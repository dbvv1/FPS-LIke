"""CPU-only tests for the read-only standards-v1 manifest verifier.

No Blender, GPU, audio, browser or network is used. Every filesystem fixture is
created under a temporary directory. The historical-manifest regression reads
the checked-in files but never writes to them.
"""
from pathlib import Path

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
TOOLS_DIR = Path(__file__).resolve().parent
STANDARDS_DIR = TOOLS_DIR.parent
SCRIPT = TOOLS_DIR / 'verify_manifest.py'
sys.path.insert(0, str(TOOLS_DIR))

import verify_manifest  # noqa: E402


PIECES = ['wall-center-dogleg', 'low-cover-site', 'lamp-existing']
BLEND_NAME = 'fps-three-standards-draft-01.blend'
HISTORICAL_BUILD_HASH = '3219449f7ef19ce644c7cffb97ba9135148ef934a9ba31614b0affdf97ac52b0'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def snapshot(root):
    return {
        path.relative_to(root).as_posix(): digest(path.read_bytes())
        for path in root.rglob('*')
        if path.is_file()
    }


class ManifestFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'standards-v1'
        (self.root / 'tools').mkdir(parents=True)
        (self.root / 'models').mkdir()
        self.files = {
            'tools/build.py': b"#!/usr/bin/env python3\nprint('synthetic build')\n",
            'tools/asset_batch.py': b'"""synthetic publication helper"""\n',
            'contract.json': json.dumps(
                {'schema': 'fps-art-standard-contract/1', 'pieces': [{'id': piece} for piece in PIECES]},
                indent=2,
            ).encode() + b'\n',
            'style.json': json.dumps({'schema': 'fps-art-standard-style/1'}).encode() + b'\n',
            f'models/{BLEND_NAME}': b'BLENDFAKE' + bytes(range(32)),
        }
        for piece in PIECES:
            self.files[f'models/{piece}.glb'] = f'GLB:{piece}:'.encode() + bytes(range(16))
        self.write_files()
        self.write_manifest()

    def write_files(self):
        for relative, data in self.files.items():
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    def default_manifest(self):
        return {
            'schema': 'fps-art-standard-draft/1',
            'status': 'engineering-draft-not-adopted',
            'method': 'synthetic',
            'blenderVersion': '4.3.2',
            'styleRevision': 'draft-01',
            'units': 'meters',
            'exportAxis': 'Y-up, bottom-center pivot',
            'notGameCapture': True,
            'noGameSourceChanged': True,
            'noExternalDownloadsOrServices': True,
            'assets': [
                {
                    'id': piece,
                    'file': f'models/{piece}.glb',
                    'dimensionsXYZ': [1, 1, 1],
                    'sourceStats': {},
                    'glbBytes': len(self.files[f'models/{piece}.glb']),
                    'sha256': digest(self.files[f'models/{piece}.glb']),
                    'textureBytes': 0,
                    'adopted': False,
                }
                for piece in PIECES
            ],
            'blend': {
                'file': f'models/{BLEND_NAME}',
                'bytes': len(self.files[f'models/{BLEND_NAME}']),
                'sha256': digest(self.files[f'models/{BLEND_NAME}']),
                'editableTextBlocks': ['tools/build.py', 'contract.json', 'style.json'],
                'previewScene': 'synthetic offline array, not a game render',
            },
            'inputs': [
                {'file': relative, 'sha256': digest(self.files[relative])}
                for relative in verify_manifest.REQUIRED_INPUTS
            ],
        }

    def write_manifest(self, manifest=None, raw=None):
        path = self.root / 'models/manifest.json'
        if raw is not None:
            path.write_bytes(raw)
        else:
            data = self.default_manifest() if manifest is None else manifest
            path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
        return path

    def verify(self, manifest_argument=None):
        return verify_manifest.verify(self.root, manifest_argument)

    def run_cli(self, arguments, cwd=None):
        env = dict(os.environ)
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            capture_output=True,
            cwd=str(cwd) if cwd is not None else None,
            env=env,
            timeout=60,
        )

    def finding_codes(self, report, check):
        return [finding['code'] for finding in report[check]['findings']]

    def finding(self, report, check, code, path=None):
        for item in report[check]['findings']:
            if item['code'] == code and (path is None or item.get('path') == path):
                return item
        self.fail(f'missing finding {code} in {check}: {report[check]["findings"]}')


