// The page's side of the scene in a worker (render-worker.js): the same calls
// as FlightScene (update, setNight, burst), each posted to the worker; the
// canvas handed over as an OffscreenCanvas. update() snapshots only what the
// scene reads of the game. renderMs, updateMs and glStats() are the worker's
// last frame's, for stats for nerds.
// the livery's SVGs and the bitmap sizes they're drawn at (their textures')
const LIVERY = [['schematik-wordmark', 1088, 160], ['schematik-mark', 288, 384]];

export const canDrawInWorker = () => typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;

export class WorkerScene {
  constructor(container, { night = false, quality = 'high' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    container.append(canvas);
    const offscreen = canvas.transferControlToOffscreen();
    this.worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
    this.renderMs = 0; this.updateMs = 0; this.gl = null; this.night = night; this.quality = quality;
    this.worker.onmessage = ({ data: m }) => {
      if (m.type === 'drawn') { this.renderMs = m.renderMs; this.updateMs = m.updateMs; this.gl = m.gl; }
      else if (m.type === 'lost') container.dispatchEvent(new CustomEvent('renderlost'));
      else if (m.type === 'error') container.dispatchEvent(new CustomEvent('rendererror', { detail: m.message }));
    };
    this.worker.onerror = (e) => container.dispatchEvent(new CustomEvent('rendererror', { detail: e.message }));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    // the plane's livery: SVGs, which only the page can decode; drawn to
    // bitmaps here (flipped, as a texture from an image would be) and handed over
    const images = {};
    const ready = Promise.all(LIVERY.map(async ([name, w, h]) => {
      try {
        const img = new Image(); img.src = `./${name}.svg`; await img.decode();
        images[name] = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, imageOrientation: 'flipY' });
      } catch { /* the plane flies without it */ }
    }));
    ready.then(() => this.worker.postMessage({ type: 'init', canvas: offscreen, night: this.night, opts: {
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      mobile: matchMedia('(pointer:coarse)').matches, reducedMotion: reduced.matches, images, quality: this.quality,
    } }, [offscreen, ...Object.values(images)]));
    reduced.addEventListener?.('change', (e) => this.worker.postMessage({ type: 'reducedMotion', on: e.matches }));
    addEventListener('resize', () => this.worker.postMessage({ type: 'resize', width: innerWidth, height: innerHeight }));
  }

  update(dt, game, pose) {
    const g = game;
    this.worker.postMessage({ type: 'frame', dt, pose: pose ? { roll: pose.roll, pitch: pose.pitch } : null, game: {
      status: g.status, mode: g.mode, x: g.x, y: g.y, vx: g.vx, roll: g.roll, pitch: g.pitch, distance: g.distance,
      gates: g.gates.map(({ x, y, z }) => ({ x, y, z })),
    } });
  }

  setNight(on) { this.night = on; this.worker.postMessage({ type: 'night', on }); } // before the worker starts: taken at its start
  setQuality(quality) { this.quality = quality; this.worker.postMessage({ type: 'quality', quality }); }
  burst(x, y, perfect) { this.worker.postMessage({ type: 'burst', x, y, perfect }); }
  glStats() { return this.gl; }
}
