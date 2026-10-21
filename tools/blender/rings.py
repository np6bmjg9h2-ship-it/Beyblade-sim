# Attack ring models, built in Blender from the catalogue numbers
# (.tools/parts.json, written by tools/blender/parts-dump.mjs) and written as
# compact mesh modules (src/render/assets/rings.js) like launchers.py.
#   node tools/blender/parts-dump.mjs
#   blender -b --factory-startup --python tools/blender/rings.py -- <outDir> [parts.json]
#   node tools/blender/mesh-to-module.mjs <outDir> src/render/assets/rings.js RING_MESHES rings.py
#
# Look: thin moulded plates (the drawn plate is `thickness`, raised details at
# most +0.8 mm), a narrow hoop carrying a few big clean blades, hook slits and
# windows for negative space, chamfered edges that read as crease lines, a
# metal (or rubber) cap on each leading face. Shapes follow the reference
# photos (references/Attack Rings) for shape language only.
#
# Envelope (tools/preview --audit): every vertex inside the physics contact
# profile at its azimuth (ported from src/physics/profile.js), the hole at
# least the largest core radius + 0.4, y in [0, T + 1.0]. The game checks the
# baked `sig` against the live contact layer and falls back to the procedural
# ring when they differ (src/render/parts/ringModel.js).
#
# Modelled in mm, Blender Z up; azimuth psi = atan2(y, x) here equals the
# game's atan2(-z, x). Materials name the game palette slot:
#   main (ring colour), frame (dark hub), sec (second colour), metal, acc
#   (bright accent), rubber, roller (rollers, separate spinner mesh).
import bpy, bmesh, math, sys, os, json, base64, struct
ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR = ARGS[0]
PARTS = ARGS[1] if len(ARGS) > 1 else '.tools/parts.json'
TAU = math.pi * 2
CORE_MAX = 10.0  # largest catalogue core radius (mm)


def clamp(x, a, b): return max(a, min(b, x))
def smoothstep(e0, e1, x): t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def lin(a, b, n): return [a + (b - a) * i / n for i in range(n + 1)]


class Prof:
    """The contact profile of src/physics/profile.js. Shapes are written in
    'L' coordinates: u = blade index + lam (lam 0 = ramp foot, w = leading
    face); right-spin rings are mirrored (psi = -u * P)."""

    def __init__(s, p):
        s.R = p['rOut']
        s.N = p['blades'] if p['blades'] > 0 and p['rOut'] > p['rBase'] else 0
        s.Rb = p['rBase'] if s.N else p['rOut']
        s.w = p.get('bladeWidth', 0.55)
        s.hand = -1 if p['spin'] == 'R' else 1 if p['spin'] == 'L' else 0
        s.P = TAU / max(1, s.N)
        s.mir = -1 if s.hand < 0 else 1
        s.T = p['thickness']

    def bump(s, lam):
        w = s.w
        if not s.N: return 0.0
        if s.hand == 0: return smoothstep(0, 0.12, lam) * (1 - smoothstep(w - 0.12, w, lam))
        return smoothstep(0, w * 0.7, lam) * (1 - smoothstep(w - 0.035, w, lam))

    def r(s, lam): return s.Rb + (s.R - s.Rb) * s.bump(lam % 1.0)

    def r_psi(s, psi):  # exact sampleProfile radius at a game azimuth
        if not s.N: return s.R
        ph = (psi / TAU) * s.N; ph -= math.floor(ph)
        return s.r(ph if s.hand >= 0 else 1 - ph)

    def xy(s, r, u):
        a = s.mir * u * s.P
        return (r * math.cos(a), r * math.sin(a))

    def dlam(s, mm, r): return mm / (r * s.P)  # an arc length as a lam step

    def period(s):
        """lam samples of one period, dense where the radius moves."""
        w, Rb, R = s.w, s.Rb, s.R
        if s.hand == 0:
            out = lin(0, 0.12, 5) + lin(0.12, w - 0.12, max(2, math.ceil(max(0, w - 0.24) * s.P * R / 2.2)))[1:] + lin(w - 0.12, w, 5)[1:]
        else:
            crest = (w * 0.3 - 0.035) * s.P * R
            out = lin(0, w * 0.7, 6) + lin(w * 0.7, w - 0.035, max(2, math.ceil(crest / 2.0)))[1:] + [w - 0.028, w - 0.02, w - 0.012, w - 0.005, w]
        gap = (1 - w) * s.P * Rb
        out += lin(w, 1, max(2, math.ceil(gap / 3.2)))[1:-1]
        return out


