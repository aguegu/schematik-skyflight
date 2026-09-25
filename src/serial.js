// Newline-delimited angles in degrees. Also accepts simple JSON telemetry.
export function parseSample(line) {
  const text = line.trim();
  if (!text || text.startsWith('#') || text.length > 256) return null;
  let roll, pitch;
  try {
    if (text.startsWith('{')) {
      const data = JSON.parse(text);
      roll = data.roll; pitch = data.pitch;
      if (typeof roll !== 'number' || typeof pitch !== 'number') return null;
    } else {
      const parts = text.split(',');
      if (parts.length < 2 || parts.length > 3 || parts.some(p => !p.trim())) return null;
      const numbers = parts.map(Number);
      if (!numbers.every(Number.isFinite)) return null;
      [roll, pitch] = numbers;
    }
  } catch { return null; }
  if (!Number.isFinite(roll) || !Number.isFinite(pitch) || Math.abs(roll) > 180 || Math.abs(pitch) > 180) return null;
  return { roll, pitch };
}

export class LineBuffer {
  constructor(limit = 256) { this.limit = limit; this.buffer = ''; this.dropping = false; }
  push(text) {
    const lines = [];
    for (const char of text) {
      if (char === '\n') {
        if (!this.dropping) lines.push(this.buffer.replace(/\r$/, ''));
        this.buffer = ''; this.dropping = false;
      } else if (!this.dropping) {
        if (this.buffer.length >= this.limit) { this.buffer = ''; this.dropping = true; }
        else this.buffer += char;
      }
    }
    return lines;
  }
}

export class SensorSerial extends EventTarget {
  constructor() {
    super();
    this.port = null; this.reader = null; this.task = null;
    this.connected = false; this.connecting = false;
    this.sample = null; this.lastSampleAt = 0; this.rate = 0;
    this.timestamps = [];
  }

  get supported() { return 'serial' in navigator; }
  get live() { return this.connected && this.sample !== null && performance.now() - this.lastSampleAt < 1200; }
  notify(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async connect() {
    if (this.connected || this.connecting) return;
    if (!this.supported) throw new Error('USB tilt control needs desktop Chrome or Edge on localhost. Keyboard controls work here.');
    this.connecting = true;
    this.notify('status');
    let port;
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.port = port;
      this.connected = true;
      this.sample = null; this.rate = 0; this.timestamps = [];
      this.notify('status');
      this.task = this.readLoop(port);
    } finally {
      this.connecting = false;
      this.notify('status');
    }
  }

  async readLoop(port) {
    const decoder = new TextDecoder();
    const lines = new LineBuffer();
    let reader;
    try {
      reader = port.readable.getReader();
      this.reader = reader;
      while (this.connected) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of lines.push(decoder.decode(value, { stream: true }))) {
          const sample = parseSample(line);
          if (!sample) {
            if (line.startsWith('# ERROR')) this.notify('error', line.slice(2));
            continue;
          }
          this.sample = sample;
          this.lastSampleAt = performance.now();
          this.timestamps.push(this.lastSampleAt);
          while (this.timestamps.length && this.timestamps[0] < this.lastSampleAt - 1000) this.timestamps.shift();
          this.rate = this.timestamps.length;
          this.notify('sample', sample);
        }
      }
    } catch (error) {
      if (this.connected) this.notify('error', `Serial connection lost: ${error.message}`);
    } finally {
      reader?.releaseLock();
      this.reader = null;
      try { await port.close(); } catch { /* The OS may already have removed the port. */ }
      this.port = null; this.connected = false; this.sample = null; this.rate = 0;
      this.notify('status');
    }
  }

  async disconnect() {
    this.connected = false;
    try { await this.reader?.cancel(); } catch { /* Device may already be unplugged. */ }
    await this.task;
  }
}
