import './style.css';
import { FlightGame, sensorInput, damp, SPEED, RUN_SECONDS } from './game.js';
import { SensorSerial } from './serial.js';
import { SensorDart } from './dart.js';
import { FlightScene } from './scene.js';

const $ = id => document.getElementById(id);
const game = new FlightGame();
// the tilt controller: a Dart USB-to-I2C bridge with an MPU6050 (WebUSB), or
// with ?serial the original firmware over Web Serial
const serial = new URLSearchParams(location.search).has('serial') ? new SensorSerial() : new SensorDart();
const keys = new Set();
const settings = { sensitivity:1, invertRoll:false, invertPitch:false, swapAxes:false };
let zero = { roll:0, pitch:0 }, selectedMode = 'rings';
let toastTimeout, feedbackTimeout, scene, lastTime = performance.now(), wasLive = false;
let needsZero = false, uiTime = 0, sceneTime = 0;
let smoothInput = { roll:0, pitch:0 };
let best = 0;
let runStats = { perfect:0, bestStreak:0 };
const chartGateNodes = Array.from({ length:5 }, () => {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('r', '3'); $('chart-gates').append(circle); return circle;
});
try { best = Math.max(0, Number(localStorage.getItem('skyflight-best')) || 0); } catch { /* Private browsing. */ }
try {
  const saved = JSON.parse(localStorage.getItem('skyflight-controller'));
  if(saved && typeof saved === 'object') {
    if(typeof saved.sensitivity === 'number' && saved.sensitivity >= .5 && saved.sensitivity <= 2) settings.sensitivity = saved.sensitivity;
    for(const key of ['invertRoll','invertPitch','swapAxes']) if(typeof saved[key] === 'boolean') settings[key] = saved[key];
  }
} catch { /* Optional preferences must never block flying. */ }

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').classList.remove('show'), 4300);
}
function clearFeedback() { clearTimeout(feedbackTimeout); $('feedback').classList.remove('show'); }
function feedback(title, subtitle, kind = 'hit') {
  $('feedback').dataset.kind = kind;
  $('feedback').replaceChildren(document.createTextNode(title));
  const small = document.createElement('small'); small.textContent = subtitle; $('feedback').append(small);
  $('feedback').classList.add('show');
  clearTimeout(feedbackTimeout); feedbackTimeout = setTimeout(() => $('feedback').classList.remove('show'), 1350);
}
function syncUI() {
  const menu = game.status === 'menu';
  document.body.classList.toggle('flying', !menu);
  document.body.dataset.status = game.status;
  $('intro').hidden = !menu;
  $('showcase-details').hidden = !menu;
  $('aircraft-label').hidden = !menu;
  $('game-hud').hidden = menu || game.status === 'finished';
  $('game-hud').inert = game.status !== 'running';
  $('combo-indicator').hidden = game.status !== 'running' || game.mode !== 'rings';
  $('run-progress-fill').parentElement.hidden = game.mode !== 'rings';
  $('course-hint').hidden = game.status !== 'running';
  $('pause-panel').hidden = game.status !== 'paused';
  $('result-panel').hidden = game.status !== 'finished';
  $('touch-controls').hidden = game.status !== 'running' || !matchMedia('(pointer:coarse)').matches;
  $('timer-label').textContent = game.mode === 'rings' ? 'TIME REMAINING' : 'FLIGHT TIME';
  $('course-text').textContent = game.mode === 'rings' ? 'FLY THROUGH THE GLOWING RINGS' : 'NO CLOCK. NO COURSE. JUST YOU AND THE COAST.';
  $('bottom-hint').textContent = menu ? 'A LITTLE TILT. A WHOLE NEW PERSPECTIVE.' : 'TILT TO STEER  /  C TO ZERO  /  P TO PAUSE';
  updateChart();
}
function start() {
  keys.clear(); smoothInput = { roll:0, pitch:0 }; clearFeedback();
  runStats = { perfect:0, bestStreak:0 };
  game.start(selectedMode); syncUI();
  // Move focus off the launch button so Space cannot accidentally restart a run.
  document.activeElement?.blur();
  toast(serial.live ? 'Tilt to steer. Your coast is calling.' : matchMedia('(pointer:coarse)').matches ? 'Hold the arrow buttons to steer. The sky is yours.' : 'WASD or arrow keys to steer. P to pause.');
}
function pause(reason = 'Your flight is paused. The sky can wait.') {
  if(game.status !== 'running') return;
  game.pause(); keys.clear(); clearFeedback();
  clearTimeout(toastTimeout); $('toast').classList.remove('show');
  $('pause-reason').textContent = reason;
  $('pause-distance').textContent = `${(game.distance / 1000).toFixed(2)} KM FLOWN`;
  syncUI(); $('resume-button').focus({ preventScroll:true });
}
function resume() { game.resume(); keys.clear(); lastTime = performance.now(); syncUI(); }
function finish() {
  const previousBest = best; best = Math.max(best, game.score);
  try { localStorage.setItem('skyflight-best', String(best)); } catch { /* No storage needed. */ }
  $('result-title').textContent = game.hits >= 15 ? 'Natural-born pilot.' : game.hits >= 7 ? 'Nice flying.' : 'The sky is yours.';
  $('result-copy').textContent = `${game.hits} ${game.hits === 1 ? 'ring' : 'rings'} collected · ${game.misses} missed · ${(game.distance / 1000).toFixed(1)} km flown`;
  $('result-score').textContent = game.score.toLocaleString();
  $('result-perfect').textContent = String(runStats.perfect).padStart(2, '0');
  $('result-streak').textContent = String(runStats.bestStreak).padStart(2, '0');
  const attempted = game.hits + game.misses;
  $('result-accuracy').textContent = `${attempted ? Math.round(game.hits / attempted * 100) : 0}%`;
  $('best-score').textContent = game.score > previousBest ? `NEW PERSONAL BEST · ${best.toLocaleString()}` : `PERSONAL BEST · ${best.toLocaleString()}`;
  clearFeedback(); syncUI(); $('again-button').focus();
}
function calibrate() {
  if(!serial.live) { toast('Connect a streaming MPU6050 first.'); return; }
  zero = { ...serial.sample }; smoothInput = { roll:0, pitch:0 };
  toast('Neutral position set. You’re ready to fly.');
}

