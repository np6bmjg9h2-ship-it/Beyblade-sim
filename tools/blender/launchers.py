# Launcher models for the battle screen, built procedurally in Blender and
# written as compact mesh modules (src/render/assets/launchers.js) so the game
# loads them offline from file:// without a model loader.
#   blender -b --factory-startup --python tools/blender/launchers.py -- <outDir> [--preview]
# Writes <outDir>/<id>.json (quantized mesh, base64) per launcher; then run
#   node tools/blender/mesh-to-module.mjs <outDir>
# Blender axes: X = forward (barrel), Z = up, Y = width, modelled the way the
# reference photo shows it. `flip` turns a model over for use (a grip launcher is
# held cradle-down, its grip up). Origin = where the top hangs. Materials name
# the game palette slot:
# body, panel, accent (the item colour), accent2, metal.
import bpy, bmesh, math, sys, os, json, base64, struct
ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR = ARGS[0]
PREVIEW = '--preview' in ARGS


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m


class Builder:
    """Side-silhouette modelling helpers in reference-photo pixels."""

    def __init__(self, scale, ox, oz):
        self.S, self.OX, self.OZ = scale, ox, oz
        self.scene = bpy.context.scene

    def P(self, px, pz):
        return ((px - self.OX) * self.S, (self.OZ - pz) * self.S)

    def slab(self, name, pts, width, material, bevel=0.0012, segs=3, y0=0.0):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        vs = [bm.verts.new((x, y0 - width / 2, z)) for x, z in (self.P(*p) for p in pts)]
        f = bm.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(bm, geom=[f])
        moved = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0, width, 0), verts=moved)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me)
        self.scene.collection.objects.link(ob)
        ob.data.materials.append(mat(material))
        if bevel > 0:
            md = ob.modifiers.new('bev', 'BEVEL'); md.width = bevel; md.segments = segs
            md.limit_method = 'ANGLE'; md.angle_limit = math.radians(30)
        return ob

    def cyl(self, name, px, pz, r_px, depth, material, axis='Y', y=0.0, x_off=0.0, verts=24):
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r_px * self.S, depth=depth)
        ob = bpy.context.active_object; ob.name = name
        x, z = self.P(px, pz)
        ob.location = (x + x_off, y, z)
        if axis == 'Y': ob.rotation_euler = (math.pi / 2, 0, 0)
        if axis == 'X': ob.rotation_euler = (0, math.pi / 2, 0)
        ob.data.materials.append(mat(material))
        bpy.ops.object.shade_smooth()
        return ob


# ------------------------------------------------------------ models