class PassingAndStaleTests(ManifestFixture):
    def test_complete_current_fixture_passes(self):
        report, code = self.verify()
        self.assertEqual(code, 0)
        self.assertEqual(report['status'], 'passed')
        self.assertTrue(report['overall'])
        self.assertTrue(report['artifactIntegrity']['passed'])
        self.assertTrue(report['sourceCurrency']['passed'])
        self.assertEqual(report['artifactIntegrity']['findings'], [])
        self.assertEqual(report['sourceCurrency']['findings'], [])
        self.assertEqual(report['manifest'], 'models/manifest.json')

    def test_missing_helper_is_reported_while_artifacts_remain_intact(self):
        manifest = self.default_manifest()
        manifest['inputs'] = [
            entry for entry in manifest['inputs']
            if entry['file'] != 'tools/asset_batch.py'
        ]
        self.write_manifest(manifest)
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertTrue(report['artifactIntegrity']['passed'])
        self.assertFalse(report['sourceCurrency']['passed'])
        self.assertFalse(report['overall'])
        self.finding(report, 'sourceCurrency', 'missing-input', 'tools/asset_batch.py')

    def test_stale_source_hash_does_not_imply_corrupt_artifacts(self):
        self.write_manifest()
        path = self.root / 'tools/build.py'
        path.write_bytes(path.read_bytes() + b'# changed after the recorded build\n')
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertTrue(report['artifactIntegrity']['passed'])
        self.assertFalse(report['sourceCurrency']['passed'])
        item = self.finding(report, 'sourceCurrency', 'input-hash-mismatch', 'tools/build.py')
        self.assertEqual(item['expected'], digest(self.files['tools/build.py']))
        self.assertEqual(item['actual'], digest(path.read_bytes()))
        self.assertNotEqual(item['expected'], item['actual'])

    def test_extra_and_duplicate_inputs_are_precisely_reported(self):
        manifest = self.default_manifest()
        manifest['inputs'] = [
            entry for entry in manifest['inputs']
            if entry['file'] != 'tools/build.py'
        ]
        manifest['inputs'].append({'file': 'contract.json', 'sha256': digest(self.files['contract.json'])})
        manifest['inputs'].append({'file': 'tools/extra.py', 'sha256': digest(b'not read')})
        self.write_manifest(manifest)
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertTrue(report['artifactIntegrity']['passed'])
        self.finding(report, 'sourceCurrency', 'missing-input', 'tools/build.py')
        self.finding(report, 'sourceCurrency', 'duplicate-input', 'contract.json')
        self.finding(report, 'sourceCurrency', 'unexpected-input', 'tools/extra.py')


