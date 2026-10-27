"""Build the renewable-transition landscape in Blender and render it.

blender -b --factory-startup --python scene.py -- still 4 12 30      (stills at those seconds)
blender -b --factory-startup --python scene.py -- render 0 2576       (frames, inclusive)

Frames go to build/frames/f00000.png and the per-frame state the HUD needs
(year, label anchors) to build/state/f00000.json.
"""
import bisect
import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Matrix, Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import globe as globe_mod  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
BUILD = os.path.join(HERE, "build")
DATA = json.load(open(os.path.join(HERE, "..", "data.json"), encoding="utf-8"))
TIMING = json.load(open(os.path.join(BUILD, "timing.json"), encoding="utf-8"))
FPS = TIMING["fps"]
SCENES = {s["id"]: s for s in TIMING["scenes"]}

YEARS = DATA["years"]
WIND = DATA["wind"]
SOLAR = DATA["solar"]
FOSSIL = [g - r for g, r in zip(DATA["generation"], DATA["total"])]
N_TURBINES = 26
N_ROWS = 48

SUN = Vector((-0.42, -0.62, 0.66)).normalized()
HAZE = (0.72, 0.80, 0.90)
rng = random.Random(7)


# ---------------------------------------------------------------- timeline

def lerp(a, b, u):
    return a + (b - a) * u


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def year_at(t):
    """2005 to 2015 while the stall is described, then 2015 to 2024 with the reset."""
    g = SCENES["growth"]
    l0, l1 = g["lines"][0], g["lines"][1]
    a0 = g["start"] + 0.3
    if t <= a0:
        return 2005.0
    if t < l1["start"]:
        return lerp(2005.0, 2015.0, min(1.0, (t - a0) / (l0["end"] - a0)))
    return lerp(2015.0, 2024.0, smooth((t - l1["start"]) / (l1["end"] - 0.8 - l1["start"])))


DISSOLVE = 0.8
VOLUME = {"China": 3398.8, "Germany": 288.3, "Australia": 97.9, "New Zealand": 37.5}
SHARE_2024 = {"New Zealand": 85.5, "Germany": 54.5, "Australia": 35.0, "China": 33.7}


def globe_weight(t):
    """1 while the Earth is on screen, 0 over the farm, with dissolves between."""
    t1 = SCENES["title"]["end"]
    w0, w1 = SCENES["world"]["start"], SCENES["world"]["end"]
    d = DISSOLVE / 2
    if t < t1 - d:
        return 1.0
    if t < t1 + d:
        return 1 - smooth((t - t1 + d) / DISSOLVE)
    if t < w0 - d:
        return 0.0
    if t < w0 + d:
        return smooth((t - w0 + d) / DISSOLVE)
    if t < w1 - d:
        return 1.0
    if t < w1 + d:
        return 1 - smooth((t - w1 + d) / DISSOLVE)
    return 0.0


def globe_heights(t):
    w = SCENES["world"]
    l0, l1 = w["lines"][0], w["lines"][1]
    grow = smooth((t - l0["start"] + 0.2) / 1.2)
    flip = smooth((t - l1["start"] - 0.6) / 1.6)
    out = {}
    for n in VOLUME:
        hv = 5.0 * VOLUME[n] / VOLUME["China"]
        hs = 5.0 * SHARE_2024[n] / 100
        out[n] = max(0.04, lerp(hv, hs, flip)) * grow
    return out


def pose_globe(g, t):
    t1 = SCENES["title"]["end"]
    if t < t1 + DISSOLVE:
        u = min(1.0, t / (t1 + DISSOLVE / 2))
        k = smooth(u)
        alt = 52.0 * (5.5 / 52.0) ** (u ** 1.4)
        g.look(lerp(100, 134, k), lerp(4, -26, k), globe_mod.R + alt, offset=0.32 * (1 - k))
        glow = 3.0 * smooth((u - 0.45) / 0.2) * (1 - smooth((u - 0.88) / 0.1))
        g.set_heights({}, glow)
    else:
        w = SCENES["world"]
        u = (t - w["start"] + DISSOLVE) / (w["end"] - w["start"] + 2 * DISSOLVE)
        g.look(lerp(114, 124, u), lerp(8, 3, u), lerp(66, 61, u), offset=0.6, lift=0.1)
        g.set_heights(globe_heights(t), 0.0)
    g.sun.rotation_euler = (Vector((0, 0, 0)) - g.cam.location.normalized() * 10
                            - Vector((0, 0, -3))).to_track_quat("-Z", "Y").to_euler()


def globe_anchors(g, t):
    hs = globe_heights(t)
    out = {}
    cam_dir = g.cam.location.normalized()
    for n in VOLUME:
        p = g.anchor(n, hs[n])
        c = world_to_camera_view(g.scene, g.cam, p)
        facing = p.normalized().dot(cam_dir)
        out[n] = [round(c.x, 4), round(1 - c.y, 4), round(facing, 3)]
    return out


def series(values, year):
    y = min(max(year, YEARS[0]), YEARS[-1])
    i = min(int(y - YEARS[0]), len(YEARS) - 2)
    return lerp(values[i], values[i + 1], y - YEARS[0] - i)


# ---------------------------------------------------------------- terrain

def height(x, y):
    d = math.hypot(x * 0.8, y + 150)
    hills = noise.noise(Vector((x / 900, y / 900, 0.3))) * 22 + noise.noise(Vector((x / 260, y / 260, 2.0))) * 4
    ridge = smooth((y - 140) / 520) * 30 * smooth((-x + 60) / 200)
    ridge *= (1 - smooth((y - 1000) / 700)) * (1 - smooth((-x - 1300) / 600))
    flat = smooth((d - 520) / 900)
    return hills * flat + ridge


