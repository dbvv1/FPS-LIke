import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';

// The official Khronos validator, pinned by package-lock.json. The case's own
// validate.mjs checks structure and contracts; this script checks that the four
// committed GLBs pass the glTF 2.0 specification.
const here = dirname(fileURLToPath(import.meta.url));
const SET = resolve(here, '..');

// An explicit expected count prevents an empty or partial set from passing.
export const EXPECTED_PIECES = 4;

export async function validateFile(path, name) {
  const bytes = await readFile(path);
  let externalRequests = 0;
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: name,
    format: 'glb',
    maxIssues: 0,
    writeTimestamp: false,
    externalResourceFunction: async () => {
      externalRequests++;
      throw new Error('Content-set GLBs must be self-contained');
    },
  });
  return {
    input: name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    externalRequests,
    ...report,
  };
}

export async function validateContentSet(distDir = resolve(SET, 'dist')) {
  const spec = JSON.parse(await readFile(resolve(SET, 'spec.json'), 'utf8'));
  if (spec.pieces.length !== EXPECTED_PIECES) {
    throw new Error(`spec.json must declare ${EXPECTED_PIECES} pieces, got ${spec.pieces.length}`);
  }
  const results = [];
  let failed = false;
  for (const piece of spec.pieces) {
    try {
      const result = await validateFile(resolve(distDir, piece.file), piece.file);
      const { numErrors, numWarnings, truncated } = result.issues;
      failed ||= numErrors > 0 || numWarnings > 0 || result.externalRequests > 0 || truncated;
      results.push({ id: piece.id, ...result });
    } catch (error) {
      failed = true;
      // Do not leak absolute local paths into reproducible output.
      results.push({ id: piece.id, input: piece.file, failure: error.code || 'VALIDATOR_EXCEPTION' });
    }
  }
  return { failed, results };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--dist-dir')) {
    throw new Error('Usage: node validate.mjs [--dist-dir DIRECTORY]');
  }
  const distDir = args.length ? resolve(args[1]) : resolve(SET, 'dist');
  const { failed, results } = await validateContentSet(distDir);
  for (const result of results) {
    if (result.failure) {
      console.error(`${result.id}: failure=${result.failure}`);
    } else {
      const { numErrors, numWarnings, numInfos, numHints } = result.issues;
      console.error(`${result.id}: errors=${numErrors} warnings=${numWarnings} infos=${numInfos} hints=${numHints}`);
    }
  }
  const exit = failed ? 1 : 0;
  console.log(JSON.stringify({ validator: validator.version(), expectedPieces: EXPECTED_PIECES, results, exit }, null, 2));
  console.error(`exit=${exit}`);
  process.exitCode = exit;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
