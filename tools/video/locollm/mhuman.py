"""Build posed MakeHuman characters in Blender from the CC0 data files.

Reads the base mesh, body-shape targets, skeleton and weights, and the
mhclo proxies (eyes, brows, lashes, hair, clothes) as plain data. Nothing
from the downloaded packs is executed.
"""
import gzip
import json
import math
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "assets", "mh_base", "data")
SYS = os.path.join(HERE, "assets", "mh_assets")
SCALE = 0.1

_cache = {}


def to_bl(v):
    return Vector((v[0], -v[2], v[1])) * SCALE


def read_obj(path):
    verts, uvs, faces, groups = [], [], [], {}
    group = None
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("v "):
                verts.append(tuple(float(x) for x in line.split()[1:4]))
            elif line.startswith("vt "):
                uvs.append(tuple(float(x) for x in line.split()[1:3]))
            elif line.startswith("g "):
                group = line.split()[1]
            elif line.startswith("f "):
                vs, ts = [], []
                for p in line.split()[1:]:
                    a = p.split("/")
                    vs.append(int(a[0]) - 1)
                    ts.append(int(a[1]) - 1 if len(a) > 1 and a[1] else -1)
                faces.append((vs, ts))
                groups.setdefault(group, []).append(len(faces) - 1)
    return verts, uvs, faces, groups


def base():
    if "base" not in _cache:
        _cache["base"] = read_obj(os.path.join(BASE, "3dobjs", "base.obj"))
    return _cache["base"]


def target(name):
    path = os.path.join(BASE, "targets", name + ".target.gz")
    out = []
    with gzip.open(path, "rt") as f:
        for line in f:
            p = line.split()
            if len(p) == 4 and not line.startswith("#"):
                out.append((int(p[0]), float(p[1]), float(p[2]), float(p[3])))
    return out


def shaped_verts(gender, race, age="young", muscle="averagemuscle", weight="averageweight"):
    verts = [list(v) for v in base()[0]]
    for name in (f"macrodetails/universal-{gender}-{age}-{muscle}-{weight}",
                 f"macrodetails/{race}-{gender}-{age}"):
        for i, dx, dy, dz in target(name):
            verts[i][0] += dx
            verts[i][1] += dy
            verts[i][2] += dz
    return verts


def read_mhclo(path):
    info = {"refs": [], "delete": set(), "scale": {}}
    mode = None
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            p = s.split()
            if p[0] in ("x_scale", "y_scale", "z_scale"):
                info["scale"][p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] in ("obj_file", "material"):
                info[p[0]] = p[1]
            elif p[0] == "verts":
                mode = "verts"
            elif p[0] == "delete_verts":
                mode = "delete"
            elif mode == "verts" and p[0][0].isdigit():
                if len(p) == 1:
                    info["refs"].append(((int(p[0]),), (1.0,), (0, 0, 0)))
                else:
                    info["refs"].append(((int(p[0]), int(p[1]), int(p[2])),
                                         tuple(float(x) for x in p[3:6]), tuple(float(x) for x in p[6:9])))
            elif mode == "delete":
                i = 0
                while i < len(p):
                    if i + 2 < len(p) and p[i + 1] == "-":
                        info["delete"].update(range(int(p[i]), int(p[i + 2]) + 1))
                        i += 3
                    else:
                        info["delete"].add(int(p[i]))
                        i += 1
    return info


def read_mhmat(path):
    d = {}
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            p = line.split(None, 1)
            if len(p) == 2 and not line.startswith("#"):
                d[p[0]] = p[1].strip()
    return d


# ---------------------------------------------------------------- materials

def tex_node(nt, path, colour=True):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(path, check_existing=True)
    if not colour:
        n.image.colorspace_settings.name = "Non-Color"
    return n


