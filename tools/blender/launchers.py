# Launcher models for the battle screen, built procedurally in Blender and
# written as compact mesh modules (src/render/assets/launchers.js) so the game
# loads them offline from file:// without a model loader.
#   blender -b --factory-startup --python tools/blender/launchers.py -- <outDir> [--preview]
# Writes <outDir>/<id>.json (quantized mesh, base64) per launcher; then run
#   node tools/blender/mesh-to-module.mjs <outDir>
# Blender axes: X = forward (barrel), Z = up, Y = width, modelled the way the
# reference photo shows it. `pose` turns a model into the way it is held:
# 'flip' (half turn about the barrel: a grip launcher held cradle-down, grip
# up), 'muzzleDown' (a pistol shooter pointed at the stadium, grip back) or
# 'flat' (modelled from a top view, extruded upward: a ripcord or string
# launcher held level over the top). `mirror` reads a photo facing left.
# `hold` tells the game how to face it: 'tangent' (barrel along the launch
# direction) or 'gripOut' (grip toward the player). Origin = where the top
# hangs. `palette` overrides game colours per slot. Materials name the game
# palette slot:
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

    def __init__(self, scale, ox, oz, mirror=False):
        self.S, self.OX, self.OZ, self.mirror = scale, ox, oz, mirror
        self.scene = bpy.context.scene

    def P(self, px, pz):
        dx = (self.OX - px) if self.mirror else (px - self.OX)
        return (dx * self.S, (self.OZ - pz) * self.S)

    def torus(self, name, px, pz, R_px, r_px, material, y=0.0, axis='Y'):
        bpy.ops.mesh.primitive_torus_add(major_radius=R_px * self.S, minor_radius=r_px * self.S, major_segments=32, minor_segments=8)
        ob = bpy.context.active_object; ob.name = name
        x, z = self.P(px, pz)
        ob.location = (x, y, z)
        if axis == 'Y': ob.rotation_euler = (math.pi / 2, 0, 0)
        ob.data.materials.append(mat(material))
        bpy.ops.object.shade_smooth()
        return ob

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



def slide(B):
    """Pistol shooter with a front ring barrel and cone, flip-up arm, round
    badge and slide rail (reference: references/Launchers/Sliding Shooter.jpg,
    1 px = 0.25 mm). Held muzzle-down; the top hangs at the cone tip."""
    slab, cyl = B.slab, B.cyl
    HW = 0.013
    slab('barrel_body', [(165,245),(175,215),(200,192),(245,182),(255,165),(275,178),(470,172),(495,190),(498,318),(290,330),(205,318),(170,300)], 2 * HW, 'body')
    slab('grip', [(290,325),(475,330),(478,345),(412,420),(400,500),(440,580),(445,650),(398,692),(185,645),(172,605),(240,560),(262,450),(282,380)], 2 * HW - 0.002, 'body')
    slab('rear_hook', [(160,250),(150,235),(165,205),(185,210),(178,245)], 0.008, 'body', bevel=0.0006)
    slab('arm', [(452,165),(455,62),(478,50),(500,58),(500,170)], 0.006, 'panel', bevel=0.0008)
    # barrel: housing, ridged ring, cone (along +X)
    cyl('housing', 532, 245, 82, 0.03, 'body', axis='X', verts=32)
    for i in range(5):
        cyl(f'ridge{i}', 572 + i * 9, 245, 78 if i % 2 else 72, 0.0022, 'panel', axis='X', verts=28)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=48 * B.S, radius2=24 * B.S, depth=0.022)
    cone = bpy.context.active_object
    cone.name = 'cone'
    x, z = B.P(680, 265)
    cone.location = (x, 0, z)
    cone.rotation_euler = (0, math.pi / 2, 0)
    cone.data.materials.append(mat('panel'))
    bpy.ops.object.shade_smooth()
    slab('rail', [(290,322),(492,318),(495,345),(292,352)], 2 * HW + 0.001, 'metal', bevel=0.0005, segs=1)
    for side in (-1, 1):
        y = side * HW
        cyl(f'badge_rim{side}', 440, 240, 48, 0.002, 'metal', y=y + side * 0.0005)
        cyl(f'badge{side}', 440, 240, 38, 0.0024, 'accent2', y=y + side * 0.0008)
        slab(f'plate{side}', [(265,215),(375,212),(378,262),(262,265)], 0.0012, 'metal', bevel=0.0003, segs=1, y0=y + side * 0.0004)
        slab(f'stripe_a{side}', [(232,520),(398,388),(412,398),(246,532)], 0.0012, 'accent', bevel=0, y0=y + side * 0.0004)
        slab(f'stripe_b{side}', [(242,545),(405,412),(410,422),(252,555)], 0.0012, 'accent2', bevel=0, y0=y + side * 0.0004)
        slab(f'stripe_c{side}', [(222,598),(232,598),(248,625),(345,630),(345,640),(240,636)], 0.0012, 'accent', bevel=0, y0=y + side * 0.0004)
        for (px, pz) in ((350, 385), (195, 615), (400, 665)):
            cyl(f'screw{px}{side}', px, pz, 9, 0.0016, 'metal', y=y + side * 0.0006)