# ------------------------------------------------------------ Blender helpers

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def dedupe(pts):
    out = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) > 1e-4: out.append(p)
    while len(out) > 2 and abs(out[0][0] - out[-1][0]) + abs(out[0][1] - out[-1][1]) <= 1e-4: out.pop()
    return out


def slab(name, loops, z0, z1, mat, bevel=0.3, res=0):
    """A 2D filled curve (first loop the outline, the rest holes) extruded
    from z0 to z1 with a chamfered (res 0) or rounded edge kept inside the
    outline, converted to a mesh with hard edges past 30 degrees."""
    b = min(bevel, (z1 - z0) * 0.32)
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = (z1 - z0) / 2 - b
    cu.bevel_depth = b; cu.bevel_resolution = res; cu.offset = -b
    for loop in loops:
        loop = dedupe(loop)
        sp = cu.splines.new('POLY'); sp.points.add(len(loop) - 1)
        for i, (x, y) in enumerate(loop): sp.points[i].co = (x, y, 0, 1)
        sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name + '_c', cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location.z = (z0 + z1) / 2
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    mo = bpy.data.objects.new(name, me)
    mo.matrix_world = ob.matrix_world
    bpy.context.scene.collection.objects.link(mo)
    bpy.data.objects.remove(ob)
    return finish(mo, mat)


def finish(ob, mat):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.use_smooth = True
    ob.data.set_sharp_from_angle(angle=math.radians(30))
    ob.data.materials.clear(); ob.data.materials.append(material(mat))
    return ob


def cyl(name, x, y, r, z0, z1, mat, verts=10, bevel=0.12):
    loop = [(x + r * math.cos(i * TAU / verts), y + r * math.sin(i * TAU / verts)) for i in range(verts)]
    return slab(name, [loop], z0, z1, mat, bevel)


def gem(name, pts, mat):
    """Faceted solid from explicit (x, y, z) vertices: its convex hull."""
    bm = bmesh.new()
    for p in pts: bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return finish(ob, mat)


def circle(r, n, x=0.0, y=0.0): return [(x + r * math.cos(i * TAU / n), y + r * math.sin(i * TAU / n)) for i in range(n)]


def arc_band(S, u0, u1, rin, rout, n=None):
    """Closed band between radii (numbers or functions of lam) over u0..u1."""
    fi = rin if callable(rin) else (lambda lam: rin)
    fo = rout if callable(rout) else (lambda lam: rout)
    n = n or max(3, math.ceil(abs(u1 - u0) * S.P * S.R / 2.2))
    us = lin(u0, u1, n)
    return [S.xy(fo(u % 1), u) for u in us] + [S.xy(fi(u % 1), u) for u in reversed(us)]


def slot(S, uc, r0, r1, half_mm):
    """Rounded window centred at u = uc between radii r0 and r1."""
    rm = (r0 + r1) / 2; hw = half_mm / (rm * S.P); rr = (r1 - r0) / 2
    pts = [S.xy(r1, u) for u in lin(uc - hw, uc + hw, 4)]
    for i in range(1, 4):  # rounded end
        a = math.pi * i / 4
        pts.append(S.xy(rm + rr * math.cos(a), uc + hw + (rr * math.sin(a)) / (rm * S.P)))
    pts += [S.xy(r0, u) for u in lin(uc + hw, uc - hw, 4)]
    for i in range(1, 4):
        a = math.pi + math.pi * i / 4
        pts.append(S.xy(rm + rr * math.cos(a), uc - hw + (rr * math.sin(a)) / (rm * S.P)))
    return pts