# ---------------------------------------------------------------- materials

def node_mix(nt, fac, a, b, blend="MIX"):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    m.blend_type = blend
    ins = [s for s in m.inputs]
    f = ins[0]
    A = [s for s in ins if s.name == "A" and s.type == "RGBA"][0]
    B = [s for s in ins if s.name == "B" and s.type == "RGBA"][0]
    for sock, v in ((f, fac), (A, a), (B, b)):
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, sock)
        elif isinstance(v, (int, float)):
            sock.default_value = v
        else:
            sock.default_value = (*v, 1.0) if len(v) == 3 else v
    return [s for s in m.outputs if s.type == "RGBA"][0]


def math_node(nt, op, a, b=None, c=None, clamp=False):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = op
    m.use_clamp = clamp
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, m.inputs[i])
        else:
            m.inputs[i].default_value = v
    return m.outputs[0]


def new_mat(name, color, rough=0.6, metal=0.0, spec=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = mat.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Specular IOR Level"].default_value = spec
    return mat


def image(path, colour=True):
    img = bpy.data.images.load(path, check_existing=True)
    if not colour:
        img.colorspace_settings.name = "Non-Color"
    return img


def haze(nt, shader_out, strength=1.0):
    """Mix a shader toward the sky colour with distance from the camera."""
    cam = nt.nodes.new("ShaderNodeCameraData")
    d = math_node(nt, "DIVIDE", cam.outputs["View Distance"], -12000.0 / strength)
    fac = math_node(nt, "SUBTRACT", 1.0, math_node(nt, "EXPONENT", d), clamp=True)
    fac = math_node(nt, "MULTIPLY", fac, 0.6)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*HAZE, 1)
    em.inputs["Strength"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fac, mix.inputs[0])
    nt.links.new(shader_out, mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    return mix.outputs[0]


def terrain_material():
    mat = bpy.data.materials.new("terrain")
    mat.use_nodes = True
    nt = mat.node_tree
    p = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tex_dir = os.path.join(ASSETS, "texture", "aerial_grass_rock")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 30, 1 / 30, 1 / 30)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    diff = nt.nodes.new("ShaderNodeTexImage")
    diff.image = image(os.path.join(tex_dir, "diff.jpg"))
    nt.links.new(mp.outputs[0], diff.inputs[0])
    nor = nt.nodes.new("ShaderNodeTexImage")
    nor.image = image(os.path.join(tex_dir, "nor.jpg"), False)
    nt.links.new(mp.outputs[0], nor.inputs[0])
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    cam0 = nt.nodes.new("ShaderNodeCameraData")
    nt.links.new(math_node(nt, "MULTIPLY", 0.6, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "DIVIDE", cam0.outputs["View Distance"], 500.0), clamp=True)), nmap.inputs["Strength"])
    nt.links.new(nor.outputs[0], nmap.inputs["Color"])
    nt.links.new(nmap.outputs[0], p.inputs["Normal"])

    # paddocks: one flat colour per Voronoi cell, stretched into long fields
    mp2 = nt.nodes.new("ShaderNodeMapping")
    mp2.inputs["Scale"].default_value = (1 / 520, 1 / 340, 0)
    mp2.inputs["Rotation"].default_value = (0, 0, math.radians(8))
    nt.links.new(tc.outputs["Object"], mp2.inputs["Vector"])
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.distance = "CHEBYCHEV"
    vor.inputs["Randomness"].default_value = 0.85
    nt.links.new(mp2.outputs[0], vor.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vor.outputs["Color"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    cols = [(0.0, (0.62, 0.45, 0.17)), (0.2, (0.33, 0.36, 0.14)), (0.38, (0.74, 0.57, 0.27)),
            (0.55, (0.47, 0.31, 0.16)), (0.72, (0.27, 0.31, 0.13)), (0.86, (0.68, 0.53, 0.29))]
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = cols[0][0], (*cols[0][1], 1)
    els[1].position, els[1].color = cols[1][0], (*cols[1][1], 1)
    for pos, c in cols[2:]:
        e = els.new(pos)
        e.color = (*c, 1)
    nt.links.new(sep.outputs[0], ramp.inputs[0])

    # crop rows inside each field
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 0.9
    wave.inputs["Distortion"].default_value = 0.0
    mp3 = nt.nodes.new("ShaderNodeMapping")
    mp3.inputs["Scale"].default_value = (1 / 4, 1 / 4, 0)
    nt.links.new(tc.outputs["Object"], mp3.inputs["Vector"])
    nt.links.new(mp3.outputs[0], wave.inputs["Vector"])
    cam = nt.nodes.new("ShaderNodeCameraData")
    near = math_node(nt, "SUBTRACT", 1.0, math_node(nt, "DIVIDE", cam.outputs["View Distance"], 260.0), clamp=True)
    far = math_node(nt, "SUBTRACT", 1.0, math_node(nt, "DIVIDE", cam.outputs["View Distance"], 650.0), clamp=True)
    rows = math_node(nt, "MULTIPLY_ADD", wave.outputs["Fac"], math_node(nt, "MULTIPLY", near, 0.14),
                     math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MULTIPLY", near, 0.07)))

    # fence lines between paddocks, darker
    edge = nt.nodes.new("ShaderNodeTexVoronoi")
    edge.feature = "DISTANCE_TO_EDGE"
    edge.distance = "CHEBYCHEV"
    edge.inputs["Randomness"].default_value = 0.85
    nt.links.new(mp2.outputs[0], edge.inputs["Vector"])
    edge_m = math_node(nt, "SMOOTH_MIN", math_node(nt, "MULTIPLY", edge.outputs["Distance"], 140.0), 1.0, 0.3)

    tex_gray = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(diff.outputs[0], tex_gray.inputs[0])
    detail = math_node(nt, "MULTIPLY_ADD", tex_gray.outputs[0], math_node(nt, "MULTIPLY", far, 1.3),
                       math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MULTIPLY", far, 0.55)))
    base = node_mix(nt, math_node(nt, "MULTIPLY", far, 0.3), ramp.outputs[0], diff.outputs[0], "MIX")
    base = node_mix(nt, 1.0, base, math_node(nt, "MULTIPLY", detail, rows), "MULTIPLY")
    base = node_mix(nt, 1.0, base, math_node(nt, "MULTIPLY_ADD", edge_m, 0.3, 0.7), "MULTIPLY")

    # big soft variation so it never looks tiled
    big = nt.nodes.new("ShaderNodeTexNoise")
    big.inputs["Scale"].default_value = 0.0012
    nt.links.new(tc.outputs["Object"], big.inputs["Vector"])
    base = node_mix(nt, 0.25, base, big.outputs["Color"], "OVERLAY")
    nt.links.new(base, p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.92
    p.inputs["Specular IOR Level"].default_value = 0.2
    nt.links.new(haze(nt, p.outputs[0]), out.inputs["Surface"])
    return mat


def yard_material():
    mat = bpy.data.materials.new("yard")
    mat.use_nodes = True
    nt = mat.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 6, 1 / 6, 1 / 6)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = image(os.path.join(ASSETS, "texture", "dry_ground_01", "diff.jpg"))
    nt.links.new(mp.outputs[0], t.inputs[0])
    col = node_mix(nt, 0.6, t.outputs[0], (0.42, 0.40, 0.37), "MIX")
    nt.links.new(col, p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.95
    nt.links.new(haze(nt, p.outputs[0]), nt.nodes["Material Output"].inputs["Surface"])
    return mat


def panel_material():
    mat = bpy.data.materials.new("panel")
    mat.use_nodes = True
    nt = mat.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Mortar Size"].default_value = 0.02
    br.inputs["Brick Width"].default_value = 1.0
    br.inputs["Row Height"].default_value = 1.0
    br.offset = 0.0
    br.inputs["Color1"].default_value = (0.02, 0.05, 0.16, 1)
    br.inputs["Color2"].default_value = (0.025, 0.06, 0.18, 1)
    br.inputs["Mortar"].default_value = (0.55, 0.58, 0.62, 1)
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 1.0, 1.0)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], br.inputs["Vector"])
    nt.links.new(br.outputs["Color"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.22
    p.inputs["Metallic"].default_value = 0.1
    p.inputs["Coat Weight"].default_value = 0.25
    p.inputs["Specular IOR Level"].default_value = 0.25
    return mat


def concrete_material(name, color, scale=0.08):
    mat = new_mat(name, color, rough=0.85, spec=0.3)
    nt = mat.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = 6
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    stain = math_node(nt, "MULTIPLY_ADD", n.outputs["Fac"], 0.35, 0.82)
    col = node_mix(nt, 1.0, color, stain, "MULTIPLY")
    nt.links.new(col, p.inputs["Base Color"])
    return mat


def plume_material(name, color, base_density):
    """Rising, drifting plume inside a unit cube domain."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    out = nt.nodes["Material Output"]
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*color, 1)
    vol.inputs["Anisotropy"].default_value = 0.3
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    z01 = math_node(nt, "MULTIPLY_ADD", sep.outputs["Z"], 0.5, 0.5)
    # bend with the wind: shift x as the plume rises
    xs = math_node(nt, "SUBTRACT", sep.outputs["X"], math_node(nt, "MULTIPLY", math_node(nt, "POWER", z01, 1.6), 1.1))
    xs = math_node(nt, "ADD", xs, 0.55)
    r = math_node(nt, "SQRT", math_node(nt, "ADD", math_node(nt, "MULTIPLY", xs, xs),
                                        math_node(nt, "MULTIPLY", sep.outputs["Y"], sep.outputs["Y"])))
    width = math_node(nt, "MULTIPLY_ADD", z01, 0.55, 0.16)
    radial = math_node(nt, "SUBTRACT", 1.0, math_node(nt, "DIVIDE", r, width), clamp=True)
    noise_n = nt.nodes.new("ShaderNodeTexNoise")
    noise_n.noise_dimensions = "4D"
    noise_n.inputs["Scale"].default_value = 2.2
    noise_n.inputs["Detail"].default_value = 4
    noise_n.inputs["Roughness"].default_value = 0.55
    tnode = nt.nodes.new("ShaderNodeValue")
    tnode.name = "clock"
    dnode = nt.nodes.new("ShaderNodeValue")
    dnode.name = "amount"
    dnode.outputs[0].default_value = 1.0
    mp = nt.nodes.new("ShaderNodeMapping")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], noise_n.inputs["Vector"])
    nt.links.new(tnode.outputs[0], noise_n.inputs["W"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.38
    mr.inputs["From Max"].default_value = 0.72
    nt.links.new(noise_n.outputs["Fac"], mr.inputs["Value"])
    top = math_node(nt, "SUBTRACT", 1.0, z01, clamp=True)
    bottom = math_node(nt, "MULTIPLY", z01, 10.0, clamp=True)
    d = math_node(nt, "MULTIPLY", radial, mr.outputs[0])
    d = math_node(nt, "MULTIPLY", d, math_node(nt, "MULTIPLY", top, bottom))
    d = math_node(nt, "MULTIPLY", d, math_node(nt, "MULTIPLY", dnode.outputs[0], base_density))
    nt.links.new(d, vol.inputs["Density"])
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return mat


# ---------------------------------------------------------------- geometry helpers

def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_obj(name, bm, mat=None, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if mat:
        me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), coll)


def box(bm, cx, cy, cz, sx, sy, sz):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=r["verts"])
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=r["verts"])
    return r["verts"]


def cyl(bm, cx, cy, z0, h, r0, r1, seg=24):
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.translate(bm, vec=(cx, cy, z0 + h / 2), verts=r["verts"])
    return r["verts"]


def lathe(bm, profile, seg=48, cap=False):
    """Revolve [(r, z), ...] around Z."""
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(len(profile) - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))


def smooth_shade(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


# ---------------------------------------------------------------- build

def build_world():
    world = bpy.data.worlds.new("sky")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    hdr = os.path.join(ASSETS, "hdri", "kloofendal_48d_partly_cloudy_puresky", "kloofendal_48d_partly_cloudy_puresky.hdr")
    env.image = image(hdr)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], env.inputs["Vector"])
    sepz = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sepz.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 0.07
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    nt.links.new(sepz.outputs["Z"], mr.inputs["Value"])
    sky = node_mix(nt, mr.outputs[0], env.outputs[0], HAZE, "MIX")
    nt.links.new(sky, bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0

    # turn the HDRI so its sun sits where SUN points
    img = env.image
    w, h = img.size
    px = img.pixels[:]
    best, bi = -1.0, 0
    for i in range(0, w * h, 7):
        v = px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]
        if v > best:
            best, bi = v, i
    u = (bi % w + 0.5) / w
    hdr_az = (u - 0.5) * 2 * math.pi * -1 + math.pi
    want_az = math.atan2(SUN.y, SUN.x)
    mp.inputs["Rotation"].default_value = (0, 0, want_az - hdr_az)
    for attr, val in (("sun_threshold", 5.0), ("sun_angle", math.radians(1.2)), ("use_sun_shadow", True)):
        if hasattr(world, attr):
            setattr(world, attr, val)
    return world


def build_terrain():
    bm = bmesh.new()
    size, n = 60000, 320
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    # finer grid near the farm and plant
    for v in bm.verts:
        x, y = v.co.x, v.co.y
        k = 1.0 + 7.0 * math.exp(-((x / 6000) ** 2 + (y / 6000) ** 2))
        v.co.x, v.co.y = x / k, y / k
    for v in bm.verts:
        v.co.z = height(v.co.x, v.co.y) - 0.4
    obj = mesh_obj("terrain", bm, terrain_material())
    obj.visible_shadow = False
    smooth_shade(obj)

    bm = bmesh.new()
    box(bm, 300, 90, -0.2, 380, 330, 0.6)
    mesh_obj("yard", bm, yard_material())

    # gravel roads
    road = new_mat("road", (0.50, 0.40, 0.29), rough=0.95, spec=0.2)
    bm = bmesh.new()
    for x0, y0, x1, y1, wdt in ((-2600, -235, 2600, -235, 9), (40, -235, 40, 900, 7), (-460, -150, -60, -150, 5)):
        steps = int(math.hypot(x1 - x0, y1 - y0) / 20)
        dx, dy = (x1 - x0) / steps, (y1 - y0) / steps
        nx, ny = -dy, dx
        ln = math.hypot(nx, ny)
        nx, ny = nx / ln * wdt / 2, ny / ln * wdt / 2
        prev = None
        for i in range(steps + 1):
            x, y = x0 + dx * i, y0 + dy * i
            z = height(x, y) + 0.12
            a = bm.verts.new((x + nx, y + ny, z))
            b = bm.verts.new((x - nx, y - ny, z))
            if prev:
                bm.faces.new((prev[0], prev[1], b, a))
            prev = (a, b)
    mesh_obj("roads", bm, road)


def build_solar():
    mat = panel_material()
    frame = new_mat("frame", (0.6, 0.62, 0.64), rough=0.4, metal=0.8)
    bm = bmesh.new()
    length, width, tilt = 72.0, 4.2, math.radians(24)
    verts = box(bm, 0, 0, 0, length, width, 0.12)
    bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-tilt, 3, "X"))
    bmesh.ops.translate(bm, verts=verts, vec=(0, 0, 2.1))
    me_panel = bpy.data.meshes.new("panel_row")
    bm.to_mesh(me_panel)
    bm.free()
    me_panel.materials.append(mat)
    bm = bmesh.new()
    for i in range(9):
        x = -length / 2 + 2 + i * (length - 4) / 8
        box(bm, x, 0.8, 1.1, 0.15, 0.15, 2.2)
        box(bm, x, -0.9, 1.6, 0.15, 0.15, 3.2)
    box(bm, 0, 0, 2.0, length, 0.2, 0.2)
    me_legs = bpy.data.meshes.new("panel_legs")
    bm.to_mesh(me_legs)
    bm.free()
    me_legs.materials.append(frame)

    rows = []
    blocks = [(-380, -122), (-298, -122), (-216, -122), (-134, -122)]
    order = []
    for r in range(12):
        for bi, (bx, by) in enumerate(blocks):
            order.append((bi, r))
    order.sort(key=lambda p: (p[0] // 2, p[1], p[0]))
    for bi, r in order[:N_ROWS]:
        bx, by = blocks[bi]
        y = by + r * 9.4
        root = bpy.data.objects.new(f"row_{len(rows)}", None)
        link(root)
        root.location = (bx, y, height(bx, y))
        for me in (me_panel, me_legs):
            o = link(bpy.data.objects.new(f"{me.name}_{len(rows)}", me))
            o.parent = root
        rows.append(root)
    # inverters and substation
    grey = concrete_material("substation", (0.72, 0.72, 0.70))
    bm = bmesh.new()
    for bx, _ in blocks:
        box(bm, bx, -140, 1.3, 6, 2.6, 2.6)
    box(bm, -60, -40, 2.5, 26, 18, 5)
    for i in range(4):
        box(bm, -66 + i * 4, -40, 7, 0.6, 0.6, 8)
    mesh_obj("inverters", bm, grey)
    return rows


def blade_mesh():
    bm = bmesh.new()
    L = 56.0
    sec = []
    for i in range(13):
        u = i / 12
        chord = 3.6 * (1 - u) ** 0.8 + 0.5 if u > 0.06 else 2.2 + u * 20
        thick = 0.9 * (1 - u) + 0.12
        twist = math.radians(14 * (1 - u))
        z = u * L
        pts = []
        for px, py in ((-0.3, 0), (0, thick / 2), (0.7, 0), (0, -thick / 2)):
            x = px * chord
            y = py
            xr = x * math.cos(twist) - y * math.sin(twist)
            yr = x * math.sin(twist) + y * math.cos(twist)
            pts.append(bm.verts.new((xr, yr, z + 1.6)))
        sec.append(pts)
    for a, b in zip(sec, sec[1:]):
        for j in range(4):
            bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
    bm.faces.new(sec[-1])
    me = bpy.data.meshes.new("blade")
    bm.to_mesh(me)
    bm.free()
    return me


def build_wind():
    white = new_mat("turbine", (0.86, 0.87, 0.88), rough=0.35, spec=0.5)
    bm = bmesh.new()
    cyl(bm, 0, 0, 0, 96, 2.3, 1.35, 28)
    me_tower = bpy.data.meshes.new("tower")
    bm.to_mesh(me_tower)
    bm.free()
    me_tower.materials.append(white)
    for p in me_tower.polygons:
        p.use_smooth = True
    bm = bmesh.new()
    box(bm, 0, 2.2, 97.5, 3.6, 11, 3.8)
    me_nac = bpy.data.meshes.new("nacelle")
    bm.to_mesh(me_nac)
    bm.free()
    me_nac.materials.append(white)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.9)
    me_hub = bpy.data.meshes.new("hub")
    bm.to_mesh(me_hub)
    bm.free()
    me_hub.materials.append(white)
    for p in me_hub.polygons:
        p.use_smooth = True
    me_blade = blade_mesh()
    me_blade.materials.append(white)

    sites = []
    tries = 0
    while len(sites) < N_TURBINES and tries < 5000:
        tries += 1
        x = rng.uniform(-980, -40)
        y = rng.uniform(170, 640)
        if all(math.hypot(x - a, y - b) > 125 for a, b in sites):
            sites.append((x, y))
    sites.sort(key=lambda p: math.hypot(p[0] + 260, p[1] - 200))
    turbines = []
    for i, (x, y) in enumerate(sites):
        root = link(bpy.data.objects.new(f"turbine_{i}", None))
        root.location = (x, y, height(x, y) - 0.5)
        root.rotation_euler = (0, 0, math.radians(rng.uniform(-14, 6)))
        for me in (me_tower, me_nac):
            o = link(bpy.data.objects.new(f"{me.name}_{i}", me))
            o.parent = root
        rotor = link(bpy.data.objects.new(f"rotor_{i}", None))
        rotor.parent = root
        rotor.location = (0, -3.9, 97.6)
        hub = link(bpy.data.objects.new(f"hub_{i}", me_hub))
        hub.parent = rotor
        for k in range(3):
            b = link(bpy.data.objects.new(f"blade_{i}_{k}", me_blade))
            b.parent = rotor
            b.rotation_euler = (0, math.radians(120 * k), 0)
        turbines.append((root, rotor, rng.uniform(0, 6.28), rng.uniform(0.9, 1.15)))
    return turbines


def build_plant():
    concrete = concrete_material("cooling_tower", (0.60, 0.58, 0.54), 0.03)
    hall_mat = concrete_material("hall", (0.26, 0.30, 0.35), 0.05)
    roof = concrete_material("roof", (0.16, 0.17, 0.19), 0.05)
    dark = concrete_material("coal", (0.06, 0.055, 0.05), 0.4)
    stripe = new_mat("stripe", (0.70, 0.12, 0.10), rough=0.6)

    towers = [(250, 175), (355, 205), (430, 120)]
    for i, (x, y) in enumerate(towers):
        bm = bmesh.new()
        prof = []
        for k in range(15):
            z = k / 14 * 118
            r = 23 * math.sqrt(1 + ((z - 88) / 48) ** 2) - 4
            prof.append((r, z))
        lathe(bm, prof, 56)
        # thickness at the rim
        o = mesh_obj(f"cooling_{i}", bm, concrete)
        o.location = (x, y, 0)
        mod = o.modifiers.new("solid", "SOLIDIFY")
        mod.thickness = 0.8
        smooth_shade(o)

    bm = bmesh.new()
    box(bm, 245, 40, 26, 120, 46, 52)       # boiler house
    box(bm, 330, 30, 17, 60, 70, 34)        # turbine hall
    box(bm, 200, 60, 12, 30, 30, 24)
    box(bm, 380, -40, 7, 40, 22, 14)        # gas units
    box(bm, 405, -40, 7, 6, 22, 14)
    mesh_obj("halls", bm, hall_mat)
    bm = bmesh.new()
    for cx, cy, cz, sx, sy in ((245, 40, 52, 121, 47), (330, 30, 34, 61, 71), (200, 60, 24, 31, 31)):
        box(bm, cx, cy, cz + 0.3, sx, sy, 0.8)
    for i in range(5):
        box(bm, 205 + i * 20, 16.6, 34, 12, 0.4, 1.5)
        box(bm, 205 + i * 20, 16.6, 20, 12, 0.4, 1.5)
    mesh_obj("roofs", bm, roof)
    bm = bmesh.new()
    cyl(bm, 175, 30, 0, 175, 9, 6.5, 32)
    cyl(bm, 392, -40, 14, 32, 2.4, 2.2, 16)
    cyl(bm, 404, -40, 14, 32, 2.4, 2.2, 16)
    mesh_obj("stacks", bm, concrete)
    bm = bmesh.new()
    cyl(bm, 175, 30, 160, 9, 6.9, 6.75, 32)
    mesh_obj("stack_band", bm, stripe)

    # coal stockpile and conveyor
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0)
    for v in bm.verts:
        v.co.x *= 70
        v.co.y *= 30
        v.co.z = max(v.co.z, 0) ** 0.8 * 18 + noise.noise(v.co * 0.08) * 1.5
    o = mesh_obj("coal_pile", bm, dark)
    o.location = (290, -120, -0.5)
    smooth_shade(o)
    bm = bmesh.new()
    box(bm, 0, 0, 0, 3, 120, 2)
    o = mesh_obj("conveyor", bm, hall_mat)
    o.location = (240, -60, 18)
    o.rotation_euler = (math.radians(10), 0, math.radians(-20))

    domains = []
    steam = plume_material("steam", (0.97, 0.97, 0.98), 1.3)
    smoke = plume_material("smoke", (0.5, 0.5, 0.52), 0.5)
    for i, (x, y) in enumerate(towers):
        bm = bmesh.new()
        box(bm, 0, 0, 0, 2, 2, 2)
        o = mesh_obj(f"steam_{i}", bm, steam)
        o.location = (x + 70, y, 118 + 120)
        o.scale = (130, 60, 125)
        domains.append(o)
    bm = bmesh.new()
    box(bm, 0, 0, 0, 2, 2, 2)
    o = mesh_obj("smoke_0", bm, smoke)
    o.location = (175 + 50, 30, 175 + 80)
    o.scale = (90, 30, 85)
    domains.append(o)
    return [steam, smoke]


def import_model(name, decimate=None, keep=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, "model", name, f"{name}_1k.gltf"))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in new:
        if o.type != "MESH" or (keep and keep not in o.name):
            continue
        if decimate:
            m = o.modifiers.new("dec", "DECIMATE")
            m.ratio = decimate
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        else:
            me = o.data
        meshes.append(me)
    for o in new:
        bpy.data.objects.remove(o)
    return meshes


def build_vegetation():
    tree_full = import_model("island_tree_02")
    tree_mid = import_model("island_tree_02", decimate=0.04)
    tree_far = import_model("island_tree_02", decimate=0.012)
    shrubs = import_model("shrub_02")
    searsia = import_model("searsia_lucida", keep="_a_")
    rock = import_model("namaqualand_boulder_02", decimate=0.2)
    for me in tree_full + tree_mid + tree_far + searsia:
        for m in me.materials:
            if m and hasattr(m, "surface_render_method"):
                m.surface_render_method = "DITHERED"
    coll = bpy.data.collections.new("vegetation")
    bpy.context.scene.collection.children.link(coll)

    def blocked(x, y):
        if -440 < x < -40 and -165 < y < 0:
            return True        # solar blocks
        if 150 < x < 500 and -170 < y < 260:
            return True        # plant yard
        if abs(y + 235) < 12 or (abs(x - 40) < 10 and y > -240):
            return True        # roads
        return False

    def place(me, x, y, s, name):
        o = link(bpy.data.objects.new(name, me), coll)
        o.location = (x, y, height(x, y) - 0.2)
        o.rotation_euler = (0, 0, rng.uniform(0, 6.28))
        o.scale = (s, s, s * rng.uniform(0.9, 1.2))
        return o

    count = 0
    # windbreak rows along the roads and paddock lines
    lines = [((-2400, -252), (1800, -252), 14), ((-2400, -218), (-500, -218), 16),
             ((58, -220), (58, 880), 13), ((-700, -10), (-700, 900), 15),
             ((-1500, 60), (-760, 90), 16), ((560, -300), (560, 700), 14), ((900, 300), (2200, 340), 16),
             ((-2600, 1100), (2400, 1150), 18), ((1200, -900), (1250, 1100), 16), ((-1600, -1000), (-1560, 1000), 16)]
    for (x0, y0), (x1, y1), step in lines:
        n = int(math.hypot(x1 - x0, y1 - y0) / step)
        for i in range(n):
            u = i / n
            x = lerp(x0, x1, u) + rng.uniform(-5, 5)
            y = lerp(y0, y1, u) + rng.uniform(-5, 5)
            if blocked(x, y) or rng.random() < 0.18:
                continue
            d = math.hypot(x + 330, y + 235)
            for me in (tree_full if d < 170 else tree_mid if d < 900 else tree_far):
                place(me, x, y, rng.uniform(3.6, 4.8), f"tree_{count}")
            count += 1
    # remnant bush clumps
    clumps = [(-900, -480, 140), (650, -520, 160), (-1300, 500, 220), (1200, -100, 200), (-200, -600, 110),
              (300, 600, 180), (-500, 980, 200), (1500, 700, 260)]
    for cx, cy, rad in clumps:
        for _ in range(int(rad / 4)):
            a, r = rng.uniform(0, 6.28), rad * math.sqrt(rng.random())
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            if blocked(x, y):
                continue
            for me in tree_far:
                place(me, x, y, rng.uniform(3.2, 4.8), f"bush_{count}")
            count += 1
    # shrubs and rocks near the solar blocks, where the camera flies low
    for _ in range(260):
        x, y = rng.uniform(-520, 60), rng.uniform(-230, 40)
        if blocked(x, y):
            continue
        me = rng.choice(shrubs + searsia)
        place(me, x, y, rng.uniform(1.4, 2.6), f"shrub_{count}")
        count += 1
    for _ in range(40):
        x, y = rng.uniform(-520, 60), rng.uniform(-230, 120)
        if blocked(x, y):
            continue
        for me in rock:
            place(me, x, y, rng.uniform(0.8, 1.8), f"rock_{count}")
        count += 1
    print("vegetation", count)


def build_powerline():
    steel = new_mat("pylon", (0.55, 0.57, 0.58), rough=0.5, metal=0.7)
    wire = new_mat("wire", (0.15, 0.15, 0.15), rough=0.5, metal=0.5)
    bm = bmesh.new()
    pts = [(170 - i * 120, 330 + i * 6) for i in range(9)]
    tops = []
    for x, y in pts:
        z0 = height(x, y)
        # simple lattice pylon: four tapered legs, cross arms
        for sx in (-1, 1):
            for sy in (-1, 1):
                a = Vector((x + sx * 4.5, y + sy * 4.5, z0))
                b = Vector((x + sx * 0.9, y + sy * 0.9, z0 + 42))
                d = b - a
                r = bmesh.ops.create_cone(bm, cap_ends=False, segments=4, radius1=0.35, radius2=0.25, depth=d.length)
                rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
                bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=r["verts"])
        for zz, w in ((30, 13), (38, 9)):
            box(bm, x, y, z0 + zz, 0.5, w * 2, 0.6)
        tops.append([(x, y + s * w, z0 + zz - 1) for zz, w in ((30, 13), (38, 9)) for s in (-1, 1)])
    mesh_obj("pylons", bm, steel)
    bm = bmesh.new()
    for k in range(4):
        for a, b in zip(tops, tops[1:]):
            pa, pb = Vector(a[k]), Vector(b[k])
            prev = None
            for i in range(13):
                u = i / 12
                p = pa.lerp(pb, u)
                p.z -= math.sin(math.pi * u) * 6
                if prev is not None:
                    d = p - prev
                    e = bmesh.ops.create_cone(bm, cap_ends=False, segments=3, radius1=0.12, radius2=0.12, depth=d.length)
                    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
                    bmesh.ops.transform(bm, matrix=Matrix.Translation((p + prev) / 2) @ rot, verts=e["verts"])
                prev = p
    mesh_obj("wires", bm, wire)


# ---------------------------------------------------------------- camera

def shot(scene, u, loc, tgt, lens=32):
    s = SCENES[scene]
    return (lerp(s["start"], s["end"], u), Vector(loc), Vector(tgt), lens)


def camera_keys():
    return [
        shot("title", 0.88, (-300, -1750, 640), (40, 350, 0), 30),
        shot("sides", 0.3, (-140, -1150, 400), (0, 150, 10), 30),
        shot("sides", 0.7, (-40, -760, 230), (30, 40, 40), 30),
        shot("sides", 1.0, (0, -700, 205), (20, 40, 40), 30),
        shot("growth", 0.5, (-60, -650, 190), (0, 50, 45), 30),
        shot("growth", 1.0, (-120, -600, 175), (-20, 60, 40), 30),
        shot("mix", 0.18, (-470, -330, 40), (-300, -40, 12), 30),
        shot("mix", 0.55, (-420, -235, 19), (-230, -60, 12), 30),
        shot("mix", 1.0, (-200, -205, 26), (-280, 260, 80), 30),
        shot("world", 0.4, (-60, -420, 210), (-330, 180, 30), 30),
        shot("world", 1.0, (60, -470, 260), (-320, 200, 30), 30),
        shot("forecast", 0.5, (620, -520, 260), (-60, 160, 40), 30),
        shot("forecast", 1.0, (700, -620, 300), (-80, 150, 40), 30),
        shot("end", 1.0, (380, -1500, 620), (-60, 180, 20), 30),
    ]


KEYS = None


def catmull(p0, p1, p2, p3, u):
    u2, u3 = u * u, u * u * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)


def camera_at(t):
    times = [k[0] for k in KEYS]
    if t <= times[0]:
        return KEYS[0][1], KEYS[0][2], KEYS[0][3]
    if t >= times[-1]:
        return KEYS[-1][1], KEYS[-1][2], KEYS[-1][3]
    i = bisect.bisect_right(times, t) - 1
    u = (t - times[i]) / (times[i + 1] - times[i])
    if i == 0 or i == len(KEYS) - 2:
        u = smooth(u) * 0.5 + u * 0.5
    k = lambda j, f: KEYS[min(max(j, 0), len(KEYS) - 1)][f]
    loc = catmull(k(i - 1, 1), k(i, 1), k(i + 1, 1), k(i + 2, 1), u)
    tgt = catmull(k(i - 1, 2), k(i, 2), k(i + 1, 2), k(i + 2, 2), u)
    return loc, tgt, lerp(KEYS[i][3], KEYS[i + 1][3], u)


# ---------------------------------------------------------------- per frame

ANCHORS = {
    "farm": Vector((-250, -60, 30)),
    "wind": Vector((-420, 380, 150)),
    "plant": Vector((300, 120, 150)),
}


def pose(t, cam, rows, turbines, plumes):
    year = year_at(t)
    if t > SCENES["forecast"]["start"]:
        year = 2024.0
    w = series(WIND, year) / max(WIND)
    s = series(SOLAR, year) / max(SOLAR)
    nw = max(1.0, w * N_TURBINES)
    ns = max(1.0, s * N_ROWS)
    for i, root in enumerate(rows):
        f = smooth(min(1.0, max(0.0, (ns - i) * 1.5)))
        root.scale = (1, 1, max(f, 0.001))
        root.hide_render = f <= 0.001
    for i, (root, rotor, ph, sp) in enumerate(turbines):
        f = smooth(min(1.0, max(0.0, (nw - i) * 1.2)))
        root.scale = (max(f, 0.001),) * 3
        root.hide_render = f <= 0.001
        rotor.rotation_euler = (0, ph + t * 1.25 * sp, 0)
    fossil = series(FOSSIL, year) / FOSSIL[0]
    for mat in plumes:
        mat.node_tree.nodes["clock"].outputs[0].default_value = t * 0.09
        mat.node_tree.nodes["amount"].outputs[0].default_value = 0.35 + 0.65 * ((fossil - 0.8) / 0.2)

    loc, tgt, lens = camera_at(t)
    cam.location = loc
    cam.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    return year


def setup_render(scene):
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    r = scene.render
    r.resolution_x = TIMING["width"]
    r.resolution_y = TIMING["height"]
    r.resolution_percentage = 100
    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "8"
    r.film_transparent = False
    ee = scene.eevee
    ee.taa_render_samples = 16
    for attr, val in (("use_shadows", True), ("shadow_ray_count", 1), ("shadow_step_count", 6),
                      ("volumetric_tile_size", "8"), ("volumetric_samples", 32), ("use_volume_custom_range", True), ("volumetric_end", 2600.0),
                      ("use_raytracing", False), ("fast_gi_method", "GLOBAL_ILLUMINATION"),
                      ("use_volumetric_shadows", True), ("clamp_surface_indirect", 10.0)):
        if hasattr(ee, attr):
            try:
                setattr(ee, attr, val)
            except Exception as e:
                print("skip", attr, e)
    vs = scene.view_settings
    vs.view_transform = "AgX"
    for look in ("AgX - Punchy", "Punchy", "AgX - Medium High Contrast"):
        try:
            vs.look = look
            break
        except TypeError:
            continue
    print("look", vs.look)
    vs.exposure = 0.25


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    setup_render(scene)
    build_world()
    build_terrain()
    rows = build_solar()
    turbines = build_wind()
    plumes = build_plant()
    build_powerline()
    build_vegetation()
    cam_data = bpy.data.cameras.new("cam")
    cam_data.clip_start = 1.0
    cam_data.clip_end = 20000
    cam_data.sensor_width = 36
    cam = link(bpy.data.objects.new("cam", cam_data))
    scene.camera = cam
    return scene, cam, rows, turbines, plumes


def main():
    global KEYS
    args = sys.argv[sys.argv.index("--") + 1:]
    mode = args[0]
    KEYS = camera_keys()
    scene, cam, rows, turbines, plumes = build()
    g = globe_mod.Globe(scene)
    frames_dir = os.path.join(BUILD, "frames" if mode == "render" else "stills")
    state_dir = os.path.join(BUILD, "state")
    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(state_dir, exist_ok=True)
    for o in bpy.data.objects:
        if any(o.name.startswith(h) for h in os.environ.get("HIDE", "~").split(",")):
            o.hide_render = True
    if mode == "still":
        frames = [int(round(float(a) * FPS)) for a in args[1:]]
    else:
        frames = list(range(int(args[1]), int(args[2]) + 1))
    for f in frames:
        t = f / FPS
        gw = globe_weight(t)
        out = os.path.join(frames_dir, f"f{f:05d}.png")
        gout = os.path.join(frames_dir, f"g{f:05d}.png")
        need_land = gw < 1.0
        need_globe = gw > 0.0
        if mode == "render" and (not need_land or os.path.exists(out)) and (not need_globe or os.path.exists(gout)):
            continue
        year = pose(t, cam, rows, turbines, plumes)
        bpy.context.view_layer.update()
        anchors = {}
        for k, p in ANCHORS.items():
            c = world_to_camera_view(scene, cam, p)
            anchors[k] = [round(c.x, 4), round(1 - c.y, 4), round(c.z, 1)]
        pose_globe(g, t)
        g.scene.view_layers[0].update()
        state = {"t": t, "year": year, "anchors": anchors, "globe": round(gw, 4), "countries": globe_anchors(g, t)}
        json.dump(state, open(os.path.join(state_dir, f"f{f:05d}.json"), "w"))
        if need_globe:
            g.scene.render.filepath = gout
            bpy.ops.render.render(write_still=True, scene=g.scene.name)
        if need_land:
            scene.render.filepath = out
            bpy.ops.render.render(write_still=True, scene=scene.name)
        print(f"frame {f} done", flush=True)


main()
