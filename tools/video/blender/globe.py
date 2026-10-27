"""The Earth for the opening and the country comparison, as its own Blender scene.

Textures: NASA Blue Marble (public domain, tools/video/assets). Country
outlines: Natural Earth via the world-atlas package (public domain data).
"""
import json
import math
import os

import bmesh
import bpy
from mathutils import Vector, geometry

HERE = os.path.dirname(os.path.abspath(__file__))
R = 10.0
COUNTRIES = {"China": (0.86, 0.27, 0.22), "Germany": (0.93, 0.63, 0.0), "Australia": (0.31, 0.79, 0.56),
             "New Zealand": (0.22, 0.53, 0.9)}


def xyz(lon, lat, r=R):
    lo, la = math.radians(lon), math.radians(lat)
    return Vector((r * math.cos(la) * math.cos(lo), r * math.cos(la) * math.sin(lo), r * math.sin(la)))


# ---------------------------------------------------------------- topojson

def load_rings(names):
    d = json.load(open(os.path.join(HERE, "assets", "geo", "countries-50m.json"), encoding="utf-8"))
    sx, sy = d["transform"]["scale"]
    tx, ty = d["transform"]["translate"]
    arcs = []
    for arc in d["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        out = []
        for i in idx:
            a = arcs[i] if i >= 0 else list(reversed(arcs[~i]))
            out.extend(a if not out else a[1:])
        return out

    res = {}
    for g in d["objects"]["countries"]["geometries"]:
        n = g["properties"]["name"]
        if n not in names:
            continue
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        res[n] = [ring(p[0]) for p in polys]
    return res


def area(r):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1]))) / 2


