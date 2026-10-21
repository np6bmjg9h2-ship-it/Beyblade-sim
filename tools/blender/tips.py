# Performance tip (base) models, built procedurally in Blender from the part
# numbers the physics uses (.tools/parts.json, written by
#   node tools/blender/parts-dump.mjs)
# and written as compact mesh modules like tools/blender/launchers.py:
#   blender -b --factory-startup --python tools/blender/tips.py -- <outDir> [parts.json]
#   node tools/blender/mesh-to-module.mjs <outDir> src/render/assets/tips.js TIP_MESHES tips.py
# Shape language from the reference bases (references/Base, refs-web/bases):
# a thin seating plate with lock tabs, a slim faceted hub, thin gusset fins
# under the plate and the contact piece; no solid housing cones.
# Contract (as src/render/parts/tip.js): the contact end is generated exactly
# (flat face fr rounding over with ball radius b, or a sphere cap of b) with
# its lowest point at y = 0; y in [0, length]; radius <= bodyRadius (+0.2
# for tabs); below the plate everything stays inside the tilt cone (tangent
# from the contact end to bodyRadius at 0.85 * length).
# Units: mm in the code, metres in the mesh. Blender Z = up (three.js Y).
# Material names are palette slots the game resolves through the tip's look:
# body, trim, pale, chrome, dark, gold, rubber, ring, clear, and flange /
# tabs (the look's cap.flange / cap.tabs bins).
import bpy, bmesh, math, sys, os, json, base64, struct
from math import sin, cos, atan2, acos, hypot, pi, radians

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR = ARGS[0]
PARTS = ARGS[1] if len(ARGS) > 1 else '.tools/parts.json'
MM = 0.001
TAU = 2 * pi
PLATE_T = 0.9   # seating plate thickness (mm): the old flanges were 1.3-2.2
SHARP = radians(25)


def contact(fr, b, to, steps, end=0.0):
    """Exact contact profile, as contactRuns in tip.js: flat face fr at y = 0
    rounding over with b about (fr, b), up to the tangent towards `to` or to
    arc angle `end`. Returns the (r, y) points, bottom-centre first."""
    c = (fr, b)
    t_end = end
    if to:
        vx, vy = to[0] - c[0], to[1] - c[1]
        t_end = atan2(vy, vx) - acos(min(1, b / hypot(vx, vy)))
    arc = []
    for i in range(steps + 1):
        t = -pi / 2 + (t_end + pi / 2) * i / steps
        arc.append((max(0.0, c[0] + b * cos(t)), c[1] + b * sin(t)))
    pts = [(0.0, 0.0)] if fr > 0.01 else []
    pts += arc
    if to:
        pts.append(tuple(to))
    return pts


