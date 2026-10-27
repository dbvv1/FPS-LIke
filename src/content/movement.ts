import { freeze } from './freeze.js';

// Original tuning for Relay Yard, not measured Counter-Strike constants.
// World units/second and world units/second². Reverse input brakes faster than release.
export const MOVEMENT = freeze({ runSpeed: 4.5, walkSpeed: 2.3, crouchSpeed: 1.7, acceleration: 40, releaseBrake: 18, reverseBrake: 55 });