def densify(r, step=1.0):
    out = []
    for a, b in zip(r, r[1:] + r[:1]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(n):
            out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out


# ---------------------------------------------------------------- materials

def emit_mat(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Emission Color"].default_value = (*color, 1)
    p.inputs["Emission Strength"].default_value = strength
    p.inputs["Roughness"].default_value = 0.4
    # walls whose normals face inwards still read as the country colour
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    back = nt.nodes.new("ShaderNodeEmission")
    back.inputs["Color"].default_value = (*[c * 0.55 for c in color], 1)
    back.inputs["Strength"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs[0])
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(back.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m


def earth_material():
    m = bpy.data.materials.new("earth")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(HERE, "..", "assets", "earth-day.jpg"))
    t.interpolation = "Cubic"
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t.outputs["Color"], sep.inputs[0])
    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    nt.links.new(sep.outputs[2], sub.inputs[0])
    nt.links.new(sep.outputs[0], sub.inputs[1])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 0.12
    mr.inputs["To Min"].default_value = 0.75
    mr.inputs["To Max"].default_value = 0.28
    nt.links.new(sub.outputs[0], mr.inputs["Value"])
    nt.links.new(mr.outputs[0], p.inputs["Roughness"])
    p.inputs["Specular IOR Level"].default_value = 0.4
    return m


def atmosphere_material():
    m = bpy.data.materials.new("atmosphere")
    m.use_nodes = True
    m.surface_render_method = "BLENDED"
    m.use_backface_culling = True
    nt = m.node_tree
    out = nt.nodes["Material Output"]
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    nt.links.new(lw.outputs["Facing"], pw.inputs[0])
    pw.inputs[1].default_value = 5.0
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.35, 0.62, 1.0, 1)
    em.inputs["Strength"].default_value = 1.6
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(pw.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def space_world():
    w = bpy.data.worlds.new("space")
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 260
    nt.links.new(tc.outputs["Generated"], vor.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 0.035
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    nt.links.new(vor.outputs["Distance"], mr.inputs["Value"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vor.outputs["Color"], sep.inputs[0])
    keep = nt.nodes.new("ShaderNodeMath")
    keep.operation = "GREATER_THAN"
    nt.links.new(sep.outputs[0], keep.inputs[0])
    keep.inputs[1].default_value = 0.72
    m1 = nt.nodes.new("ShaderNodeMath")
    m1.operation = "MULTIPLY"
    nt.links.new(mr.outputs[0], m1.inputs[0])
    nt.links.new(keep.outputs[0], m1.inputs[1])
    m2 = nt.nodes.new("ShaderNodeMath")
    m2.operation = "MULTIPLY"
    nt.links.new(m1.outputs[0], m2.inputs[0])
    nt.links.new(sep.outputs[1], m2.inputs[1])
    col = nt.nodes.new("ShaderNodeCombineColor")
    for i in range(3):
        nt.links.new(m2.outputs[0], col.inputs[i])
    nt.links.new(col.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 5.0
    return w


# ---------------------------------------------------------------- geometry

def sphere(name, r, mat, coll, seg=192, rings=96):
    bm = bmesh.new()
    verts = [[bm.verts.new(xyz(-180 + 360 * i / seg, -90 + 180 * j / rings, r)) for i in range(seg + 1)]
             for j in range(rings + 1)]
    uvl = bm.loops.layers.uv.new("UVMap")
    for j in range(rings):
        for i in range(seg):
            vs = (verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i])
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uvl].uv = (a / seg, b / rings)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def outline(name, rings, mat, coll):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.022
    for r in rings:
        pts = densify(r, 0.5)
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, (lo, la) in zip(sp.points, pts):
            p.co = (*xyz(lo, la, R * 1.004), 1)
        sp.use_cyclic_u = True
    cu.materials.append(mat)
    o = bpy.data.objects.new(name, cu)
    coll.objects.link(o)
    return o


def prism(name, rings, mat, coll):
    """Country raised off the globe. Shape key 'up' lifts the top by 1 unit."""
    bm = bmesh.new()
    for r in rings:
        if area(r) < 0.6:
            continue
        pts = densify(r, 1.5)
        if len(pts) < 3:
            continue
        tris = geometry.tessellate_polygon([[Vector((x, y, 0)) for x, y in pts]])
        vs = [bm.verts.new((x, y, 0)) for x, y in pts]
        for a, b, c in tris:
            try:
                bm.faces.new((vs[a], vs[b], vs[c]))
            except ValueError:
                pass
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > 2.0], cuts=2, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    boundary = [e for e in bm.edges if e.is_boundary]
    ll = {v: (v.co.x, v.co.y) for v in bm.verts}
    low = {}
    for e in boundary:
        for v in e.verts:
            if v not in low:
                low[v] = bm.verts.new((0, 0, 0))
                ll[low[v]] = ll[v]
    for e in boundary:
        a, b = e.verts
        try:
            bm.faces.new((a, b, low[b], low[a]))
        except ValueError:
            pass
    lows = set(low.values())
    for v in bm.verts:
        lo, la = ll[v]
        v.co = xyz(lo, la, R * (0.995 if v in lows else 1.003))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    order = [v for v in bm.verts]
    lift = [(v not in lows) for v in order]
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    o.shape_key_add(name="Basis")
    k = o.shape_key_add(name="up")
    k.slider_max = 10.0
    for i, (pt, up) in enumerate(zip(k.data, lift)):
        if up:
            pt.co = pt.co + pt.co.normalized() * 1.0
    return o


# ---------------------------------------------------------------- scene

class Globe:
    def __init__(self, main_scene):
        sc = bpy.data.scenes.new("globe")
        self.scene = sc
        sc.render.engine = main_scene.render.engine
        sc.render.resolution_x = main_scene.render.resolution_x
        sc.render.resolution_y = main_scene.render.resolution_y
        sc.render.resolution_percentage = 100
        sc.render.image_settings.file_format = "PNG"
        sc.eevee.taa_render_samples = 24
        sc.view_settings.view_transform = "AgX"
        try:
            sc.view_settings.look = "AgX - Punchy"
        except TypeError:
            pass
        sc.world = space_world()
        coll = sc.collection
        self.earth = sphere("earth", R, earth_material(), coll)
        sphere("atmosphere", R * 1.03, atmosphere_material(), coll, 96, 48)
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 4.0
        so = bpy.data.objects.new("sun", sun)
        coll.objects.link(so)
        so.rotation_euler = (Vector((0, 0, 0)) - xyz(110, 20, 1)).to_track_quat("-Z", "Y").to_euler()
        self.sun = so
        rings = load_rings(set(COUNTRIES))
        self.glow = emit_mat("aus_glow", (0.45, 0.85, 1.0), 0.0)
        outline("aus_outline", [r for r in rings["Australia"] if area(r) > 0.6], self.glow, coll)
        self.prisms = {}
        self.mats = {}
        for n, col in COUNTRIES.items():
            m = emit_mat(f"country_{n}", col, 0.12)
            self.mats[n] = m
            self.prisms[n] = prism(f"country_{n}", rings[n], m, coll)
        self.centroid = {n: self._centroid(rings[n]) for n in COUNTRIES}
        cd = bpy.data.cameras.new("gcam")
        cd.lens = 50
        cd.clip_start = 0.05
        cd.clip_end = 1000
        self.cam = bpy.data.objects.new("gcam", cd)
        coll.objects.link(self.cam)
        sc.camera = self.cam

    @staticmethod
    def _centroid(rings):
        r = max(rings, key=area)
        return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))

    def look(self, lon, lat, dist, offset=0.0, lift=0.0):
        """Camera above (lon, lat) at dist from the centre, looking at the Earth;
        offset > 0 slides the globe to the right of the frame."""
        p = xyz(lon, lat, dist)
        fwd = (-p).normalized()
        right = fwd.cross(Vector((0, 0, 1))).normalized()
        up = right.cross(fwd)
        tgt = Vector((0, 0, 0)) - right * offset * R + up * lift * R
        self.cam.location = p
        self.cam.rotation_euler = (tgt - p).to_track_quat("-Z", "Y").to_euler()

    def set_heights(self, heights, glow=0.0):
        for n, o in self.prisms.items():
            h = heights.get(n, 0.0)
            o.data.shape_keys.key_blocks["up"].value = h
            o.hide_render = h <= 0.001
        self.glow.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = glow
        for o in self.scene.objects:
            if o.name == "aus_outline":
                o.hide_render = glow <= 0.01

    def anchor(self, name, h):
        lon, lat = self.centroid[name]
        return xyz(lon, lat, R * 1.003 + h)
