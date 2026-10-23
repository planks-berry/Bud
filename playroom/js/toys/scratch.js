// How a hand moves the turntable's record, and how the record's speed reaches the sound. Pure, so
// the suite can put a scratch through it in Node and listen, as it were, for steps.
//
// Touches come about sixty times a second, and not always evenly. A record that went exactly where
// each touch put it would change speed in steps, sixty times a second; on a drum that is lost in
// the noise, but on a held note it is a buzz, the robot in a voice. So the record follows the
// finger as if it had weight, the way a spring that stops dead does (critically damped: it never
// overshoots), and the sound comes to each new speed gliding, on the audio clock, between one
// frame and the next.

// How stiffly the record follows the finger, per second. It trails a steadily moving finger by
// 2 / FOLLOW seconds.
export const FOLLOW = 50;

// How long the sound takes to come to a new speed: a time constant, in seconds.
export const GLIDE = 0.03;

// The record `dt` seconds on, following a finger held at `target` meanwhile: its angle and its
// turning speed, in radians and radians a second.
export function follow(angle, spin, target, dt) {
    const y = angle - target;
    const b = spin + FOLLOW * y;
    const e = Math.exp(-FOLLOW * dt);
    return [target + (y + b * dt) * e, (spin - FOLLOW * b * dt) * e];
}

// How far ahead of a turning record to put the finger's mark when a hand catches it, so that it
// slows to a stop under the finger as quickly as it can without going back.
export function lead(spin) {
    return spin / FOLLOW;
}
