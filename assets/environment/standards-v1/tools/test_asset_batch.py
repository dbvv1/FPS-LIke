"""CPU-only regression checks; no Blender, browser or render context required."""
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch

from asset_batch import output_batch, require_finished


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'tools').mkdir()
        self.target = self.root / 'models'
        self.target.mkdir()
        self.names = ['wall.glb', 'cover.glb', 'fps-three-standards-draft-01.blend', 'manifest.json']
        for name in self.names:
            (self.target / name).write_bytes(b'old:' + name.encode())
        (self.target / 'notes').mkdir()
        (self.target / 'notes/keep.txt').write_text('keep this')
        self.before = self.snapshot(self.target)

    @staticmethod
    def snapshot(path):
        return {p.relative_to(path).as_posix(): p.read_bytes() for p in path.rglob('*') if p.is_file()}

    def write(self, stage):
        for name in self.names:
            (stage / name).write_bytes(b'new:' + name.encode())

    def batch(self, target='models'):
        return output_batch(self.root, target, ['wall', 'cover'])

    def assert_clean(self):
        self.assertFalse(list(self.root.glob('.models.build-*')))

    def test_success_preserves_unknown_files_and_supports_second_build(self):
        for _ in range(2):
            with self.batch() as (stage, final):
                self.assertEqual(final, self.target)
                self.assertFalse((stage / 'wall.glb').exists())
                self.write(stage)
            self.assertEqual((self.target / 'cover.glb').read_bytes(), b'new:cover.glb')
            self.assertEqual((self.target / 'notes/keep.txt').read_text(), 'keep this')
            self.assert_clean()

    def test_second_export_blend_or_manifest_failure_preserves_entire_old_batch(self):
        for fail_after in range(1, len(self.names) + 1):
            with self.assertRaisesRegex(RuntimeError, 'injected'):
                with self.batch() as (stage, _):
                    for name in self.names[:fail_after]:
                        (stage / name).write_bytes(b'new')
                    raise RuntimeError('injected writer failure')
            self.assertEqual(self.snapshot(self.target), self.before)
            self.assert_clean()

    def test_missing_or_empty_output_cannot_reuse_old_generated_files(self):
        for empty in [False, True]:
            with self.assertRaisesRegex(RuntimeError, 'missing generated output'):
                with self.batch() as (stage, _):
                    self.write(stage)
                    (stage / 'cover.glb').unlink()
                    if empty:
                        (stage / 'cover.glb').touch()
            self.assertEqual(self.snapshot(self.target), self.before)
            self.assert_clean()

    def test_first_build_failure_leaves_no_final_directory(self):
        with self.assertRaisesRegex(RuntimeError, 'injected'):
            with self.batch('fresh') as (stage, _):
                (stage / 'wall.glb').write_bytes(b'new')
                raise RuntimeError('injected')
        self.assertFalse((self.root / 'fresh').exists())
        self.assertFalse(list(self.root.glob('.fresh.build-*')))

    def test_failed_publication_restores_old_directory(self):
        real = os.replace
        calls = []
        def fail_second(source, target):
            calls.append((source, target))
            if len(calls) == 2:
                raise OSError('injected rename')
            return real(source, target)
        with patch('asset_batch.os.replace', side_effect=fail_second):
            with self.assertRaisesRegex(OSError, 'injected rename'):
                with self.batch() as (stage, _):
                    self.write(stage)
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.snapshot(self.target), self.before)
        self.assert_clean()

    def test_failed_rollback_preserves_recovery_and_blocks_retry(self):
        real = os.replace
        calls = 0
        def fail_after_backup(source, target):
            nonlocal calls
            calls += 1
            if calls >= 2:
                raise OSError('injected rename')
            return real(source, target)
        with patch('asset_batch.os.replace', side_effect=fail_after_backup):
            with self.assertRaisesRegex(RuntimeError, 'rollback failed'):
                with self.batch() as (stage, _):
                    self.write(stage)
        self.assertEqual(self.snapshot(self.root / '.models.build-backup'), self.before)
        self.assertTrue((self.root / '.models.build-lock').is_dir())
        self.assertTrue(stage.is_dir())
        with self.assertRaisesRegex(RuntimeError, 'backup exists'):
            with self.batch():
                self.fail('must not enter an interrupted batch')

    def test_concurrent_and_interrupted_lock_rejected_without_touching_owner(self):
        with self.batch() as (stage, _):
            with self.assertRaisesRegex(RuntimeError, 'build lock exists'):
                with self.batch():
                    self.fail('concurrent writer entered')
            self.assertTrue((self.root / '.models.build-lock').is_dir())
            self.write(stage)
        (self.root / '.models.build-lock').mkdir()
        with self.assertRaisesRegex(RuntimeError, 'build lock exists'):
            with self.batch():
                self.fail('interrupted writer entered')

    def test_cleanup_failure_reports_committed_batch_and_retains_lock(self):
        import shutil
        real = shutil.rmtree
        def fail_backup(path, *args, **kwargs):
            if Path(path).name == '.models.build-backup':
                raise OSError('injected backup cleanup')
            return real(path, *args, **kwargs)
        with patch('asset_batch.shutil.rmtree', side_effect=fail_backup):
            with self.assertRaisesRegex(RuntimeError, 'new batch committed.*cleanup failed'):
                with self.batch() as (stage, _):
                    self.write(stage)
        self.assertEqual((self.target / 'wall.glb').read_bytes(), b'new:wall.glb')
        self.assertEqual(self.snapshot(self.root / '.models.build-backup'), self.before)
        self.assertTrue((self.root / '.models.build-lock').is_dir())

    def test_dangerous_targets_rejected_before_mutation(self):
        (self.root / 'file').write_text('not a directory')
        for target in ['.', 'models/..', '..', 'tools', 'file', 'missing/child']:
            with self.subTest(target=target), self.assertRaises(ValueError):
                with self.batch(target):
                    self.fail('unsafe target entered')
        self.assertEqual(self.snapshot(self.target), self.before)
        self.assert_clean()

    def test_symlink_target_ancestor_and_output_content_rejected(self):
        (self.root / 'link').symlink_to(self.target, target_is_directory=True)
        for target in ['link', 'link/child']:
            with self.assertRaisesRegex(ValueError, 'symlink'):
                with self.batch(target):
                    self.fail('symlink entered')
        (self.target / 'unknown-link').symlink_to(self.root / 'tools')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            with self.batch():
                self.fail('content symlink copied')
        self.assert_clean()

    def test_unsafe_piece_ids_and_existing_nonfile_output_rejected(self):
        for names in [[], ['same', 'same'], ['../escape'], ['/absolute']]:
            with self.assertRaises(ValueError):
                with output_batch(self.root, 'models', names):
                    self.fail('invalid names entered')
        (self.target / 'wall.glb').unlink()
        (self.target / 'wall.glb').mkdir()
        with self.assertRaisesRegex(ValueError, 'not a regular file'):
            with self.batch():
                self.fail('directory treated as a generated file')
        self.assert_clean()

    def test_cancelled_missing_and_empty_blender_results_rejected(self):
        path = self.root / 'export.glb'
        with self.assertRaises(RuntimeError):
            require_finished({'FINISHED'}, path)
        path.touch()
        with self.assertRaises(RuntimeError):
            require_finished({'FINISHED'}, path)
        path.write_bytes(b'valid')
        with self.assertRaises(RuntimeError):
            require_finished({'CANCELLED'}, path)
        require_finished({'FINISHED'}, path)


if __name__ == '__main__':
    unittest.main()
