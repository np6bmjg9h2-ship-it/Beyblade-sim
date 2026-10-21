# Weight disc models, built in Blender from the catalogue numbers and written
# as compact mesh modules (src/render/assets/discs.js), the way
# tools/blender/launchers.py does launchers.
#   node tools/blender/parts-dump.mjs                      (-> .tools/parts.json)
#   blender -b --factory-startup --python tools/blender/discs.py -- <outDir> [parts.json]
#   node tools/blender/mesh-to-module.mjs <outDir> src/render/assets/discs.js DISC_MESHES discs.py
#
# Look (references/Weightdisk, refs-web/weight-disks): a real weight disc is a
# thin stamped metal plate with a big centre window, key tabs with a slot and
# bolt holes reaching in to the core. The physics thickness (stack height and
# contact layer) stays: every model spans y = 0..thickness through a dark hub
# spacer round the bore, but the visible plate is a slim slab at the top,
# chamfered hard underneath so its edge reads thin, with a raised outer lip
# over a recessed face. Rim weights, bumpers and counterweights hang under
# the plate as separate pieces. Envelope: r <= rOut (+0.2), y in [0, T]; the
# bore r < rIn stays open for the lock boss.
#
# Modelled in game units (mm, y up, angle a: x = r cos a, z = r sin a);
# written in Blender axes and exported back to three.js axes (x, y, z).
# Materials name the game palette slot: main, dark, accent, chrome, alt.
import bpy, bmesh, math, sys, os, json, base64, struct
from mathutils.geometry import tessellate_polygon

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR = ARGS[0]
PARTS = {p['id']: p for p in json.load(open(ARGS[1] if len(ARGS) > 1 else '.tools/parts.json'))['disc']}
TAU, PI = 2 * math.pi, math.pi
SHARP = math.radians(30)


def pol(r, a):
    return (r * math.cos(a), r * math.sin(a))


def circle(r, n, cx=0.0, cz=0.0, a0=0.0):
    return [(cx + r * math.cos(a0 + i * TAU / n), cz + r * math.sin(a0 + i * TAU / n)) for i in range(n)]


