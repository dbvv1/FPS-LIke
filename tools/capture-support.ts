import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

/** mkdtemp creates an exclusive directory even for simultaneous identical runs. */
export async function createCaptureRun(outputRoot: string, commit: string, input: string) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-z0-9-]+$/.test(input)) throw new Error('Invalid capture run identity');
  await mkdir(outputRoot, { recursive: true });
  return mkdtemp(join(outputRoot, `run-${commit.slice(0, 12)}-${input}-`));
}

/** Windows .cmd files need cmd.exe. Keep the command literal: cwd/options never
 * enter shell text, /d disables AutoRun, and no caller arguments are interpolated.
 * https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows
 */
export function captureBuildInvocation(platform: NodeJS.Platform, comspec?: string) {
  return platform === 'win32'
    ? { file: comspec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd run build'] }
    : { file: 'npm', args: ['run', 'build'] };
}
