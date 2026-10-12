# Blender (4.5 LTS) script: renders a 360-degree panorama of an arena hall
# (tiered stands with a crowd, a lighting truss, big screens, banners) seen
# from where the stadium stands. The game uses it in the Realistic art style
# as the backdrop and, prefiltered, for reflections (src/render/environment.js).
#   blender --background --python tools/blender/hall_panorama.py -- <out.jpg> [width] [samples]
import bpy, math, random, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '//hall.jpg'
W = int(argv[1]) if len(argv) > 1 else 2048
SAMPLES = int(argv[2]) if len(argv) > 2 else 48
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.render.resolution_x = W
scene.render.resolution_y = W // 2
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 88
scene.view_settings.view_transform = 'AgX'

world = bpy.data.worlds.new('hall')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.006, 0.007, 0.012, 1)


def material(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def add(op, mat, **kw):
    op(**kw)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    return o


# Template meshes, instanced by linked duplicates (bpy.ops per object is slow).
TEMPLATES = {}


def template(key, op, mat, **kw):
    if key not in TEMPLATES:
        o = add(op, mat, **kw)
        o.location = (0, 0, -100)  # parked out of sight
        TEMPLATES[key] = o.data
    return TEMPLATES[key]


def place(mesh, loc):
    o = bpy.data.objects.new('inst', mesh)
    o.location = loc
    bpy.context.collection.objects.link(o)
    return o


def ring(r_in, r_out, depth, z, mat, vertices=96):
    # a flat ring (annulus) as a solid: outer cylinder minus inner cylinder
    bpy.ops.mesh.primitive_cylinder_add(radius=r_out, depth=depth, location=(0, 0, z), vertices=vertices)
    outer = bpy.context.active_object
    bpy.ops.mesh.primitive_cylinder_add(radius=r_in, depth=depth * 1.2, location=(0, 0, z), vertices=vertices)
    inner = bpy.context.active_object
    mod = outer.modifiers.new('cut', 'BOOLEAN')
    mod.object = inner
    mod.operation = 'DIFFERENCE'
    bpy.context.view_layer.objects.active = outer
    bpy.ops.object.modifier_apply(modifier='cut')
    bpy.data.objects.remove(inner)
    outer.data.materials.append(mat)
    return outer


floor_m = material('floor', (0.02, 0.02, 0.025), rough=0.8)
concrete = material('concrete', (0.16, 0.16, 0.18), rough=0.85)
rail = material('rail', (0.6, 0.62, 0.66), rough=0.25, metal=1.0)
seat_m = [material(f'seat{i}', c, rough=0.6) for i, c in enumerate([(0.08, 0.12, 0.35), (0.35, 0.06, 0.08), (0.09, 0.1, 0.13)])]
skin = [material(f'skin{i}', c, rough=0.7) for i, c in enumerate([(0.85, 0.62, 0.45), (0.55, 0.36, 0.22), (0.33, 0.2, 0.12), (0.95, 0.78, 0.6)])]
shirts = [material(f'shirt{i}', c, rough=0.8) for i, c in enumerate([(0.8, 0.1, 0.1), (0.1, 0.3, 0.85), (0.95, 0.75, 0.1), (0.1, 0.6, 0.3), (0.9, 0.9, 0.92), (0.5, 0.15, 0.7), (0.95, 0.45, 0.1), (0.15, 0.15, 0.18)])]
lamp = material('lamp', (1, 1, 1), emit=(1.0, 0.95, 0.88), strength=60)
truss_m = material('truss', (0.2, 0.2, 0.22), rough=0.4, metal=1.0)
screen_m = material('screen', (0.02, 0.02, 0.02), emit=(0.2, 0.6, 1.0), strength=2.2)
screen2 = material('screen2', (0.02, 0.02, 0.02), emit=(1.0, 0.35, 0.2), strength=2)

# a dark arena floor (the game draws the stadium and its own stands below)
add(bpy.ops.mesh.primitive_cylinder_add, floor_m, radius=40, depth=0.2, location=(0, 0, -1.1))

# tiered stands with a crowd
TIERS = [(9.0, 0.0), (11.5, 1.4), (14.0, 2.8), (16.5, 4.2), (19.0, 5.6)]
for ti, (r, h) in enumerate(TIERS):
    ring(r, r + 2.4, 1.4, h - 0.4, concrete)
    bpy.ops.mesh.primitive_torus_add(major_radius=r + 0.05, minor_radius=0.03, location=(0, 0, h + 0.7))
    bpy.context.active_object.data.materials.append(rail)
    n = int(2 * math.pi * (r + 1.0) / 0.55)
    for k in range(n):
        if (k % 24) < 2:  # aisle
            continue
        if random.random() < 0.08:  # an empty seat
            continue
        a = 2 * math.pi * k / n
        rr = r + 1.0 + random.uniform(-0.1, 0.1)
        x, y = math.cos(a) * rr, math.sin(a) * rr
        si = ti % len(seat_m)
        place(template(('seat', si), bpy.ops.mesh.primitive_cube_add, seat_m[si], size=0.4), (x, y, h + 0.5))
        sh = random.randrange(len(shirts))
        place(template(('body', sh), bpy.ops.mesh.primitive_cylinder_add, shirts[sh], radius=0.17, depth=0.55, vertices=8), (x, y, h + 0.95))
        sk = random.randrange(len(skin))
        place(template(('head', sk), bpy.ops.mesh.primitive_uv_sphere_add, skin[sk], radius=0.13, segments=8, ring_count=6), (x, y, h + 1.35))
        if random.random() < 0.18:  # a raised arm
            place(template(('arm', sk), bpy.ops.mesh.primitive_cylinder_add, skin[sk], radius=0.04, depth=0.5, vertices=6), (x + 0.12, y, h + 1.55))

# lighting truss with lamps over the stadium
for k in range(16):
    a = 2 * math.pi * k / 16
    add(bpy.ops.mesh.primitive_cylinder_add, lamp, radius=0.35, depth=0.25, location=(math.cos(a) * 6.5, math.sin(a) * 6.5, 9.0))
add(bpy.ops.mesh.primitive_torus_add, truss_m, major_radius=6.5, minor_radius=0.12, location=(0, 0, 9.3))
for k in range(4):
    a = 2 * math.pi * k / 4 + math.pi / 4
    add(bpy.ops.mesh.primitive_cylinder_add, truss_m, radius=0.08, depth=12, location=(math.cos(a) * 6.5, math.sin(a) * 6.5, 15.3))

# big screens and banners around the top of the bowl
for k in range(4):
    a = 2 * math.pi * k / 4
    s = add(bpy.ops.mesh.primitive_plane_add, screen_m if k % 2 == 0 else screen2, size=1, location=(math.cos(a) * 24, math.sin(a) * 24, 10))
    s.scale = (7, 4, 1)
    s.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)
