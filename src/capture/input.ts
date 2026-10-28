import type { Command } from '../sim/types.js';
import type { InputName } from './config.js';
// Open-loop tape. Only public commands: no actor relocation, HP/ammo override,
// hidden target information, custom rules or separate capture-only simulation.
export function captureCommands(name: InputName, tick: number): Command[] {
  const actorId = 'player';
  if (name === 'idle') return [];
  const commands: Command[] = [];
  if (tick === 0) commands.push({ actorId, type: 'move', x: 1, z: 0 });
  if (tick === 30) commands.push({ actorId, type: 'move', x: 0, z: 1 });
  if (tick === 180) commands.push({ actorId, type: 'move', x: 0, z: 0 }, { actorId, type: 'aim', yaw: 0, pitch: 0 });
  if (tick >= 192 && tick < 300 && tick % 6 === 0) commands.push({ actorId, type: 'shoot', yaw: 0, pitch: 0 });
  if (tick === 306) commands.push({ actorId, type: 'reload' });
  return commands;
}
