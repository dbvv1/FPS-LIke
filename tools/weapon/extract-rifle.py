#!/usr/bin/env python3
"""Extract one CC0 source rifle into the existing two-backend vertex contract.

No runtime loader, bone engine or simulated weapon data is introduced. The
source OBJ/MTL remain editable; this deterministic export separates its
already-disconnected magazine and preserves the original face topology.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/weapons/quaternius/AssaultRifle2_1.obj"
EXPECTED = "bddb03e49ea71517865028b1f06cdc8b1c6ffbc854b15369db66599f973a4d2f"
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED, "Review changed source topology before exporting"
vertices, faces, parent = [], [], []
material = ""


def root(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


for line in SOURCE.read_text().splitlines():
    fields = line.split()
    if not fields:
        continue
    if fields[0] == "v":
        parent.append(len(vertices))
        vertices.append(tuple(map(float, fields[1:4])))
    elif fields[0] == "usemtl":
        material = fields[1]
    elif fields[0] == "f":
        ids = [int(value.split("/")[0]) - 1 for value in fields[1:]]
        faces.append((ids, material))
        for i in ids:
            parent[root(i)] = root(ids[0])

components = {}
for i in range(len(vertices)):
    components.setdefault(root(i), []).append(i)
# Stable, inspectable labels from source topology, not a proximity guess at runtime.
components = sorted(components.values(), key=min)
component_for = {i: number for number, ids in enumerate(components) for i in ids}
assert len(components) == 18
assert len(components[4]) == 64 and min(components[4]) == 202  # curved detachable magazine


def local(v):
    x, y, z = v
    # Source +X points down barrel, +Y up. Camera-local forward is -Z.
    return [round(z * .16, 6), round(y * .16 - .10, 6), round(-x * .16 - .20, 6)]


points = [local(v) for v in vertices]
groups = {}
for ids, color in faces:
    groups.setdefault((component_for[ids[0]], color), []).append(ids)
palette = {"Main": 0x34444A, "MainDark": 0x202C32, "MainLight": 0x596A70}
parts = []
for (component, color), polygons in groups.items():
    ids = sorted({i for face in polygons for i in face})
    bounds = [[min(points[i][a] for i in components[component]), max(points[i][a] for i in components[component])] for a in range(3)]
    pivot = [round((a + b) / 2, 6) for a, b in bounds]
    remap = {old: new for new, old in enumerate(ids)}
    part = {"id": f"rifle-{component}-{color}", "position": pivot,
            "size": [round(b - a, 6) for a, b in bounds], "color": palette[color],
            "mesh": {"vertices": [[round(points[i][a] - pivot[a], 6) for a in range(3)] for i in ids],
                     "faces": [[remap[i] for i in face] for face in polygons]}}
    if component == 4:
        part["role"] = "magazine"
    parts.append(part)

output = ROOT / "assets/weapons/rx24-rifle.json"
front = max(v[0] for v in vertices)
cap = [v for v in vertices if abs(v[0] - front) < .00001]
muzzle = local([sum(v[a] for v in cap) / len(cap) for a in range(3)])
# Lower left side of the actual detachable magazine, not its bounding center.
# This authored face is stable under the checked source hash/topology above.
magazine = next(p for p in parts if p["id"] == "rifle-4-Main")
grip_face = [34, 38, 27, 13]
assert grip_face in magazine["mesh"]["faces"]
grip_surface = [round(sum(magazine["mesh"]["vertices"][i][a] + magazine["position"][a] for i in grip_face) / len(grip_face), 6) for a in range(3)]
grip = {"partId": magazine["id"], "face": grip_face, "surface": grip_surface, "palmOffset": [-.025, 0, 0]}
output.write_text(json.dumps({"sourceSha256": EXPECTED, "muzzle": muzzle, "grip": grip, "parts": parts}, separators=(",", ":")) + "\n")
print(json.dumps({"sourceVertices": len(vertices), "faces": len(faces), "parts": len(parts), "bytes": output.stat().st_size}))