# ------------------------------------------------------------ designs

def hole_r(p): return max(p['rIn'], CORE_MAX + 0.4)


def collar(S, H, T, gaps=3, mat='frame', h=0.55):
    """Raised hub collar split by rectangular slots (the core clips there)."""
    n = gaps
    for i in range(n):
        pts = []
        for f in lin(0.04, 0.96, 6):
            a = (i + f) * TAU / n
            pts.append(((H + 2.0) * math.cos(a), (H + 2.0) * math.sin(a)))
        for f in lin(0.96, 0.04, 6):
            a = (i + f) * TAU / n
            pts.append(((H + 0.05) * math.cos(a), (H + 0.05) * math.sin(a)))
        slab(f'collar{i}', [pts], T - 0.02, T + h, mat, 0.15)


def screws(S, H, T, us, r):
    for i, u in enumerate(us):
        x, y = S.xy(r, u)
        cyl(f'screw{i}', x, y, 0.8, T - 0.02, T + 0.32, 'metal', 8, 0)


def windows(S, loops, r0, r1, spokes, spoke_mm=2.8):
    """Cut the plate between hub and hoop into spokes at the given lam
    positions of every period (the second one only on wide periods), so the
    hoop reads thin. Adds the window loops to `loops`."""
    rm, rr = (r0 + r1) / 2, (r1 - r0) / 2
    per = S.P * rm
    if per <= 30: spokes = spokes[:1]
    if r1 - r0 < 1.6: return
    for k in range(max(1, S.N)):
        for j, a in enumerate(spokes):
            b = spokes[(j + 1) % len(spokes)] + (1 if j + 1 == len(spokes) else 0)
            half = ((b - a) * per - spoke_mm) / 2 - rr
            if half > 0.8: loops.append(slot(S, k + (a + b) / 2, r0, r1, half))


