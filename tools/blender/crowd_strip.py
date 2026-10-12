# Blender (4.5 LTS) script: renders one row of seated spectators (17 seats,
# some cheering, some empty) facing the camera on a transparent background.
# The Realistic art style paints it onto the stand risers in place of the
# drawn crowd (src/render/arenaMesh.js crowdTexture); the tile wraps, so no
# one is cut by the image edges.
#   blender --background --python tools/blender/crowd_strip.py -- <out.webp> [width] [samples]
import bpy, math, random, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '//crowd.webp'
W = int(argv[1]) if len(argv) > 1 else 2048
SAMPLES = int(argv[2]) if len(argv) > 2 else 48
N = 17
SEAT = 1.0  # seat pitch (m)
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = W
scene.render.resolution_y = W // 9
# WebP keeps the alpha and is a third of the PNG's size
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.quality = 82
scene.view_settings.view_transform = 'AgX'

world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.05, 0.07, 1)


def material(name, color, rough=0.7, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def obj(op, mat, **kw):
    op(**kw)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


skins = [material(f'skin{i}', c, 0.55) for i, c in enumerate([(0.86, 0.63, 0.47), (0.62, 0.42, 0.28), (0.36, 0.22, 0.13), (0.95, 0.78, 0.62), (0.75, 0.52, 0.36)])]
hairs = [material(f'hair{i}', c, 0.45) for i, c in enumerate([(0.03, 0.02, 0.02), (0.15, 0.08, 0.04), (0.35, 0.2, 0.08), (0.7, 0.55, 0.3), (0.08, 0.08, 0.1), (0.4, 0.06, 0.05)])]
shirts = [material(f'shirt{i}', c, 0.8) for i, c in enumerate([(0.75, 0.08, 0.1), (0.08, 0.25, 0.8), (0.95, 0.72, 0.08), (0.08, 0.55, 0.25), (0.88, 0.88, 0.9), (0.45, 0.12, 0.65), (0.95, 0.42, 0.08), (0.12, 0.12, 0.15), (0.1, 0.6, 0.75)])]
pants = material('pants', (0.06, 0.07, 0.1), 0.85)

for i in range(N):
    x = (i - (N - 1) / 2) * SEAT + random.uniform(-0.06, 0.06)
    if random.random() < 0.1:
        continue  # empty seat
    shirt = random.choice(shirts)
    skin = random.choice(skins)
    lean = random.uniform(-0.08, 0.08)
    # torso (seated, seen from the front), shoulders, head, hair
    t = obj(bpy.ops.mesh.primitive_uv_sphere_add, shirt, radius=0.27, location=(x, 0, 0.42), segments=16, ring_count=10)
    t.scale = (1.05, 0.7, 1.15)
    t.rotation_euler = (0, lean, 0)
    obj(bpy.ops.mesh.primitive_uv_sphere_add, skin, radius=0.075, location=(x, 0, 0.72), segments=10, ring_count=6)  # neck
    h = obj(bpy.ops.mesh.primitive_uv_sphere_add, skin, radius=0.17, location=(x + lean * 0.6, -0.02, 0.92), segments=16, ring_count=10)
    h.scale = (0.92, 0.95, 1.08)
    hr = obj(bpy.ops.mesh.primitive_uv_sphere_add, random.choice(hairs), radius=0.18, location=(x + lean * 0.6, 0.03, 0.99), segments=16, ring_count=10)
    hr.scale = (0.98, 0.95, 0.75)
    # legs below the riser edge are hidden; the lap shows
    lap = obj(bpy.ops.mesh.primitive_cube_add, pants, size=0.3, location=(x, -0.1, 0.12))
    lap.scale = (1.5, 1.2, 0.5)
    # arms: down on the lap, or one raised in a cheer
    if random.random() < 0.28:
        # from the shoulder up and a little out
        a = obj(bpy.ops.mesh.primitive_cylinder_add, shirt, radius=0.065, depth=0.6, location=(x + 0.3, -0.02, 0.88), vertices=10)
        a.rotation_euler = (0, math.radians(12), 0)
        obj(bpy.ops.mesh.primitive_uv_sphere_add, skin, radius=0.075, location=(x + 0.36, -0.02, 1.18), segments=10, ring_count=6)
        side = -1
    else:
        side = 0
    for s in ([-1, 1] if side == 0 else [-1]):
        a = obj(bpy.ops.mesh.primitive_cylinder_add, shirt, radius=0.06, depth=0.42, location=(x + s * 0.27, -0.04, 0.3), vertices=10)
        a.rotation_euler = (math.radians(20), s * math.radians(8), 0)

# lighting: stadium floods from above and in front, a cool rim from behind
bpy.ops.object.light_add(type='AREA', location=(0, -6, 6))
key = bpy.context.active_object
key.data.energy = 2500
key.data.size = 14
key.rotation_euler = (math.radians(45), 0, 0)
bpy.ops.object.light_add(type='AREA', location=(0, 4, 3))
rim = bpy.context.active_object
rim.data.energy = 600
rim.data.size = 14
rim.data.color = (0.6, 0.75, 1.0)
rim.rotation_euler = (math.radians(-120), 0, 0)

# orthographic camera framing exactly N seats wide, so the tile wraps
bpy.ops.object.camera_add(location=(0, -10, 0.6), rotation=(math.pi / 2, 0, 0))
cam = bpy.context.active_object
cam.data.type = 'ORTHO'
cam.data.ortho_scale = N * SEAT
scene.camera = cam
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('rendered', OUT)