class ArtifactIntegrityTests(ManifestFixture):
    def test_output_byte_size_change_is_reported(self):
        self.write_manifest()
        glb = self.root / f'models/{PIECES[0]}.glb'
        glb.write_bytes(glb.read_bytes() + b'extra')
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertFalse(report['artifactIntegrity']['passed'])
        self.assertTrue(report['sourceCurrency']['passed'])
        self.finding(report, 'artifactIntegrity', 'asset-bytes-mismatch', f'models/{PIECES[0]}.glb')
        self.finding(report, 'artifactIntegrity', 'asset-hash-mismatch', f'models/{PIECES[0]}.glb')

    def test_same_size_output_byte_change_is_a_hash_mismatch(self):
        self.write_manifest()
        glb = self.root / f'models/{PIECES[0]}.glb'
        data = glb.read_bytes()
        glb.write_bytes(data[:-1] + bytes([data[-1] ^ 0xFF]))
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertFalse(report['artifactIntegrity']['passed'])
        codes = self.finding_codes(report, 'artifactIntegrity')
        self.assertIn('asset-hash-mismatch', codes)
        self.assertNotIn('asset-bytes-mismatch', codes)

    def test_missing_output_file_is_reported(self):
        self.write_manifest()
        (self.root / f'models/{PIECES[1]}.glb').unlink()
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertFalse(report['artifactIntegrity']['passed'])
        self.finding(report, 'artifactIntegrity', 'asset-missing-file', f'models/{PIECES[1]}.glb')

    def test_blend_bytes_and_hash_are_checked_without_parsing(self):
        self.write_manifest()
        blend = self.root / f'models/{BLEND_NAME}'
        blend.write_bytes(blend.read_bytes() + b'tampered')
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertFalse(report['artifactIntegrity']['passed'])
        self.finding(report, 'artifactIntegrity', 'blend-bytes-mismatch', f'models/{BLEND_NAME}')
        self.finding(report, 'artifactIntegrity', 'blend-hash-mismatch', f'models/{BLEND_NAME}')

    def test_duplicate_asset_id_and_path_are_reported(self):
        manifest = self.default_manifest()
        manifest['assets'].append(dict(manifest['assets'][0]))
        self.write_manifest(manifest)
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertFalse(report['artifactIntegrity']['passed'])
        self.finding(report, 'artifactIntegrity', 'duplicate-asset-id', f'models/{PIECES[0]}.glb')
        self.finding(report, 'artifactIntegrity', 'duplicate-asset-path', f'models/{PIECES[0]}.glb')

    def test_asset_file_mapping_must_match_contract_id(self):
        manifest = self.default_manifest()
        manifest['assets'][0]['file'] = f'models/{PIECES[1]}.glb'
        self.write_manifest(manifest)
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertFalse(report['artifactIntegrity']['passed'])
        item = self.finding(report, 'artifactIntegrity', 'asset-file-mapping', f'models/{PIECES[0]}.glb')
        self.assertEqual(item['expected'], f'models/{PIECES[0]}.glb')
        self.assertEqual(item['actual'], f'models/{PIECES[1]}.glb')

    def test_unexpected_asset_id_is_reported(self):
        manifest = self.default_manifest()
        manifest['assets'].append({
            'id': 'gloves-not-in-contract',
            'file': 'models/gloves-not-in-contract.glb',
            'glbBytes': 0,
            'sha256': digest(b''),
        })
        self.write_manifest(manifest)
        report, code = self.verify()
        self.assertEqual(code, 1)
        self.assertFalse(report['artifactIntegrity']['passed'])
        self.finding(report, 'artifactIntegrity', 'unexpected-asset', 'models/gloves-not-in-contract.glb')