def clip(B):
    """Clip launcher: a box body with a ripcord slot, a ridged winder wheel on
    top and two prongs that hold the top (reference:
    references/Launchers/EZShooter.jpg, 1 px = 0.15 mm). The top hangs between
    the prongs."""
    slab, cyl = B.slab, B.cyl
    HW = 0.011
    slab('box', [(150,245),(160,232),(645,232),(665,262),(665,395),(650,412),(160,412),(148,395)], 2 * HW, 'body')
    slab('slot_lip', [(265,240),(435,240),(435,355),(265,355)], 2 * HW + 0.0016, 'panel', bevel=0.0005, segs=1)
    slab('wheel', [(215,232),(222,160),(262,148),(310,143),(360,148),(400,160),(412,232)], 0.016, 'panel', bevel=0.0008)
    for i in range(9):
        x0 = 232 + i * 19
        slab(f'wheel_rib{i}', [(x0,232),(x0,152),(x0 + 6,150),(x0 + 6,232)], 0.0172, 'body', bevel=0, segs=1)
    cyl('collar', 368, 470, 150, 0.022, 'panel', axis='Z', verts=36)
    for k in range(16):
        a = k * math.pi / 8
        cyl(f'collar_rib{k}', 368 + 153 * math.cos(a), 466, 10, 0.017, 'body', axis='Z', verts=8, y=153 * math.sin(a) * B.S)
    cyl('collar_ring', 368, 515, 150, 0.0035, 'metal', axis='Z', verts=36)
    for side in (-1, 1):
        x0 = 368 + side * 115
        slab(f'prong{side}', [(x0 - 28, 520), (x0 + 28, 520), (x0 + 18, 690), (x0 - 4, 715), (x0 - 20, 640)], 0.008, 'body', bevel=0.0008)
        slab(f'side_tab{side}', [(x0 - 18, 410), (x0 + 18, 410), (x0 + 16, 490), (x0 - 16, 490)], 0.006, 'body', bevel=0.0006)
        slab(f'band{side}', [(160,318),(648,318),(648,330),(160,330)], 0.0012, 'accent', bevel=0, y0=side * (HW + 0.0004))
        slab(f'grip_line{side}', [(470,262),(630,262),(630,300),(470,300)], 0.0012, 'accent2', bevel=0.0003, segs=1, y0=side * (HW + 0.0004))


