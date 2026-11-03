"""Real Blender export/rollback checks in a disposable copy; never render or use GPU.

Run with Python 3.11+ and Blender 4.3.2 on PATH. A missing Blender fails, not skips.
"""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import unittest


class BlenderBuildTests(unittest.TestCase):
    def test_rebuild_second_edit_failure_and_restore(self):
        blender = shutil.which('blender')
        self.assertIsNotNone(blender, 'Blender is required for this integration check')
        source = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix='fps-standards-test-') as temporary:
            root = Path(temporary) / 'standards'
            shutil.copytree(source, root, ignore=shutil.ignore_patterns('__pycache__'))
            command = [blender, '--background', '--factory-startup', '--disable-autoexec',
                       '--python-exit-code', '1', '--python', str(root / 'tools/build.py')]

            def run(expected=0):
                result = subprocess.run(command, capture_output=True, text=True, timeout=120)
                self.assertEqual(result.returncode, expected, (result.stdout + result.stderr)[-4000:])

            def snapshot():
                return {p.relative_to(root / 'models').as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in (root / 'models').rglob('*') if p.is_file()}

            glbs = ['wall-center-dogleg.glb', 'low-cover-site.glb', 'lamp-existing.glb']
            baseline = snapshot()
            for _ in range(2):
                run()
                for name in glbs:
                    self.assertEqual(snapshot()[name], baseline[name], name)
                manifest = json.loads((root / 'models/manifest.json').read_text())
                for item in [*manifest['assets'], manifest['blend']]:
                    self.assertTrue(item['file'].startswith('models/'))
                    self.assertEqual(hashlib.sha256((root / item['file']).read_bytes()).hexdigest(), item['sha256'])

            (root / 'models/keep.txt').write_text('keep unknown files')
            before = snapshot()
            style_path = root / 'style.json'
            original_style = style_path.read_text()
            style = json.loads(original_style)
            style['palette']['plaster'] = '#c1d2e3'
            style['revision'] = 'test-second-edit'
            style_path.write_text(json.dumps(style))
            script = root / 'tools/build.py'
            original_script = script.read_text()
            # Fault only the disposable source: first GLB is really exported,
            # then the second export raises. This is not a simulated GLB writer.
            faulted, count = re.subn(
                r"(?m)^(\s*)name=piece\['id'\]; objs=assets\[name\]; stats=mesh_stats\(objs\)$",
                lambda match: match[0] + '\n' + match[1] +
                "if name == 'low-cover-site': raise RuntimeError('injected second export failure')",
                original_script,
            )
            self.assertEqual(count, 1, 'update the fault seam when the builder changes')
            script.write_text(faulted)
            run(1)
            self.assertEqual(snapshot(), before)
            self.assertFalse(list(root.glob('.models.build-*')))

            script.write_text(original_script)
            run()
            edited = snapshot()
            self.assertNotEqual(edited[glbs[0]], baseline[glbs[0]])
            self.assertNotEqual(edited[glbs[1]], baseline[glbs[1]])
            self.assertEqual(edited[glbs[2]], baseline[glbs[2]])
            self.assertEqual((root / 'models/keep.txt').read_text(), 'keep unknown files')
            style_path.unlink()
            run(1)
            self.assertEqual(snapshot(), edited)
            style_path.write_text(original_style)
            run()
            for name in glbs:
                self.assertEqual(snapshot()[name], baseline[name])


if __name__ == '__main__':
    unittest.main()
