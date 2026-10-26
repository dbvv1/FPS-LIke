import { cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Keep upstream simulation output separate from the Sites static payload.
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
rmSync('dist', { recursive: true, force: true });
cpSync('web-dist', 'dist', { recursive: true });