class StructureAndSafetyTests(ManifestFixture):
    def test_unsupported_schema_and_fields_are_rejected_not_ignored(self):
        cases = []
        manifest = self.default_manifest()
        manifest['schema'] = 'fps-art-standard-draft/2'
        cases.append(('unsupported-schema', manifest))
        manifest = self.default_manifest()
        manifest['futureField'] = True
        cases.append(('unsupported-field', manifest))
        manifest = self.default_manifest()
        manifest['assets'][0]['futureField'] = True
        cases.append(('unsupported-field', manifest))
        for expected_code, manifest in cases:
            with self.subTest(code=expected_code):
                self.write_manifest(manifest)
                report, exit_code = self.verify()
                self.assertEqual(exit_code, 2)
                self.assertEqual(report['status'], 'error')
                self.assertEqual(report['error']['code'], expected_code)

    def test_invalid_hash_json_and_missing_fields_exit_2(self):
        cases = []
        manifest = self.default_manifest()
        manifest['inputs'][0]['sha256'] = 'abc123'
        cases.append(('invalid-hash', manifest, None))
        manifest = self.default_manifest()
        del manifest['blend']
        cases.append(('missing-field', manifest, None))
        cases.append(('invalid-json', None, b'{not json'))
        cases.append(('invalid-structure', None, b'[]'))
        for expected_code, manifest, raw in cases:
            with self.subTest(code=expected_code):
                self.write_manifest(manifest, raw=raw)
                report, exit_code = self.verify()
                self.assertEqual(exit_code, 2)
                self.assertEqual(report['error']['code'], expected_code)

    def test_unsafe_manifest_paths_are_rejected_before_reading(self):
        unsafe_inputs = [
            '../escape.txt',
            '../../outside/manifest.json',
            '/etc/passwd',
            'C:\\Windows\\win.ini',
            'https://example.invalid/model.glb',
            'models\\manifest.json',
            '~/secret',
        ]
        for unsafe in unsafe_inputs:
            with self.subTest(path=unsafe):
                manifest = self.default_manifest()
                manifest['inputs'][0]['file'] = unsafe
                self.write_manifest(manifest)
                report, exit_code = self.verify()
                self.assertEqual(exit_code, 2)
                self.assertIn(report['error']['code'], {'invalid-path', 'path-escape'})
                self.assertNotIn(str(self.root), json.dumps(report))

        for unsafe in ['/absolute/model.glb', '../model.glb', 'https://example.invalid/model.glb']:
            with self.subTest(asset_path=unsafe):
                manifest = self.default_manifest()
                manifest['assets'][0]['file'] = unsafe
                self.write_manifest(manifest)
                report, exit_code = self.verify()
                self.assertEqual(exit_code, 2)
                self.assertIn(report['error']['code'], {'invalid-path', 'path-escape'})

    def test_surrogate_strings_exit_2_with_parseable_json(self):
        def set_asset_file(manifest):
            manifest['assets'][0]['file'] = 'models/\ud800.glb'

        def set_asset_id(manifest):
            manifest['assets'][0]['id'] = 'asset\ud800id'

        def set_blend_file(manifest):
            manifest['blend']['file'] = 'models/\ud800.blend'

        def set_input_file(manifest):
            manifest['inputs'][0]['file'] = 'tools/\ud800.py'

        def set_unknown_key(manifest):
            manifest['future\ud800field'] = True

        cases = [
            ('asset-file', 'invalid-path', set_asset_file),
            ('asset-id', 'invalid-path', set_asset_id),
            ('blend-file', 'invalid-path', set_blend_file),
            ('input-file', 'invalid-path', set_input_file),
            ('unknown-field-name', 'unsupported-field', set_unknown_key),
        ]
        for name, expected_code, mutate in cases:
            with self.subTest(case=name):
                manifest = self.default_manifest()
                mutate(manifest)
                self.write_manifest(manifest)
                result = self.run_cli([
                    '--root', str(self.root),
                    '--manifest', 'models/manifest.json',
                    '--json',
                ])
                self.assertEqual(result.returncode, 2)
                self.assertNotEqual(result.stdout, b'')
                self.assertNotIn(b'Traceback', result.stderr)
                self.assertNotIn(str(self.root).encode(), result.stderr)
                self.assertNotIn(str(self.root).encode(), result.stdout)
                self.assertEqual(result.stdout.count(b'\n'), 1)
                self.assertNotIn(b'\r', result.stdout)
                report = json.loads(result.stdout.decode('utf-8'))
                self.assertEqual(report['status'], 'error')
                self.assertEqual(report['error']['code'], expected_code)

    def test_deeply_nested_and_oversized_numeric_json_exit_2_without_traceback(self):
        raw_cases = {
            # About 5000 nested arrays exceed CPython's JSON decoder recursion
            # limit and used to escape as a RecursionError traceback.
            'deep-nesting': b'[' * 5000 + b']' * 5000,
        }
        # CPython 3.11+ rejects integer literals longer than 4300 digits while
        # decoding. Skip when the per-interpreter limit is absent or disabled.
        if getattr(sys, 'get_int_max_str_digits', lambda: 0)():
            manifest = self.default_manifest()
            manifest['assets'][0]['glbBytes'] = 0
            text = json.dumps(manifest, indent=2)
            needle = '"glbBytes": 0'
            self.assertIn(needle, text)
            # Build the 5000-digit literal as text: str(huge_int) would itself
            # hit the digit limit on the test interpreter.
            raw_cases['oversized-integer'] = (
                text.replace(needle, '"glbBytes": ' + '1' * 5000, 1).encode('utf-8') + b'\n'
            )

        for name, raw in raw_cases.items():
            with self.subTest(case=name):
                self.write_manifest(raw=raw)
                result = self.run_cli([
                    '--root', str(self.root),
                    '--manifest', 'models/manifest.json',
                    '--json',
                ])
                self.assertEqual(result.returncode, 2)
                self.assertNotEqual(result.stdout, b'')
                self.assertEqual(result.stdout.count(b'\n'), 1)
                self.assertNotIn(b'\r', result.stdout)
                self.assertNotIn(b'Traceback', result.stderr)
                self.assertNotIn(str(self.root).encode(), result.stderr)
                self.assertNotIn(str(self.root).encode(), result.stdout)
                report = json.loads(result.stdout.decode('utf-8'))
                self.assertEqual(report['status'], 'error')
                self.assertEqual(report['error']['code'], 'invalid-json')

    def test_unexpected_internal_failure_becomes_an_error_report(self):
        secret = str(self.root)
        with mock.patch.object(
            verify_manifest,
            '_check_sources',
            side_effect=RuntimeError(f'unexpected failure under {secret}'),
        ):
            report, exit_code = self.verify()
        self.assertEqual(exit_code, 2)
        self.assertEqual(report['status'], 'error')
        self.assertEqual(report['error']['code'], 'unexpected-error')
        self.assertNotIn(secret, json.dumps(report))

    def test_manifest_outside_root_is_rejected(self):
        outside = Path(self.temp.name) / 'outside-manifest.json'
        outside.write_text(json.dumps(self.default_manifest()), encoding='utf-8')
        for argument in [str(outside), '../outside-manifest.json']:
            with self.subTest(argument=argument):
                report, exit_code = self.verify(argument)
                self.assertEqual(exit_code, 2)
                self.assertIn(report['error']['code'], {'manifest-outside-root', 'path-escape'})
                self.assertNotIn(str(self.root), json.dumps(report))
                self.assertNotIn(str(outside), json.dumps(report))

    def test_symlink_escape_is_rejected(self):
        outside = Path(self.temp.name) / 'outside.glb'
        outside.write_bytes(b'outside bytes')
        link = self.root / f'models/{PIECES[0]}.glb'
        link.unlink()
        try:
            link.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest('symlink creation is not permitted in this environment')
        report, exit_code = self.verify()
        self.assertEqual(exit_code, 2)
        self.assertEqual(report['error']['code'], 'path-escape')

    def test_unsafe_contract_piece_ids_are_rejected(self):
        for piece in ['../escape', '/absolute', 'nested/name', '..']:
            with self.subTest(piece=piece):
                contract = {'schema': 'fps-art-standard-contract/1', 'pieces': [{'id': piece}]}
                (self.root / 'contract.json').write_text(json.dumps(contract), encoding='utf-8')
                report, exit_code = self.verify()
                self.assertEqual(exit_code, 2)
                self.assertEqual(report['error']['code'], 'invalid-contract')

    def test_missing_and_invalid_cli_exit_2_with_json(self):
        cases = [
            ['--bogus'],
            ['--root'],
            ['--manifest'],
        ]
        for arguments in cases:
            with self.subTest(arguments=arguments):
                result = self.run_cli(arguments)
                self.assertEqual(result.returncode, 2)
                report = json.loads(result.stdout.decode('utf-8'))
                self.assertEqual(report['error']['code'], 'invalid-cli')
                self.assertNotIn(str(self.root).encode(), result.stdout)

    def test_missing_manifest_file_exits_2(self):
        (self.root / 'models/manifest.json').unlink()
        report, exit_code = self.verify()
        self.assertEqual(exit_code, 2)
        self.assertEqual(report['error']['code'], 'unreadable-manifest')