def material(name, folder, mat, kind, tint=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    diff = mat.get("diffuseTexture")
    if diff:
        t = tex_node(nt, os.path.join(folder, os.path.basename(diff)))
        col = t.outputs["Color"]
        if tint:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            nt.links.new(col, [s for s in mix.inputs if s.name == "A" and s.type == "RGBA"][0])
            [s for s in mix.inputs if s.name == "B" and s.type == "RGBA"][0].default_value = (*tint, 1)
            col = [s for s in mix.outputs if s.type == "RGBA"][0]
        nt.links.new(col, p.inputs["Base Color"])
        if kind in ("hair", "brow", "lash"):
            nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
            m.surface_render_method = "DITHERED"
    nm = mat.get("normalmapTexture")
    if nm and os.path.exists(os.path.join(folder, os.path.basename(nm))):
        t = tex_node(nt, os.path.join(folder, os.path.basename(nm)), False)
        n = nt.nodes.new("ShaderNodeNormalMap")
        n.inputs["Strength"].default_value = 0.8
        nt.links.new(t.outputs["Color"], n.inputs["Color"])
        nt.links.new(n.outputs[0], p.inputs["Normal"])
    if kind == "skin":
        p.inputs["Subsurface Weight"].default_value = 0.25
        p.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        p.inputs["Subsurface Scale"].default_value = 0.012
        p.inputs["Roughness"].default_value = 0.48
        p.inputs["Specular IOR Level"].default_value = 0.35
    elif kind == "hair":
        p.inputs["Roughness"].default_value = 0.42
        p.inputs["Specular IOR Level"].default_value = 0.45
    elif kind == "eye":
        p.inputs["Roughness"].default_value = 0.08
        p.inputs["Coat Weight"].default_value = 1.0
    else:
        p.inputs["Roughness"].default_value = 0.8
        p.inputs["Specular IOR Level"].default_value = 0.25
    if kind in ("lash", "brow"):
        p.inputs["Roughness"].default_value = 0.7
    return m


# ---------------------------------------------------------------- build

def mesh_from(name, verts_bl, uvs, faces, keep_faces, mat):
    used = sorted({v for fi in keep_faces for v in faces[fi][0]})
    remap = {o: n for n, o in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([verts_bl[i] for i in used], [], [[remap[v] for v in faces[fi][0]] for fi in keep_faces])
    if uvs:
        uvl = me.uv_layers.new(name="UVMap")
        k = 0
        for fi in keep_faces:
            for t in faces[fi][1]:
                uvl.data[k].uv = uvs[t] if t >= 0 else (0, 0)
                k += 1
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    return obj, remap


def joint_centres(verts_obj):
    _, _, faces, groups = base()
    out = {}
    for g, fis in groups.items():
        if g and g.startswith("joint-"):
            vs = {v for fi in fis for v in faces[fi][0]}
            c = Vector((0, 0, 0))
            for v in vs:
                c += Vector(verts_obj[v])
            out[g] = c / len(vs)
    return out


def bone_point(spec, verts_obj, joints):
    st = spec["strategy"]
    if st == "CUBE" and spec.get("cube_name") in joints:
        return to_bl(joints[spec["cube_name"]])
    if st == "VERTEX":
        return to_bl(verts_obj[spec["vertex_index"]])
    if st == "MEAN":
        c = Vector((0, 0, 0))
        for i in spec["vertex_indices"]:
            c += Vector(verts_obj[i])
        return to_bl(c / len(spec["vertex_indices"]))
    return Vector(spec["default_position"])


def build_armature(name, verts_obj, coll):
    rig = json.load(open(os.path.join(BASE, "rigs", "standard", "rig.default.json"), encoding="utf-8"))
    joints = joint_centres(verts_obj)
    arm = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, arm)
    coll.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, b in rig.items():
        eb = arm.edit_bones.new(bname)
        eb.head = bone_point(b["head"], verts_obj, joints)
        eb.tail = bone_point(b["tail"], verts_obj, joints)
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, 0.01))
        eb.roll = b.get("roll", 0.0)
    for bname, b in rig.items():
        if b.get("parent"):
            arm.edit_bones[bname].parent = arm.edit_bones[b["parent"]]
            arm.edit_bones[bname].use_connect = b.get("use_connect", False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def weights():
    if "w" not in _cache:
        w = json.load(open(os.path.join(BASE, "rigs", "standard", "weights.default.json"), encoding="utf-8"))["weights"]
        per = {}
        for bone, pairs in w.items():
            for v, x in pairs:
                per.setdefault(v, {})[bone] = per.setdefault(v, {}).get(bone, 0) + x
        _cache["w"] = per
    return _cache["w"]


def skin(obj, arm, vert_weights):
    groups = {}
    for i, bw in enumerate(vert_weights):
        tot = sum(bw.values()) or 1.0
        for bone, x in bw.items():
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([i], x / tot, "REPLACE")
    mod = obj.modifiers.new("rig", "ARMATURE")
    mod.object = arm
    obj.parent = arm


def fit_proxy(path, verts_obj):
    info = read_mhclo(path)
    sc = {}
    for ax, k in (("x", 0), ("y", 1), ("z", 2)):
        if ax in info["scale"]:
            a, b, d = info["scale"][ax]
            sc[k] = abs(verts_obj[a][k] - verts_obj[b][k]) / d
        else:
            sc[k] = 1.0
    out, refs = [], []
    for idx, ws, off in info["refs"]:
        p = [0.0, 0.0, 0.0]
        for i, w in zip(idx, ws):
            for k in range(3):
                p[k] += verts_obj[i][k] * w
        for k in range(3):
            p[k] += off[k] * sc[k]
        out.append(p)
        refs.append((idx, ws))
    return info, out, refs


def person(name, gender="female", race="asian", skin_name="young_asian_female", hair="bob02",
           clothes=("female_casualsuit01", "shoes02"), eyes="brown", brows="eyebrow001", lashes="eyelashes01",
           tints=None, hair_tint=None, location=(0, 0, 0), rotation=0.0, coll=None):
    tints = tints or {}
    coll = coll or bpy.context.scene.collection
    verts_obj = shaped_verts(gender, race)
    verts_bl = [to_bl(v) for v in verts_obj]
    _, uvs, faces, groups = base()
    per = weights()
    arm = build_armature(name, verts_obj, coll)

    deleted = set()
    covered = set()
    proxies = []
    for c in clothes:
        folder = os.path.join(SYS, "clothes", c)
        proxies.append(("cloth", c, folder))
    proxies += [("hair", hair, os.path.join(SYS, "hair", hair)),
                ("eye", "high-poly", os.path.join(SYS, "eyes", "high-poly")),
                ("brow", brows, os.path.join(SYS, "eyebrows", brows)),
                ("lash", lashes, os.path.join(SYS, "eyelashes", lashes))]
    for kind, pname, folder in proxies:
        mhclo = [f for f in os.listdir(folder) if f.endswith(".mhclo")][0]
        info, pverts, refs = fit_proxy(os.path.join(folder, mhclo), verts_obj)
        deleted |= info["delete"]
        if kind == "cloth" and not info["delete"] and "shoes" not in pname:
            covered.update(i for idx, _, _ in info["refs"] for i in idx)
        pv, puv, pf, _ = read_obj(os.path.join(folder, info.get("obj_file", mhclo[:-6] + ".obj")))
        if kind == "eye":
            matdef = read_mhmat(os.path.join(SYS, "eyes", "materials", eyes + ".mhmat"))
            mfolder = os.path.join(SYS, "eyes", "materials")
        else:
            matdef = read_mhmat(os.path.join(folder, info.get("material", mhclo[:-6] + ".mhmat")))
            mfolder = folder
        tint = hair_tint if kind == "hair" else tints.get(pname)
        mat = material(f"{name}_{pname}", mfolder, matdef, kind, tint)
        o, remap = mesh_from(f"{name}_{pname}", [to_bl(v) for v in pverts], puv, pf, list(range(len(pf))), mat)
        coll.objects.link(o)
        if kind == "cloth":
            # stand the cloth a little off the skin so posing does not let the body poke through
            lift = 0.013 if "shirt" in pname else 0.006
            for v in o.data.vertices:
                v.co += v.normal * lift
        vw = []
        for old in sorted(remap, key=remap.get):
            idx, ws = refs[old]
            acc = {}
            for i, w in zip(idx, ws):
                for bone, x in per.get(i, {}).items():
                    acc[bone] = acc.get(bone, 0) + x * max(w, 0)
            vw.append(acc)
        skin(o, arm, vw)
        if kind == "hair":
            o.visible_shadow = True

    body_faces = [fi for fi in groups.get("body", []) if not all(v in deleted for v in faces[fi][0])]
    body_faces = [fi for fi in body_faces if not any(v in deleted for v in faces[fi][0])]
    body_faces = [fi for fi in body_faces if sum(v in covered for v in faces[fi][0]) < 3]
    sk = os.path.join(SYS, "skins", skin_name)
    skin_mat = material(f"{name}_skin", sk, read_mhmat(os.path.join(sk, skin_name + ".mhmat")), "skin")
    body, remap = mesh_from(f"{name}_body", verts_bl, uvs, faces, body_faces, skin_mat)
    coll.objects.link(body)
    skin(body, arm, [per.get(old, {}) for old in sorted(remap, key=remap.get)])
    sub = body.modifiers.new("smooth", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1

    # stand on the floor
    zmin = min(v.z for v in verts_bl[:13380])
    arm.location = Vector(location) - Vector((0, 0, zmin))
    arm.rotation_euler = (0, 0, rotation)
    return arm


# ---------------------------------------------------------------- posing

def aim(arm, bone, direction, twist=0.0):
    """Point a bone along a direction given in the armature's local space."""
    pb = arm.pose.bones[bone]
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    head = m.to_translation()
    cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    rot = cur.rotation_difference(Vector(direction).normalized())
    r3 = rot.to_matrix() @ m.to_3x3()
    if twist:
        r3 = Matrix.Rotation(twist, 3, Vector(direction).normalized()) @ r3
    pb.matrix = Matrix.Translation(head) @ r3.to_4x4()
    bpy.context.view_layer.update()


def bend(arm, bone, axis, degrees):
    pb = arm.pose.bones[bone]
    pb.rotation_mode = "XYZ"
    e = list(pb.rotation_euler)
    e["XYZ".index(axis)] += math.radians(degrees)
    pb.rotation_euler = e
    bpy.context.view_layer.update()


def pose_seated_typing(arm, lean=0.12):
    """Sitting on a chair, forearms forward to a keyboard. Local axes: -Y is
    the character's front, +Z up."""
    for side, sx in (("L", 1), ("R", -1)):
        aim(arm, f"upperleg01.{side}", (0.04 * sx, -1.0, -0.08))
        aim(arm, f"upperleg02.{side}", (0.04 * sx, -1.0, -0.08))
        aim(arm, f"lowerleg01.{side}", (0.03 * sx, -0.15, -1.0))
        aim(arm, f"lowerleg02.{side}", (0.03 * sx, -0.15, -1.0))
        aim(arm, f"foot.{side}", (0.0, -1.0, -0.25))
    for b in ("spine03", "spine02", "spine01"):
        aim(arm, b, (0, -lean, 1.0))
    for side, sx in (("L", 1), ("R", -1)):
        aim(arm, f"upperarm01.{side}", (0.22 * sx, -0.35, -1.0))
        aim(arm, f"upperarm02.{side}", (0.22 * sx, -0.35, -1.0))
        aim(arm, f"lowerarm01.{side}", (-0.18 * sx, -1.0, 0.12))
        aim(arm, f"lowerarm02.{side}", (-0.18 * sx, -1.0, 0.12))
        aim(arm, f"wrist.{side}", (-0.1 * sx, -1.0, -0.12))
    aim(arm, "neck01", (0, -0.25, 1.0))
    aim(arm, "head", (0, -0.12, 1.0))


def pose_standing_typing(arm):
    """Standing at a counter, hands forward on a laptop."""
    aim(arm, "spine03", (0, -0.1, 1.0))
    for side, sx in (("L", 1), ("R", -1)):
        aim(arm, f"upperarm01.{side}", (0.18 * sx, -0.32, -1.0))
        aim(arm, f"upperarm02.{side}", (0.18 * sx, -0.32, -1.0))
        aim(arm, f"lowerarm01.{side}", (-0.2 * sx, -1.0, -0.5))
        aim(arm, f"lowerarm02.{side}", (-0.2 * sx, -1.0, -0.5))
        aim(arm, f"wrist.{side}", (-0.1 * sx, -1.0, -0.35))
    aim(arm, "neck01", (0, -0.3, 1.0))
    aim(arm, "head", (0, -0.35, 1.0))


def pose_standing(arm):
    for side, sx in (("L", 1), ("R", -1)):
        aim(arm, f"upperarm01.{side}", (0.12 * sx, 0.02, -1.0))
        aim(arm, f"upperarm02.{side}", (0.12 * sx, 0.02, -1.0))
        aim(arm, f"lowerarm01.{side}", (0.05 * sx, -0.25, -1.0))
        aim(arm, f"lowerarm02.{side}", (0.05 * sx, -0.25, -1.0))
