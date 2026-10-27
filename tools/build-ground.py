"""One licensed 2m concrete colour map; no height, normal or collision synthesis."""
from pathlib import Path
from PIL import Image
import base64, hashlib, json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/materials/courtyard-concrete'
SOURCE = OUT / 'source/concrete_floor_01_diff_1k.jpg'
EXPECTED = 'db7c800f1464359b5f359fc743e82ac51b34e014fdfd53844f4af34bb1949229'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
image = Image.open(SOURCE).convert('RGB').resize((256, 256), Image.Resampling.LANCZOS)
pixels = list(image.get_flattened_data())
means = [sum(p[c] for p in pixels) / len(pixels) for c in range(3)]
# Preserve the current yard palette and reduce photographic aggregate contrast;
# this is an editable material treatment, not a claim to retain source albedo.
base = (0x78, 0x89, 0x82)
colours = [tuple(max(0, min(255, round(base[c] + .55 * (p[c] - means[c])))) for c in range(3)) for p in pixels]
image.putdata(colours)
levels = []
for size in (256, 128, 64, 32, 16, 8, 4, 2, 1):
    mip = image.resize((size, size), Image.Resampling.BOX).convert('RGBA')
    levels.append({'size': size, 'rgba': base64.b64encode(mip.tobytes()).decode('ascii')})
(OUT / 'ground.json').write_text(json.dumps({'tileMetres': 2, 'levels': levels}, separators=(',', ':'))+'\n')
image.save(OUT / 'preview.png')
print('Wrote shared colour mip chain; source SHA-256 verified')