def attack(p, S):
    """Hoop + big blades: hook slit behind each blade tip, a metal (rubber)
    cap on each leading face, a second-colour edge band and an accent
    stripe, windows in the hoop between blades, slotted hub collar."""
    T, H, w, N, Rb, R = S.T, hole_r(p), S.w, S.N, S.Rb, S.R
    inset = 0.3
    rh = Rb - inset
    out = lambda lam: S.r(lam) - inset
    depth = R - Rb
    g = 0.75
    # hook slit (one-handed blades with room for it)
    sl = None
    if S.hand and depth >= 3.4:
        l0 = next((lam for lam in lin(0.05 * w, 0.6 * w, 80) if out(lam) - (rh + g) >= 1.3), None)
        if l0 is not None and l0 < 0.45 * w:
            l1 = min(0.6 * w, l0 + max(0.22 * w, min(0.35 * w, S.dlam(5.0, Rb))))
            sl = (l0, l1)
    loop = []
    for k in range(N):
        lams = S.period()
        if sl:
            l0, l1 = sl
            tip = out(l0) - 0.55
            top = lambda lam: (rh + g) + (tip - rh - g) * ((l1 - lam) / (l1 - l0)) ** 1.7
            pre = [lam for lam in lams if lam < l0] + lin(l0, l1, 6)
            loop += [(rh, k + lam) for lam in pre]
            rd = S.dlam(g / 2, rh)
            loop += [(rh + g / 2, k + l1 + rd), ]
            loop += [(top(lam), k + lam) for lam in lin(l1, l0, 7)]
            loop += [(out(lam), k + lam) for lam in [l0] + [x for x in lams if x > l0]]
        else:
            loop += [(out(lam), k + lam) for lam in lams]
    loops = [[S.xy(r, u) for r, u in loop], circle(H, 40)]
    windows(S, loops, H + 2.9, Rb - 1.9, [w * 0.5, (w + 1) / 2])
    slab('body', loops, 0, T, 'main', 0.32)
    capmat = 'rubber' if p.get('rubber') else 'metal'
    rI = max(Rb + 0.5, R - 2.4)
    d = S.dlam(min(5.0, 0.3 * w * S.P * R), R)  # cap length
    faces = [(w, -1)] if S.hand else [(0.0, 1), (w, -1)]  # (face lam, into the blade)
    if sl:
        l0, l1 = sl
        tip = out(l0) - 0.55
        top = lambda lam: (rh + g) + (tip - rh - g) * ((l1 - lam) / (l1 - l0)) ** 1.7
    inner = lambda lam: max(Rb - 1.4, top(lam) + 0.35) if sl and lam < l1 else Rb - 1.4
    if S.hand:
        la = next((lam for lam in lin(sl[0] if sl else 0.0, w * 0.7, 60) if out(lam) - 0.6 - inner(lam) >= 0.7), None)
        lb = w - d
    else:
        la, lb = d, w - d
    for k in range(N):
        # leading face cap: a wedge along the blade edge that wraps the face
        for fi, (fl, sgn) in enumerate(faces):
            far = fl + sgn * d
            lams = [lam for lam in lin(far, fl, 9) if S.r(lam) - 0.12 > rI + 0.15]
            if len(lams) < 3: continue
            inn = lambda lam: lerp(out(far) - 0.75, rI, ((lam - far) / (fl - far)) ** 0.7)
            pts = [(S.r(lam) - 0.12, k + lam) for lam in lams] + [(min(inn(lam), S.r(lam) - 0.3), k + lam) for lam in reversed(lams)]
            slab(f'cap{k}_{fi}', [[S.xy(r, u) for r, u in pts]], 0.3, T + 0.35, capmat, 0.12)
        # second-colour blade panel (the sticker area) with an accent stripe
        if la is None or lb - la < 0.03 or depth < 2.5: continue
        slab(f'panel{k}', [arc_band(S, k + la, k + lb, inner, lambda l: out(l) - 0.6)], T - 0.02, T + 0.3, 'sec', 0.12)
        m0, m1 = lerp(la, lb, 0.22), lerp(la, lb, 0.9)
        mid = lambda l: (inner(l) + out(l) - 0.6) / 2
        if min(out(l) - 0.6 - inner(l) for l in lin(m0, m1, 8)) >= 2.0:
            slab(f'acc{k}', [arc_band(S, k + m0, k + m1, lambda l: mid(l) - 0.3, lambda l: mid(l) + 0.3)], T + 0.2, T + 0.45, 'acc', 0)
    collar(S, H, T)
    screws(S, H, T, [k + w / 2 for k in range(N)], H + 3.8)


def bastion(p, S):
    T, H, R = S.T, hole_r(p), S.R
    loops = [circle(R - 0.3, 80), circle(H, 40)]
    windows(S, loops, H + 2.9, R - 3.3, [i / 6 for i in range(6)], 3.2)
    slab('body', loops, 0, T, 'main', 0.6, 1)
    for i in range(8):
        u = i / 8
        slab(f'merlon{i}', [arc_band(S, u - 0.022, u + 0.022, R - 2.7, R - 0.55, 3)], T - 0.02, T + 0.8, 'sec', 0.25, 1)
    collar(S, H, T, 4)
    screws(S, H, T, [i / 3 for i in range(3)], H + 4.0)


