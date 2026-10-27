"""Download the CC0 and OFL assets listed in assets.json into assets/.

Only data is downloaded (glTF, images, HDRI, fonts). Nothing downloaded is
ever executed. Run with any Python 3:  python -I fetch_assets.py
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")
API = "https://api.polyhaven.com"
UA = {"User-Agent": "waranyu-portfolio-video/1.0"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        return r.read()


def save(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print("  ", os.path.relpath(path, OUT))
    data = get(url)
    with open(path, "wb") as f:
        f.write(data)


def polyhaven(item):
    aid, kind, res = item["id"], item["kind"], item["res"]
    files = json.loads(get(f"{API}/files/{aid}"))
    info = json.loads(get(f"{API}/info/{aid}"))
    base = os.path.join(OUT, kind, aid)
    os.makedirs(base, exist_ok=True)
    print(aid)
    if kind == "hdri":
        save(files["hdri"][res]["hdr"]["url"], os.path.join(base, f"{aid}.hdr"))
    elif kind == "texture":
        for key, name in (("Diffuse", "diff"), ("nor_gl", "nor"), ("Rough", "rough")):
            if key in files:
                save(files[key][res]["jpg"]["url"], os.path.join(base, f"{name}.jpg"))
    elif kind == "model":
        g = files["gltf"][res]["gltf"]
        save(g["url"], os.path.join(base, os.path.basename(g["url"])))
        for rel, f in g.get("include", {}).items():
            save(f["url"], os.path.join(base, *rel.split("/")))
    meta = {"id": aid, "name": info.get("name"), "authors": list(info.get("authors", {})),
            "url": f"https://polyhaven.com/a/{aid}", "licence": "CC0 1.0"}
    with open(os.path.join(base, "source.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)


def main():
    manifest = json.load(open(os.path.join(HERE, "assets.json"), encoding="utf-8"))
    for item in manifest["polyhaven"]:
        polyhaven(item)
    for font in manifest["fonts"]:
        save(font["url"], os.path.join(OUT, "fonts", font["file"]))
    print("done")


if __name__ == "__main__":
    sys.exit(main())
