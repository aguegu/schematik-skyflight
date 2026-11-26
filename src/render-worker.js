// The scene drawn in a worker, on an OffscreenCanvas: the WebGL draw call
// waits on the GPU here, not on the page's thread, so the page keeps taking
// the Dart's replies (Web Bluetooth lives on the page) while a frame is slow.
// The page posts the game's state each frame it would have drawn (its own
// animation frames set the pace); the worker draws the latest as soon as it's
// free, frames that came in while it was busy folded into one (their times added).
import { FlightScene } from './scene.js';

let scene = null, latest = null, dtSum = 0, pending = false;

function draw() {
  pending = false;
  if (!latest) return;
  const at = performance.now();
  try { scene.update(Math.min(dtSum, .1), latest.game, latest.pose); }
  catch (error) { latest = null; postMessage({ type: 'error', message: `${error.message}\n${error.stack}` }); return; }
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
    } catch (error) {
      postMessage({ type: 'error', message: `${error.message}\n${error.stack}` });
    }
    return;
  }
  if (!scene) return;
  if (m.type === 'frame') {
    latest = m; dtSum += m.dt;
    if (!pending) { pending = true; setTimeout(draw, 0); }
  }
  else if (m.type === 'resize') scene.resize(m.width, m.height);
  else if (m.type === 'night') scene.setNight(m.on);
  else if (m.type === 'burst') scene.burst(m.x, m.y, m.perfect);
  else if (m.type === 'reducedMotion') scene.reducedMotion = m.on;
};