def bumped(p, S, kind):
    """Defensive / stamina rings with low crests: rounded plate, panels or
    studs on the crests, no accents (they read as safe to hit)."""
    T, H, w, N, Rb, R = S.T, hole_r(p), S.w, S.N, S.Rb, S.R
    out = lambda lam: S.r(lam) - 0.3
    loop = [S.xy(out(lam), k + lam) for k in range(N) for lam in S.period()]
    loops = [loop, circle(H, 40)]
    if kind != 'iron': windows(S, loops, H + 2.9, Rb - (5.4 if kind == 'aegis' else 3.2), [w * 0.5, (w + 1) / 2], 3.2)
    slab('body', loops, 0, T, 'main', 0.55, 1)
    if kind == 'iron':
        slab('band', [circle(Rb - 2.4, 64), circle(Rb - 3.8, 64)], T - 0.02, T + 0.35, 'sec', 0.12)
        for k in range(N):
            x, y = S.xy(R - 2.1, k + w / 2)
            cyl(f'stud{k}', x, y, 1.2, T - 0.02, T + 0.6, 'metal', 10, 0.25)
    else:
        lift = 0.7 if kind == 'aegis' else 0.35
        rin = Rb - (5.0 if kind == 'aegis' else 2.8)
        for k in range(N):
            slab(f'panel{k}', [arc_band(S, k + 0.12, k + w - 0.12, rin, lambda l: out(l) - 0.9)], T - 0.02, T + lift, 'sec', 0.3, 0 if kind == 'aegis' else 1)
            if kind == 'aegis':
                c = k + w / 2; rm = Rb - 2.4
                gem(f'gem{k}', [(*S.xy(rm - 1.3, c), T + 0.6), (*S.xy(rm + 1.3, c), T + 0.6), (*S.xy(rm, c - 0.025), T + 0.6), (*S.xy(rm, c + 0.025), T + 0.6), (*S.xy(rm, c), T + 1.0)], 'acc')
    collar(S, H, T)
    screws(S, H, T, [k + (w + 1) / 2 for k in range(N)] if kind == 'iron' else [k + w / 2 for k in range(N)], Rb - 5.6 if kind == 'iron' else H + 3.8)


def hoop(p, S):
    """Classic hoop on three spokes."""
    T, H, R = S.T, hole_r(p), S.R
    hubR, hoopIn = H + 4.2, R - 2.4
    loops = [circle(R - 0.35, 96), circle(H, 40)]
    for i in range(3):
        a0, a1 = i / 3 + 0.25, (i + 1) / 3 + 0.25
        di, do = 1.05 / (hubR * TAU) + 0.004, 1.05 / (hoopIn * TAU) + 0.002
        pts = [S.xy(hoopIn, u) for u in lin(a0 + do, a1 - do, 22)] + [S.xy(hubR, u) for u in lin(a1 - di, a0 + di, 10)]
        loops.append(pts)
    slab('body', loops, 0, T, 'main', 0.3)
    for i in range(3):
        x, y = S.xy(hoopIn - 0.3, i / 3 + 0.25)
        cyl(f'stud{i}', x, y, 1.3, T - 0.02, T + 0.45, 'sec', 12, 0.15)
    slab('hubband', [circle(hubR - 0.5, 48), circle(H + 0.9, 48)], T - 0.02, T + 0.3, 'frame', 0.1)


def roller_guard(p, S):
    T, H, R, Rb, w, N = S.T, hole_r(p), S.R, S.Rb, S.w, S.N
    rr = 2.7
    cs = [k + w / 2 for k in range(N)]
    rc = [S.r(w / 2) - rr - 0.12 for _ in cs]

    def guard(u):
        r = min(S.r(u % 1), Rb) - 0.4
        for c, rcc in zip(cs, rc):
            dx = math.atan2(math.sin((u - c) * S.P), math.cos((u - c) * S.P)) * rcc
            if abs(dx) < rr + 0.5: r = min(r, rcc - math.sqrt(max(0, (rr + 0.5) ** 2 - dx * dx)))
        return r
    us = sorted(set([i / 160 * N for i in range(160)] + [c + d for c in cs for d in [x * 0.004 for x in range(-12, 13)]]))
    slab('body', [[S.xy(guard(u), u) for u in us], circle(H, 40)], 0, T, 'main', 0.35)
    for k in range(N):
        a0, a1 = cs[k] + 0.09, cs[k] + 0.91
        slab(f'wing{k}', [arc_band(S, a0, a1, H + 3.2, Rb - 1.4)], T - 0.2, T + 0.6, 'frame', 0.2)
    for c, rcc in zip(cs, rc):
        x, y = S.xy(rcc, c)
        slab(f'yoke{c}', [arc_band(S, c - 0.012, c + 0.012, rcc - rr - 1.6, rcc, 2)], T - 0.2, T + 0.5, 'main', 0.15)
        cyl(f'yokecap{c}', x, y, 1.5, T - 0.2, T + 0.5, 'main', 14, 0.15)
        cyl(f'axle{c}', x, y, 0.9, T + 0.5, T + 0.8, 'metal', 10, 0.1)
    collar(S, H, T, 2)
    # spinner positions in game coordinates (metres, Y up)
    return [[x * 0.001, (T / 2) * 0.001, -y * 0.001] for x, y in (S.xy(rcc, c) for c, rcc in zip(cs, rc))]