class ReadOnlyAndCliTests(ManifestFixture):
    def test_verification_never_modifies_inputs(self):
        self.write_manifest()
        (self.root / 'tools/build.py').write_bytes(b'changed before the read-only check\n')
        before = snapshot(self.root)
        self.verify()
        self.assertEqual(snapshot(self.root), before)

    def test_cli_json_is_one_utf8_lf_document_without_absolute_paths(self):
        result = self.run_cli(['--root', str(self.root), '--manifest', 'models/manifest.json', '--json'])
        self.assertEqual(result.returncode, 0)
        self.assertTrue(result.stdout.endswith(b'\n'))
        self.assertEqual(result.stdout.count(b'\n'), 1)
        self.assertNotIn(b'\r', result.stdout)
        report = json.loads(result.stdout.decode('utf-8'))
        self.assertTrue(report['overall'])
        self.assertNotIn(str(self.root).encode(), result.stdout)
        self.assertNotIn(str(self.root).encode(), result.stderr)

    def test_cli_accepts_manifest_path_inside_root(self):
        result = self.run_cli([
            '--root', str(self.root),
            '--manifest', 'standards-v1/models/manifest.json',
            '--json',
        ], cwd=Path(self.temp.name))
        self.assertEqual(result.returncode, 0)
        self.assertTrue(json.loads(result.stdout.decode('utf-8'))['overall'])
        result = self.run_cli([
            '--root', str(self.root),
            '--manifest', str(self.root / 'models/manifest.json'),
            '--json',
        ])
        self.assertEqual(result.returncode, 0)

    def test_cli_defaults_to_author_directory_and_reports_historical_stale_manifest(self):
        # No --root/--manifest: the script uses its own standards-v1 directory.
        result = self.run_cli(['--json'], cwd=Path(self.temp.name))
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(b'\r', result.stdout)
        report = json.loads(result.stdout.decode('utf-8'))
        self.assertEqual(report['manifest'], 'models/manifest.json')
        self.assertTrue(report['artifactIntegrity']['passed'])
        self.assertFalse(report['sourceCurrency']['passed'])
        self.assertNotIn(str(STANDARDS_DIR).encode(), result.stdout)


