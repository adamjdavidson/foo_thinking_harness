// Touch and tilt both dispatch the same set-control action. No movement is active without a clutch.
export class TiltClutch {
  constructor() { this.release(); }
  hold(value, angle) { this.start = value; this.baseline = angle; this.position = value; this.active = true; }
  release() { this.active = false; this.baseline = null; }
  sample(angle) {
    if (!this.active || !Number.isFinite(angle)) return null;
    if (this.baseline === null) this.baseline = angle;
    const delta = ((angle - this.baseline + 540) % 360) - 180;
    const target = this.start + delta / 12;
    // Hysteresis stops a shaky hand from chattering at a boundary.
    while (target > this.position + 0.65 && this.position < 5) this.position++;
    while (target < this.position - 0.65 && this.position > 1) this.position--;
    return this.position;
  }
}
export function screenTilt(beta, gamma, rotation = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const r = rotation * Math.PI / 180;
  return gamma * Math.cos(r) + beta * Math.sin(r);
}