for(const button of document.querySelectorAll('.mode')) button.addEventListener('click', () => {
  selectedMode = button.dataset.mode;
  for(const b of document.querySelectorAll('.mode')) { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }
  document.querySelector('.intro-details div span').textContent = selectedMode === 'rings' ? '90 seconds of a different perspective.' : 'No clock. No course. Just the coastline.';
});
$('start-button').addEventListener('click', start);
$('again-button').addEventListener('click', start);
$('pause-button').addEventListener('click', () => pause());
$('resume-button').addEventListener('click', resume);
for(const b of document.querySelectorAll('.return-home')) b.addEventListener('click', () => {
  game.status = 'menu'; game.reset(); keys.clear(); clearFeedback(); syncUI(); $('start-button').focus();
});

function openDialog(id) {
  pause('Controller settings are open. Resume when you’re ready.');
  keys.clear(); $(id).showModal();
}
$('settings-button').addEventListener('click', () => openDialog('settings-dialog'));
for(const id of ['help-button','guide-button']) $(id).addEventListener('click', () => openDialog('help-dialog'));
for(const b of document.querySelectorAll('.close-dialog')) b.addEventListener('click', () => b.closest('dialog').close());
for(const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', e => {
  if(e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
});
$('calibrate-button').addEventListener('click', calibrate);
$('sensitivity').value = settings.sensitivity;
$('sensitivity-value').textContent = `${settings.sensitivity.toFixed(1)}×`;
for(const [id,key] of [['invert-roll','invertRoll'],['invert-pitch','invertPitch'],['swap-axes','swapAxes']]) {
  $(id).checked = settings[key];
  $(id).addEventListener('change', () => { settings[key] = $(id).checked; saveSettings(); });
}
function saveSettings() { try { localStorage.setItem('skyflight-controller', JSON.stringify(settings)); } catch { /* Optional. */ } }
$('sensitivity').addEventListener('input', () => {
  settings.sensitivity = Number($('sensitivity').value); $('sensitivity-value').textContent = `${settings.sensitivity.toFixed(1)}×`; saveSettings();
});

$('connect-button').addEventListener('click', async () => {
  if(serial.connected) { openDialog('settings-dialog'); return; }
  pause('USB connection setup. Resume once the controller is ready.');
  needsZero = true;
  try { await serial.connect(); if(serial.connected) toast('Connected. Keep the sensor still while it calibrates.'); }
  catch(error) {
    if(error.name === 'NotFoundError') toast('No device selected. Keyboard controls are still ready.');
    else toast(error.message || 'Could not open serial port. Close other serial monitors and try again.');
  }
});
$('disconnect-button').addEventListener('click', async () => {
  pause('Controller disconnected. Resume with the keyboard, or reconnect.');
  await serial.disconnect(); toast('Controller disconnected. Keyboard controls are ready.');
});
serial.addEventListener('status', () => {
  $('connect-label').textContent = serial.connecting ? 'Connecting…' : serial.connected ? 'MPU6050 connected' : 'Connect MPU6050';
  $('connect-button').disabled = serial.connecting;
  $('connect-button').querySelector('.status-dot').classList.toggle('connected', serial.connected);
  $('disconnect-button').disabled = !serial.connected;
});
serial.addEventListener('error', e => toast(e.detail));
serial.addEventListener('sample', () => {
  if(needsZero) { zero = { ...serial.sample }; needsZero = false; toast('Tilt controller ready. Neutral position set automatically.'); }
});