class HistoricalManifestRegressionTests(unittest.TestCase):
    """Read-only regression against the real checked-in historical manifest."""

    def test_historical_manifest_is_stale_but_output_bytes_are_intact(self):
        manifest_path = STANDARDS_DIR / 'models/manifest.json'
        before = snapshot(STANDARDS_DIR)
        report, exit_code = verify_manifest.verify(STANDARDS_DIR, None)
        self.addCleanup(self.assert_unchanged, before)
        self.assertEqual(exit_code, 1)
        self.assertEqual(report['status'], 'mismatch')
        self.assertTrue(report['artifactIntegrity']['passed'])
        self.assertFalse(report['sourceCurrency']['passed'])
        self.assertFalse(report['overall'])
        self.assertEqual(report['manifest'], 'models/manifest.json')
        self.assertNotIn(str(STANDARDS_DIR), json.dumps(report))
        self.assertNotIn(str(STANDARDS_DIR), json.dumps(report, ensure_ascii=False))

        findings = report['sourceCurrency']['findings']
        missing_helper = [
            item for item in findings
            if item['code'] == 'missing-input' and item.get('path') == 'tools/asset_batch.py'
        ]
        self.assertEqual(len(missing_helper), 1)
        build_mismatch = [
            item for item in findings
            if item['code'] == 'input-hash-mismatch' and item.get('path') == 'tools/build.py'
        ]
        self.assertEqual(len(build_mismatch), 1)
        self.assertEqual(build_mismatch[0]['expected'], HISTORICAL_BUILD_HASH)
        self.assertEqual(build_mismatch[0]['actual'], digest((STANDARDS_DIR / 'tools/build.py').read_bytes()))

    def assert_unchanged(self, before):
        self.assertEqual(snapshot(STANDARDS_DIR), before)


if __name__ == '__main__':
    unittest.main()
