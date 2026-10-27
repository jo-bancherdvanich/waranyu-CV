"""Unpack the MakeHuman data the film needs from the downloaded zips.

Only data files are extracted (meshes, targets, rig and weights JSON,
textures, proxy and material files). Python files inside the archives are
skipped; nothing from them is run.
"""
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ZIPS = os.path.join(HERE, "assets", "zips")
KEEP = ("data/3dobjs/", "data/rigs/standard/rig.default", "data/rigs/standard/weights.default",
        "data/targets/macrodetails/")


def main():
    z = zipfile.ZipFile(os.path.join(ZIPS, "mpfb.zip"))
    for n in z.namelist():
        if n.startswith(KEEP) and not n.endswith((".py", "/")):
            z.extract(n, os.path.join(HERE, "assets", "mh_base"))
    for name in os.listdir(ZIPS):
        if name.endswith("_cc0.zip"):
            z = zipfile.ZipFile(os.path.join(ZIPS, name))
            for n in z.namelist():
                if not n.endswith((".py", "/")):
                    z.extract(n, os.path.join(HERE, "assets", "mh_assets"))
    print("unpacked")


if __name__ == "__main__":
    sys.exit(main())
