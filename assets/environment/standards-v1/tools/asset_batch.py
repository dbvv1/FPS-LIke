"""Publish this small authored model family after the entire build succeeds.

Directory renames roll back ordinary publication errors. This is not a durable
transaction across power loss or SIGKILL; leftover lock/backup paths fail closed.
"""
from contextlib import contextmanager
from pathlib import Path
import os
import re
import shutil
import tempfile


def require_finished(result, path):
    if result != {'FINISHED'} or not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f'Blender did not finish writing {path.name}')


@contextmanager
def output_batch(root, output, piece_ids):
    root = Path(root).resolve()
    requested = root / output
    # Inspect the lexical path before resolve, including symlinked ancestors.
    if any(p.is_symlink() for p in (requested, *requested.parents)):
        raise ValueError('output cannot contain symlinks')
    target = requested.resolve()
    if target == root or not target.is_relative_to(root):
        raise ValueError('output must be a strict child of the asset directory')
    for source in (root / 'tools', root / 'contract.json', root / 'style.json'):
        if source == target or source.is_relative_to(target):
            raise ValueError('output cannot replace authoring inputs')
    if not target.parent.is_dir():
        raise ValueError('output parent must already exist')
    if target.exists() and not target.is_dir():
        raise ValueError('output must be a directory')
    if not piece_ids or len(set(piece_ids)) != len(piece_ids) or any(
        not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', name)
        for name in piece_ids
    ):
        raise ValueError('piece IDs must be unique simple filenames')

    lock = target.with_name(f'.{target.name}.build-lock')
    backup = target.with_name(f'.{target.name}.build-backup')
    # Never guess whether another writer is alive or discard interrupted output.
    if backup.exists() or backup.is_symlink():
        raise RuntimeError(f'interrupted build backup exists: {backup}; inspect it before retrying')
    try:
        lock.mkdir()
    except FileExistsError as error:
        raise RuntimeError(f'build lock exists: {lock}; another or interrupted build owns this output') from error
    stage = None
    keep_recovery = False
    try:
        if target.exists() and any(p.is_symlink() for p in target.rglob('*')):
            raise ValueError('output contents cannot contain symlinks')
        stage = Path(tempfile.mkdtemp(prefix=f'.{target.name}.build-', dir=target.parent))
        if target.exists():
            shutil.copytree(target, stage, dirs_exist_ok=True)
        generated = [f'{name}.glb' for name in piece_ids] + [
            'fps-three-standards-draft-01.blend', 'manifest.json',
        ]
        # Old generated files must never satisfy a failed or CANCELLED export.
        for name in [*generated, 'offline-array-draft-01.png']:
            path = stage / name
            if path.exists():
                if not path.is_file():
                    raise ValueError(f'generated output is not a regular file: {name}')
                path.unlink()
        yield stage, target
        for name in generated:
            path = stage / name
            if not path.is_file() or path.stat().st_size == 0:
                raise RuntimeError(f'missing generated output: {name}')
        had_target = target.exists()
        if had_target:
            os.replace(target, backup)
        try:
            os.replace(stage, target)
            stage = None
        except BaseException:
            if had_target:
                try:
                    os.replace(backup, target)
                except BaseException as error:
                    keep_recovery = True
                    raise RuntimeError(f'publication and rollback failed; preserve {lock}, {backup} and {stage} for recovery') from error
            raise
        if had_target:
            try:
                shutil.rmtree(backup)
            except OSError as error:
                keep_recovery = True
                raise RuntimeError(f'new batch committed to {target}, but backup cleanup failed; inspect {backup} and {lock}') from error
    finally:
        if not keep_recovery:
            if stage is not None:
                shutil.rmtree(stage)
            lock.rmdir()
