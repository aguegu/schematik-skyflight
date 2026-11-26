export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
export const RUN_SECONDS = 90;
// Relaxed pace: twice as much time to line up with the next ring.
export const SPEED = 24;
export const GATE_RADIUS = 8.5;
export const GATE_SPACING = 110;

export function makeGate(index, z) {
  return { index, x: Math.sin(index * 0.72) * 27, y: 24 + Math.sin(index * 0.91) * 12, z };
}

export class FlightGame {
  constructor() {
    this.status = 'menu';
    this.mode = 'rings';
    this.reset();
  }

  reset() {
    this.x = 0; this.y = 24; this.vx = 0; this.vy = 0;
    this.roll = 0; this.pitch = 0;
    this.elapsed = 0; this.distance = 0;
    this.score = 0; this.combo = 0; this.hits = 0; this.misses = 0;
    this.gates = Array.from({ length: 9 }, (_, i) => makeGate(i, -120 - i * GATE_SPACING));
    this.nextGate = 9;
  }

  start(mode = 'rings') {
    this.mode = mode;
    this.reset();
    this.status = 'running';
  }

  pause() { if (this.status === 'running') this.status = 'paused'; }
  resume() { if (this.status === 'paused') this.status = 'running'; }
  get remaining() { return Math.max(0, RUN_SECONDS - this.elapsed); }
  get multiplier() { return Math.min(5, 1 + Math.floor(Math.max(0, this.combo - 1) / 3)); }

  // attitude: the sensor's own roll and pitch, degrees, when a tilt
  // controller is live: the plane then banks and pitches exactly as the
  // sensor does; without it (keys, touch) the input eases it
  update(dt, input = { roll: 0, pitch: 0 }, attitude = null) {
    if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return [];
    dt = Math.min(dt, 0.05, this.mode === 'rings' ? this.remaining : Infinity);
    const oldX = this.x, oldY = this.y;
    const roll = clamp(input.roll || 0, -1, 1), pitch = clamp(input.pitch || 0, -1, 1);
    // Gentler corrections without adding extra input lag or coasting.
    this.vx = damp(this.vx, roll * 16, 4.5, dt);
    this.vy = damp(this.vy, pitch * 12, 4.5, dt);
    this.x = clamp(this.x + this.vx * dt, -52, 52);
    this.y = clamp(this.y + this.vy * dt, 8, 67);
    if (attitude) {
      // eased over ~40 ms: the readings come 20 to 50 times a second, the
      // frames 60, so the plane glides between readings instead of stepping
      this.roll = damp(this.roll, -attitude.roll * RAD_PER_DEG, ATTITUDE_RATE, dt);
      this.pitch = damp(this.pitch, attitude.pitch * RAD_PER_DEG, ATTITUDE_RATE, dt);
    } else {
      this.roll = damp(this.roll, -roll * 0.7, 6, dt);
      this.pitch = damp(this.pitch, pitch * 0.26, 5, dt);
    }
    this.elapsed += dt;
    const movement = SPEED * dt;
    this.distance += movement;
    const events = [];
    if (this.mode === 'rings') {
      for (const gate of this.gates) {
        const oldZ = gate.z;
        gate.z += movement;
        if (oldZ < 0 && gate.z >= 0) {
          const fraction = -oldZ / movement;
          const crossingX = oldX + (this.x - oldX) * fraction;
          const crossingY = oldY + (this.y - oldY) * fraction;
          const distance = Math.hypot(crossingX - gate.x, crossingY - gate.y);
          if (distance < GATE_RADIUS - 0.8) {
            this.hits++; this.combo++;
            const perfect = distance < 3.3;
            const points = (100 + (perfect ? 50 : 0)) * this.multiplier;
            this.score += points;
            events.push({ type: 'hit', perfect, points, multiplier: this.multiplier, x: gate.x, y: gate.y });
          } else {
            this.misses++; this.combo = 0;
            events.push({ type: 'miss' });
          }
        }
      }
      while (this.gates[0].z > 35) {
        this.gates.shift();
        this.gates.push(makeGate(this.nextGate++, this.gates.at(-1).z - GATE_SPACING));
      }
      if (this.remaining < 0.00001) {
        this.elapsed = RUN_SECONDS;
        this.status = 'finished';
        events.push({ type: 'finish' });
      }
    }
    return events;
  }
}

const RAD_PER_DEG = Math.PI / 180;
const ATTITUDE_RATE = 25; // 1/s: the sensor's attitude eased with a 40 ms time constant

// the sensor's attitude as the plane takes it, degrees: its roll and pitch
// from the zero (none unless the player sets one), swapped and inverted as
// the settings say; no dead zone, no limit
export function sensorAttitude(sample, zero, settings) {
  let roll = ((sample.roll - zero.roll + 180) % 360 + 360) % 360 - 180;
  let pitch = sample.pitch - zero.pitch;
  if (settings.swapAxes) [roll, pitch] = [pitch, roll];
  return { roll: settings.invertRoll ? -roll : roll, pitch: settings.invertPitch ? -pitch : pitch };
}

export function sensorInput(sample, zero, settings) {
  let roll = sample.roll - zero.roll;
  // Wrap around the accelerometer's ±180° roll boundary.
  roll = ((roll + 180) % 360 + 360) % 360 - 180;
  let pitch = sample.pitch - zero.pitch;
  if (settings.swapAxes) [roll, pitch] = [pitch, roll];
  const axis = (angle, inverted) => {
    const deadZone = 1.2;
    const adjusted = Math.sign(angle) * Math.max(0, Math.abs(angle) - deadZone);
    return clamp(adjusted / 30 * settings.sensitivity * (inverted ? -1 : 1), -1, 1);
  };
  return { roll: axis(roll, settings.invertRoll), pitch: axis(pitch, settings.invertPitch) };
}