def roller_mesh(p, S):
    T = S.T
    cyl('roller', 0, 0, 2.7, -(T - 1.4) / 2, (T - 1.4) / 2, 'roller', 16, 0.25)
    cyl('rollerrim', 0, 0, 2.1, -(T - 0.9) / 2, (T - 0.9) / 2, 'roller', 14, 0.15)


def quad_spike(p, S):
    T, H, w, N, Rb = S.T, hole_r(p), S.w, S.N, S.Rb
    loop = [S.xy(S.r(lam) - 0.4, k + lam) for k in range(N) for lam in S.period()]
    loops = [loop, circle(H, 40)]
    windows(S, loops, H + 3.8, Rb - 1.9, [w * 0.5, (w + 1) / 2])
    slab('body', loops, 0, T, 'main', 0.3)
    for k in range(N):
        c = k + w / 2; r0, r1 = H + 3.2, S.r(w / 2) - 0.9
        rm = r0 + (r1 - r0) * 0.45; hw = 0.3 / S.P
        gem(f'spike{k}', [(*S.xy(r0, c), T - 0.25), (*S.xy(rm, c - hw), T - 0.25), (*S.xy(r1, c), T - 0.25), (*S.xy(rm, c + hw), T - 0.25),
                          (*S.xy(r0 + (r1 - r0) * 0.2, c), T + 1.0), (*S.xy(r1 - (r1 - r0) * 0.12, c), T + 1.0)], 'sec')
    slab('hubring', [circle(H + 3.4, 48), circle(H + 1.6, 48)], T - 0.2, T + 0.6, 'frame', 0.2)


DESIGNS = {
    'ring_bastion': bastion,
    'ring_ironwall': lambda p, S: bumped(p, S, 'iron'),
    'ring_aegisprism': lambda p, S: bumped(p, S, 'aegis'),
    'ring_tidalhalo': lambda p, S: bumped(p, S, 'tidal'),
    'ring_hoophalo': hoop,
    'ring_rollerguard': roller_guard,
    'ring_quadspike': quad_spike,
}


def rake(S, p, H):
    """Upper / down rake: outer walls lean inward above (slope > 0) or below
    (slope < 0) mid-height, like the procedural ring's warp."""
    sl = math.radians(p.get('slope', 0) or 0)
    if not sl: return
    tk, T = math.tan(abs(sl)), S.T
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH': continue
        M = ob.matrix_world; Mi = M.inverted()
        for v in ob.data.vertices:
            co = M @ v.co; r = math.hypot(co.x, co.y)
            if r < 1e-6: continue
            d = (max(0, co.z - T / 2) if sl > 0 else max(0, T / 2 - co.z)) * tk * smoothstep(H + 3, H + 6, r)
            co.x *= (r - d) / r; co.y *= (r - d) / r
            v.co = Mi @ co


# ------------------------------------------------------------ export