const flightKeys = new Set(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
window.addEventListener('keydown', e => {
  if(document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if(e.target.matches('input,textarea,select')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if(flightKeys.has(key) && game.status === 'running') { e.preventDefault(); keys.add(key); }
  if(e.repeat) return;
  if(key === 'p' || key === 'Escape') { if(game.status === 'running') pause(); else if(game.status === 'paused') resume(); }
  if(key === 'c') calibrate();
});
window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => { keys.clear(); pause('Window out of focus. Your flight is safely paused.'); });
document.addEventListener('visibilitychange', () => { if(document.hidden) pause('Tab hidden. Your flight is safely paused.'); });
for(const button of document.querySelectorAll('[data-key]')) {
  button.addEventListener('pointerdown', e => { e.preventDefault(); clearTimeout(toastTimeout); $('toast').classList.remove('show'); button.setPointerCapture(e.pointerId); keys.add(button.dataset.key); });
  for(const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, () => keys.delete(button.dataset.key));
}
function getInput(dt) {
  const target = serial.live ? sensorInput(serial.sample, zero, settings) : {
    roll: Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft')),
    pitch: Number(keys.has('w') || keys.has('ArrowUp')) - Number(keys.has('s') || keys.has('ArrowDown')),
  };
  smoothInput.roll = damp(smoothInput.roll, target.roll, 12, dt);
  smoothInput.pitch = damp(smoothInput.pitch, target.pitch, 12, dt);
  return smoothInput;
}
function updateChart() {
  const menu = game.status === 'menu';
  const finished = game.status === 'finished';
  const rings = !menu && !finished && game.mode === 'rings';
  const upcoming = rings ? game.gates.filter(g => g.z < 0).slice(0, 5) : [];
  const px = menu ? 112 : 112 + game.x * .85;
  $('chart-plane').setAttribute('transform', `translate(${px.toFixed(1)} 85)`);
  $('chart-label').textContent = menu ? '01 / COASTAL EXPLORER' : finished ? 'FLIGHT LOG / COPPER COAST' : rings ? 'COURSE / NEXT FIVE RINGS' : 'FREE FLIGHT / COASTAL CRUISE';
  $('chart-detail').textContent = menu ? 'A SMALL ESCAPE, BY SCHEMATIK.' : rings ? `NEXT RING · ${String((upcoming[0]?.index ?? 0) + 1).padStart(2,'0')}` : `${(game.distance / 1000).toFixed(2)} KM · ${finished ? 'FLIGHT COMPLETE' : 'SIMULATED ROUTE'}`;
  $('next-gate-time').textContent = upcoming.length ? `${(-upcoming[0].z / SPEED).toFixed(1)}s` : finished ? '✓' : '↗';
  $('coast-chart').setAttribute('aria-label', rings ? `Course preview. Next ring in ${(-upcoming[0]?.z / SPEED || 0).toFixed(1)} seconds. Simulated route, not GPS.` : 'Illustrated coastal route, not GPS');
  const points = upcoming.map(g => [112 + g.x * .85, Math.max(8, 85 + g.z * .15)]);
  $('chart-route').setAttribute('d', menu ? 'M112 88 Q78 65 117 44 T111 8' : `M${px} 85 ${points.map(([x,y]) => `L${x} ${y}`).join(' ')}`);
  chartGateNodes.forEach((node, i) => {
    node.style.display = points[i] ? '' : 'none';
    if(points[i]) { node.setAttribute('cx', points[i][0]); node.setAttribute('cy', points[i][1]); }
  });
}
const angle = value => `${value < -.05 ? '−' : '+'}${Math.abs(value).toFixed(1).padStart(4,'0')}`;
function updateTelemetry(input) {
  const live = serial.live;
  if(wasLive && !live) { pause('Sensor data stopped. Check the USB connection, or resume using the keyboard.'); toast('No live sensor data. Flight paused; keyboard fallback is ready.'); }
  wasLive = live;
  $('input-label').textContent = live ? 'MPU6050 / LIVE TILT' : 'KEYBOARD CONTROL';
  $('input-rate').textContent = live ? `${serial.rate} HZ` : serial.connected ? 'NO SENSOR DATA' : game.status === 'running' ? 'ACTIVE' : 'STANDBY';
  $('input-dot').classList.toggle('connected', live);
  const roll = live ? serial.sample.roll - zero.roll : input.roll * 30;
  const pitch = live ? serial.sample.pitch - zero.pitch : input.pitch * 30;
  $('roll-value').innerHTML = `${angle(roll)}<small>°</small>`;
  $('pitch-value').innerHTML = `${angle(pitch)}<small>°</small>`;
  $('alt-value').innerHTML = `${Math.round(game.y).toString().padStart(3,'0')}<small>m</small>`;
  $('attitude-horizon').style.transform = `translateY(${input.pitch * 8}px) rotate(${-input.roll * 35}deg)`;
  $('score').textContent = game.score.toString().padStart(4,'0');
  $('run-progress-fill').style.transform = `scaleX(${game.remaining / RUN_SECONDS})`;
  $('game-hud').classList.toggle('ending', game.mode === 'rings' && game.remaining <= 15);
  $('combo-multiplier').textContent = `${game.multiplier}×`;
  $('combo-copy').textContent = game.combo ? `${String(game.combo).padStart(2,'0')} ${game.combo === 1 ? 'RING' : 'RINGS'} IN A ROW` : 'FIND YOUR FLOW';
  const pipCount = game.combo ? (game.combo - 1) % 3 + 1 : 0;
  [...$('combo-pips').children].forEach((pip, i) => pip.classList.toggle('filled', game.multiplier === 5 || i < pipCount));
  updateChart();
  const seconds = game.mode === 'rings' ? Math.ceil(game.remaining) : Math.floor(game.elapsed);
  $('timer').textContent = `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}`;
  $('rings').innerHTML = `${game.hits.toString().padStart(2,'0')} <small>/ ${(game.hits + game.misses).toString().padStart(2,'0')}</small>`;
  $('sensor-description').textContent = live ? `Streaming at ${serial.rate} Hz · neutral position set` : serial.connected ? 'Port open · waiting for valid roll,pitch data…' : 'No sensor connected · keyboard is ready';
  $('sensor-angles').textContent = live ? `ROLL ${angle(roll)}°   PITCH ${angle(pitch)}°` : 'ROLL —   PITCH —';
  $('calibrate-button').disabled = !live;
}

try { scene = new FlightScene($('world')); }
catch(error) {
  console.error(error);
  const panel = document.createElement('div'); panel.className = 'render-error';
  panel.textContent = 'This sky needs WebGL. Enable hardware acceleration in Chrome or Edge and reload. Your hardware does not need to be connected to try the game.';
  document.body.append(panel); $('start-button').disabled = true;
}
$('world').addEventListener('renderlost', () => { pause('Graphics connection lost. Reload this page to restore the sky.'); toast('WebGL context lost. Please reload the page.'); });
syncUI(); updateTelemetry(smoothInput);
function animate(now) {
  const dt = Math.min(Math.max(0,(now-lastTime)/1000),.05); lastTime = now;
  // Check stream health before moving the aircraft, not after a stale-input step.
  if(wasLive && !serial.live) updateTelemetry(smoothInput);
  const input = getInput(dt);
  for(const event of game.update(dt,input)) {
    if(event.type === 'hit') {
      if(event.perfect) runStats.perfect++;
      runStats.bestStreak = Math.max(runStats.bestStreak, game.combo);
      scene?.burst(event.x,event.y,event.perfect);
      feedback(`${event.perfect ? 'Perfect line' : 'Ring cleared'} +${event.points}`, `${event.multiplier}× MULTIPLIER · ${game.combo} IN A ROW`, event.perfect ? 'perfect' : 'hit');
    }
    if(event.type === 'miss') feedback('Next one is yours.', 'A FRESH LINE. A NEW CHANCE.', 'miss');
    if(event.type === 'finish') finish();
  }
  // Full-rate flight/live tilt; quieter idle rendering and no GPU work in hidden tabs.
  sceneTime += dt;
  const renderInterval = game.status === 'running' || serial.live ? 0 : game.status === 'menu' ? 1 / 30 : 1 / 15;
  if(!document.hidden && sceneTime + .001 >= renderInterval) {
    scene?.update(Math.min(sceneTime, .1),game,serial.live?input:null);
    sceneTime = 0;
  } else if(document.hidden) sceneTime = 0;
  uiTime += dt;
  if(uiTime>.08) { updateTelemetry(input); uiTime=0; }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