class Tip:
    def __init__(self, part):
        self.part = part
        self.L = part['length']
        self.br = part['bodyRadius']
        self.b = part['ballRadius']
        self.fr = part['flatRadius']
        self.wide = part.get('socket') == 'wide'
        self.y1 = self.L - 0.06            # plate top (the emblem decal sits above)
        self.y0 = self.y1 - PLATE_T        # plate bottom
        self.rp = self.br - 0.22 if self.wide else self.br - 0.45
        # tilt cone (tiltCone in tip.js)
        fr = self.fr if self.fr > 0.2 else 0
        R, c, b = (self.br, 0.85 * self.L), (fr, self.b), self.b
        vx, vy = R[0] - c[0], R[1] - c[1]
        t = atan2(vy, vx) - acos(min(1, b / hypot(vx, vy)))
        T = (c[0] + b * cos(t), c[1] + b * sin(t))
        k = (R[1] - T[1]) / (R[0] - T[0])
        self.minY = lambda r: 0.0 if r <= T[0] else T[1] + (r - T[0]) * k
        self.spin = []

    def safe(self, r, y, m=0.1):
        return max(y, self.minY(r) + m)

    # ---------------------------------------------------------- primitives
    def _obj(self, slot, bm, name='p'):
        for f in bm.faces:
            f.smooth = True
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > SHARP:
                e.smooth = False
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        m = bpy.data.materials.get(slot) or bpy.data.materials.new(slot)
        ob.data.materials.append(m)
        return ob

    def rev(self, slot, pts, n=24, facets=0, phase=0.0, closed=False):
        """Revolve an (r, y) profile about the axis. `facets` makes flat
        sides (corner radius r); `closed` joins the last point to the first."""
        P = [p for i, p in enumerate(pts) if i == 0 or (abs(p[0] - pts[i - 1][0]) + abs(p[1] - pts[i - 1][1])) > 1e-6]
        if closed and abs(P[0][0] - P[-1][0]) + abs(P[0][1] - P[-1][1]) < 1e-6:
            P = P[:-1]
        N = facets or n
        ang = [phase + TAU * i / N for i in range(N)]
        bm = bmesh.new()
        rings = []
        for r, y in P:
            if r < 1e-4:
                rings.append([bm.verts.new((0, 0, y * MM))])
            else:
                rings.append([bm.verts.new((r * MM * cos(a), r * MM * sin(a), y * MM)) for a in ang])
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
        for A, B in pairs:
            for i in range(N):
                j = (i + 1) % N
                if len(A) == 1 and len(B) == 1:
                    break
                vs = [A[0], B[i], B[j]] if len(A) == 1 else [A[i], A[j], B[0]] if len(B) == 1 else [A[i], A[j], B[j], B[i]]
                try:
                    bm.faces.new(vs)
                except ValueError:
                    pass
        return self._obj(slot, bm)

    def prism(self, slot, sec, w, angle, skew=0.0):
        """(r, y) cross-section extruded tangentially by w mm, centred on the
        radial direction at `angle`; `skew` leans the outer end sideways."""
        r0, r1 = min(p[0] for p in sec), max(p[0] for p in sec)
        rad, tan = (cos(angle), sin(angle)), (-sin(angle), cos(angle))
        bm = bmesh.new()
        sides = []
        for s in (-1, 1):
            ring = []
            for r, y in sec:
                t = s * w / 2 + skew * (r - r0) / max(1e-6, r1 - r0)
                ring.append(bm.verts.new(((r * rad[0] + t * tan[0]) * MM, (r * rad[1] + t * tan[1]) * MM, y * MM)))
            sides.append(ring)
        A, B = sides
        bm.faces.new(A)
        bm.faces.new(list(reversed(B)))
        n = len(sec)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([A[i], A[j], B[j], B[i]])
        return self._obj(slot, bm)

    def sphere(self, slot, r, at, u=10, v=6):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r * MM)
        bmesh.ops.translate(bm, vec=(at[0] * MM, at[1] * MM, at[2] * MM), verts=bm.verts)
        return self._obj(slot, bm)

    def stud(self, slot, r, y, angle, rad=0.3, h=0.3, sides=6, down=False):
        """Hex bolt head on a wall at (r, y) facing out (or down)."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=rad * MM, radius2=rad * 0.82 * MM, depth=h * MM)
        if down:
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=_rot('X', pi), verts=bm.verts)
            off = (r * cos(angle), r * sin(angle), y - h / 2 + 0.05)
        else:
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=_rot('Y', pi / 2), verts=bm.verts)
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=_rot('Z', angle), verts=bm.verts)
            rr = r + h / 2 - 0.08
            off = (rr * cos(angle), rr * sin(angle), y)
        bmesh.ops.translate(bm, vec=tuple(c * MM for c in off), verts=bm.verts)
        return self._obj(slot, bm)

    def coil(self, slot, rc, rw, ya, yb, turns, steps_per_turn=14, m=5):
        bm = bmesh.new()
        rings = []
        n = int(turns * steps_per_turn)
        pitch = (yb - ya) / (turns * TAU)
        for i in range(n + 1):
            a = i / n * turns * TAU
            c = (rc * cos(a), rc * sin(a), ya + pitch * a)
            N = (cos(a), sin(a), 0.0)
            T = (-rc * sin(a), rc * cos(a), pitch); tl = hypot(*T); T = tuple(x / tl for x in T)
            Bv = (T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0])
            rings.append([bm.verts.new(tuple((c[q] + rw * (cos(TAU * k / m) * N[q] + sin(TAU * k / m) * Bv[q])) * MM for q in range(3))) for k in range(m)])
        for A, B in zip(rings, rings[1:]):
            for k in range(m):
                bm.faces.new([A[k], A[(k + 1) % m], B[(k + 1) % m], B[k]])
        bm.faces.new(rings[0]); bm.faces.new(list(reversed(rings[-1])))
        return self._obj(slot, bm)

    # ---------------------------------------------------------- base kit
    def hub(self, slot, r, yb, facets=8, phase=0.0, flare=0.0):
        """Slim column from yb up into the plate; `flare` widens its top."""
        y0 = self.y0
        pts = [(0, yb), (r - 0.25, yb), (r, yb + 0.25)]
        if flare > 0:
            yf = self.safe(r + flare, y0 - 0.9, 0.12)
            pts += [(r, max(yb + 0.3, yf - 0.6)), (r + flare, yf)]
        pts += [(r + flare, y0 + 0.05), (0, y0 + 0.05)]
        return self.rev(slot, pts, facets=facets, phase=phase)

    def fins(self, slot, n, r_in, y_in, w=0.45, phase=0.0, r_out=None, depth=2.4):
        """Thin bracket fins from the hub out under the plate: shallow
        triangles (at most `depth` mm deep at the hub) whose lower edge is a
        chord above the tilt cone (the cone is convex, so a chord between two
        points above it stays above it)."""
        y0 = self.y0
        ro = r_out or self.rp - 0.5
        while self.minY(ro) + 0.15 > y0 - 0.3 and ro > r_in + 0.5:
            ro -= 0.1
        ya = self.safe(r_in, max(y_in, y0 - depth), 0.15)
        yb = max(self.minY(ro) + 0.15, y0 - 0.35)
        sec = [(r_in - 0.3, ya), (r_in + 0.15, ya), (ro, yb), (ro, y0 + 0.05), (r_in - 0.3, y0 + 0.05)]
        for i in range(n):
            self.prism(slot, sec, w, phase + i * TAU / n)

    def plate(self, tabs=3, tab_w=1.7, phase=0.0, notches=4, lip=True):
        """Thin seating plate: std = round plate + lock tabs (`tabs` slot),
        wide = full-radius plate with square lock notches."""
        y0, y1 = self.y0, self.y1
        if self.wide:
            r, ri, hw = self.rp, self.rp - 0.9, 1.7 / 2 / self.rp
            steps = 8
            out = []
            for i in range(notches):
                a0 = phase + i * TAU / notches + hw
                a1 = phase + (i + 1) * TAU / notches - hw
                out += [(r * cos(a0 + (a1 - a0) * s / steps), r * sin(a0 + (a1 - a0) * s / steps)) for s in range(steps + 1)]
                out += [(ri * cos(a1), ri * sin(a1)), (ri * cos(a1 + 2 * hw), ri * sin(a1 + 2 * hw))]
            bm = bmesh.new()
            lo = [bm.verts.new((x * MM, y * MM, y0 * MM)) for x, y in out]
            mid = [bm.verts.new((x * MM, y * MM, (y1 - 0.2) * MM)) for x, y in out]
            top = [bm.verts.new((x * (1 - 0.2 / r) * MM, y * (1 - 0.2 / r) * MM, y1 * MM)) for x, y in out]
            bm.faces.new(list(reversed(lo))); bm.faces.new(top)
            n = len(out)
            for A, B in ((lo, mid), (mid, top)):
                for i in range(n):
                    j = (i + 1) % n
                    bm.faces.new([A[i], A[j], B[j], B[i]])
            self._obj('flange', bm, 'plate')
        else:
            r = self.rp
            self.rev('flange', [(0, y0), (r - 0.2, y0), (r, y0 + 0.2), (r, y1 - 0.2), (r - 0.2, y1), (0, y1)], n=32)
            tr = self.br + 0.2
            for i in range(tabs):
                sec = [(r - 0.6, y0 + 0.08), (tr - 0.25, y0 + 0.08), (tr, y0 + 0.33), (tr, y1 - 0.3), (tr - 0.2, y1 - 0.1), (r - 0.6, y1 - 0.1)]
                self.prism('tabs', sec, tab_w, phase + i * TAU / tabs)
        # thin rim lip under the plate where the tilt cone leaves room
        rl = self.rp - (1.2 if self.wide else 0.25)
        yl = self.safe(rl, y0 - 0.55, 0.12)
        if lip and yl < y0 - 0.2:
            self.rev('flange', [(rl - 0.45, y0 + 0.05), (rl - 0.45, yl), (rl - 0.15, yl), (rl, yl + 0.15), (rl, y0 + 0.05)], n=32, closed=True)

    def check(self):
        bad, rmax = 0, 0
        for ob in bpy.context.scene.objects:
            for v in ob.data.vertices:
                x, y, z = v.co.x / MM, v.co.y / MM, v.co.z / MM
                r = hypot(x, y)
                rmax = max(rmax, r)
                if z < self.y0 - 0.01 and z < self.minY(r) - 0.03:
                    bad += 1
                if z < -1e-4 or z > self.L + 1e-4:
                    bad += 1
        return bad, rmax


def _rot(axis, a):
    from mathutils import Matrix
    return Matrix.Rotation(a, 3, axis)


# ------------------------------------------------------------ designs
# Each mirrors the look of its procedural original in tip.js (same colour
# blocking and hardware), slimmed: plate + hub + fins replace the housing.

def needle(t):
    t.rev('chrome', contact(0, t.b, (0.85, 3.2), 9) + [(0.85, 3.7), (0, 3.7)], n=20)
    t.rev('trim', [(0.8, 2.7), (1.5, 2.7), (2.05, 3.15), (2.05, 4.25), (1.8, 4.55), (0.8, 4.55)], facets=6, phase=TAU / 12, closed=True)
    t.hub('body', 1.9, 4.4, facets=8, flare=0.6)
    t.fins('trim', 8, 2.0, 4.6, w=0.42, phase=TAU / 16)
    t.plate(tabs=3)


def pivotball(t):
    R = t.b
    t.rev('chrome', contact(0, R, None, 13, radians(22)) + [(0, R + R * sin(radians(22)))], n=24)
    t.rev('trim', [(R - 0.15, 3.0), (3.05, 3.0), (3.45, 3.4), (3.45, 4.3), (3.2, 4.55), (2.0, 4.55)], n=24, closed=True)
    for i in range(6):
        t.stud('chrome', 3.45, 3.85, i * TAU / 6, rad=0.26, h=0.22, sides=6)
    t.hub('body', 2.6, 4.45, facets=10)
    t.fins('trim', 10, 2.7, 4.5, w=0.4)
    t.plate(tabs=3)


def flatstrike(t):
    f = contact(t.fr, t.b, None, 9, 0)
    ft = f[-1]
    t.rev('pale', f + [(ft[0], 1.15), (ft[0] - 0.3, 1.45), (0, 1.45)], n=28)
    t.rev('body', [(0, 1.3), (2.75, 1.3), (3.15, 1.7), (3.15, 2.5), (2.8, 2.85), (0, 2.85)], n=24)
    t.hub('body', 2.3, 2.6, facets=8, flare=0.5)
    t.fins('trim', 8, 2.4, 2.7, w=0.6)
    for i in range(4):
        t.stud('chrome', 3.15, 2.1, TAU / 16 + i * TAU / 4, rad=0.28, h=0.24)
    t.plate(tabs=3)


def rubberflat(t):
    f = contact(t.fr, t.b, None, 9, 0)
    t.rev('rubber', f + [(3.42, 0.98), (3.42, 2.25), (3.15, 2.5), (0, 2.5)], n=28)
    for i in range(10):
        t.prism('rubber', [(3.3, 1.02), (3.66, 1.1), (3.7, 1.95), (3.45, 2.22), (3.3, 2.22)], 0.85, i * TAU / 10)
    t.rev('trim', [(3.0, 2.2), (3.95, 2.2), (4.25, 2.5), (4.25, 3.3), (3.95, 3.6), (3.0, 3.6)], facets=12, closed=True)
    t.hub('body', 2.9, 3.45, facets=12)
    t.fins('trim', 6, 3.0, 3.6, w=0.55, phase=TAU / 12)
    t.plate(tabs=3)


def semiflat(t):
    f = contact(t.fr, t.b, None, 9, 0)
    t.rev('pale', f + [(f[-1][0], 1.55), (1.75, 1.85), (0, 1.85)], n=24)
    t.rev('dark', [(0, 1.75), (1.2, 1.75), (1.2, 5.75), (0, 5.75)], n=16)
    for i in range(6):
        t.prism('trim', [(1.1, 1.95), (1.62, 2.3), (1.65, 5.25), (1.1, 5.6)], 0.45, i * TAU / 6)
    t.rev('chrome', [(1.1, 5.35), (2.25, 5.35), (2.5, 5.6), (2.5, 5.8), (2.25, 6.05), (1.1, 6.05)], n=24, closed=True)
    t.hub('body', 2.0, 5.95, facets=8, phase=TAU / 16, flare=0.5)
    t.fins('body', 8, 2.1, 6.0, w=0.45)
    t.plate(tabs=3)


def wideball(t):
    R = t.b
    t.rev('pale', contact(0, R, None, 15, radians(5)) + [(0, R + R * sin(radians(5)))], n=28)
    t.rev('trim', [(R - 0.05, R - 0.05), (R + 0.12, R - 0.05), (R + 0.12, R + 0.6), (R - 0.12, R + 0.6)], n=28, closed=True)
    t.rev('body', [(3.0, 4.75), (4.6, 4.75), (4.95, 5.1), (4.95, 5.9), (4.6, 6.2), (3.0, 6.2)], facets=12, closed=True)
    t.hub('body', 3.4, 4.7, facets=12)
    t.fins('trim', 12, 4.6, 5.2, w=0.42)
    t.plate(notches=4)


def bearing(t):
    y0 = 4.85
    t.rev('chrome', contact(0, t.b, (0.95, y0 - 0.35), 9) + [(0.95, y0 + 0.1), (1.25, y0 + 0.3), (1.25, y0 + 2.05), (0, y0 + 2.05)], n=20)
    for i in range(8):
        t.sphere('chrome', 0.6, (2.3 * cos(i * TAU / 8), 2.3 * sin(i * TAU / 8), y0 + 1.0), u=8, v=5)
    t.rev('gold', [(1.2, y0 - 0.1), (2.9, y0 - 0.1), (3.15, y0 + 0.15), (3.15, y0 + 0.4), (1.2, y0 + 0.4)], n=20, closed=True)
    t.rev('gold', [(1.2, y0 + 1.6), (3.15, y0 + 1.6), (3.15, y0 + 1.85), (2.9, y0 + 2.1), (1.2, y0 + 2.1)], n=20, closed=True)
    t.rev('clear', [(3.0, y0 - 0.2), (3.2, y0 - 0.2), (3.45, y0 + 0.1), (3.45, y0 + 1.9), (3.2, y0 + 2.2), (3.0, y0 + 2.2)], n=24, closed=True)
    t.hub('body', 2.6, y0 + 2.1, facets=10)
    t.fins('gold', 5, 2.7, y0 + 2.3, w=0.45)
    t.fins('body', 5, 2.7, y0 + 2.3, w=0.45, phase=TAU / 10)
    t.plate(tabs=3)
    t.spin = ['chrome']


def griphold(t):
    f = contact(t.fr, t.b, None, 9, 0)
    t.rev('rubber', f + [(f[-1][0], 2.05), (2.35, 2.35), (0, 2.35)], n=24)
    for i in range(8):
        t.prism('rubber', [(2.25, 1.5), (2.85, 1.62), (3.3, 2.55), (3.3, 3.05), (2.45, 3.25)], 0.9, i * TAU / 8, skew=0.55)
    t.hub('body', 2.5, 2.95, facets=6, phase=TAU / 12, flare=0.7)
    t.fins('trim', 6, 2.4, 3.3, w=0.55)
    for i in range(6):
        t.stud('chrome', 2.5 * cos(pi / 6), 4.2, i * TAU / 6 + TAU / 12, rad=0.3, h=0.24, sides=8)
    t.plate(tabs=3, phase=TAU / 12)


def orbit(t):
    f = contact(t.fr, t.b, None, 9, 0)
    ft = f[-1]
    t.rev('pale', f + [(ft[0], 1.25), (ft[0] - 0.3, 1.55), (3.25, 1.75), (0, 1.75)], n=28)
    t.rev('ring', [(3.35, 2.2), (5.0, 2.2), (5.35, 2.55), (5.35, 2.85), (5.05, 3.1), (3.35, 3.1)], n=28, closed=True)
    for i in range(3):
        t.prism('ring', [(4.0, 2.9), (5.0, 2.9), (4.8, 3.3), (4.0, 3.3)], 1.1, i * TAU / 3)
    t.hub('body', 3.25, 1.65, facets=12)
    t.fins('trim', 6, 3.3, 3.6, w=0.5, phase=TAU / 12)
    t.plate(notches=3)
    t.spin = ['ring']


def steelball(t):
    R = t.b
    t.rev('chrome', contact(0, R, None, 13, radians(24)) + [(0, R + R * sin(radians(24)))], n=24)
    t.rev('trim', [(R - 0.25, 3.0), (3.0, t.safe(3.0, 3.2)), (3.3, t.safe(3.3, 3.6)), (3.3, 4.7), (2.0, 4.7)], n=24, closed=True)
    for i in range(6):
        t.stud('chrome', 3.3, 4.15, i * TAU / 6, rad=0.26, h=0.22, sides=8)
    t.hub('body', 3.0, 4.55, facets=8, phase=TAU / 16)
    for a in (0, pi):
        t.sphere('chrome', 0.85, (3.25 * cos(a + TAU / 16), 3.25 * sin(a + TAU / 16), 6.2), u=10, v=6)
    t.fins('body', 8, 3.1, 4.8, w=0.45, phase=0)
    t.plate(tabs=3)


def springjump(t):
    f = contact(t.fr, t.b, None, 9, 0)
    ft = f[-1]
    t.rev('pale', f + [(ft[0], 1.85), (ft[0] - 0.3, 2.15), (0, 2.15)], n=24)
    t.rev('dark', [(0, 2.0), (0.95, 2.0), (0.95, 6.1), (0, 6.1)], n=12)
    yw = t.safe(2.15, 2.05)
    t.rev('trim', [(0.9, 2.05), (2.15, yw), (2.15, yw + 0.35), (0.9, yw + 0.35)], n=20, closed=True)
    t.coil('chrome', 1.75, 0.28, t.safe(2.1, 2.5), 5.6, 5, steps_per_turn=14, m=5)
    t.hub('body', 2.2, 5.75, facets=10, flare=0.5)
    t.fins('trim', 5, 2.3, 6.0, w=0.5)
    t.plate(tabs=3)


def _clutch(t, h0, arm_slot):
    yh = h0[1]
    t.rev('body', [(0, yh), (h0[0], yh), (h0[0] + 0.3, yh + 0.3), (3.6, t.safe(3.6, 4.6)), (3.6, 6.6), (0, 6.6)], n=24)
    ty0 = t.safe(4.6, 5.1)
    for i in range(16):
        t.prism('gold', [(3.5, ty0), (4.4, ty0 + 0.15), (4.4, ty0 + 1.1), (3.5, ty0 + 1.25)], 0.75, i * TAU / 16)
    t.hub('body', 2.6, 6.4, facets=8)
    t.fins('trim', 4, 2.7, 6.6, w=0.5, phase=TAU / 8 + TAU / 8)
    for a in (0, pi):
        ya = t.safe(6.6, 8.3, 0.15)
        t.prism(arm_slot, [(4.3, ya), (6.3, ya), (6.6, ya + 0.3), (6.6, t.y0 + 0.05), (4.3, t.y0 + 0.05)], 1.2, a + TAU / 8, skew=0.5)
    t.plate(tabs=3)


def clutchhit(t):
    f = contact(t.fr, t.b, None, 9, 0)
    t.rev('pale', f + [(f[-1][0], 1.5), (f[-1][0] - 0.3, 1.8), (0, 1.8)], n=24)
    y0 = t.safe(3.2, 1.6)
    t.rev('rubber', [(2.3, y0), (2.9, y0), (3.2, y0 + 0.35), (3.2, y0 + 1.0), (2.3, y0 + 1.0)], n=24, closed=True)
    _clutch(t, (3.1, y0 + 0.9), 'trim')


def clutchfinal(t):
    t.rev('chrome', contact(0, t.b, (1.0, 2.4), 9) + [(1.0, 3.0), (0, 3.0)], n=20)
    t.rev('trim', [(0.9, 2.6), (1.7, t.safe(1.7, 2.6)), (1.95, t.safe(1.95, 2.9)), (1.95, 3.4), (0.9, 3.4)], n=20, closed=True)
    _clutch(t, (1.9, 3.3), 'dark')


def autoshift(t):
    t.rev('chrome', contact(0, t.b, (0.95, 3.2), 9) + [(0.95, 3.6), (0, 3.6)], n=20)
    c, R = 4.0, 2.2
    arc = [(R * cos(radians(-20 + 50 * i / 8)), c + R * sin(radians(-20 + 50 * i / 8))) for i in range(9)]
    t.rev('pale', [(0.9, arc[0][1])] + arc + [(0.9, arc[-1][1])], n=24, closed=True)
    for i in range(3):  # the three shift weights
        a = i * TAU / 3
        t.sphere('chrome', 0.6, (2.6 * cos(a), 2.6 * sin(a), 5.15), u=8, v=5)
    t.hub('body', 2.3, 4.75, facets=12, flare=0.4)
    t.fins('trim', 6, 2.4, 5.0, w=0.45, phase=TAU / 6)
    t.plate(tabs=3)


def hybrid(t):
    t.rev('chrome', contact(t.fr, t.b, (2.0, 2.9), 9) + [(2.0, 3.6), (0, 3.6)], n=24)
    t.rev('dark', [(1.45, 2.55), (2.6, 2.55), (3.0, 2.95), (3.0, 3.4), (2.7, 3.7), (1.45, 3.7)], n=24, closed=True)
    t.rev('trim', [(0, 3.6), (2.6, 3.6), (2.9, 3.9), (2.9, 5.95), (0, 5.95)], facets=8)
    t.rev('dark', [(2.4, 5.8), (3.3, 5.8), (3.55, 6.05), (3.55, 6.45), (3.3, 6.7), (2.4, 6.7)], facets=8, phase=TAU / 16, closed=True)
    t.hub('body', 2.3, 6.5, facets=8, phase=TAU / 16)
    t.fins('trim', 8, 2.4, 6.8, w=0.42, phase=TAU / 16)
    t.plate(tabs=3)


DESIGNS = {
    'tip_needle': needle, 'tip_pivotball': pivotball, 'tip_flatstrike': flatstrike,
    'tip_rubberflat': rubberflat, 'tip_semiflat': semiflat, 'tip_wideball': wideball,
    'tip_bearing': bearing, 'tip_griphold': griphold, 'tip_orbit': orbit,
    'tip_steelball': steelball, 'tip_springjump': springjump, 'tip_clutchhit': clutchhit,
    'tip_clutchfinal': clutchfinal, 'tip_autoshift': autoshift, 'tip_hybrid': hybrid,
}


# ------------------------------------------------------------ export

def export(tid, t):
    """Triangles grouped by material, positions quantized to int16 over the
    bounding box, corner normals to int8; Blender Z-up -> three.js Y-up."""
    dg = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH':
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        M = ob.matrix_world; N = M.to_3x3()
        cn = me.corner_normals
        for tri in me.loop_triangles:
            mname = ob.material_slots[tri.material_index].material.name
            g = groups.setdefault(mname, {'verts': {}, 'pos': [], 'nor': [], 'idx': []})
            for li in tri.loops:
                p = M @ me.vertices[me.loops[li].vertex_index].co
                n = (N @ cn[li].vector).normalized()
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
    meta = {'id': tid, 'plateR': round(t.rp, 3), 'wide': t.wide, 'spin': t.spin, 'min': lo, 'max': hi, 'groups': []}
    blob = bytearray()
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
    with open(os.path.join(OUT_DIR, tid + '.json'), 'w') as f:
        json.dump(meta, f)
    bad, rmax = t.check()
    print(f'{tid}: {meta["tris"]} tris, {len(meta["groups"])} groups, {len(blob)} bytes, rMax {rmax:.2f} (limit {t.br + 0.3}), envelope violations {bad}')


os.makedirs(OUT_DIR, exist_ok=True)
with open(PARTS) as f:
    TIPS = {p['id']: p for p in json.load(f)['tip']}
for tid, fn in DESIGNS.items():
    if tid not in TIPS:
        print(f'{tid}: not in parts.json, skipped')
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    t = Tip(TIPS[tid])
    fn(t)
    export(tid, t)
