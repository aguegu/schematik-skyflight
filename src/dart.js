// The tilt controller over a Dart USB-to-I2C bridge (WebUSB) instead of a
// microcontroller: atiic reads the MPU6050 from the browser, and roll and
// pitch are worked out here, the same way the included firmware does
// (accelerometer angles, gyro rates, a complementary filter with a 0.45 s
// time constant, the gyro's bias averaged at connect). Same interface as
// SensorSerial: connect(), disconnect(), connected, connecting, live,
// sample { roll, pitch } in degrees, rate; 'status', 'sample', 'error' events.
// Pitch is given nose-up positive (the board's x axis as the nose): the
// firmware's atan2(-ax, ...) is nose-down positive, so its pitch, filtered
// the same way, is sent negated; roll as the firmware's (right wing down positive).
import { Mpu6050 } from 'atiic';
import { Dart, FILTERS } from 'atiic/adapters/dart';

const SCL_HZ = 400000;
const PERIOD_MS = 20; // 50 Hz, as the firmware
const TAU_S = 0.45; // the complementary filter's time constant, as the firmware
const BIAS_SAMPLES = 50; // about a second, held still
const DEG_PER_RAD = 180 / Math.PI;
const STALE_MS = 1200;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class SensorDart extends EventTarget {
  constructor() {
    super();
    this.bus = null; this.task = null;
    this.connected = false; this.connecting = false;
    this.sample = null; this.lastSampleAt = 0; this.rate = 0;
    this.timestamps = [];
  }

  get supported() { return 'usb' in navigator; }
  get live() { return this.connected && this.sample !== null && performance.now() - this.lastSampleAt < STALE_MS; }
  notify(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async connect() {
    if (this.connected || this.connecting) return;
    if (!this.supported) throw new Error('The Dart needs WebUSB: desktop Chrome or Edge on localhost. Keyboard controls work here.');
    this.connecting = true;
    this.notify('status');
    try {
      const device = await navigator.usb.requestDevice({ filters: FILTERS });
      const bus = await new Dart(device).open(SCL_HZ);
      const imu = new Mpu6050(bus);
      try {
        await imu.init('500', '4');
      } catch (error) {
        await bus.close().catch(() => {});
        throw new Error(`No MPU6050 on the Dart (0x68): ${error.message}`);
      }
      this.bus = bus;
      this.connected = true;
      this.sample = null; this.rate = 0; this.timestamps = [];
      this.notify('status');
      this.task = this.readLoop(imu);
    } finally {
      this.connecting = false;
      this.notify('status');
    }
  }

  async readLoop(imu) {
    try {
      // the gyro's bias, the sensor held still
      const bias = { x: 0, y: 0 };
      for (let i = 0; i < BIAS_SAMPLES && this.connected; i++) {
        const { gyroscopes: g } = await imu.measure();
        bias.x += g.x / BIAS_SAMPLES; bias.y += g.y / BIAS_SAMPLES;
        await delay(PERIOD_MS);
      }
      let roll = null, pitch = 0, last = performance.now();
      while (this.connected) {
        const { accelerometers: a, gyroscopes: g } = await imu.measure();
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        const accelRoll = Math.atan2(a.y, a.z) * DEG_PER_RAD;
        const accelPitch = Math.atan2(-a.x, Math.hypot(a.y, a.z)) * DEG_PER_RAD;
        const alpha = TAU_S / (TAU_S + dt);
        if (roll === null || Math.abs(accelRoll - roll) > 180) { roll = accelRoll; pitch = accelPitch; }
        else {
          roll = alpha * (roll + (g.x - bias.x) * dt) + (1 - alpha) * accelRoll;
          pitch = alpha * (pitch + (g.y - bias.y) * dt) + (1 - alpha) * accelPitch;
        }
        this.sample = { roll, pitch: -pitch };
        this.lastSampleAt = now;
        this.timestamps.push(now);
        while (this.timestamps.length && this.timestamps[0] < now - 1000) this.timestamps.shift();
        this.rate = this.timestamps.length;
        this.notify('sample', this.sample);
        const spent = performance.now() - now;
        if (spent < PERIOD_MS) await delay(PERIOD_MS - spent);
      }
    } catch (error) {
      if (this.connected) this.notify('error', `Dart connection lost: ${error.message}`);
    } finally {
      try { await this.bus?.close(); } catch { /* unplugged already */ }
      this.bus = null; this.connected = false; this.sample = null; this.rate = 0;
      this.notify('status');
    }
  }

  async disconnect() {
    this.connected = false;
    await this.task;
  }
}
