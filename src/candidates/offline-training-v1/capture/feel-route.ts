import { qualityCaptureOptions } from './quality-route.js';
/** An explicitly separate fixed input tape; never changes qualityCapture's idle tape. */
export function feelCaptureOptions(search: string) {
  const p = new URLSearchParams(search), names = p.getAll('feelCapture');
  if (!names.length) return null;
  if (names.length !== 1 || names[0] !== 'move-stop' || p.has('qualityCapture')) throw new Error('Unsupported or mixed feelCapture');
  p.delete('feelCapture'); p.set('qualityCapture', 'gameplay');
  return { ...qualityCaptureOptions('?' + p)!, feel: 'move-stop' as const };
}
