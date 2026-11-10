#!/usr/bin/env python3
"""Read-only consistency check for the standards-v1 model manifest.

The tool answers two separate questions:

* ``artifactIntegrity`` -- do the shipped ``models/*.glb`` and ``.blend`` bytes
  still match the sizes and SHA-256 values recorded in the manifest?
* ``sourceCurrency`` -- do the manifest's recorded authoring-input hashes match
  the current ``build.py``, ``asset_batch.py``, ``contract.json`` and
  ``style.json`` bytes?

A stale source record does not mean the shipped artifacts are corrupt, and a
matching record does not prove that the historical authoring tools ran. This
tool never builds assets, never parses ``.blend`` or GLB internals and never
writes to the checked files.

Run:
    python tools/verify_manifest.py --json
    python tools/verify_manifest.py --root <standards-v1> \
        --manifest models/manifest.json --json

Exit codes: 0 both checks pass, 1 mismatch/stale, 2 invalid CLI or structure.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath

SUPPORTED_MANIFEST_SCHEMA = 'fps-art-standard-draft/1'
REPORT_SCHEMA = 'fps-artifact-verification/1'

REQUIRED_INPUTS = (
    'tools/build.py',
    'tools/asset_batch.py',
    'contract.json',
    'style.json',
)

MANIFEST_FIELDS = frozenset({
    'schema', 'status', 'method', 'mainCommit', 'runningCommit',
    'blenderVersion', 'styleRevision', 'units', 'exportAxis',
    'notGameCapture', 'noGameSourceChanged', 'noExternalDownloadsOrServices',
    'assets', 'blend', 'inputs',
})
ASSET_FIELDS = frozenset({
    'id', 'file', 'dimensionsXYZ', 'sourceStats', 'glbBytes', 'sha256',
    'textureBytes', 'adopted',
})
BLEND_FIELDS = frozenset({
    'file', 'bytes', 'sha256', 'editableTextBlocks', 'previewScene',
})
INPUT_FIELDS = frozenset({'file', 'sha256'})

SHA256_RE = re.compile(r'^[0-9a-fA-F]{64}$')
PIECE_ID_RE = re.compile(r'^[A-Za-z0-9_-]+$')
URL_RE = re.compile(r'^[A-Za-z][A-Za-z0-9+.\-]*:')
WINDOWS_DRIVE_RE = re.compile(r'^[A-Za-z]:')
DEFAULT_ROOT = Path(__file__).resolve().parents[1]

EXIT_PASS = 0
EXIT_MISMATCH = 1
EXIT_INVALID = 2


class VerificationError(Exception):
    """Invalid CLI, unreadable file or unsupported manifest structure."""

    def __init__(self, code, reason, field=None):
        super().__init__(reason)
        self.code = code
        self.reason = reason
        self.field = field


def _finding(code, reason, path=None, field=None, expected=None, actual=None):
    item = {'code': code, 'reason': reason}
    if path is not None:
        item['path'] = path
    if field is not None:
        item['field'] = field
    if expected is not None:
        item['expected'] = str(expected)
    if actual is not None:
        item['actual'] = str(actual)
    return item


def _has_surrogate(value):
    """True when a decoded JSON string still holds a lone UTF-16 surrogate."""
    return any(0xD800 <= ord(ch) <= 0xDFFF for ch in value)


def _check_text(value, field):
    """Validate one root-relative manifest path before any file is opened."""
    if not isinstance(value, str) or not value:
        raise VerificationError('invalid-path', f'{field} must be a non-empty root-relative path', field)
    if any(ord(ch) < 0x20 or ord(ch) == 0x7f for ch in value):
        raise VerificationError('invalid-path', f'{field} contains control characters', field)
    if _has_surrogate(value):
        raise VerificationError('invalid-path', f'{field} contains an unpaired surrogate', field)
    if '\\' in value:
        raise VerificationError('invalid-path', f'{field} must use forward slashes', field)
    if '://' in value or URL_RE.match(value) or WINDOWS_DRIVE_RE.match(value):
        raise VerificationError('invalid-path', f'{field} must not be an absolute path or URL', field)
    if value.startswith('/') or value.startswith('~'):
        raise VerificationError('invalid-path', f'{field} must be root-relative', field)
    parts = PurePosixPath(value).parts
    if not parts:
        raise VerificationError('invalid-path', f'{field} is not a file path', field)
    if '..' in parts:
        raise VerificationError('path-escape', f'{field} must not contain ..', field)
    return parts


def _resolve_inside(root, value, field):
    """Resolve a validated root-relative path and reject symlink escapes."""
    parts = _check_text(value, field)
    candidate = root.joinpath(*parts)
    resolved = candidate.resolve()
    if resolved == root or not resolved.is_relative_to(root):
        raise VerificationError('path-escape', f'{field} resolves outside the root', field)
    return resolved


def _read_bytes(path):
    try:
        return path.read_bytes()
    except OSError:
        raise VerificationError('unreadable-file', 'a required file could not be read') from None


def _sha256_file(path):
    digest = hashlib.sha256()
    try:
        with path.open('rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(chunk)
    except OSError:
        raise VerificationError('unreadable-file', 'a required file could not be read') from None
    return digest.hexdigest()


def _load_json(path, label):
    raw = _read_bytes(path)
    try:
        return json.loads(raw.decode('utf-8-sig'))
    except (UnicodeDecodeError, ValueError, RecursionError) as error:
        # json.JSONDecodeError is a ValueError and carries line/column.
        # ValueError also covers the interpreter's integer-digit limit for
        # numeric literals; RecursionError covers pathologically nested input.
        line = getattr(error, 'lineno', None)
        column = getattr(error, 'colno', None)
        where = f' (line {line}, column {column})' if line is not None else ''
        raise VerificationError(
            'invalid-json',
            f'{label} is not valid or is too deeply nested JSON{where}',
        ) from None


def _require_unique_fields(obj, allowed, label):
    unknown = sorted(set(obj) - allowed)
    if unknown:
        raise VerificationError(
            'unsupported-field',
            f'{label} has unsupported field(s): {", ".join(unknown)}',
        )


def _require_key(obj, key, label):
    if key not in obj:
        raise VerificationError('missing-field', f'{label} is missing required field {key}', key)


def _require_sha256(obj, key, label):
    _require_key(obj, key, label)
    value = obj[key]
    if not isinstance(value, str) or not SHA256_RE.match(value):
        raise VerificationError(
            'invalid-hash',
            f'{label}.{key} must be a full 64-character hexadecimal SHA-256',
            key,
        )
    return value.lower()


def _require_bytes(obj, key, label):
    _require_key(obj, key, label)
    value = obj[key]
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise VerificationError(
            'invalid-size',
            f'{label}.{key} must be a non-negative integer',
            key,
        )
    return value


def _validate_manifest_structure(manifest):
    if not isinstance(manifest, dict):
        raise VerificationError('invalid-structure', 'manifest root must be a JSON object')
    _require_unique_fields(manifest, MANIFEST_FIELDS, 'manifest')
    _require_key(manifest, 'schema', 'manifest')
    schema = manifest['schema']
    if schema != SUPPORTED_MANIFEST_SCHEMA:
        raise VerificationError(
            'unsupported-schema',
            f'manifest schema must be {SUPPORTED_MANIFEST_SCHEMA}',
            'schema',
        )
    for key in ('assets', 'inputs'):
        _require_key(manifest, key, 'manifest')
        if not isinstance(manifest[key], list):
            raise VerificationError('invalid-structure', f'manifest.{key} must be a list', key)
    _require_key(manifest, 'blend', 'manifest')
    if not isinstance(manifest['blend'], dict):
        raise VerificationError('invalid-structure', 'manifest.blend must be an object', 'blend')

    for index, asset in enumerate(manifest['assets']):
        label = f'assets[{index}]'
        if not isinstance(asset, dict):
            raise VerificationError('invalid-structure', f'{label} must be an object')
        _require_unique_fields(asset, ASSET_FIELDS, label)
        _require_key(asset, 'id', label)
        if not isinstance(asset['id'], str) or not asset['id']:
            raise VerificationError('invalid-structure', f'{label}.id must be a non-empty string')
        if _has_surrogate(asset['id']) or any(ord(ch) < 0x20 or ord(ch) == 0x7f for ch in asset['id']):
            raise VerificationError('invalid-path', f'{label}.id contains unsafe characters', 'id')
        _require_key(asset, 'file', label)
        _check_text(asset['file'], f'{label}.file')
        _require_bytes(asset, 'glbBytes', label)
        _require_sha256(asset, 'sha256', label)

    blend = manifest['blend']
    _require_unique_fields(blend, BLEND_FIELDS, 'blend')
    _require_key(blend, 'file', 'blend')
    _check_text(blend['file'], 'blend.file')
    _require_bytes(blend, 'bytes', 'blend')
    _require_sha256(blend, 'sha256', 'blend')
    if 'editableTextBlocks' in blend:
        blocks = blend['editableTextBlocks']
        if not isinstance(blocks, list) or any(not isinstance(item, str) for item in blocks):
            raise VerificationError(
                'invalid-structure',
                'blend.editableTextBlocks must be a list of strings',
                'editableTextBlocks',
            )
    if 'previewScene' in blend and not isinstance(blend['previewScene'], str):
        raise VerificationError('invalid-structure', 'blend.previewScene must be a string', 'previewScene')

    for index, entry in enumerate(manifest['inputs']):
        label = f'inputs[{index}]'
        if not isinstance(entry, dict):
            raise VerificationError('invalid-structure', f'{label} must be an object')
        _require_unique_fields(entry, INPUT_FIELDS, label)
        _require_key(entry, 'file', label)
        _check_text(entry['file'], f'{label}.file')
        _require_sha256(entry, 'sha256', label)


def _load_contract_piece_ids(root):
    contract_path = _resolve_inside(root, 'contract.json', 'contract.json')
    contract = _load_json(contract_path, 'contract.json')
    if not isinstance(contract, dict):
        raise VerificationError('invalid-contract', 'contract.json root must be an object')
    pieces = contract.get('pieces')
    if not isinstance(pieces, list) or not pieces:
        raise VerificationError('invalid-contract', 'contract.json must define a non-empty pieces list')
    identifiers = []
    for index, piece in enumerate(pieces):
        if not isinstance(piece, dict) or not isinstance(piece.get('id'), str):
            raise VerificationError('invalid-contract', f'contract.json pieces[{index}].id must be a string')
        piece_id = piece['id']
        if not PIECE_ID_RE.fullmatch(piece_id):
            raise VerificationError(
                'invalid-contract',
                f'contract.json pieces[{index}].id is not a safe filename component',
            )
        if piece_id in identifiers:
            raise VerificationError('invalid-contract', 'contract.json piece IDs must be unique')
        identifiers.append(piece_id)
    return identifiers


def _check_artifacts(root, manifest, piece_ids):
    findings = []
    assets = manifest['assets']
    by_id = collections.defaultdict(list)
    for asset in assets:
        by_id[asset['id']].append(asset)
    expected = set(piece_ids)

    for piece_id in piece_ids:
        relative = f'models/{piece_id}.glb'
        entries = by_id.get(piece_id, [])
        if not entries:
            findings.append(_finding(
                'asset-missing',
                'manifest has no asset entry for the contract piece',
                path=relative,
                field='assets[].id',
                expected=piece_id,
                actual='missing',
            ))
            continue
        if len(entries) > 1:
            findings.append(_finding(
                'duplicate-asset-id',
                'manifest records the same asset ID more than once',
                path=relative,
                field='assets[].id',
                expected='exactly one entry',
                actual=f'{len(entries)} entries',
            ))
        resolved = _resolve_inside(root, relative, f'models/{piece_id}.glb')
        if not resolved.is_file():
            findings.append(_finding(
                'asset-missing-file',
                'mapped GLB file does not exist',
                path=relative,
                field='assets[].file',
                expected='regular file',
                actual='missing',
            ))
            continue
        size = resolved.stat().st_size
        digest = _sha256_file(resolved)
        for entry in entries:
            field = f'assets[id={piece_id}]'
            if entry['file'] != relative:
                findings.append(_finding(
                    'asset-file-mapping',
                    'manifest asset file does not match the contract-ID mapping',
                    path=relative,
                    field=f'{field}.file',
                    expected=relative,
                    actual=entry['file'],
                ))
            if entry['glbBytes'] != size:
                findings.append(_finding(
                    'asset-bytes-mismatch',
                    'actual GLB byte size differs from the manifest value',
                    path=relative,
                    field=f'{field}.glbBytes',
                    expected=entry['glbBytes'],
                    actual=size,
                ))
            if entry['sha256'].lower() != digest:
                findings.append(_finding(
                    'asset-hash-mismatch',
                    'actual GLB SHA-256 differs from the manifest value',
                    path=relative,
                    field=f'{field}.sha256',
                    expected=entry['sha256'].lower(),
                    actual=digest,
                ))

    for asset in assets:
        if asset['id'] not in expected:
            findings.append(_finding(
                'unexpected-asset',
                'manifest asset ID is not present in contract.json pieces',
                path=asset['file'],
                field='assets[].id',
                expected='a contract piece ID',
                actual=asset['id'],
            ))

    path_counts = collections.Counter(asset['file'] for asset in assets)
    for relative, count in sorted(path_counts.items()):
        if count > 1:
            findings.append(_finding(
                'duplicate-asset-path',
                'manifest records the same asset file more than once',
                path=relative,
                field='assets[].file',
                expected='unique root-relative path',
                actual=f'{count} entries',
            ))

    blend = manifest['blend']
    blend_relative = blend['file']
    blend_path = _resolve_inside(root, blend_relative, 'blend.file')
    if not blend_path.is_file():
        findings.append(_finding(
            'blend-missing-file',
            'manifest .blend file does not exist',
            path=blend_relative,
            field='blend.file',
            expected='regular file',
            actual='missing',
        ))
    else:
        blend_size = blend_path.stat().st_size
        blend_digest = _sha256_file(blend_path)
        if blend['bytes'] != blend_size:
            findings.append(_finding(
                'blend-bytes-mismatch',
                'actual .blend byte size differs from the manifest value',
                path=blend_relative,
                field='blend.bytes',
                expected=blend['bytes'],
                actual=blend_size,
            ))
        if blend['sha256'].lower() != blend_digest:
            findings.append(_finding(
                'blend-hash-mismatch',
                'actual .blend SHA-256 differs from the manifest value',
                path=blend_relative,
                field='blend.sha256',
                expected=blend['sha256'].lower(),
                actual=blend_digest,
            ))

    return findings


def _check_sources(root, manifest):
    findings = []
    entries = manifest['inputs']
    by_file = collections.defaultdict(list)
    for entry in entries:
        by_file[entry['file']].append(entry)
    required = set(REQUIRED_INPUTS)

    for relative in REQUIRED_INPUTS:
        matches = by_file.get(relative, [])
        if not matches:
            findings.append(_finding(
                'missing-input',
                'required authoring input is absent from manifest inputs',
                path=relative,
                field='inputs[].file',
                expected='present',
                actual='missing',
            ))
            continue
        if len(matches) > 1:
            findings.append(_finding(
                'duplicate-input',
                'manifest records the same authoring input more than once',
                path=relative,
                field='inputs[].file',
                expected='exactly one entry',
                actual=f'{len(matches)} entries',
            ))
        path = _resolve_inside(root, relative, relative)
        if not path.is_file():
            raise VerificationError('unreadable-file', 'a required authoring input could not be read')
        actual_digest = _sha256_file(path)
        for entry in matches:
            if entry['sha256'].lower() != actual_digest:
                findings.append(_finding(
                    'input-hash-mismatch',
                    'manifest input hash differs from the current file bytes',
                    path=relative,
                    field='inputs[].sha256',
                    expected=entry['sha256'].lower(),
                    actual=actual_digest,
                ))

    for relative in sorted(set(by_file) - required):
        findings.append(_finding(
            'unexpected-input',
            'manifest input is not part of the fixed authoring input set',
            path=relative,
            field='inputs[].file',
            expected='one of the fixed authoring inputs',
            actual=relative,
        ))

    return findings


def _sorted(findings):
    return sorted(
        findings,
        key=lambda item: (
            item.get('code', ''),
            item.get('path', ''),
            item.get('field', ''),
            item.get('expected', ''),
            item.get('actual', ''),
        ),
    )


def _report(manifest_display, manifest_schema, artifact_findings, source_findings):
    artifact_findings = _sorted(artifact_findings)
    source_findings = _sorted(source_findings)
    artifact_passed = not artifact_findings
    source_passed = not source_findings
    overall = artifact_passed and source_passed
    report = {
        'schema': REPORT_SCHEMA,
        'status': 'passed' if overall else 'mismatch',
        'manifest': manifest_display,
        'manifestSchema': manifest_schema,
        'artifactIntegrity': {
            'passed': artifact_passed,
            'findings': artifact_findings,
        },
        'sourceCurrency': {
            'passed': source_passed,
            'findings': source_findings,
        },
        'overall': overall,
        'supportedSchema': {
            'manifest': SUPPORTED_MANIFEST_SCHEMA,
            'manifestFields': sorted(MANIFEST_FIELDS),
            'assetFields': sorted(ASSET_FIELDS),
            'blendFields': sorted(BLEND_FIELDS),
            'inputFields': sorted(INPUT_FIELDS),
            'verifiedFields': {
                'manifest': ['assets', 'blend', 'inputs', 'schema'],
                'asset': ['file', 'glbBytes', 'id', 'sha256'],
                'blend': ['bytes', 'file', 'sha256'],
                'input': ['file', 'sha256'],
            },
        },
        'notes': [
            'sourceCurrency compares manifest-recorded input hashes with current source bytes. A mismatch means the manifest record is stale; it does not imply the shipped artifacts are corrupt.',
            'A passing sourceCurrency check does not prove the historical build tools actually ran or that the shipped bytes were produced by the current sources.',
            'artifactIntegrity compares file sizes and SHA-256 values only. GLB geometry, triangle counts, skinning, visual quality, licensing and .blend internals are not verified.',
            'The .blend file is read as opaque bytes for its size and hash; it is not parsed, executed, re-saved or uploaded.',
            'Recognized historical metadata fields are accepted for schema compatibility but are not independently verified; only the fields listed under supportedSchema are understood.',
        ],
    }
    return report, EXIT_PASS if overall else EXIT_MISMATCH


def _error_report(code, reason):
    return {
        'schema': REPORT_SCHEMA,
        'status': 'error',
        'artifactIntegrity': {'passed': False, 'findings': []},
        'sourceCurrency': {'passed': False, 'findings': []},
        'overall': False,
        'error': {'code': code, 'reason': reason},
    }


def _resolve_manifest_path(root, manifest_arg):
    if manifest_arg is None:
        return _resolve_inside(root, 'models/manifest.json', 'models/manifest.json')
    if '..' in PurePosixPath(manifest_arg.replace('\\', '/')).parts:
        raise VerificationError('path-escape', '--manifest must not contain ..')
    candidate = Path(manifest_arg)
    if candidate.is_absolute():
        resolved = candidate.resolve()
        if resolved == root or not resolved.is_relative_to(root):
            raise VerificationError(
                'manifest-outside-root',
                'manifest path must resolve inside --root',
            )
        return resolved
    # Accept a cwd-relative path only when it actually resolves inside root;
    # otherwise read it as root-relative. Either way the read stays in root.
    cwd_relative = candidate.resolve()
    if (
        cwd_relative != root
        and cwd_relative.is_relative_to(root)
        and cwd_relative.is_file()
    ):
        return cwd_relative
    return _resolve_inside(root, manifest_arg, '--manifest')


def verify(root_argument, manifest_argument=None):
    """Run the checks and return (report, exit_code). Never writes to root."""
    try:
        root = Path(root_argument).resolve()
        if not root.is_dir():
            raise VerificationError('invalid-root', '--root must be an existing directory')
        manifest_path = _resolve_manifest_path(root, manifest_argument)
        manifest_display = manifest_path.relative_to(root).as_posix()
        if not manifest_path.is_file():
            raise VerificationError('unreadable-manifest', 'manifest file does not exist')
        manifest = _load_json(manifest_path, 'manifest')
        _validate_manifest_structure(manifest)
        piece_ids = _load_contract_piece_ids(root)
        artifact_findings = _check_artifacts(root, manifest, piece_ids)
        source_findings = _check_sources(root, manifest)
        return _report(
            manifest_display,
            manifest['schema'],
            artifact_findings,
            source_findings,
        )
    except VerificationError as error:
        return _error_report(error.code, error.reason), EXIT_INVALID
    except Exception:
        # Defensive boundary: an unexpected parser or filesystem failure must
        # still produce one JSON error document and exit 2 rather than a
        # traceback on stderr. The exception text is deliberately not echoed
        # because it can contain absolute paths or environment details.
        return _error_report(
            'unexpected-error',
            'the manifest or an authoring input could not be processed',
        ), EXIT_INVALID


class _ArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise VerificationError('invalid-cli', 'invalid command line arguments')


def _emit(report):
    # ensure_ascii=True keeps stdout UTF-8/JSON even if an untrusted string
    # still carries a lone surrogate; such values never crash the encoder.
    text = json.dumps(report, ensure_ascii=True, sort_keys=False) + '\n'
    buffer = getattr(sys.stdout, 'buffer', None)
    if buffer is not None:
        try:
            sys.stdout.flush()
        except (AttributeError, ValueError):
            pass
        buffer.write(text.encode('utf-8'))
        buffer.flush()
    else:
        sys.stdout.write(text)
        sys.stdout.flush()


def main(argv=None):
    parser = _ArgumentParser(
        prog='verify_manifest.py',
        description='Read-only consistency check for the standards-v1 model manifest.',
    )
    parser.add_argument(
        '--root',
        help='standards-v1 asset directory (default: this script author directory)',
    )
    parser.add_argument(
        '--manifest',
        help='manifest path inside --root (default: models/manifest.json)',
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='emit machine-readable JSON (output is always a single JSON document)',
    )
    try:
        args = parser.parse_args(argv)
    except VerificationError:
        _emit(_error_report('invalid-cli', 'invalid command line arguments'))
        sys.stderr.write('verify_manifest: invalid command line arguments\n')
        sys.stderr.flush()
        return EXIT_INVALID

    report, exit_code = verify(
        Path(args.root) if args.root else DEFAULT_ROOT,
        args.manifest,
    )
    _emit(report)
    if exit_code == EXIT_MISMATCH:
        sys.stderr.write('verify_manifest: artifact/source mismatch; see JSON on stdout\n')
        sys.stderr.flush()
    elif exit_code == EXIT_INVALID:
        sys.stderr.write('verify_manifest: invalid input or manifest structure; see JSON on stdout\n')
        sys.stderr.flush()
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