def spark(B):
    """Light ripcord launcher, top view: notched square body, hex plate, a
    ripcord rack out one side and a pull ring on the other (reference:
    .claude/research/refs-web/launchers/light-launcher-burst.jpg; 1 unit =
    0.1 mm, centred). Held level; the top hangs under the hub."""
    slab, cyl = B.slab, B.cyl
    slab('body', [(-230,-180),(-180,-230),(180,-230),(230,-180),(230,180),(180,230),(-180,230),(-230,180)], 0.016, 'body', y0=0.012)
    hexa = [(130 * math.cos(math.pi / 6 + k * math.pi / 3), 130 * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]
    slab('hex', hexa, 0.0015, 'panel', bevel=0.0003, segs=1, y0=0.0208)
    for (cx, cz) in ((0, -245), (0, 245), (-245, 0), (245, 0)):
        w, d = (70, 22) if cz else (22, 70)
        slab(f'tab{cx}{cz}', [(cx - w, cz - d), (cx + w, cz - d), (cx + w, cz + d), (cx - w, cz + d)], 0.012, 'body', bevel=0.0006, y0=0.012)
    slab('rack', [(-235,-110),(-250,-135),(-650,-560),(-622,-588),(-218,-150)], 0.003, 'panel', bevel=0.0004, segs=1, y0=0.016)
    for i in range(10):
        t = 0.1 + i * 0.085
        x, z = -250 + (-635 + 250) * t, -130 + (-572 + 130) * t
        slab(f'tooth{i}', [(x - 8, z + 8), (x + 8, z - 8), (x + 14, z - 2), (x - 2, z + 14)], 0.0042, 'panel', bevel=0, segs=1, y0=0.016)
    slab('ring_neck', [(230,60),(300,90),(300,150),(230,150)], 0.006, 'panel', bevel=0.0005, y0=0.012)
    B.torus('ring', 395, 165, 105, 24, 'panel', y=0.012)
    cyl('hub', 0, 0, 120, 0.004, 'panel', axis='Y', y=0.002, verts=32)
    cyl('hub_cap', 0, 0, 70, 0.0012, 'accent', axis='Y', y=-0.0004, verts=24)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cyl(f'pin{k}', 185 * math.cos(a), 185 * math.sin(a), 14, 0.0012, 'metal', axis='Y', y=0.0206)
    slab('stripe', [(-200,140),(200,140),(200,165),(-200,165)], 0.0006, 'accent', bevel=0, y0=0.0203)


def tower_clip(B):
    """Dual-direction clip launcher: a ridged crown tower, a box body with a
    side ratchet rack and prongs below (reference:
    references/Launchers/Neo Reverse Shooter.jpg, 1 px = 0.1 mm). The top
    hangs between the prongs."""
    slab, cyl = B.slab, B.cyl
    HW = 0.015
    cyl('tower', 330, 200, 140, 0.0172, 'body', axis='Z', verts=36)
    for k in range(14):
        a = k * math.pi / 7
        x = 330 + 143 * math.cos(a)
        cyl(f'tower_rib{k}', x, 185, 9, 0.011, 'panel', axis='Z', verts=8, y=143 * math.sin(a) * B.S)
    for side in (-1, 1):
        x0 = 330 + side * 125
        slab(f'crown{side}', [(x0 - 18, 120), (x0 - 10, 45), (x0 + 12, 55), (x0 + 18, 120)], 0.008, 'body', bevel=0.0006)
    slab('box', [(70,295),(90,282),(490,282),(505,300),(505,515),(490,528),(90,528),(70,512)], 2 * HW, 'body')
    slab('seam', [(70,340),(505,340),(505,348),(70,348)], 2 * HW + 0.001, 'panel', bevel=0, segs=1)
    slab('rack', [(470,305),(650,305),(655,280),(730,280),(735,445),(640,450),(640,425),(470,425)], 0.016, 'body', bevel=0.0008)
    for i in range(6):
        x0 = 485 + i * 26
        slab(f'rack_tooth{i}', [(x0, 312), (x0 + 12, 312), (x0 + 12, 418), (x0, 418)], 0.0172, 'panel', bevel=0, segs=1)
    cyl('collar', 330, 505, 145, 0.011, 'panel', axis='Z', verts=36)
    cyl('collar_ring', 330, 555, 150, 0.0025, 'metal', axis='Z', verts=36)
    for side in (-1, 1):
        x0 = 330 + side * 135
        slab(f'prong{side}', [(x0 - 22, 560), (x0 + 22, 560), (x0 + 14, 720), (x0 - 2, 745), (x0 - 16, 660)], 0.008, 'body', bevel=0.0008)
        slab(f'badge{side}', [(120,380),(260,380),(260,460),(120,460)], 0.0012, 'accent', bevel=0.0003, segs=1, y0=side * (HW + 0.0004))
        slab(f'badge2{side}', [(290,390),(420,390),(420,450),(290,450)], 0.0012, 'accent2', bevel=0.0003, segs=1, y0=side * (HW + 0.0004))


def spring_shooter(B):
    """Spring-driven stick shooter: a head block with exposed twin springs,
    knurled knobs and a spin dial, a trigger lever and a long grip; the top
    sits at the bottom end (reference: references/Launchers/Spring Shooter.jpg,
    1 px = 0.22 mm)."""
    slab, cyl = B.slab, B.cyl
    HW = 0.014
    slab('head', [(240,60),(300,30),(410,30),(422,60),(425,250),(410,300),(300,310),(240,290)], 2 * HW, 'body')
    slab('shoulder', [(240,250),(400,240),(470,300),(462,340),(350,342),(300,300)], 2 * HW - 0.002, 'body')
    slab('grip', [(352,330),(525,330),(522,750),(502,790),(432,792),(357,760)], 2 * HW + 0.002, 'body')
    for (pz) in (98, 155):
        cyl(f'knob{pz}', 205, pz, 24, 0.016, 'metal', axis='X', x_off=0.0)
        cyl(f'rod{pz}', 495, pz + 35, 7, 0.032, 'metal', axis='X')
        for i in range(7):
            cyl(f'coil{pz}{i}', 440 + i * 18, pz + 35, 30, 0.0012, 'metal', axis='X', verts=16)
    slab('spring_plate', [(560,55),(585,60),(585,225),(560,230)], 0.022, 'panel', bevel=0.0008)
    slab('lever', [(270,330),(300,345),(228,480),(172,500),(166,480),(240,400)], 0.009, 'panel', bevel=0.0008)
    cyl('pivot', 275, 355, 28, 2 * HW + 0.004, 'metal')
    cyl('cap', 440, 780, 62, 0.008, 'panel', axis='Z', verts=32)
    for side in (-1, 1):
        y = side * (HW + 0.001)
        cyl(f'dial_rim{side}', 312, 232, 58, 0.002, 'metal', y=y + side * 0.0005)
        cyl(f'dial{side}', 312, 232, 46, 0.0024, 'accent2', y=y + side * 0.0008)
        cyl(f'dial_mark{side}', 312, 232, 20, 0.0028, 'accent', y=y + side * 0.001)
        slab(f'label{side}', [(415,420),(468,420),(468,720),(415,720)], 0.0012, 'accent2', bevel=0.0003, segs=1, y0=y + side * 0.0004)
        slab(f'band{side}', [(357,335),(520,335),(520,352),(357,352)], 0.0012, 'accent', bevel=0, y0=y + side * 0.0004)
        cyl(f'screw{side}', 395, 152, 12, 0.0016, 'metal', y=y + side * 0.0006)


def digital(B):
    """Pistol shooter with an LCD readout panel, swept nose and rear wings
    (reference: references/Launchers/Dragon Digital Shooter DX.jpg, 1 px =
    0.25 mm, photo faces left so it is mirrored). Held muzzle-down."""
    slab, cyl = B.slab, B.cyl
    HW = 0.012
    slab('shell', [(200,225),(320,92),(470,82),(560,140),(600,230),(600,330),(548,402),(560,470),(470,482),(430,412),(330,422),(262,330)], 2 * HW, 'body')
    slab('grip', [(330,440),(470,470),(520,520),(560,560),(600,640),(610,700),(560,745),(470,762),(420,700),(362,560),(330,480)], 2 * HW - 0.002, 'body')
    slab('nose', [(30,240),(110,192),(300,178),(305,302),(110,302)], 0.016, 'panel', bevel=0.0010)
    slab('nose_tip', [(52,236),(118,222),(120,252),(58,250)], 0.0168, 'accent2', bevel=0.0004, segs=1)
    slab('bump', [(380,72),(480,72),(482,110),(378,110)], 0.014, 'body', bevel=0.0008)
    slab('wing_top', [(545,165),(672,148),(688,190),(560,215)], 0.008, 'panel', bevel=0.0008)
    slab('wing_low', [(545,350),(560,340),(688,362),(672,402)], 0.008, 'panel', bevel=0.0008)
    for side in (-1, 1):
        y = side * HW
        slab(f'lcd_frame{side}', [(285,150),(310,128),(520,128),(545,150),(545,388),(520,410),(310,410),(285,388)], 0.004, 'panel', bevel=0.0008, y0=y + side * 0.0015)
        slab(f'lcd{side}', [(345,205),(478,205),(478,322),(345,322)], 0.0012, 'lcd', bevel=0.0002, segs=1, y0=y + side * 0.0036)
        for (px, pz, r) in ((522, 200, 16), (528, 262, 22), (522, 322, 16)):
            cyl(f'btn{px}{pz}{side}', px, pz, r, 0.0018, 'accent', y=y + side * 0.0038, verts=6)
        slab(f'grip_panel{side}', [(452,492),(520,502),(590,620),(596,690),(542,702),(502,602)], 0.0012, 'panel', bevel=0.0003, segs=1, y0=y + side * 0.0004)
        cyl(f'trigger{side}', 540, 700, 28, 0.002, 'accent2', y=y + side * 0.0006)
        for (px, pz) in ((310, 150), (515, 150), (310, 388), (515, 388)):
            cyl(f'screw{px}{pz}{side}', px, pz, 9, 0.0012, 'metal', y=y + side * 0.0036)


def string_launcher(B):
    """String launcher, top view: a long body with a T-handle on its pull
    string, a window panel and grip ribs (reference:
    .claude/research/refs-web/launchers/string-launcher-burst.jpg, 1 px =
    0.12 mm). Held level; the top hangs under the wide end."""
    slab, cyl = B.slab, B.cyl
    slab('body', [(150,230),(250,140),(560,150),(620,250),(640,440),(600,560),(612,720),(690,800),(560,892),(330,792),(300,580),(160,510),(110,320)], 0.022, 'body', y0=0.015)
    slab('window', [(250,250),(400,250),(400,420),(322,420),(322,300),(250,300)], 0.0012, 'panel', bevel=0.0003, segs=1, y0=0.0266)
    slab('ridge', [(420,170),(560,180),(600,260),(470,250)], 0.0016, 'accent', bevel=0.0004, segs=1, y0=0.0266)
    for i in range(5):
        x0 = 335 + i * 28
        slab(f'rib{i}', [(x0, 600 + i * 12), (x0 + 14, 600 + i * 12), (x0 + 40, 780), (x0 + 26, 780)], 0.0014, 'body', bevel=0.0002, segs=1, y0=0.0267)
    slab('t_bar', [(80,150),(350,55),(366,90),(100,186)], 0.008, 'panel', bevel=0.0008, y0=0.016)
    slab('t_stem', [(222,118),(246,112),(258,165),(234,170)], 0.004, 'metal', bevel=0.0003, segs=1, y0=0.016)
    cyl('hub', 400, 380, 150, 0.004, 'panel', axis='Y', y=0.002, verts=32)
    cyl('hub_cap', 400, 380, 80, 0.0012, 'accent', axis='Y', y=-0.0004, verts=24)


def precision(B):
    """Ripcord launcher with a round housing and cap, a white body, a black
    handle, a red trigger and a pull tab (reference:
    .claude/research/refs-web/launchers/precision-strike-launcher.jpg, 1 px =
    0.28 mm, top view). Held level; the top hangs under the housing."""
    slab, cyl = B.slab, B.cyl
    cyl('housing_base', 330, 105, 105, 0.006, 'panel', axis='Y', y=0.003, verts=40)
    cyl('housing', 330, 105, 95, 0.016, 'cap', axis='Y', y=0.014, verts=40)
    cyl('housing_top', 330, 105, 70, 0.0015, 'accent2', axis='Y', y=0.0225, verts=32)
    slab('body', [(150,150),(230,80),(300,60),(305,200),(240,250),(150,210)], 0.018, 'body', y0=0.012)
    slab('body_slot', [(175,160),(280,110),(286,130),(182,180)], 0.0012, 'panel', bevel=0.0002, segs=1, y0=0.0216)
    slab('handle', [(10,215),(30,180),(150,130),(175,150),(160,230),(60,300),(20,290)], 0.016, 'panel', bevel=0.0012, y0=0.012)
    slab('trigger', [(160,235),(200,220),(215,280),(185,286)], 0.008, 'cap', bevel=0.0006, y0=0.008)
    slab('tab', [(400,60),(472,50),(472,92),(410,110)], 0.004, 'cap', bevel=0.0006, y0=0.016)
    cyl('hub', 330, 105, 60, 0.003, 'panel', axis='Y', y=0.0, verts=24)


def titan(B):
    """Two-hand launcher grip with a launcher clipped to its head (reference:
    .claude/research/refs-web/launchers/launcher-grip-burst.jpg, 1 px =
    0.18 mm). Held head-down, grip up; the top hangs under the launcher."""
    slab, cyl = B.slab, B.cyl
    HW = 0.014
    slab('grip', [(270,20),(612,20),(616,200),(560,262),(522,800),(582,832),(572,950),(330,950),(320,832),(302,262),(266,200)], 2 * HW, 'body')
    slab('bottom_tab', [(380,948),(500,948),(500,1015),(380,1015)], 0.010, 'panel', bevel=0.0008)
    for side in (-1, 1):
        y = side * (HW + 0.0015)
        slab(f'front_grip{side}', [(262,185),(420,180),(442,230),(382,330),(362,600),(302,830),(296,560),(272,330)], 0.003, 'panel', bevel=0.0010, y0=y)
        slab(f'back_grip{side}', [(456,300),(600,240),(612,262),(546,342),(582,800),(566,812),(472,560)], 0.003, 'panel', bevel=0.0010, y0=y)
        slab(f'frame{side}', [(150 if side < 0 else 615, 70), (265 if side < 0 else 730, 70), (265 if side < 0 else 730, 205), (150 if side < 0 else 615, 205)], 0.008, 'panel', bevel=0.0008)
    # the launcher clipped to the head (its hub faces away from the grip)
    slab('launcher', [(240,-150),(640,-150),(660,-120),(660,20),(220,20),(220,-120)], 2 * HW + 0.006, 'accent2', bevel=0.0015)
    slab('launcher_stripe', [(240,-80),(640,-80),(640,-62),(240,-62)], 2 * HW + 0.0072, 'accent', bevel=0, segs=1)
    cyl('hub', 440, -165, 110, 0.006, 'panel', axis='Z', verts=36)
    cyl('hub_cap', 440, -180, 60, 0.002, 'accent', axis='Z', verts=24)


MODELS = {
    'launcher_catapult': (catapult, dict(scale=0.0003, ox=383, oz=94, pose='flip', hold='tangent')),
    'launcher_slide': (slide, dict(scale=0.00025, ox=722, oz=265, pose='muzzleDown', hold='gripOut')),
    'launcher_clip': (clip, dict(scale=0.00015, ox=368, oz=522, hold='tangent')),
    'launcher_spark': (spark, dict(scale=0.0001, ox=0, oz=0, pose='flat', hold='tangent', palette={'body': '#f2f4f8', 'panel': '#23262e'})),
    'launcher_twin': (tower_clip, dict(scale=0.0001, ox=330, oz=560, hold='tangent', palette={'body': '#2d3db3', 'panel': '#5b6ae0'})),
    'launcher_windup': (spring_shooter, dict(scale=0.00022, ox=440, oz=800, hold='tangent', palette={'body': '#8d97a6', 'panel': '#555d6b'})),
    'launcher_digital': (digital, dict(scale=0.00025, ox=30, oz=240, mirror=True, pose='muzzleDown', hold='gripOut', palette={'body': '#eef0f6', 'panel': '#3b3f8f', 'accent2': '#38d6c8'})),
    'launcher_torque': (string_launcher, dict(scale=0.00012, ox=400, oz=380, pose='flat', hold='tangent', palette={'body': '#e8b22c', 'panel': '#22252c'})),
    'launcher_precision': (precision, dict(scale=0.00028, ox=330, oz=105, pose='flat', hold='tangent', palette={'body': '#f1f2f5', 'panel': '#2a2b30'})),
    'launcher_titan': (titan, dict(scale=0.00018, ox=440, oz=-185, pose='flip', hold='tangent', palette={'body': '#f0f1f4', 'panel': '#25272d', 'accent2': '#c7ccd6'})),
}


# ------------------------------------------------------------ export

def export(lid, pose=None, hold='tangent', palette=None):
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
                    if pose == 'flip':  # half turn about the forward axis
                        p = p.copy(); p.y, p.z = -p.y, -p.z; n = n.copy(); n.y, n.z = -n.y, -n.z
                    elif pose == 'muzzleDown':  # quarter turn about the width axis: +X -> down
                        p = p.copy(); p.x, p.z = p.z, -p.x; n = n.copy(); n.x, n.z = n.z, -n.x
                    elif pose == 'flat':  # top-view model: extrusion axis -> up
                        p = p.copy(); p.y, p.z = -p.z, p.y; n = n.copy(); n.y, n.z = -n.z, n.y
                    g['pos'].append((p.x, p.z, -p.y)); g['nor'].append((n.x, n.z, -n.y))
                g['idx'].append(k)
        ev.to_mesh_clear()
    allp = [p for g in groups.values() for p in g['pos']]
    lo = [min(p[i] for p in allp) for i in range(3)]
    hi = [max(p[i] for p in allp) for i in range(3)]
    meta, blob = {'id': lid, 'hold': hold, 'palette': palette or {}, 'min': lo, 'max': hi, 'groups': []}, bytearray()
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
    fn(Builder(cfg['scale'], cfg['ox'], cfg['oz'], cfg.get('mirror', False)))
    export(lid, cfg.get('pose'), cfg.get('hold', 'tangent'), cfg.get('palette'))
