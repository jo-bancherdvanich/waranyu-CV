"""The future of LocoLLM: a town, a hospital room and a corner shop, in Blender.

blender -b --factory-startup --python scene.py -- still 3 15 22 ...
blender -b --factory-startup --python scene.py -- render 0 1439

PYLIB must point at a folder with Pillow for this Python (screens are drawn
with it). Frames go to build/frames, per-frame state to build/state.
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
if os.environ.get("PYLIB"):
    sys.path.insert(0, os.environ["PYLIB"])
import mhuman  # noqa: E402
import screens  # noqa: E402

ASSETS = os.path.join(HERE, "assets")
BUILD = os.path.join(HERE, "build")
FPS = 30
DURATION = 48.0
rng = random.Random(3)

HOSP = Vector((1000, 0, 0))
HAZE = (0.74, 0.8, 0.88)
SHOP = Vector((2000, 0, 0))


# ---------------------------------------------------------------- helpers

def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def lerp(a, b, u):
    return a + (b - a) * u


def link(o, coll=None):
    (coll or bpy.context.scene.collection).objects.link(o)
    return o


def new_mesh(name, bm, mat=None, smooth_shade=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if mat:
        me.materials.append(mat)
    if smooth_shade:
        for p in me.polygons:
            p.use_smooth = True
    return link(bpy.data.objects.new(name, me))


def box(bm, c, s):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=s, verts=r["verts"])
    bmesh.ops.translate(bm, vec=c, verts=r["verts"])
    return r["verts"]


def cyl(bm, c, r, h, seg=24, r2=None):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, vec=(c[0], c[1], c[2] + h / 2), verts=res["verts"])
    return res["verts"]


def socket(node, name, kind=None):
    for s in node.inputs:
        if s.name == name and (kind is None or s.type == kind):
            return s
    raise KeyError(name)


def pbr(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, spec=0.5, emit=None, alpha=None, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Specular IOR Level"].default_value = spec
    p.inputs["Coat Weight"].default_value = coat
    if emit:
        p.inputs["Emission Color"].default_value = (*emit[0], 1)
        p.inputs["Emission Strength"].default_value = emit[1]
    if alpha is not None:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m


def textured(name, folder, scale=1.0, tint=None, rough_mult=1.0, bump=0.6):
    """Poly Haven texture set, mapped in object space (metres)."""
    d = os.path.join(ASSETS, "texture", folder)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / scale,) * 3
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    def img(fname, colour=True):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(d, fname), check_existing=True)
        if not colour:
            t.image.colorspace_settings.name = "Non-Color"
        t.projection = "BOX"
        t.projection_blend = 0.25
        nt.links.new(mp.outputs[0], t.inputs[0])
        return t

    diff = img("diff.jpg")
    col = diff.outputs["Color"]
    if tint:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1.0
        nt.links.new(col, socket(mix, "A", "RGBA"))
        socket(mix, "B", "RGBA").default_value = (*tint, 1)
        col = [s for s in mix.outputs if s.type == "RGBA"][0]
    nt.links.new(col, p.inputs["Base Color"])
    if os.path.exists(os.path.join(d, "rough.jpg")):
        r = img("rough.jpg", False)
        mm = nt.nodes.new("ShaderNodeMath")
        mm.operation = "MULTIPLY"
        mm.inputs[1].default_value = rough_mult
        nt.links.new(r.outputs["Color"], mm.inputs[0])
        nt.links.new(mm.outputs[0], p.inputs["Roughness"])
    if os.path.exists(os.path.join(d, "nor.jpg")):
        n = img("nor.jpg", False)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = bump
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs[0], p.inputs["Normal"])
    return m


def facade(name, folder, scale, tint=None, wx=3.2, wz=3.3, z0=1.2, lit=0.25, shop_floor=False):
    """Facade texture with a grid of glass windows cut in by the shader."""
    m = textured(name, folder, scale, tint)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    tc = [n for n in nt.nodes if n.type == "TEX_COORD"][0]
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def M(op, a, b=None, clamp=False):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                nt.links.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs[0]

    u = M("ADD", sep.outputs["X"], sep.outputs["Y"])
    fu = M("FRACT", M("DIVIDE", u, wx))
    zz = M("SUBTRACT", sep.outputs["Z"], z0)
    fz = M("FRACT", M("DIVIDE", zz, wz))
    inu = M("MULTIPLY", M("GREATER_THAN", fu, 0.3), M("LESS_THAN", fu, 0.7))
    inz = M("MULTIPLY", M("GREATER_THAN", fz, 0.28), M("LESS_THAN", fz, 0.72))
    above = M("GREATER_THAN", zz, 0.0)
    mask = M("MULTIPLY", M("MULTIPLY", inu, inz), above)
    ou = M("MULTIPLY", M("GREATER_THAN", fu, 0.27), M("LESS_THAN", fu, 0.73))
    oz = M("MULTIPLY", M("GREATER_THAN", fz, 0.25), M("LESS_THAN", fz, 0.75))
    frame_mask = M("SUBTRACT", M("MULTIPLY", M("MULTIPLY", ou, oz), above), mask, clamp=True)
    glass = nt.nodes.new("ShaderNodeBsdfPrincipled")
    glass.inputs["Base Color"].default_value = (0.07, 0.09, 0.12, 1)
    glass.inputs["Roughness"].default_value = 0.06
    glass.inputs["Specular IOR Level"].default_value = 1.0
    # a few windows lit from inside
    cell = nt.nodes.new("ShaderNodeTexWhiteNoise")
    cell.noise_dimensions = "2D"
    cv = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(M("FLOOR", M("DIVIDE", u, wx)), cv.inputs[0])
    nt.links.new(M("FLOOR", M("DIVIDE", zz, wz)), cv.inputs[1])
    nt.links.new(cv.outputs[0], cell.inputs["Vector"])
    on = M("LESS_THAN", cell.outputs["Value"], lit)
    glass.inputs["Emission Color"].default_value = (1.0, 0.82, 0.6, 1)
    nt.links.new(M("MULTIPLY", on, 0.35), glass.inputs["Emission Strength"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mask, mix.inputs[0])
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(glass.outputs[0], mix.inputs[2])
    fr = nt.nodes.new("ShaderNodeBsdfPrincipled")
    fr.inputs["Base Color"].default_value = (0.86, 0.86, 0.84, 1)
    fr.inputs["Roughness"].default_value = 0.4
    mix2 = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(frame_mask, mix2.inputs[0])
    nt.links.new(mix.outputs[0], mix2.inputs[1])
    nt.links.new(fr.outputs[0], mix2.inputs[2])
    nt.links.new(mix2.outputs[0], out.inputs["Surface"])
    return m


def text_obj(body, size, mat, loc, rot=(math.pi / 2, 0, 0), extrude=0.03, align="CENTER", bold=True):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    f = os.path.join(ASSETS, "fonts", "PublicSans.ttf")
    cu.font = bpy.data.fonts.load(f, check_existing=True)
    o = link(bpy.data.objects.new("txt_" + body[:10], cu))
    o.data.materials.append(mat)
    o.location = loc
    o.rotation_euler = rot
    return o


def import_model(name, decimate=None, at=(0, 0, 0), rot=0.0, scale=1.0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, "model", name, f"{name}_1k.gltf"))
    new = [o for o in bpy.data.objects if o not in before]
    if decimate:
        dg = bpy.context.evaluated_depsgraph_get()
        for o in new:
            if o.type == "MESH":
                m = o.modifiers.new("dec", "DECIMATE")
                m.ratio = decimate
        dg.update()
        for o in new:
            if o.type == "MESH":
                me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
                o.modifiers.clear()
                o.data = me
    root = link(bpy.data.objects.new(name + "_root", None))
    for o in new:
        if o.parent is None:
            o.parent = root
    root.location = at
    root.rotation_euler = (0, 0, rot)
    root.scale = (scale,) * 3
    for o in new:
        if o.type == "MESH":
            for mat in o.data.materials:
                if mat and mat.blend_method != "OPAQUE" and hasattr(mat, "surface_render_method"):
                    mat.surface_render_method = "DITHERED"
    return root, new


def instance(src_objs, at, rot=0.0, scale=1.0, name="inst"):
    root = link(bpy.data.objects.new(name, None))
    for o in src_objs:
        if o.type == "MESH":
            c = link(bpy.data.objects.new(o.name + "_i", o.data))
            c.parent = root
            c.matrix_parent_inverse = Matrix()
            c.matrix_basis = o.matrix_world.copy() if o.parent is None else o.matrix_basis.copy()
    root.location = at
    root.rotation_euler = (0, 0, rot)
    root.scale = (scale,) * 3
    return root


# ---------------------------------------------------------------- world

def build_world():
    w = bpy.data.worlds.new("sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(ASSETS, "hdri", "kloofendal_48d_partly_cloudy_puresky",
                                                  "kloofendal_48d_partly_cloudy_puresky.hdr"))
    mp = nt.nodes.new("ShaderNodeMapping")
    tc = nt.nodes.new("ShaderNodeTexCoord")
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
    want_az = math.atan2(-0.85, -0.55)
    mp.inputs["Rotation"].default_value = (0, 0, want_az - hdr_az)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], env.inputs["Vector"])
    # fade the sky below the horizon into the haze so the ground has no visible edge
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 0.06
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(mr.outputs[0], mix.inputs[0])
    nt.links.new(env.outputs[0], socket(mix, "A", "RGBA"))
    socket(mix, "B", "RGBA").default_value = (*HAZE, 1)
    nt.links.new([o for o in mix.outputs if o.type == "RGBA"][0], nt.nodes["Background"].inputs["Color"])
    for attr, val in (("sun_threshold", 5.0), ("sun_angle", math.radians(1.5)), ("use_sun_shadow", True)):
        if hasattr(w, attr):
            setattr(w, attr, val)


# ---------------------------------------------------------------- town

BADGES = {}


def vary_and_haze(mat, scale, amount):
    """Break up texture repeats with large soft patches, and fade into haze with distance."""
    nt = mat.node_tree
    p = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    src = p.inputs["Base Color"].links[0].from_socket
    tc = [n for n in nt.nodes if n.type == "TEX_COORD"][0]
    if amount:
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = 1.0 / scale
        n.inputs["Detail"].default_value = 3
        nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "OVERLAY"
        mix.inputs[0].default_value = amount
        nt.links.new(src, socket(mix, "A", "RGBA"))
        nt.links.new(n.outputs["Color"], socket(mix, "B", "RGBA"))
        nt.links.new([o for o in mix.outputs if o.type == "RGBA"][0], p.inputs["Base Color"])
    cam = nt.nodes.new("ShaderNodeCameraData")
    d = nt.nodes.new("ShaderNodeMath")
    d.operation = "DIVIDE"
    nt.links.new(cam.outputs["View Distance"], d.inputs[0])
    d.inputs[1].default_value = -6000.0
    e = nt.nodes.new("ShaderNodeMath")
    e.operation = "EXPONENT"
    nt.links.new(d.outputs[0], e.inputs[0])
    f = nt.nodes.new("ShaderNodeMath")
    f.operation = "SUBTRACT"
    f.use_clamp = True
    f.inputs[0].default_value = 1.0
    nt.links.new(e.outputs[0], f.inputs[1])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*HAZE, 1)
    g = nt.nodes.new("ShaderNodeMath")
    g.operation = "MULTIPLY"
    nt.links.new(f.outputs[0], g.inputs[0])
    g.inputs[1].default_value = 0.75
    ms = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(g.outputs[0], ms.inputs[0])
    nt.links.new(p.outputs[0], ms.inputs[1])
    nt.links.new(em.outputs[0], ms.inputs[2])
    nt.links.new(ms.outputs[0], out.inputs["Surface"])


def building(name, x0, y0, sx, sy, h, mat, roof_mat, pitched=False, badge=None):
    bm = bmesh.new()
    box(bm, (0, 0, h / 2), (sx, sy, h))
    o = new_mesh(name, bm, mat)
    o.location = (x0, y0, 0)
    if pitched:
        bm = bmesh.new()
        v = [bm.verts.new(p) for p in ((-sx / 2 - 0.4, -sy / 2 - 0.4, h), (sx / 2 + 0.4, -sy / 2 - 0.4, h),
                                        (sx / 2 + 0.4, sy / 2 + 0.4, h), (-sx / 2 - 0.4, sy / 2 + 0.4, h),
                                        (-sx / 2 - 0.4, 0, h + sy * 0.38), (sx / 2 + 0.4, 0, h + sy * 0.38))]
        for f in ((0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5)):
            bm.faces.new([v[i] for i in f])
        r = new_mesh(name + "_roof", bm, roof_mat)
        r.location = (x0, y0, 0)
        top = h + sy * 0.38
    else:
        bm = bmesh.new()
        box(bm, (0, 0, h + 0.3), (sx + 0.3, sy + 0.3, 0.6))
        for _ in range(2):
            box(bm, (rng.uniform(-sx / 3, sx / 3), rng.uniform(-sy / 3, sy / 3), h + 1.2), (2.4, 1.6, 1.4))
        r = new_mesh(name + "_roof", bm, roof_mat)
        r.location = (x0, y0, 0)
        top = h + 1.5
    if badge:
        BADGES[badge] = Vector((x0, y0, top + 4))
    return o


def car(x, y, rot, color):
    paint = pbr(f"paint_{len(bpy.data.materials)}", color, rough=0.25, metal=0.5, coat=1.0)
    glass = pbr("carglass", (0.02, 0.025, 0.03), rough=0.05, metal=0.3)
    tyre = pbr("tyre", (0.02, 0.02, 0.02), rough=0.8)
    bm = bmesh.new()
    box(bm, (0, 0, 0.62), (4.3, 1.8, 0.62))
    o = new_mesh("car", bm, paint)
    bm = bmesh.new()
    box(bm, (-0.2, 0, 1.18), (2.2, 1.6, 0.55))
    cab = new_mesh("car_cab", bm, glass)
    cab.parent = o
    bm = bmesh.new()
    for wx in (-1.35, 1.35):
        for wy in (-0.85, 0.85):
            r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.34, radius2=0.34, depth=0.24)
            bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
            bmesh.ops.translate(bm, verts=r["verts"], vec=(wx, wy, 0.34))
    wh = new_mesh("car_wheels", bm, tyre)
    wh.parent = o
    o.location = (x, y, 0)
    o.rotation_euler = (0, 0, rot)


def build_town(trees_mid, trees_full, shrubs):
    grass = textured("grass", "aerial_grass_rock", 22.0, tint=(0.58, 0.72, 0.46))
    asphalt = textured("asphalt", "asphalt_02", 4.0, tint=(0.7, 0.7, 0.72))
    paving = textured("paving", "rectangular_paving", 2.0, tint=(0.8, 0.82, 0.86))
    white = pbr("line", (0.9, 0.9, 0.88), rough=0.6)

    vary_and_haze(grass, 70.0, 0.18)
    vary_and_haze(asphalt, 200.0, 0.0)
    bm = bmesh.new()
    box(bm, (0, 0, -0.05), (9000, 9000, 0.1))
    new_mesh("ground", bm, grass)
    bm = bmesh.new()
    box(bm, (0, 0, 0.02), (9000, 11, 0.04))
    box(bm, (0, 0, 0.02), (11, 9000, 0.04))
    box(bm, (0, 110, 0.02), (9000, 9, 0.04))
    box(bm, (0, -110, 0.02), (9000, 9, 0.04))
    box(bm, (110, 0, 0.02), (9, 9000, 0.04))
    box(bm, (-110, 0, 0.02), (9, 9000, 0.04))
    new_mesh("roads", bm, asphalt)
    bm = bmesh.new()
    for sxn in (-1, 1):
        for syn in (-1, 1):
            box(bm, (sxn * 52, syn * 52, 0.09), (88, 88, 0.14))
    new_mesh("blocks", bm, paving)
    bm = bmesh.new()
    for i in range(-40, 41):
        if abs(i) < 2:
            continue
        box(bm, (i * 5.5, 0, 0.05), (2.4, 0.18, 0.02))
        box(bm, (0, i * 5.5, 0.05), (0.18, 2.4, 0.02))
    for k in range(-3, 4):
        box(bm, (k * 1.1, 7.2, 0.05), (0.6, 3.2, 0.02))
        box(bm, (k * 1.1, -7.2, 0.05), (0.6, 3.2, 0.02))
        box(bm, (7.2, k * 1.1, 0.05), (3.2, 0.6, 0.02))
        box(bm, (-7.2, k * 1.1, 0.05), (3.2, 0.6, 0.02))
    new_mesh("road_lines", bm, white)
    # lawns inside the blocks
    bm = bmesh.new()
    for cx, cy, sx, sy in ((60, 78, 70, 20), (-80, 30, 22, 60), (30, -85, 50, 16), (-60, -40, 30, 30)):
        box(bm, (cx, cy, 0.17), (sx, sy, 0.04))
    new_mesh("lawns", bm, grass)

    concrete = facade("hospital_wall", "beige_wall_001", 2.5, tint=(1.0, 1.04, 1.08), lit=0.15)
    brick = facade("brick", "brick_wall_001", 2.0, wx=3.0, lit=0.3)
    beige = facade("beige", "beige_wall_001", 2.0, tint=(1.0, 0.96, 0.88), lit=0.2)
    office = facade("office_wall", "beige_wall_001", 2.5, tint=(0.78, 0.82, 0.88), wx=2.4, wz=3.4, lit=0.3)
    flat = textured("flatroof", "asphalt_02", 3.0, tint=(0.55, 0.55, 0.56))
    roof_grey = textured("roof_grey", "grey_roof_tiles", 1.5)
    roof_clay = textured("roof_clay", "clay_roof_tiles", 1.5)

    building("hospital", 50, 48, 46, 26, 19.8, concrete, flat, badge="Health")
    building("hospital_wing", 34, 70, 16, 22, 13.2, concrete, flat)
    building("law", -36, 40, 26, 18, 13.2, beige, flat, badge="Privacy law")
    building("bank", -70, 66, 22, 18, 16.5, beige, flat, badge="Finance")
    building("school", -50, -66, 46, 18, 9.9, brick, roof_grey, pitched=True, badge="Education")
    building("pharmacy", -18, -30, 16, 14, 6.6, brick, flat, badge="Pharmacy")
    building("shop", 18, -20, 18, 16, 8.0, brick, flat, badge="Small business")
    building("offices", 62, -36, 20, 20, 33.0, office, flat, badge="Accounting")
    building("council", 64, -78, 30, 16, 13.2, beige, flat, badge="Government")
    building("hr", 30, -70, 14, 14, 23.1, office, flat, badge="HR")
    # houses outside the centre
    houses = []
    for i in range(60):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(140, 330)
        x, y = r * math.cos(a), r * math.sin(a)
        if min(abs(x), abs(y), abs(abs(x) - 110), abs(abs(y) - 110)) < 14:
            continue
        sx, sy = rng.uniform(9, 14), rng.uniform(8, 11)
        mat = rng.choice((brick, beige))
        o = building(f"house_{i}", x, y, sx, sy, rng.choice((3.3, 3.3, 6.6)), mat, rng.choice((roof_grey, roof_clay)),
                     pitched=True)
        o.rotation_euler = (0, 0, rng.choice((0, math.pi / 2)) + rng.uniform(-0.05, 0.05))
        bpy.data.objects[f"house_{i}_roof"].rotation_euler = o.rotation_euler
        houses.append((x, y))
    # outer suburbs, from their own random stream so the rest of the town keeps its layout
    r2 = random.Random(11)
    for i in range(240):
        a = r2.uniform(0, 2 * math.pi)
        r = r2.uniform(340, 1500)
        x, y = r * math.cos(a), r * math.sin(a)
        if min(abs(x), abs(y), abs(abs(x) - 110), abs(abs(y) - 110)) < 14:
            continue
        sx, sy = r2.uniform(9, 14), r2.uniform(8, 11)
        o = building(f"suburb_{i}", x, y, sx, sy, r2.choice((3.3, 3.3, 6.6)), r2.choice((brick, beige)),
                     r2.choice((roof_grey, roof_clay)), pitched=True)
        o.rotation_euler = (0, 0, r2.choice((0, math.pi / 2)))
        bpy.data.objects[f"suburb_{i}_roof"].rotation_euler = o.rotation_euler
    for i in range(420):
        a = r2.uniform(0, 2 * math.pi)
        r = r2.uniform(420, 1600)
        instance(trees_mid, (r * math.cos(a), r * math.sin(a), 0.1), r2.uniform(0, 6.28), r2.uniform(1.6, 2.4),
                 f"far_tree_{i}")
    hx, hy = min(houses, key=lambda h: math.hypot(h[0] + 90, h[1] + 150))
    BADGES["Real estate"] = Vector((hx, hy, 14))
    BADGES["centre"] = Vector((0, 0, 3))
    BADGES["laptop"] = SHOP + Vector((4.9, 3.36, 1.1))
    BADGES["screen"] = HOSP + Vector((0.4, 3.0, 1.2))

    # signs
    red = pbr("red", (0.8, 0.05, 0.06), rough=0.4, emit=((1, 0.1, 0.1), 2.0))
    green = pbr("green", (0.05, 0.6, 0.25), rough=0.4, emit=((0.1, 1, 0.4), 1.5))
    sign = pbr("sign", (0.95, 0.95, 0.95), rough=0.4)
    navy = pbr("navy", (0.08, 0.12, 0.25), rough=0.4)
    bm = bmesh.new()
    box(bm, (0, 0, 0), (3.0, 0.4, 1.0))
    box(bm, (0, 0, 0), (1.0, 0.4, 3.0))
    o = new_mesh("hospital_cross", bm, red)
    o.location = (50, 34.8, 15.5)
    text_obj("HOSPITAL", 2.2, sign, (40, 34.7, 15.5), extrude=0.08)
    bm = bmesh.new()
    box(bm, (0, 0, 0), (1.8, 0.3, 0.6))
    box(bm, (0, 0, 0), (0.6, 0.3, 1.8))
    o = new_mesh("pharmacy_cross", bm, green)
    o.location = (-18, -37.2, 5.0)
    text_obj("PHARMACY", 1.0, sign, (-18, -37.2, 3.6), extrude=0.05)
    text_obj("LAW CHAMBERS", 1.2, navy, (-36, 30.85, 10.5), extrude=0.05)
    text_obj("BANK", 1.6, navy, (-70, 56.85, 13.5), extrude=0.05)
    text_obj("SCHOOL", 1.4, sign, (-50, -56.85, 8.0), rot=(math.pi / 2, 0, math.pi), extrude=0.05)
    text_obj("COUNCIL", 1.3, navy, (64, -69.85, 10.5), rot=(math.pi / 2, 0, math.pi), extrude=0.05)

    # the corner shop front: awning, big windows, sign
    shop_front(18, -20, 18, 16)

    # columns on the law building
    stone = pbr("stone", (0.85, 0.82, 0.76), rough=0.6)
    bm = bmesh.new()
    for i in range(6):
        cyl(bm, (-46 + i * 4, 30.2, 0.2), 0.45, 9.0, 16)
    box(bm, (-36, 30.2, 9.6), (24, 1.6, 1.2))
    new_mesh("columns", bm, stone, smooth_shade=True)

    # trees along the streets and in the lawns
    pts = []
    for i in range(-20, 21):
        for side in (-1, 1):
            pts.append((i * 11 + 3, side * 9.5))
            pts.append((side * 9.5, i * 11 + 3))
    for cx, cy, sx, sy in ((60, 78, 70, 20), (-80, 30, 22, 60), (30, -85, 50, 16), (-60, -40, 30, 30)):
        for _ in range(int(sx * sy / 90)):
            pts.append((cx + rng.uniform(-sx / 2, sx / 2), cy + rng.uniform(-sy / 2, sy / 2)))
    for _ in range(260):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(125, 420)
        pts.append((r * math.cos(a), r * math.sin(a)))
    n = 0
    for x, y in pts:
        if abs(x) < 7 or abs(y) < 7 or (4 < x < 34 and -52 < y < -6):
            continue
        near_shop = math.hypot(x - 18, y + 34) < 30
        src = trees_full if near_shop else trees_mid
        instance(src, (x, y, 0.1), rng.uniform(0, 6.28), rng.uniform(1.6, 2.3), f"tree_{n}")
        n += 1

    cols = [(0.6, 0.05, 0.05), (0.85, 0.85, 0.86), (0.05, 0.05, 0.06), (0.1, 0.2, 0.45), (0.5, 0.5, 0.52),
            (0.75, 0.6, 0.2)]
    for i, (x, y, r) in enumerate(((20, -7.2, 0), (32, -7.2, 0), (-28, 7.2, math.pi), (7.2, 30, math.pi / 2),
                                   (-7.2, -44, -math.pi / 2), (58, 7.2, math.pi), (-7.2, 70, -math.pi / 2),
                                   (-60, -7.2, 0), (2.5, -60, math.pi / 2), (-2.5, 22, -math.pi / 2))):
        car(x, y, r, cols[i % len(cols)])


def shop_front(x0, y0, sx, sy):
    """The street corner of the shop the narration visits (front faces -y)."""
    fy = y0 - sy / 2 - 0.02
    glass = pbr("shopglass", (0.1, 0.12, 0.13), rough=0.03, metal=0.2, alpha=0.35)
    frame = pbr("shopframe", (0.1, 0.18, 0.16), rough=0.4)
    wood = pbr("shopwood", (0.30, 0.18, 0.10), rough=0.5)
    inside = pbr("shopinside", (0.9, 0.85, 0.75), rough=0.8, emit=((1.0, 0.86, 0.66), 1.8))
    stripes = bpy.data.materials.new("awning")
    stripes.use_nodes = True
    nt = stripes.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 1.0
    wave.wave_profile = "SAW"
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.9, 0, 0)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (0.05, 0.32, 0.26, 1)
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (0.92, 0.9, 0.84, 1)
    nt.links.new(wave.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.85

    bm = bmesh.new()
    box(bm, (x0, fy - 0.05, 1.7), (sx - 1.0, 0.04, 2.6))
    new_mesh("shop_glass", bm, glass)
    bm = bmesh.new()
    box(bm, (x0, y0 - 0.5, 1.6), (sx - 1.2, 0.2, 3.0))   # lit interior behind the glass
    new_mesh("shop_inside", bm, inside)
    bm = bmesh.new()
    box(bm, (x0, fy - 0.1, 0.25), (sx - 0.8, 0.25, 0.5))
    box(bm, (x0, fy - 0.1, 3.1), (sx - 0.8, 0.25, 0.25))
    for i in range(5):
        box(bm, (x0 - (sx - 1) / 2 + i * (sx - 1) / 4, fy - 0.1, 1.7), (0.18, 0.25, 2.9))
    new_mesh("shop_frames", bm, frame)
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in ((x0 - sx / 2, fy, 3.5), (x0 + sx / 2, fy, 3.5),
                                    (x0 + sx / 2, fy - 2.2, 2.9), (x0 - sx / 2, fy - 2.2, 2.9))]
    bm.faces.new(v)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.04)
    aw = new_mesh("awning", bm, stripes)
    bm = bmesh.new()
    box(bm, (x0, fy - 0.12, 4.4), (sx * 0.62, 0.2, 1.1))
    new_mesh("shop_signboard", bm, wood)
    cream = pbr("cream", (0.96, 0.9, 0.7), rough=0.4, emit=((1, 0.92, 0.7), 0.6))
    text_obj("Corner Shop", 0.85, cream, (x0, fy - 0.24, 4.4), extrude=0.04)
    # shelves of goods visible through the window
    goods = [pbr(f"goods{i}", c, rough=0.5) for i, c in enumerate(((0.8, 0.2, 0.1), (0.9, 0.7, 0.1), (0.1, 0.4, 0.7),
                                                                     (0.2, 0.6, 0.3), (0.9, 0.9, 0.85)))]
    for k, gm in enumerate(goods):
        bm = bmesh.new()
        for shelf in range(3):
            for j in range(14):
                if (j + shelf + k) % 5 == 0:
                    gx = x0 - sx / 2 + 1.2 + j * 1.15
                    box(bm, (gx, y0 - 1.2, 0.7 + shelf * 0.75 + 0.18), (0.8, 0.35, 0.36))
        new_mesh(f"goods_{k}", bm, gm)


# ---------------------------------------------------------------- interiors

def room(origin, sx, sy, sz, floor_mat, wall_mat, window=None, door=None):
    """Floor, ceiling and four walls facing inwards. window=(wall, a, b, z0, z1)."""
    ox, oy, oz = origin
    bm = bmesh.new()
    box(bm, (ox + sx / 2, oy + sy / 2, oz - 0.05), (sx, sy, 0.1))
    new_mesh("floor", bm, floor_mat)
    ceil = pbr("ceiling", (0.92, 0.92, 0.9), rough=0.9)
    bm = bmesh.new()
    box(bm, (ox + sx / 2, oy + sy / 2, oz + sz + 0.05), (sx, sy, 0.1))
    new_mesh("ceiling", bm, ceil)
    bm = bmesh.new()
    t = 0.15
    walls = {"x0": ((ox - t / 2, oy + sy / 2), (t, sy)), "x1": ((ox + sx + t / 2, oy + sy / 2), (t, sy)),
             "y0": ((ox + sx / 2, oy - t / 2), (sx, t)), "y1": ((ox + sx / 2, oy + sy + t / 2), (sx, t))}
    for k, ((cx, cy), (wx, wy)) in walls.items():
        if window and window[0] == k:
            _, a, b, z0, z1 = window
            if k in ("y0", "y1"):
                box(bm, (ox + a / 2, cy, oz + sz / 2), (a, wy, sz))
                box(bm, (ox + (b + sx) / 2, cy, oz + sz / 2), (sx - b, wy, sz))
                box(bm, (ox + (a + b) / 2, cy, oz + z0 / 2), (b - a, wy, z0))
                box(bm, (ox + (a + b) / 2, cy, oz + (z1 + sz) / 2), (b - a, wy, sz - z1))
            continue
        box(bm, (cx, cy, oz + sz / 2), (wx, wy, sz))
    new_mesh("walls", bm, wall_mat)
    skirting = pbr("skirting", (0.85, 0.85, 0.83), rough=0.5)
    bm = bmesh.new()
    box(bm, (ox + 0.01, oy + sy / 2, oz + 0.06), (0.03, sy, 0.12))
    box(bm, (ox + sx - 0.01, oy + sy / 2, oz + 0.06), (0.03, sy, 0.12))
    box(bm, (ox + sx / 2, oy + 0.01, oz + 0.06), (sx, 0.03, 0.12))
    new_mesh("skirting", bm, skirting)


def area_light(loc, target, energy, size, color=(1, 1, 1), shape="RECTANGLE", sy=None):
    ld = bpy.data.lights.new("area", "AREA")
    ld.energy = energy
    ld.color = color
    ld.shape = shape
    ld.size = size
    if sy:
        ld.size_y = sy
    o = link(bpy.data.objects.new("area", ld))
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def ceiling_panel(c, sx=1.2, sy=0.6, energy=120):
    lamp = pbr("panel_light", (1, 1, 1), emit=((1, 0.98, 0.95), 6.0))
    bm = bmesh.new()
    box(bm, c, (sx, sy, 0.03))
    new_mesh("panel", bm, lamp)
    area_light((c[0], c[1], c[2] - 0.05), (c[0], c[1], c[2] - 3), energy, sx, (1, 0.97, 0.92), sy=sy)


def monitor(at, facing, w=0.62, h=0.36, name="screen"):
    """Thin desktop monitor; returns the screen material so its image can change."""
    black = pbr("bezel", (0.02, 0.02, 0.022), rough=0.35, metal=0.2)
    alu = pbr("stand", (0.6, 0.6, 0.62), rough=0.3, metal=0.9)
    scr = bpy.data.materials.new(name)
    scr.use_nodes = True
    nt = scr.node_tree
    p = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.name = "img"
    t.image = bpy.data.images.new(name + "_img", 16, 16)
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(t.outputs["Color"], p.inputs["Emission Color"])
    p.inputs["Emission Strength"].default_value = 1.4
    p.inputs["Roughness"].default_value = 0.12
    p.inputs["Specular IOR Level"].default_value = 0.3
    root = link(bpy.data.objects.new(name + "_root", None))
    bm = bmesh.new()
    box(bm, (0, 0.02, 0), (w + 0.03, 0.025, h + 0.03))
    o = new_mesh(name + "_bezel", bm, black)
    o.parent = root
    bm = bmesh.new()
    box(bm, (0, 0.07, -h / 2 - 0.1), (0.05, 0.04, 0.26))
    box(bm, (0, 0.06, -h / 2 - 0.23), (0.24, 0.18, 0.012))
    o = new_mesh(name + "_stand", bm, alu)
    o.parent = root
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for i, c in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[i].uv = c
    me.materials.append(scr)
    o = link(bpy.data.objects.new(name, me))
    o.parent = root
    o.location = (0, 0.006, 0)
    root.location = at
    root.rotation_euler = (0, 0, facing)
    return scr, o


def keyboard(at, rot):
    k = pbr("keys", (0.06, 0.06, 0.065), rough=0.5)
    bm = bmesh.new()
    box(bm, (0, 0, 0.012), (0.44, 0.14, 0.024))
    box(bm, (0.32, 0, 0.015), (0.065, 0.11, 0.03))
    o = new_mesh("keyboard", bm, k, smooth_shade=False)
    o.location = at
    o.rotation_euler = (0, 0, rot)


def office_chair(at, rot):
    fabric = pbr("chair_fabric", (0.06, 0.07, 0.08), rough=0.9)
    alu = pbr("chair_metal", (0.25, 0.25, 0.27), rough=0.35, metal=0.8)
    bm = bmesh.new()
    box(bm, (0, 0, 0.47), (0.5, 0.5, 0.08))
    box(bm, (0, 0.27, 0.82), (0.46, 0.07, 0.6))
    o = new_mesh("chair", bm, fabric)
    bm = bmesh.new()
    cyl(bm, (0, 0, 0.08), 0.03, 0.36, 12)
    for i in range(5):
        a = i * 2 * math.pi / 5
        box(bm, (0.17 * math.cos(a), 0.17 * math.sin(a), 0.07), (0.34 * abs(math.cos(a)) + 0.05, 0.34 * abs(math.sin(a)) + 0.05, 0.03))
    box(bm, (0, 0.24, 0.6), (0.04, 0.04, 0.3))
    m = new_mesh("chair_base", bm, alu)
    m.parent = o
    o.location = at
    o.rotation_euler = (0, 0, rot)


def hospital_bed(at):
    frame = pbr("bed_frame", (0.82, 0.83, 0.84), rough=0.3, metal=0.6)
    sheet = pbr("sheet", (0.93, 0.94, 0.95), rough=0.85)
    blanket = pbr("blanket", (0.45, 0.62, 0.75), rough=0.9)
    bm = bmesh.new()
    box(bm, (0, 0, 0.45), (0.95, 2.05, 0.08))
    for x in (-0.42, 0.42):
        for y in (-0.95, 0.95):
            box(bm, (x, y, 0.22), (0.05, 0.05, 0.44))
    box(bm, (0, 1.02, 0.75), (0.95, 0.05, 0.6))
    box(bm, (0, -1.02, 0.62), (0.95, 0.05, 0.35))
    for x in (-0.5, 0.5):
        box(bm, (x, 0.2, 0.68), (0.03, 1.1, 0.02))
        box(bm, (x, 0.2, 0.55), (0.03, 1.1, 0.02))
    o = new_mesh("bed", bm, frame)
    bm = bmesh.new()
    box(bm, (0, 0, 0.56), (0.9, 2.0, 0.16))
    box(bm, (0, 0.78, 0.69), (0.62, 0.36, 0.13))
    s = new_mesh("mattress", bm, sheet)
    s.modifiers.new("bev", "BEVEL").width = 0.04
    s.parent = o
    bm = bmesh.new()
    box(bm, (0, -0.3, 0.66), (0.98, 1.3, 0.05))
    b = new_mesh("blanket", bm, blanket)
    b.modifiers.new("bev", "BEVEL").width = 0.02
    b.parent = o
    o.location = at


def patient_monitor(at, rot, scr_name):
    grey = pbr("mon_body", (0.78, 0.8, 0.8), rough=0.4)
    alu = pbr("pole", (0.7, 0.7, 0.72), rough=0.3, metal=0.9)
    bm = bmesh.new()
    cyl(bm, (0, 0, 0.05), 0.025, 1.3, 12)
    box(bm, (0, 0, 0.03), (0.5, 0.5, 0.04))
    pole = new_mesh("monitor_pole", bm, alu)
    bm = bmesh.new()
    box(bm, (0, 0, 1.42), (0.36, 0.14, 0.28))
    body = new_mesh("monitor_body", bm, grey)
    body.parent = pole
    scr, so = monitor((0, -0.072, 1.43), 0, name=scr_name)
    for c in bpy.data.objects[scr_name + "_root"].children:
        if c.name != scr_name:
            c.hide_render = True
    bpy.data.objects[scr_name].scale = (0.5, 1, 0.62)
    bpy.data.objects[scr_name + "_root"].parent = pole
    pole.location = at
    pole.rotation_euler = (0, 0, rot)
    return scr


def iv_stand(at):
    alu = pbr("iv_metal", (0.75, 0.75, 0.77), rough=0.3, metal=0.9)
    bag = pbr("iv_bag", (0.85, 0.9, 0.95), rough=0.2, alpha=0.6)
    bm = bmesh.new()
    cyl(bm, (0, 0, 0.05), 0.015, 1.9, 10)
    for i in range(5):
        a = i * 2 * math.pi / 5
        box(bm, (0.15 * math.cos(a), 0.15 * math.sin(a), 0.04), (0.3 * abs(math.cos(a)) + 0.03, 0.3 * abs(math.sin(a)) + 0.03, 0.02))
    box(bm, (0, 0, 1.92), (0.3, 0.015, 0.015))
    o = new_mesh("iv", bm, alu)
    bm = bmesh.new()
    box(bm, (0.12, 0, 1.72), (0.12, 0.04, 0.22))
    b = new_mesh("iv_bag", bm, bag)
    b.modifiers.new("bev", "BEVEL").width = 0.02
    b.parent = o
    o.location = at


def curtain(x0, x1, y, z0, z1, mat):
    bm = bmesh.new()
    n = 40
    rows = []
    for j in range(2):
        z = z0 if j == 0 else z1
        rows.append([bm.verts.new((lerp(x0, x1, i / n), y + 0.06 * math.sin(i * 1.3), z)) for i in range(n + 1)])
    for i in range(n):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    o = new_mesh("curtain", bm, mat, smooth_shade=True)
    o.modifiers.new("solid", "SOLIDIFY").thickness = 0.01


SCREENS = {}


def build_hospital(models):
    o = HOSP
    floor = textured("hosp_floor", "terrazzo_tiles", 1.2, tint=(0.9, 0.93, 0.95), rough_mult=0.6)
    wall = pbr("hosp_wall", (0.80, 0.86, 0.84), rough=0.85, spec=0.3)
    room(o, 7.0, 6.0, 3.0, floor, wall, window=("y1", 1.4, 4.4, 0.9, 2.5))
    glass = pbr("window_glass", (0.9, 0.95, 1.0), rough=0.02, alpha=0.08)
    bm = bmesh.new()
    box(bm, (o.x + 2.9, o.y + 6.0, o.z + 1.7), (3.0, 0.02, 1.6))
    new_mesh("hosp_glass", bm, glass)
    frame = pbr("winframe", (0.9, 0.9, 0.9), rough=0.4)
    bm = bmesh.new()
    box(bm, (o.x + 2.9, o.y + 6.0, o.z + 0.9), (3.1, 0.2, 0.06))
    box(bm, (o.x + 2.9, o.y + 6.0, o.z + 2.5), (3.1, 0.2, 0.06))
    box(bm, (o.x + 2.9, o.y + 6.0, o.z + 1.7), (0.05, 0.2, 1.6))
    new_mesh("hosp_frame", bm, frame)
    # view out of the window: lawn and trees, lit by the sky
    lawn = textured("hosp_lawn", "aerial_grass_rock", 5.0, tint=(0.8, 0.9, 0.65))
    bm = bmesh.new()
    box(bm, (o.x + 3, o.y + 40, o.z - 4), (120, 60, 0.1))
    new_mesh("hosp_outside", bm, lawn)
    for i in range(8):
        instance(models["tree_mid"], (o.x + rng.uniform(-20, 26), o.y + rng.uniform(14, 40), o.z - 4),
                 rng.uniform(0, 6), rng.uniform(2.0, 2.8), f"htree_{i}")
    area_light((o.x + 2.9, o.y + 6.6, o.z + 1.8), (o.x + 2.9, o.y + 3, o.z + 0.6), 260, 3.0, (1, 0.97, 0.92), sy=1.7)
    ceiling_panel((o.x + 2.0, o.y + 2.0, o.z + 2.97), energy=90)
    ceiling_panel((o.x + 5.0, o.y + 3.8, o.z + 2.97), energy=90)
    area_light((o.x + 5.5, o.y + 0.5, o.z + 2.6), (o.x + 2, o.y + 3, o.z + 0.8), 60, 2.0, (0.95, 0.97, 1.0))

    hospital_bed(Vector((o.x + 5.6, o.y + 4.3, o.z)))
    SCREENS["ecg"] = patient_monitor(Vector((o.x + 6.55, o.y + 5.55, o.z)), math.radians(-35), "ecg_screen")
    iv_stand(Vector((o.x + 4.7, o.y + 5.6, o.z)))
    curtain_mat = pbr("curtain", (0.55, 0.75, 0.78), rough=0.9)
    curtain(o.x + 6.25, o.x + 6.95, o.y + 2.6, o.z + 0.3, o.z + 2.6, curtain_mat)
    rail = pbr("rail", (0.8, 0.8, 0.8), rough=0.3, metal=0.9)
    bm = bmesh.new()
    box(bm, (o.x + 5.65, o.y + 2.6, o.z + 2.62), (2.5, 0.03, 0.03))
    new_mesh("rail", bm, rail)

    # the clinician's desk against the left wall
    import_model("metal_office_desk", at=(o.x + 0.5, o.y + 3.0, o.z), rot=math.radians(-90))
    SCREENS["main"], scr_obj = monitor(Vector((o.x + 0.38, o.y + 3.0, o.z + 0.79 + 0.36)), math.radians(90), name="main_screen")
    keyboard((o.x + 0.75, o.y + 3.0, o.z + 0.79), math.radians(90))
    mouse = pbr("mouse", (0.05, 0.05, 0.05), rough=0.4)
    bm = bmesh.new()
    box(bm, (o.x + 0.78, o.y + 2.62, o.z + 0.8), (0.1, 0.06, 0.03))
    new_mesh("mouse", bm, mouse).modifiers.new("bev", "BEVEL").width = 0.012
    import_model("clipboard", at=(o.x + 0.6, o.y + 3.6, o.z + 0.795), rot=0.3)
    import_model("office_notepads", at=(o.x + 0.45, o.y + 2.3, o.z + 0.795), rot=0.1, scale=0.5)
    office_chair((o.x + 1.5, o.y + 3.0, o.z), math.radians(-90))
    import_model("wheelchair_01", at=(o.x + 1.4, o.y + 0.9, o.z), rot=math.radians(60))
    import_model("potted_plant_02", at=(o.x + 0.5, o.y + 5.4, o.z), rot=0.4)
    import_model("wall_clock", at=(o.x + 0.02, o.y + 3.0, o.z + 2.2), rot=math.radians(-90))
    import_model("modern_arm_chair_01", at=(o.x + 3.6, o.y + 4.9, o.z), rot=math.radians(200))
    red = pbr("cross_red", (0.75, 0.05, 0.06), rough=0.4)
    bm = bmesh.new()
    box(bm, (0, 0, 0), (0.02, 0.36, 0.12))
    box(bm, (0, 0, 0), (0.02, 0.12, 0.36))
    c = new_mesh("wall_cross", bm, red)
    c.location = (o.x + 0.01, o.y + 4.6, o.z + 1.9)

    doc = mhuman.person("clinician", gender="female", race="asian", skin_name="young_asian_female",
                        hair="ponytail01", hair_tint=(0.35, 0.25, 0.2),
                        clothes=("toigo_basic_tucked_t-shirt", "toigo_wool_pants", "shoes03"),
                        tints={"toigo_basic_tucked_t-shirt": (0.35, 0.72, 0.70), "toigo_wool_pants": (0.33, 0.66, 0.66)},
                        brows="eyebrow010", lashes="eyelashes02")
    doc.rotation_euler = (0, 0, math.radians(-90))
    mhuman.pose_seated_typing(doc, lean=0.18)
    seat(doc, Vector((o.x + 1.45, o.y + 3.0, o.z + 0.55)))
    return doc


def seat(arm, hip_target):
    bpy.context.view_layer.update()
    l = arm.matrix_world @ arm.pose.bones["upperleg01.L"].head
    r = arm.matrix_world @ arm.pose.bones["upperleg01.R"].head
    arm.location += hip_target - (l + r) / 2


def build_shop(models):
    o = SHOP
    floor = textured("shop_floor", "laminate_floor_02", 2.0, rough_mult=0.7)
    wall = textured("shop_wall", "painted_plaster_wall", 2.0, tint=(0.97, 0.92, 0.84), bump=0.2)
    room(o, 8.0, 6.0, 3.2, floor, wall, window=("y0", 1.0, 7.0, 0.5, 2.8))
    glass = pbr("shop_window", (0.9, 0.95, 1.0), rough=0.02, alpha=0.06)
    bm = bmesh.new()
    box(bm, (o.x + 4, o.y, o.z + 1.65), (6, 0.02, 2.3))
    new_mesh("shopwin", bm, glass)
    paving = textured("street", "rectangular_paving", 2.0)
    bm = bmesh.new()
    box(bm, (o.x + 4, o.y - 20, o.z - 0.05), (60, 40, 0.1))
    new_mesh("street", bm, paving)
    brick = textured("opp_brick", "brick_wall_001", 2.0)
    bm = bmesh.new()
    box(bm, (o.x + 4, o.y - 16, o.z + 6), (60, 1, 12))
    new_mesh("opposite", bm, brick)
    for i in range(4):
        instance(models["tree_mid"], (o.x + i * 7 - 6, o.y - 6, o.z), rng.uniform(0, 6), 1.8, f"stree_{i}")
    area_light((o.x + 4, o.y - 1.5, o.z + 2.0), (o.x + 4, o.y + 3, o.z + 1.0), 380, 6.0, (1, 0.96, 0.9), sy=2.2)
    for x in (2.0, 6.0):
        ceiling_panel((o.x + x, o.y + 3.0, o.z + 3.17), 1.0, 1.0, 110)
    area_light((o.x + 4, o.y + 5.6, o.z + 2.8), (o.x + 4, o.y + 2, o.z + 0.8), 70, 3.0, (1, 0.9, 0.78))

    # counter across the room, the owner behind it facing the door
    wood = textured("counter_wood", "laminate_floor_02", 1.0, tint=(0.8, 0.62, 0.45))
    top = pbr("counter_top", (0.92, 0.92, 0.9), rough=0.25)
    bm = bmesh.new()
    box(bm, (o.x + 4.6, o.y + 3.4, o.z + 0.47), (3.2, 0.6, 0.94))
    new_mesh("counter", bm, wood)
    bm = bmesh.new()
    box(bm, (o.x + 4.6, o.y + 3.4, o.z + 0.96), (3.3, 0.7, 0.04))
    new_mesh("counter_top", bm, top)
    import_model("CashRegister_01", at=(o.x + 3.4, o.y + 3.35, o.z + 0.98), rot=math.radians(180), scale=0.7)
    SCREENS["laptop"] = laptop(Vector((o.x + 4.9, o.y + 3.42, o.z + 0.98)), 0.0)
    import_model("potted_plant_04", at=(o.x + 5.9, o.y + 3.3, o.z + 0.98), scale=1.4)
    import_model("potted_plant_02", at=(o.x + 0.6, o.y + 0.8, o.z), rot=1.0)
    import_model("wooden_display_shelves_01", at=(o.x + 0.25, o.y + 2.6, o.z), rot=0)
    import_model("wooden_display_shelves_01", at=(o.x + 7.75, o.y + 2.6, o.z), rot=math.pi)
    back_shelves(o)

    owner = mhuman.person("owner", gender="male", race="african", skin_name="young_african_male", hair="short04",
                          clothes=("namuhekam_male_polo_shirt", "cortu_cargo_pants", "shoes01"),
                          tints={"namuhekam_male_polo_shirt": (0.25, 0.34, 0.55), "cortu_cargo_pants": (0.55, 0.5, 0.42)},
                          hair_tint=(0.12, 0.1, 0.09),
                          brows="eyebrow002", location=(o.x + 4.85, o.y + 3.98, o.z), rotation=0.0)
    mhuman.pose_standing_typing(owner)
    return owner


def laptop(at, rot):
    alu = pbr("laptop_alu", (0.55, 0.56, 0.58), rough=0.3, metal=0.9)
    black = pbr("laptop_keys", (0.03, 0.03, 0.035), rough=0.5)
    root = link(bpy.data.objects.new("laptop", None))
    bm = bmesh.new()
    box(bm, (0, 0, 0.009), (0.34, 0.24, 0.018))
    b = new_mesh("laptop_base", bm, alu)
    b.parent = root
    bm = bmesh.new()
    box(bm, (0, 0.02, 0.019), (0.29, 0.11, 0.002))
    k = new_mesh("laptop_keyboard", bm, black)
    k.parent = root
    lid = link(bpy.data.objects.new("lid", None))
    lid.parent = root
    lid.location = (0, -0.115, 0.018)
    lid.rotation_euler = (math.radians(-12), 0, 0)
    bm = bmesh.new()
    box(bm, (0, -0.006, 0.11), (0.34, 0.008, 0.22))
    l = new_mesh("laptop_lid", bm, alu)
    l.parent = lid
    scr = bpy.data.materials.new("laptop_screen")
    scr.use_nodes = True
    nt = scr.node_tree
    p = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.name = "img"
    t.image = bpy.data.images.new("laptop_img", 16, 16)
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(t.outputs["Color"], p.inputs["Emission Color"])
    p.inputs["Emission Strength"].default_value = 1.3
    p.inputs["Roughness"].default_value = 0.15
    me = bpy.data.meshes.new("laptop_screen")
    w, h = 0.31, 0.195
    me.from_pydata([(w / 2, 0, 0), (-w / 2, 0, 0), (-w / 2, 0, h), (w / 2, 0, h)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for i, c in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[i].uv = c
    me.materials.append(scr)
    s = link(bpy.data.objects.new("laptop_screen", me))
    s.parent = lid
    s.location = (0, 0.0005, 0.012)
    root.location = at
    root.rotation_euler = (0, 0, rot)
    return scr


def back_shelves(o):
    wood = pbr("shelf_wood", (0.45, 0.3, 0.18), rough=0.6)
    bm = bmesh.new()
    for i in range(5):
        box(bm, (o.x + 4, o.y + 5.75, o.z + 0.35 + i * 0.5), (6.0, 0.45, 0.03))
    for x in (1.0, 3.0, 5.0, 7.0):
        box(bm, (o.x + x, o.y + 5.75, o.z + 1.2), (0.04, 0.45, 2.4))
    new_mesh("back_shelves", bm, wood)
    palette = [(0.75, 0.15, 0.1), (0.95, 0.75, 0.15), (0.15, 0.4, 0.7), (0.2, 0.55, 0.3), (0.92, 0.9, 0.85),
               (0.55, 0.25, 0.5), (0.9, 0.45, 0.15)]
    mats = [pbr(f"product{i}", c, rough=0.45, spec=0.5) for i, c in enumerate(palette)]
    bms = [bmesh.new() for _ in mats]
    for i in range(5):
        x = o.x + 1.1
        while x < o.x + 6.9:
            w = rng.uniform(0.08, 0.2)
            h = rng.uniform(0.15, 0.36)
            k = rng.randrange(len(mats))
            if rng.random() < 0.4:
                cyl(bms[k], (x + w / 2, o.y + 5.7, o.z + 0.365 + i * 0.5), w / 2, h, 12)
            else:
                box(bms[k], (x + w / 2, o.y + 5.7, o.z + 0.365 + i * 0.5 + h / 2), (w, 0.2, h))
            x += w + rng.uniform(0.01, 0.04)
    for k, bm in enumerate(bms):
        new_mesh(f"products_{k}", bm, mats[k])


# ---------------------------------------------------------------- camera

CUTS = []  # (start, end, keys[(u, loc, target, lens)])


def shots():
    H, S = HOSP, SHOP
    return [
        (0.0, 12.4, [(0.0, (-150, -210, 120), (8, 0, 4), 32), (0.55, (-40, -230, 95), (10, 0, 6), 32),
                     (1.0, (90, -150, 80), (30, 20, 8), 32)]),
        (12.4, 19.2, [(0.0, H + Vector((6.6, 0.35, 1.75)), H + Vector((1.6, 4.2, 1.0)), 24),
                      (1.0, H + Vector((5.6, 0.6, 1.65)), H + Vector((1.2, 3.8, 1.05)), 24)]),
        (19.2, 26.5, [(0.0, H + Vector((2.9, 1.9, 1.5)), H + Vector((0.4, 3.0, 1.12)), 35),
                      (0.55, H + Vector((2.05, 3.62, 1.36)), H + Vector((0.38, 2.95, 1.15)), 42),
                      (1.0, H + Vector((1.9, 3.62, 1.34)), H + Vector((0.38, 2.95, 1.16)), 46)]),
        (26.5, 30.0, [(0.0, (4, -44, 2.2), (17, -28, 3.0), 28), (1.0, (10, -38, 1.9), (18, -28, 2.6), 28)]),
        (30.0, 32.4, [(0.0, S + Vector((2.0, 0.8, 1.7)), S + Vector((4.7, 3.8, 1.3)), 28),
                      (1.0, S + Vector((3.0, 0.9, 1.62)), S + Vector((4.85, 3.7, 1.25)), 30)]),
        (32.4, 37.2, [(0.0, S + Vector((6.6, 5.3, 2.05)), S + Vector((4.95, 3.4, 1.05)), 34),
                      (1.0, S + Vector((6.3, 5.0, 1.95)), S + Vector((4.95, 3.4, 1.08)), 38)]),
        (37.2, 48.0, [(0.0, (60, -170, 70), (0, 0, 5), 30), (0.6, (-60, -230, 140), (0, 0, 0), 30),
                      (1.0, (-110, -250, 175), (0, 0, 0), 30)]),
    ]


def camera_at(t):
    for start, end, keys in CUTS:
        if start <= t < end or (end == DURATION and t >= start):
            u = (t - start) / (end - start)
            for (u0, l0, t0, f0), (u1, l1, t1, f1) in zip(keys, keys[1:]):
                if u <= u1:
                    k = smooth((u - u0) / (u1 - u0)) * 0.6 + ((u - u0) / (u1 - u0)) * 0.4
                    return Vector(l0).lerp(Vector(l1), k), Vector(t0).lerp(Vector(t1), k), lerp(f0, f1, k)
            u0, l0, t0, f0 = keys[-1]
            return Vector(l0), Vector(t0), f0
    return Vector((0, -100, 50)), Vector((0, 0, 0)), 32


# ---------------------------------------------------------------- per frame

IMG_CACHE = {}


def set_screen(mat, key, draw):
    if key not in IMG_CACHE:
        path = os.path.join(BUILD, "screens", key + ".png")
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            draw().save(path)
        IMG_CACHE[key] = bpy.data.images.load(path)
    mat.node_tree.nodes["img"].image = IMG_CACHE[key]


def pose_frame(t, cam, people):
    loc, tgt, lens = camera_at(t)
    inside = loc.x > 500
    if bpy.context.scene.eevee.use_raytracing != inside:
        bpy.context.scene.eevee.use_raytracing = inside
    cam.data.clip_start = 0.05 if inside else 1.0
    cam.location = loc
    cam.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    set_screen(SCREENS["ecg"], f"ecg_{int(t * 15) % 30:02d}", lambda: screens.ecg(int(t * 15) % 30))
    k = screens.health_state(t)
    set_screen(SCREENS["main"], "health_" + k, lambda: screens.health(k))
    k2 = screens.shop_state(t)
    set_screen(SCREENS["laptop"], "shop_" + k2, lambda: screens.shop(k2))
    # small signs of life: breathing and a slight head movement
    for arm, base_rot in people:
        hb = arm.pose.bones["head"]
        hb.rotation_mode = "XYZ"
        hb.rotation_euler = (math.radians(2 * math.sin(t * 0.7)), math.radians(1.5 * math.sin(t * 0.43)), 0)
        sp = arm.pose.bones["spine03"]
        sp.rotation_mode = "XYZ"
        sp.rotation_euler = (math.radians(0.8 * math.sin(t * 1.6)), 0, 0)


def setup_render(scene):
    scene.render.engine = "BLENDER_EEVEE"
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1280, 720, 100
    r.image_settings.file_format = "PNG"
    ee = scene.eevee
    ee.taa_render_samples = 20
    ee.use_raytracing = True
    ee.ray_tracing_options.resolution_scale = "2"
    ee.use_shadows = True
    ee.shadow_ray_count = 2
    ee.shadow_step_count = 8
    ee.fast_gi_method = "GLOBAL_ILLUMINATION"
    vs = scene.view_settings
    vs.view_transform = "AgX"
    try:
        vs.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    vs.exposure = 0.0


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    setup_render(scene)
    build_world()
    models = {}
    _, models["tree_full"] = import_model("island_tree_02", at=(0, 0, -500))
    _, models["tree_mid"] = import_model("island_tree_02", decimate=0.03, at=(0, 0, -500))
    _, models["shrub"] = import_model("shrub_02", at=(0, 0, -500))
    for k in models:
        models[k] = [o for o in models[k] if o.type == "MESH"]
        for o in models[k]:
            o.hide_render = True
    build_town(models["tree_mid"], models["tree_full"], models["shrub"])
    doc = build_hospital(models)
    owner = build_shop(models)
    cd = bpy.data.cameras.new("cam")
    cd.clip_start = 0.05
    cd.clip_end = 9000
    cam = link(bpy.data.objects.new("cam", cd))
    scene.camera = cam
    return scene, cam, [(doc, 0), (owner, 0)]


def main():
    global CUTS
    args = sys.argv[sys.argv.index("--") + 1:]
    mode = args[0]
    CUTS = shots()
    scene, cam, people = build()
    frames_dir = os.path.join(BUILD, "frames" if mode == "render" else "stills")
    state_dir = os.path.join(BUILD, "state")
    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(state_dir, exist_ok=True)
    if mode == "still":
        frames = [int(round(float(a) * FPS)) for a in args[1:]]
    else:
        frames = list(range(int(args[1]), int(args[2]) + 1))
    for f in frames:
        out = os.path.join(frames_dir, f"f{f:05d}.png")
        if mode == "render" and os.path.exists(out):
            continue
        t = f / FPS
        pose_frame(t, cam, people)
        bpy.context.view_layer.update()
        anchors = {}
        for k, p in BADGES.items():
            c = world_to_camera_view(scene, cam, p)
            anchors[k] = [round(c.x, 4), round(1 - c.y, 4), round(c.z, 1)]
        json.dump({"t": t, "anchors": anchors}, open(os.path.join(state_dir, f"f{f:05d}.json"), "w"))
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        print(f"frame {f} done", flush=True)


main()