def rot2(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


# ------------------------------------------------------------ pieces
# A piece is (material, verts [(x, y, z) mm], faces [index tuples]).

class Disc:
    def __init__(self):
        self.pieces = []

    def add(self, mat, V, F):
        self.pieces.append((mat, V, F))


def area(loop):
    return sum(loop[i][0] * loop[(i + 1) % len(loop)][1] - loop[(i + 1) % len(loop)][0] * loop[i][1] for i in range(len(loop))) / 2


def orient(loop, ccw):
    return list(loop) if (area(loop) > 0) == ccw else list(reversed(loop))


def offset(loop, d):
    """Move every point d mm to the left of the loop (into the material for
    a CCW outline or a CW hole), mitred."""
    n, out = len(loop), []
    for i in range(n):
        p0, p1, p2 = loop[i - 1], loop[i], loop[(i + 1) % n]
        e1 = (p1[0] - p0[0], p1[1] - p0[1]); l1 = math.hypot(*e1) or 1
        e2 = (p2[0] - p1[0], p2[1] - p1[1]); l2 = math.hypot(*e2) or 1
        n1 = (-e1[1] / l1, e1[0] / l1); n2 = (-e2[1] / l2, e2[0] / l2)
        m = (n1[0] + n2[0], n1[1] + n2[1]); lm = math.hypot(*m) or 1
        m = (m[0] / lm, m[1] / lm)
        k = d / max(0.5, m[0] * n1[0] + m[1] * n1[1])
        out.append((p1[0] + m[0] * k, p1[1] + m[1] * k))
    return out


def plate(D, mat, outer, holes, y0, y1, ct=0.0, cb=0.0, xf=None):
    """Flat slab y0..y1 from an outline with holes; chamfer ct on the top
    edges and cb on the bottom ones (outline and holes alike). xf maps a
    local (x, y, z) to the model (face plates)."""
    loops = [orient(outer, True)] + [orient(h, False) for h in holes]
    levels = ([(cb, y0)] if cb > 0 else []) + [(0.0, y0 + cb), (0.0, y1 - ct)] + ([(ct, y1)] if ct > 0 else [])
    V, F, idx = [], [], []
    for (ins, y) in levels:
        lv = []
        for L in loops:
            pts = offset(L, ins) if ins else L
            lv.append(len(V))
            V.extend((x, y, z) for (x, z) in pts)
        idx.append(lv)
    for li in range(len(levels) - 1):
        for k, L in enumerate(loops):
            a, b, n = idx[li][k], idx[li + 1][k], len(L)
            for i in range(n):
                j = (i + 1) % n
                F.append((a + i, a + j, b + j, b + i))
    for lv in (idx[0], idx[-1]):
        flat = [[(V[s + i][0], V[s + i][2], 0.0) for i in range(len(L))] for s, L in zip(lv, loops)]
        offs = [lv[k] for k in range(len(loops))]
        # tessellate_polygon indexes the concatenated loops
        starts, acc = [], 0
        for L in loops:
            starts.append(acc); acc += len(L)
        def gidx(t):
            for k in range(len(loops) - 1, -1, -1):
                if t >= starts[k]:
                    return offs[k] + t - starts[k]
        for tri in tessellate_polygon(flat):
            F.append(tuple(gidx(t) for t in tri))
    if xf:
        V = [xf(*v) for v in V]
    D.add(mat, V, F)


def lathe(D, mat, prof, n=48, facets=0, a0=0.0, span=TAU, caps=False):
    """Revolve a closed [r, y] profile; facets > 0 gives a flat-sided polygon."""
    N = facets or n
    full = span >= TAU - 1e-6
    cols = N if full else N + 1
    M = len(prof)
    V = [(r * math.cos(a0 + j * span / N), y, r * math.sin(a0 + j * span / N)) for j in range(cols) for (r, y) in prof]
    F = []
    for j in range(N):
        j2 = (j + 1) % cols
        for i in range(M):
            i2 = (i + 1) % M
            F.append((j * M + i, j2 * M + i, j2 * M + i2, j * M + i2))
    if not full and caps:
        F.append(tuple(range(M)))
        F.append(tuple(N * M + i for i in range(M)))
    D.add(mat, V, F)


def box(D, mat, x0, x1, hw, y0, y1, a=0.0, b=0.08):
    """Chamfered block x0..x1 (radial), |z| <= hw, y0..y1, turned to angle a."""
    pts = [rot2(p, a) for p in [(x0, -hw), (x1, -hw), (x1, hw), (x0, hw)]]
    plate(D, mat, pts, [], y0, y1, b, b)


def cyl(D, mat, r, a, y0, y1, rad, n=10, c=0.08):
    """Round slug standing from y0 to y1 at radius r, angle a."""
    cx, cz = pol(r, a)
    plate(D, mat, circle(rad, n, cx, cz), [], y0, y1, c, 0)


def rivet(D, mat, r, a, y, rad=0.32, h=0.18, n=8):
    """Low rivet head on a vertical wall at radius r, facing out."""
    def xf(x, yy, z):  # local: x, z = face plane (tangent, height), y = outward
        p = rot2((r + (yy - 0.0), -x), a)
        return (p[0], y + z, p[1])
    plate(D, mat, circle(rad, n), [], 0.0, h, 0.06, 0, xf=xf)


def face_plate(D, mat, shape, r0, r1, a, b=0.04):
    """Shape in the (tangent t, height y) plane, extruded radially r0..r1."""
    def xf(x, yy, z):
        p = rot2((yy, -x), a)
        return (p[0], z, p[1])
    plate(D, mat, shape, [], r0, r1, b, 0, xf=xf)


def hub(D, r0, rh, T, mat='dark', facets=0, c=0.3):
    lathe(D, mat, [(r0 + c, 0), (rh - c, 0), (rh, c), (rh, T - c), (rh - c, T), (r0 + c, T), (r0, T - c), (r0, c)], n=24, facets=facets)


# ------------------------------------------------------------ outlines

def poly_outline(sides, R, flat, phase=0.0, arc=2):
    """Regular polygon (apothem flat * R) with its corners turned off by the
    circle R; flats centred at phase + k * TAU / sides."""
    k, out = TAU / sides, []
    dc = math.acos(min(1.0, flat))
    for j in range(sides):
        c = phase + j * k
        out.append(pol(R, c - dc)); out.append(pol(R, c + dc))
        for m in range(1, arc + 1):
            out.append(pol(R, c + dc + (k - 2 * dc) * m / (arc + 1)))
    return out


def notched_circle(R, notches, n=64):
    """Circle R with rectangular notches [(angle, half width mm, depth mm)]."""
    out, marks = [], sorted(notches)
    for i in range(n):
        a = i * TAU / n
        if any(abs(math.atan2(math.sin(a - c), math.cos(a - c))) < (hw + 0.6) / R for c, hw, _ in marks):
            continue
        out.append((a, pol(R, a)))
    for c, hw, dep in marks:
        h0, h1 = hw / R, hw / (R - dep)
        for a, r in ((c - h0, R), (c - h1, R - dep), (c + h1, R - dep), (c + h0, R)):
            out.append((a + (TAU if a < 0 else 0), pol(r, a)))
    out.sort(key=lambda t: t[0] % TAU)
    return [p for _, p in out]


def window(rw, tabs, n=48):
    """Round centre window of radius rw with tabs reaching in. A tab is
    dict(a, h = half width at rw (mm), rt = inner radius, hi = half width at
    rt, skew = angle shift of the inner end, slot = (half width, depth))."""
    tabs = sorted(tabs, key=lambda t: t['a'] % TAU)
    out = []
    for k, t in enumerate(tabs):
        a, h, rt, hi, sk = t['a'] % TAU, t['h'], t['rt'], t['hi'], t.get('skew', 0.0)
        ai = a + sk
        out.append(pol(rw, a - h / rw))
        out.append(pol(rt, ai - hi / rt))
        if t.get('slot'):
            s, dep = t['slot']
            out += [pol(rt, ai - s / rt), pol(rt + dep, ai - s / rt), pol(rt + dep, ai + s / rt), pol(rt, ai + s / rt)]
        else:
            out.append(pol(rt, ai))
        out.append(pol(rt, ai + hi / rt))
        out.append(pol(rw, a + h / rw))
        # arc to the next tab
        nxt = tabs[(k + 1) % len(tabs)]
        b0, b1 = a + h / rw, nxt['a'] % TAU - nxt['h'] / rw
        if b1 <= b0:
            b1 += TAU
        m = max(1, int(round((b1 - b0) / (TAU / n))))
        out += [pol(rw, b0 + (b1 - b0) * i / m) for i in range(1, m)]
    return out


def bat(a, rw, rt, h, hi, slot=(0.9, 1.4)):
    return dict(a=a, h=h, rt=rt, hi=hi, slot=slot)


def bolt_pair(a, r, dt, rad=0.85, n=12):
    return [circle(rad, n, *pol(r, a - dt / r)), circle(rad, n, *pol(r, a + dt / r))]


def kidney(rc, w, a, h, m=6, mc=4):
    pts, ro, ri = [], rc + w / 2, rc - w / 2
    pts += [pol(ro, a - h + 2 * h * i / m) for i in range(m + 1)]
    def cap(ac, sg):
        cx, cz = pol(rc, ac); ux, uz = math.cos(ac), math.sin(ac); tx, tz = -uz * sg, ux * sg
        for k in range(1, mc):
            th = k / mc * PI; cr = math.cos(th) * w / 2 * sg; sr = math.sin(th) * w / 2
            pts.append((cx + ux * cr + tx * sr, cz + uz * cr + tz * sr))
    cap(a + h, 1)
    pts += [pol(ri, a - h + 2 * h * i / m) for i in range(m, -1, -1)]
    cap(a - h, -1)
    return pts


# ------------------------------------------------------------ designs
# Each returns meta extras: deco (engraved print regions on recessed faces,
# texts '$label' / '$mass'), faces (top/bottom plate heights), handed.

def lip(D, outline, T, w, ct=0.2, mat='main'):
    """Raised outer lip over the recessed face (top T - 0.25 .. T)."""
    plate(D, mat, outline, [offset(orient(outline, True), w)], T - 0.25, T, ct, 0)


def ten(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, fl = r0 + 2.4, 0.965
    out = poly_outline(10, R - 0.05, fl)
    rw = R * fl - 4.4
    tabs = [bat(a, rw, rh - 0.3, 4.6, 3.4) for a in (PI / 2, -PI / 2)]
    holes = [window(rw, tabs)] + bolt_pair(PI / 2, rh + 2.0, 2.3) + bolt_pair(-PI / 2, rh + 2.0, 2.3)
    plate(D, 'main', out, holes, T - 1.8, T - 0.25, 0, 0.55)
    lip(D, out, T, 1.3)
    hub(D, r0, rh, T, facets=10)
    rm = (rw + R * fl - 1.3) / 2
    for a in (0, PI):  # accent arrow pads on the recessed face
        arrow = [rot2(p, a) for p in [(rm - 1.2, -0.9), (rm + 0.4, -0.9), (rm + 1.2, 0), (rm + 0.4, 0.9), (rm - 1.2, 0.9), (rm - 0.4, 0)]]
        plate(D, 'accent', arrow, [], T - 0.27, T - 0.12, 0.05, 0)
    return dict(deco=[dict(rA=rw + 0.35, rB=R * fl - 1.5, y=T - 0.25, on='main', texts=[dict(s='$label', a=-PI / 2), dict(s='$mass', a=PI / 2)], marks=[])])


def heavyring(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, rRi, yb = r0 + 2.6, R - 4.2, T - 2.6
    g0, g1 = yb + 0.75, yb + 1.55
    lathe(D, 'main', [(rRi + 0.3, yb), (R - 0.5, yb), (R, yb + 0.5), (R, g0), (R - 0.45, g0), (R - 0.45, g1), (R, g1), (R, T - 0.3), (R - 0.3, T),
                      (R - 1.3, T), (R - 1.45, T - 0.25), (rRi + 0.5, T - 0.25), (rRi, T - 0.75), (rRi, yb + 0.3)], n=56)
    lathe(D, 'chrome', [(R - 0.5, g0 + 0.05), (R - 0.12, g0 + 0.05), (R - 0.02, g0 + 0.25), (R - 0.02, g1 - 0.25), (R - 0.12, g1 - 0.05), (R - 0.5, g1 - 0.05)], n=56)
    NC = 5; sp = TAU / NC
    rc, wr = (rh + rRi) / 2, (rRi - rh) * 0.55
    h = max(0.08, (sp - (wr + 2.4) / rc) / 2)
    plate(D, 'main', circle(rRi + 0.4, 48), [circle(rh - 0.3, 24)] + [kidney(rc, wr, k * sp, h) for k in range(NC)], T - 1.95, T - 0.95, 0.2, 0)
    for k in range(NC):
        box(D, 'accent', R - 0.6, R + 0.06, 0.6, g0 - 0.12, g1 + 0.12, k * sp + sp / 2)
    hub(D, r0, rh, T)
    return dict(deco=[dict(rA=rRi + 0.6, rB=R - 1.6, y=T - 0.25, on='main', texts=[dict(s='$label', a=-PI / 2), dict(s='$mass', a=PI / 2)], marks=[0, PI])])


def feather(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, NF = r0 + 2.0, 12
    st = TAU / NF; Rt = R - 0.1; Rb = R - 2.6; dR = Rt - Rb
    Pk = lambda r, f, k: pol(r, (k + f) * st)
    out = []
    for k in range(NF):
        out += [Pk(Rb, 0, k), Pk(Rb + 0.45 * dR, 0.22, k), Pk(Rb + 0.85 * dR, 0.47, k), Pk(Rt, 0.62, k), Pk(Rt - 0.3 * dR, 0.72, k), Pk(Rb + 0.25 * dR, 0.9, k)]
    rw = Rb - 2.3
    spokes = [dict(a=k * TAU / 6, h=1.1, rt=rh - 0.3, hi=0.95, skew=-0.38) for k in range(6)]
    plate(D, 'main', out, [window(rw, spokes, 56)], T - 1.1, T - 0.12, 0, 0.35)
    for k in range(0, NF, 2):  # accent inlays on every other feather
        plate(D, 'accent', [Pk(Rb + 0.2, 0.14, k), Pk(Rb + 0.5 * dR, 0.3, k), Pk(Rt - 0.45, 0.6, k), Pk(Rb + 0.55 * dR, 0.55, k), Pk(Rb + 0.2, 0.3, k)], [], T - 0.2, T, 0.05, 0)
    # dark spine ring under the plate
    lathe(D, 'dark', [(rw + 0.2, T - 1.55), (Rb - 0.4, T - 1.55), (Rb, T - 1.25), (Rb, T - 1.0), (rw + 0.2, T - 1.0)], n=48)
    hub(D, r0, rh, T)
    return dict(handed=True)


def wide(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, rw = r0 + 2.4, R - 6.0
    tabs = [bat(a, rw, rh - 0.3, 5.0, 3.6) for a in (PI / 2, -PI / 2)] + [dict(a=a, h=2.4, rt=rw - 3.0, hi=2.0) for a in (0, PI)]
    holes = [window(rw, tabs, 56)] + bolt_pair(PI / 2, rh + 2.1, 2.5) + bolt_pair(-PI / 2, rh + 2.1, 2.5) + [circle(0.9, 12, *pol(rw - 1.7, a)) for a in (0, PI)]
    plate(D, 'main', circle(R - 1.5, 64), holes, T - 1.75, T - 0.25, 0, 0.35)
    # contact bumper round the plate edge (raised lip), accent pads on its belt
    lathe(D, 'dark', [(R - 2.1, T - 1.6), (R - 0.6, T - 1.95), (R, T - 1.45), (R, T - 0.55), (R - 0.45, T - 0.05), (R - 1.9, T - 0.05), (R - 2.1, T - 0.25)], n=64)
    for k in range(8):
        box(D, 'accent', R - 0.4, R + 0.04, 1.6, T - 1.35, T - 0.65, k * PI / 4 + PI / 8)
    hub(D, r0, rh, T)
    return dict(deco=[dict(rA=rw + 0.35, rB=R - 2.3, y=T - 0.25, on='main', texts=[dict(s='$label', a=-PI / 2 + PI / 8), dict(s='$mass', a=PI / 2 + PI / 8)], marks=[])])


def counter(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, Rp, rw = r0 + 2.4, R - 0.6, R - 5.0
    tabs = [bat(a, rw, rh - 0.3, 4.6, 3.4) for a in (PI / 2, -PI / 2)]
    rL = (rw + Rp - 1.2) / 2
    holes = [window(rw, tabs, 32)] + bolt_pair(PI / 2, rh + 2.0, 2.3, n=10) + bolt_pair(-PI / 2, rh + 2.0, 2.3, n=10) + [circle(0.85, 10, *pol(rL, a)) for a in (PI - 0.5, PI, PI + 0.5)]
    out = circle(Rp, 40)
    plate(D, 'main', out, holes, T - 1.7, T - 0.25, 0, 0.45)
    lip(D, out, T, 1.2)
    # brass crescent under the plate on +X, three blocks with dark spacers
    cs, gap = 0.84 * PI, 0.05
    seg = (cs - 2 * gap) / 3; rc0 = rw - 0.4; yt = T - 1.7
    prof = [(rc0 + 0.3, 0.3), (R - 0.7, 0.3), (R - 0.2, 0.8), (R - 0.2, yt), (rc0, yt), (rc0, 0.6)]
    for i in range(3):
        lathe(D, 'alt', prof, n=8, a0=-cs / 2 + i * (seg + gap), span=seg, caps=True)
        mid = -cs / 2 + i * (seg + gap) + seg / 2
        for s in (-1, 1):
            rivet(D, 'chrome', R - 0.2, mid + s * seg * 0.3, (0.8 + yt) / 2, n=6)
    for i in (1, 2):
        a = -cs / 2 + i * (seg + gap) - gap
        lathe(D, 'dark', [(rc0 + 0.5, 0.5), (R - 0.5, 0.5), (R - 0.5, yt - 0.02), (rc0 + 0.5, yt - 0.02)], n=1, a0=a - 0.015, span=gap + 0.03, caps=True)
    li = Rp - 1.2
    lathe(D, 'accent', [(li - 0.6, T - 0.25), (li - 0.05, T - 0.25), (li - 0.05, T - 0.12), (li - 0.6, T - 0.12)], n=20, a0=cs / 2 + 0.5, span=TAU - cs - 1.0, caps=True)
    hub(D, r0, rh, T, mat='dark')
    return dict(deco=[dict(rA=rw + 0.35, rB=li - 0.2, y=T - 0.25, a0=-cs / 2, span=cs, on='main', texts=[dict(s='$label', a=-0.35), dict(s='$mass', a=0.35)], marks=[])])


def orbit(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, rw, NS = r0 + 2.4, R - 5.0, 4
    sp, hn, dep = TAU / NS, 2.3, 2.2
    rN = R - dep
    out = notched_circle(R, [((k + 0.5) * sp, hn, dep) for k in range(NS)], 64)
    spokes = [dict(a=k * sp, h=2.6, rt=rh - 0.3, hi=2.0) for k in range(NS)]
    holes = [window(rw, spokes)] + [circle(0.85, 12, *pol((rw + rh) / 2, k * sp)) for k in range(NS)]
    yb = T - 1.9
    plate(D, 'main', out, holes, yb, T - 0.25, 0, 0.45)
    lip(D, out, T, 1.1)
    for k in range(NS):
        an = (k + 0.5) * sp
        box(D, 'dark', rN - 0.45, rN + 0.3, hn + 0.25, yb - 1.0, T - 0.3, an)
        box(D, 'accent', rN + 0.2, R - 0.8, 0.7, yb - 0.8, T - 0.45, an)
        box(D, 'accent', R - 0.95, R - 0.05, 1.5, yb - 0.6, T - 0.7, an)
        rivet(D, 'chrome', R - 0.06, k * sp, (yb + T - 0.25) / 2)
    hub(D, r0, rh, T)
    return dict(deco=[dict(rA=rw + 0.35, rB=rN - 0.3, y=T - 0.25, on='main', texts=[dict(s='$label', a=sp / 2 + PI - sp / 2 + 0.0), dict(s='$mass', a=0.0)], marks=[])])


def compact(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, rw, NR = r0 + 2.2, R - 4.6, 40
    rs = TAU / NR
    reed = []
    for i in range(NR):
        reed += [pol(R - 0.06, i * rs), pol(R - 0.4, (i + 0.5) * rs)]
    tabs = [dict(a=k * TAU / 3, h=1.6, rt=rh - 0.3, hi=1.3) for k in range(3)] + [dict(a=k * TAU / 3 + PI / 3, h=2.2, rt=rw - 3.0, hi=1.8) for k in range(3)]
    plate(D, 'main', reed, [window(rw, tabs, 48)], T - 1.3, T - 0.22, 0, 0.3)
    lip(D, reed, T, 1.0, ct=0.15)
    for k in range(3):
        cyl(D, 'chrome', rw - 1.55, k * TAU / 3 + PI / 3, T - 1.4, T - 0.12, 0.85, n=12)
    lathe(D, 'accent', [(R - 2.0, T - 1.55), (R - 0.8, T - 1.55), (R - 0.8, T - 1.25), (R - 2.0, T - 1.25)], n=56)
    hub(D, r0, rh, T, facets=12)
    return dict(deco=[dict(rA=rw + 0.35, rB=R - 1.6, y=T - 0.22, on='main', texts=[dict(s='$label', a=0.0), dict(s='$mass', a=PI)], marks=[])])


def titan(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, rw, NB = r0 + 2.6, R - 5.4, 6
    sp = TAU / NB
    out = poly_outline(12, R - 0.05, 0.975, sp / 4, arc=1)
    tabs = [bat(k * TAU / 3 + PI / 6, rw, rh - 0.3, 4.0, 3.0, slot=(0.8, 1.2)) for k in range(3)]
    win = window(rw, tabs, 48)
    plate(D, 'main', out, [win], T - 1.8, T - 0.25, 0, 0.5)
    lip(D, out, T, 1.3)
    # lower dark plate and the armour lugs that space the two
    plate(D, 'dark', circle(R - 1.6, 56), [win], 0.45, 1.85, 0.3, 0.35)
    span = 0.4
    for k in range(NB):
        a = k * sp
        lathe(D, 'main', [(R - 3.4, 0.3), (R - 0.8, 0.3), (R - 0.15, 0.95), (R - 0.15, T - 1.75), (R - 3.4, T - 1.75)], n=4, a0=a - span / 2, span=span, caps=True)
        cy, ch = 1.2, 0.55
        chev = [(t * ch, cy + y * ch) for t, y in [(-1.6, 0), (0, 1.0), (1.6, 0), (1.6, 0.8), (0, 1.8), (-1.6, 0.8)]]
        face_plate(D, 'accent', chev, R - 0.35, R + 0.05, a)
    hub(D, r0, rh, T, facets=12)
    return dict(deco=[dict(rA=rw + 0.35, rB=R * 0.975 - 1.5, y=T - 0.25, on='main', texts=[dict(s='$label', a=-PI / 2 + sp / 2), dict(s='$mass', a=PI / 2 + sp / 2)], marks=[sp / 2, sp / 2 + PI])])


# classic series: one die-cast zinc plate (main) on a darker zinc spacer

def hexheavy(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, fl = r0 + 2.4, 0.9
    out = poly_outline(6, R - 0.05, fl, PI / 6, arc=2)
    rw = R * fl - 4.3
    tabs = [bat(a, rw, rh - 0.3, 4.4, 3.2) for a in (PI / 2, -PI / 2)]
    plate(D, 'main', out, [window(rw, tabs)] + bolt_pair(PI / 2, rh + 2.1, 2.3) + bolt_pair(-PI / 2, rh + 2.1, 2.3), T - 2.2, T, 0.3, 0.6)
    hub(D, r0, rh, T)
    return {}


def octawide(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, fl = r0 + 2.4, 0.95
    out = poly_outline(8, R - 0.05, fl, PI / 8, arc=2)
    rw = R * fl - 3.2
    spokes = [dict(a=k * PI / 2 + PI / 4, h=2.9, rt=rh - 0.3, hi=2.2) for k in range(4)]
    holes = [window(rw, spokes, 56)] + [circle(0.8, 12, *pol(rw - 2.0, k * PI / 2 + PI / 4)) for k in range(4)]
    plate(D, 'main', out, holes, T - 1.5, T, 0.25, 0.5)
    hub(D, r0, rh, T)
    return {}


def starlobe(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, NL, inner = r0 + 2.4, 5, 15.2
    out = [pol(inner + (R - 0.05 - inner) * abs(math.cos(NL * a / 2)) ** 1.6, a) for a in (i * TAU / 90 for i in range(90))]
    rw = inner - 2.6
    tabs = [bat(a, rw, rh - 0.3, 3.8, 2.8, slot=(0.8, 1.2)) for a in (PI / 2, -PI / 2)]
    holes = [window(rw, tabs)] + [circle(1.0, 12, *pol(R - 2.6, k * TAU / NL)) for k in range(NL)]
    plate(D, 'main', out, holes, T - 1.7, T, 0.25, 0.5)
    hub(D, r0, rh, T)
    return {}


def magna(D, P):
    R, T, r0 = P['rOut'], P['thickness'], P['rIn']
    rh, fl = r0 + 2.2, 0.96
    out = poly_outline(10, R - 0.05, fl, PI / 10, arc=1)
    top, bot = T - 0.06, T - 2.3
    plate(D, 'main', out, [circle(rh - 0.3, 24)], bot, top, 0.3, 0.5)
    hub(D, r0, rh, T)
    return dict(faces=dict(top=top, bottom=bot))


MODELS = dict(disc_ten=ten, disc_heavyring=heavyring, disc_feather=feather, disc_wide=wide, disc_counter=counter, disc_orbit=orbit,
              disc_compact=compact, disc_titan=titan, disc_hexheavy=hexheavy, disc_octawide=octawide, disc_starlobe=starlobe, disc_magna=magna)


# ------------------------------------------------------------ Blender + export

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def to_blender(D):
    """Pieces -> Blender objects (mm -> m, game y-up -> Blender z-up), smooth
    shaded with sharp edges past 30 degrees."""
    for i, (mname, V, F) in enumerate(D.pieces):
        me = bpy.data.meshes.new(f'{mname}{i}')
        me.from_pydata([(x * 0.001, -z * 0.001, y * 0.001) for (x, y, z) in V], [], F)
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            e.smooth = e.is_manifold and e.calc_face_angle(PI) < SHARP
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(me.name, me)
        bpy.context.scene.collection.objects.link(ob)
        m = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
        ob.data.materials.append(m)


def export(did, P, extra):
    dg = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH':
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        cn = me.corner_normals
        for tri in me.loop_triangles:
            mname = ob.material_slots[tri.material_index].material.name
            g = groups.setdefault(mname, {'verts': {}, 'pos': [], 'nor': [], 'idx': []})
            for li in tri.loops:
                p = ob.matrix_world @ me.vertices[me.loops[li].vertex_index].co
                n = cn[li].vector.normalized()
                key = (round(p.x, 7), round(p.y, 7), round(p.z, 7), round(n.x, 2), round(n.y, 2), round(n.z, 2))
                k = g['verts'].get(key)
                if k is None:
                    k = len(g['pos']); g['verts'][key] = k
                    g['pos'].append((p.x, p.z, -p.y)); g['nor'].append((n.x, n.z, -n.y))
                g['idx'].append(k)
        ev.to_mesh_clear()
    allp = [p for g in groups.values() for p in g['pos']]
    lo = [min(p[i] for p in allp) for i in range(3)]
    hi = [max(p[i] for p in allp) for i in range(3)]
    meta = {'id': did, 'rIn': P['rIn'], 'rOut': P['rOut'], 'T': P['thickness'], 'min': lo, 'max': hi, 'groups': []}
    meta.update(extra)
    blob = bytearray()
    for name, g in sorted(groups.items()):
        assert len(g['pos']) < 65536, f'{did}/{name}: too many vertices'
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
    with open(os.path.join(OUT_DIR, did + '.json'), 'w') as f:
        json.dump(meta, f)
    r = max(math.hypot(p[0], p[2]) for p in allp) * 1000
    print(f'{did}: {meta["tris"]} tris, {len(blob)} bytes, rMax {r:.2f} (rOut {P["rOut"]}), y {lo[1] * 1000:.2f}..{hi[1] * 1000:.2f} (T {P["thickness"]})')


os.makedirs(OUT_DIR, exist_ok=True)
for did, fn in MODELS.items():
    if did not in PARTS:
        print(f'{did}: not in the catalogue, skipped'); continue
    reset()
    D = Disc()
    extra = fn(D, PARTS[did])
    to_blender(D)
    export(did, PARTS[did], extra)