def audit(S, H):
    worst, hole_min, zmin, zmax = -9, 99, 9, -9
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH': continue
        for v in ob.data.vertices:
            co = ob.matrix_world @ v.co; r = math.hypot(co.x, co.y); psi = math.atan2(co.y, co.x)
            pr = max(S.r_psi(psi + d) for d in (-0.0087, 0, 0.0087))
            worst = max(worst, r - pr); zmin = min(zmin, co.z); zmax = max(zmax, co.z)
            if 0.2 < co.z < S.T - 0.2: hole_min = min(hole_min, r)
    return {'outside': round(worst, 3), 'holeMin': round(hole_min, 3), 'z': [round(zmin, 3), round(zmax, 3)]}


def export(rid, extra):
    """Triangles grouped by material, positions (mm -> m) quantized to int16
    over the bounding box, corner normals to int8; Blender Z-up -> three Y-up."""
    groups = {}
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH': continue
        me = ob.data; me.calc_loop_triangles()
        M = ob.matrix_world; N = M.to_3x3()
        cn = me.corner_normals
        for tri in me.loop_triangles:
            mname = ob.material_slots[tri.material_index].material.name
            g = groups.setdefault(mname, {'verts': {}, 'pos': [], 'nor': [], 'idx': []})
            for li in tri.loops:
                p = (M @ me.vertices[me.loops[li].vertex_index].co) * 0.001
                n = (N @ cn[li].vector).normalized()
                key = (round(p.x, 7), round(p.y, 7), round(p.z, 7), round(n.x, 2), round(n.y, 2), round(n.z, 2))
                k = g['verts'].get(key)
                if k is None:
                    k = len(g['pos']); g['verts'][key] = k
                    g['pos'].append((p.x, p.z, -p.y)); g['nor'].append((n.x, n.z, -n.y))
                g['idx'].append(k)
    allp = [p for g in groups.values() for p in g['pos']]
    lo = [min(p[i] for p in allp) for i in range(3)]
    hi = [max(p[i] for p in allp) for i in range(3)]
    meta, blob = {'id': rid, **extra, 'min': lo, 'max': hi, 'groups': []}, bytearray()
    for name, g in groups.items():
        meta['groups'].append({'mat': name, 'verts': len(g['pos']), 'index': len(g['idx'])})
        for p in g['pos']:
            blob += struct.pack('<3h', *(round(((p[i] - lo[i]) / max(1e-9, hi[i] - lo[i])) * 65535 - 32768) for i in range(3)))
        for n in g['nor']:
            blob += struct.pack('<3b', *(max(-127, min(127, round(c * 127))) for c in n))
        if len(blob) % 2: blob += bytes(1)
        blob += struct.pack(f'<{len(g["idx"])}H', *g['idx'])
        if len(blob) % 4: blob += bytes(4 - len(blob) % 4)
    meta['tris'] = sum(len(g['idx']) for g in groups.values()) // 3
    meta['data'] = base64.b64encode(bytes(blob)).decode('ascii')
    with open(os.path.join(OUT_DIR, rid + '.json'), 'w') as f:
        json.dump(meta, f)
    return meta['tris']


os.makedirs(OUT_DIR, exist_ok=True)
with open(PARTS) as f: rings = json.load(f)['ring']
for p in rings:
    S = Prof(p); H = hole_r(p)
    reset()
    spinners = (DESIGNS.get(p['id']) or attack)(p, S)
    rake(S, p, H)
    a = audit(S, H)
    sig = {'rOut': p['rOut'], 'rBase': p['rBase'], 'blades': p['blades'], 'bladeWidth': p.get('bladeWidth', 0.55), 'spin': p['spin'], 'thickness': p['thickness'], 'slope': p.get('slope', 0) or 0}
    extra = {'sig': sig, 'hole': H}
    if spinners: extra['spinners'] = spinners; extra['spinnerMesh'] = p['id'] + '__roller'
    tris = export(p['id'], extra)
    print(f"{p['id']}: {tris} tris, audit {a}")
    if spinners:
        reset(); roller_mesh(p, S)
        print(f"{p['id']}__roller: {export(p['id'] + '__roller', {'spinner': True})} tris")
