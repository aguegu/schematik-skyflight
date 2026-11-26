// The scene drawn in a worker, on an OffscreenCanvas: the WebGL draw call
// waits on the GPU here, not on the page's thread, so the page keeps taking
// the Dart's replies (Web Bluetooth lives on the page) while a frame is slow.
// The page posts the game's state each frame it would have drawn; the worker
// draws the latest on its own animation frames, adding up the time between.
import { FlightScene } from './scene.js';

let scene = null, latest = null, dtSum = 0;
const frame = self.requestAnimationFrame ? (f) => self.requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 16);

function tick() {
  frame(tick);
  if (!latest) return;
  const at = performance.now();
  scene.update(Math.min(dtSum, .1), latest.game, latest.pose);
  const updateMs = performance.now() - at;
  latest = null; dtSum = 0;
  postMessage({ type: 'drawn', updateMs, renderMs: scene.renderMs, gl: scene.glStats() });
}

onmessage = ({ data: m }) => {
  if (m.type === 'init') {
    try {
      scene = new FlightScene(null, { ...m.opts, canvas: m.canvas, onContextLost: () => postMessage({ type: 'lost' }) });
      scene.setNight(m.night);
      postMessage({ type: 'ready' });
      frame(tick);
    } catch (error) {
      postMessage({ type: 'error', message: error.message });
    }
    return;
  }
  if (!scene) return;
  if (m.type === 'frame') { latest = m; dtSum += m.dt; }
  else if (m.type === 'resize') scene.resize(m.width, m.height);
  else if (m.type === 'night') scene.setNight(m.on);
  else if (m.type === 'burst') scene.burst(m.x, m.y, m.perfect);
  else if (m.type === 'reducedMotion') scene.reducedMotion = m.on;
};