for k in range(24):
    a = 2 * math.pi * (k + 0.5) / 24
    col = [(0.9, 0.15, 0.2), (0.15, 0.45, 0.95), (0.95, 0.8, 0.15)][k % 3]
    b = add(bpy.ops.mesh.primitive_plane_add, material(f'banner{k}', col, rough=0.9, emit=col, strength=0.4), size=1, location=(math.cos(a) * 21.8, math.sin(a) * 21.8, 8.2))
    b.scale = (0.9, 2.2, 1)
    b.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)

# real lights: spots from the truss onto the stadium and a big soft top light
for k in range(4):
    a = 2 * math.pi * k / 4
    bpy.ops.object.light_add(type='SPOT', location=(math.cos(a) * 6.5, math.sin(a) * 6.5, 8.8))
    L = bpy.context.active_object
    L.data.energy = 6000
    L.data.spot_size = math.radians(45)
    L.rotation_euler = (math.radians(35), 0, a + math.pi / 2)
bpy.ops.object.light_add(type='AREA', location=(0, 0, 14))
bpy.context.active_object.data.energy = 3500
bpy.context.active_object.data.size = 10

# 360-degree camera where the stadium stands, at table height
bpy.ops.object.camera_add(location=(0, 0, 0.6), rotation=(math.pi / 2, 0, 0))
cam = bpy.context.active_object
cam.data.type = 'PANO'
try:
    cam.data.panorama_type = 'EQUIRECTANGULAR'
except AttributeError:
    cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
scene.camera = cam
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('rendered', OUT)
