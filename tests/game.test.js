import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame, makeGate, sensorInput, sensorAttitude, GATE_RADIUS, SPEED, GATE_SPACING } from '../src/game.js';
import { parseSample, LineBuffer } from '../src/serial.js';

const settings = { sensitivity:1, invertRoll:false, invertPitch:false, swapAxes:false };
test('parses firmware CSV, optional yaw and JSON without treating logs as angles',()=>{
  assert.deepEqual(parseSample('12.25,-6.50\r'),{roll:12.25,pitch:-6.5});
  assert.deepEqual(parseSample('1,2,3'),{roll:1,pitch:2});
  assert.deepEqual(parseSample('{"roll":-13,"pitch":4}'),{roll:-13,pitch:4});
  for(const line of ['', '# READY', 'NaN,0','Infinity,0','181,0','0,-181',',0','1,','null','{}','{"roll":null,"pitch":0}','{"roll":"2","pitch":0}','1,2,3,4,5,6','1,2,garbage']) assert.equal(parseSample(line),null,line);
});
test('serial framing handles chunk boundaries, CRLF and oversized corrupt lines',()=>{
  const framer = new LineBuffer();
  assert.deepEqual(framer.push('1.5,'),[]);
  assert.deepEqual(framer.push('2\r\n3,4\n5'),['1.5,2','3,4']);
  assert.deepEqual(framer.push(',6\n'),['5,6']);
  assert.deepEqual(framer.push('x'.repeat(4096)+'1,2\n7,8\n'),['7,8']);
  assert.equal(framer.buffer,'');
});
test('sensor zero, deadzone, clamping, inversion, swapping and wraparound',()=>{
  assert.deepEqual(sensorInput({roll:5,pitch:8},{roll:5,pitch:8},settings),{roll:0,pitch:0});
  assert.equal(sensorInput({roll:.9,pitch:0},{roll:0,pitch:0},settings).roll,0);
  assert.equal(sensorInput({roll:40,pitch:-50},{roll:0,pitch:0},settings).pitch,-1);
  assert.equal(sensorInput({roll:40,pitch:0},{roll:0,pitch:0},{...settings,invertRoll:true}).roll,-1);
  assert.equal(sensorInput({roll:40,pitch:0},{roll:0,pitch:0},{...settings,swapAxes:true}).pitch,1);
  const wrapped=sensorInput({roll:-179,pitch:0},{roll:179,pitch:0},settings);
  assert.ok(wrapped.roll>0&&wrapped.roll<.05);
});
test('pause freezes simulation and reset discards score/course state',()=>{
  const game=new FlightGame(); game.start(); game.update(.05,{roll:1,pitch:1}); game.pause();
  const before=JSON.stringify(game); game.update(.05,{roll:-1,pitch:-1}); assert.equal(JSON.stringify(game),before);
  game.resume(); game.update(.05); assert.ok(game.elapsed>.05);
  game.start('free'); assert.equal(game.elapsed,0); assert.equal(game.x,0); assert.equal(game.y,24); assert.equal(game.mode,'free');
});
test('first ring is reachable at neutral; center bonus is awarded exactly once',()=>{
  const game=new FlightGame();game.start();game.gates[0].z=-1;
  const events=game.update(.05);
  assert.equal(events[0].type,'hit');assert.equal(events[0].perfect,true);assert.equal(game.score,150);assert.equal(game.hits,1);
  game.update(.05);assert.equal(game.hits,1);
});
test('ring collision allows margin, rejects rim and resets combo',()=>{
  const game=new FlightGame();game.start();game.combo=7;game.x=GATE_RADIUS;
  game.gates[0].z=-1;
  assert.equal(game.update(.05)[0].type,'miss');assert.equal(game.combo,0);assert.equal(game.misses,1);
  game.x=5;game.gates[0].z=-1;
  const hit=game.update(.05)[0];assert.equal(hit.perfect,false);assert.equal(hit.points,100);
});
test('combo caps at five times and higher combos award more points',()=>{
  const game=new FlightGame();game.start();
  for(let i=0;i<20;i++) {game.gates[0].z=-1;game.update(.05);}
  assert.equal(game.multiplier,5);assert.ok(game.score>20*150);
});
test('a full run ends at exactly 90 seconds; course stays bounded and ordered',()=>{
  const game=new FlightGame();game.start();
  let finishCount=0;
  for(let i=0;i<6000;i++) {
    for(const e of game.update(1/60))if(e.type==='finish')finishCount++;
    assert.equal(game.gates.length,9);
    for(let j=1;j<9;j++)assert.ok(game.gates[j].z<game.gates[j-1].z);
  }
  assert.equal(game.status,'finished');assert.equal(game.elapsed,90);assert.equal(finishCount,1);
  assert.equal(game.hits+game.misses,19);
});
test('free flight stays active, input and flight envelope are bounded',()=>{
  const game=new FlightGame();game.start('free');
  for(let i=0;i<2200;i++)game.update(.05,{roll:9,pitch:9});
  assert.equal(game.status,'running');assert.equal(game.x,52);assert.equal(game.y,67);assert.equal(game.score,0);
  for(let i=0;i<1000;i++)game.update(.05,{roll:-9,pitch:-9});
  assert.equal(game.x,-52);assert.equal(game.y,8);
});
test('easy flight tuning keeps a five-second first ring and gentle steering',()=>{
  const game=new FlightGame();game.start();
  assert.equal(SPEED,24);
  assert.equal(game.gates[0].z,-120);
  assert.equal(-game.gates[0].z/SPEED,5);
  assert.ok(Math.abs(GATE_SPACING/SPEED-4.583333333333333)<1e-12);
  for(let i=0;i<99;i++) assert.equal(game.update(.05).length,0);
  assert.equal(game.hits+game.misses,0);
  const firstCrossing=game.update(.05);
  assert.equal(firstCrossing.length,1);
  assert.equal(firstCrossing[0].type,'hit');
  assert.equal(firstCrossing[0].perfect,true);
  assert.ok(Math.abs(game.elapsed-5)<1e-9);
  game.start('free');
  for(let i=0;i<200;i++)game.update(.05,{roll:1,pitch:1});
  assert.ok(Math.abs(game.vx-16)<1e-12);
  assert.ok(Math.abs(game.vy-12)<1e-12);
  for(let i=0;i<20;i++)game.update(.05);
  assert.ok(Math.abs(game.vx)<.2);
  assert.ok(Math.abs(game.vy)<.15);
});
test('course generation is deterministic and fits the playable envelope',()=>{
  for(let i=0;i<200;i++) { const gate=makeGate(i,-200); assert.ok(Math.abs(gate.x)<=27);assert.ok(gate.y>=12&&gate.y<=36);assert.deepEqual(gate,makeGate(i,-200)); }
});

test('a live sensor sets the plane\'s attitude itself, from true level, eased'), () => {
  const settings = { sensitivity: 1, invertRoll: false, invertPitch: false, swapAxes: false };
  const att = sensorAttitude({ roll: 20, pitch: -10 }, { roll: 0, pitch: 0 }, settings);
  assert.deepEqual(att, { roll: 20, pitch: -10 });
  const game = new FlightGame(); game.start('free');
  // eased (40 ms): a third of a second later it's there
  for (let i = 0; i < 20; i++) game.update(0.016, sensorInput({ roll: 20, pitch: -10 }, { roll: 0, pitch: 0 }, settings), att);
  assert.ok(Math.abs(game.roll - (-20 * Math.PI / 180)) < 1e-3);
  assert.ok(Math.abs(game.pitch - (-10 * Math.PI / 180)) < 1e-3);
  assert.deepEqual(sensorAttitude({ roll: 20, pitch: -10 }, { roll: 0, pitch: 0 }, { ...settings, swapAxes: true, invertRoll: true }), { roll: 10, pitch: 20 });
});