def catapult(B):
    """Pistol launcher with a hollow top cradle a normal launcher drops into
    (reference: references/Launchers/Catapult Shooter.jpg, 1 px = 0.3 mm)."""
    slab, cyl, OX, OZ = B.slab, B.cyl, B.OX, B.OZ
    M_BODY, M_PANEL, M_ACC, M_ACC2, M_METAL = 'body', 'panel', 'accent', 'accent2', 'metal'
    HW = 0.012  # half width of the body (24 mm)
    RAIL = 0.0022
    # main body + grip; the top between the rear block and the front fin is a
    # hollow cradle a normal launcher drops into for extra grip and control
    body = slab('body', [(132,228),(168,148),(225,148),(225,180),(560,180),(575,178),(575,205),(548,232),(540,262),(520,330),(498,420),(500,560),(522,700),(500,745),(420,762),(345,668),(300,612),(318,585),(388,500),(382,360),(345,300),(318,248),(160,245)], 2 * HW, M_BODY)
    # cradle end walls (full width) and side rails (thin)
    slab('rear_wall', [(222,182),(222,40),(250,8),(305,14),(318,62),(312,182)], 2 * HW, M_BODY)
    slab('front_wall', [(455,182),(458,70),(500,22),(512,40),(548,108),(572,172),(560,182)], 2 * HW, M_BODY)
    for side in (-1, 1):
        slab(f'rail{side}', [(312,182),(312,141),(360,140),(390,118),(455,113),(455,182)], RAIL, M_PANEL, bevel=0.0006, segs=2, y0=side * (HW - RAIL / 2))
    # muzzle
    cyl('muzzle', 578, 190, 18, 0.012, M_BODY, axis='X', x_off=0.002)
    cyl('muzzle_tip', 590, 190, 12, 0.004, M_METAL, axis='X', x_off=0.002)
    for side in (-1, 1):
        y = side * HW
        cyl(f'medal_rim{side}', 405, 160, 25, 0.002, M_METAL, y=y + side * 0.0005)
        cyl(f'medal{side}', 405, 160, 19, 0.0024, M_ACC, y=y + side * 0.0008)
        star = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5; rr = 14 if k % 2 == 0 else 6
            star.append((405 + rr * math.cos(a), 160 - rr * math.sin(a)))
        slab(f'emblem{side}', star, 0.0008, M_ACC2, bevel=0, y0=y + side * 0.0022)
        slab(f'tip_rear{side}', [(250,12),(303,17),(310,40),(258,34)], 0.001, M_ACC2, bevel=0, y0=y + side * 0.0005)
        slab(f'tip_front{side}', [(500,26),(511,43),(530,78),(512,70)], 0.001, M_ACC2, bevel=0, y0=y + side * 0.0005)
        slab(f'stripe_body{side}', [(178,205),(205,160),(222,160),(222,205)], 0.0012, M_ACC, bevel=0.0003, segs=1, y0=y + side * 0.0004)
        slab(f'stripe_rail{side}', [(318,175),(318,150),(352,147),(352,175)], 0.0012, M_ACC, bevel=0.0003, segs=1, y0=y + side * 0.0004)
        slab(f'stripe_grip{side}', [(405,690),(470,640),(500,650),(505,690),(430,725)], 0.0012, M_ACC, bevel=0.0003, segs=1, y0=y + side * 0.0004)
        cyl(f'screw_a{side}', 432, 325, 11, 0.0016, M_METAL, y=y + side * 0.0006)
        cyl(f'screw_b{side}', 470, 705, 13, 0.0016, M_METAL, y=y + side * 0.0006)
        cyl(f'screw_c{side}', 150, 228, 7, 0.0014, M_METAL, y=y + side * 0.0006)
        for i in range(3):
            z = 540 + i * 13
            slab(f'rib{side}{i}', [(462, z), (494, z - 3), (495, z + 4), (463, z + 7)], 0.0014, M_BODY, bevel=0.0003, segs=1, y0=y + side * 0.0007)
        slab(f'grip_panel{side}', [(352,312),(398,352),(408,500),(355,595),(362,615),(420,700),(485,690),(478,560),(470,420),(492,330),(505,268),(395,262)], 0.0012, M_PANEL, bevel=0.0006, segs=2, y0=y + side * 0.0002)
        slab(f'lever{side}', [(448,262),(470,258),(472,298),(450,300)], 0.0016, M_METAL, bevel=0.0003, segs=1, y0=y + side * 0.0009)
    # a normal launcher seated in the cradle: it holds the top, which hangs
    # out of the cradle opening (held cradle-down, grip up)
    slab('clip_body', [(318,178),(318,128),(330,110),(440,108),(450,125),(450,178)], 2 * (HW - RAIL) - 0.0006, M_ACC2, bevel=0.0015, segs=2)
    cyl('clip_ring', 383, 104, 62, 0.003, M_METAL, axis='Z', verts=40)
    cyl('clip_hub', 383, 98, 30, 0.004, M_PANEL, axis='Z', verts=32)



MODELS = {
    'launcher_catapult': (catapult, dict(scale=0.0003, ox=383, oz=94, flip=True)),
}


# ------------------------------------------------------------ export

def export(lid, flip=False):
    """Triangles grouped by material, positions quantized to int16 over the
    bounding box, corner normals to int8; Blender Z-up -> three.js Y-up."""
    dg = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name.startswith('demo'):
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        M = ob.matrix_world; N = M.to_3x3()
        cn = me.corner_normals
        for tri in me.loop_triangles:
            mname = ob.material_slots[tri.material_index].material.name if ob.material_slots else 'body'
            g = groups.setdefault(mname, {'verts': {}, 'pos': [], 'nor': [], 'idx': []})
            for li in tri.loops:
                p = M @ me.vertices[me.loops[li].vertex_index].co
                n = (N @ cn[li].vector).normalized()
                key = (round(p.x, 6), round(p.y, 6), round(p.z, 6), round(n.x, 2), round(n.y, 2), round(n.z, 2))
                k = g['verts'].get(key)
                if k is None:
                    k = len(g['pos']); g['verts'][key] = k
                    if flip:  # half turn about the forward axis
                        p = p.copy(); p.y, p.z = -p.y, -p.z; n = n.copy(); n.y, n.z = -n.y, -n.z
                    g['pos'].append((p.x, p.z, -p.y)); g['nor'].append((n.x, n.z, -n.y))
                g['idx'].append(k)
        ev.to_mesh_clear()
    allp = [p for g in groups.values() for p in g['pos']]
    lo = [min(p[i] for p in allp) for i in range(3)]
    hi = [max(p[i] for p in allp) for i in range(3)]
    meta, blob = {'id': lid, 'min': lo, 'max': hi, 'groups': []}, bytearray()
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
    with open(os.path.join(OUT_DIR, lid + '.json'), 'w') as f:
        json.dump(meta, f)
    print(f'{lid}: {meta["tris"]} tris, {len(blob)} bytes')


os.makedirs(OUT_DIR, exist_ok=True)
for lid, (fn, cfg) in MODELS.items():
    reset()
    fn(Builder(cfg['scale'], cfg['ox'], cfg['oz']))
    export(lid, cfg.get('flip', False))
