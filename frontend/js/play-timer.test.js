import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayTimer, formatElapsed } from './play-timer.js';

test('elapsed format shows whole seconds, 60 seconds and 125 seconds', () => {
  for (const [ms, text] of [[0,'00:00'],[999,'00:00'],[1000,'00:01'],
    [60000,'01:00'],[125000,'02:05'],[5999000,'99:59'],[6000000,'100:00']]) {
    assert.equal(formatElapsed(ms), text);
  }
});

test('timer measures clock differences even with no display ticks for 125 seconds', () => {
  let now = 8000; const timer = new PlayTimer(() => now);
  timer.start(); assert.equal(timer.text, '00:00');
  now += 1000; assert.equal(timer.text, '00:01');
  now += 59000; assert.equal(timer.text, '01:00');
  now += 65000; assert.equal(timer.text, '02:05');
  assert.equal(timer.elapsed, 125000);
});

test('stopping freezes the exact elapsed time and repeated stop is stable', () => {
  let now = 0; const timer = new PlayTimer(() => now); timer.start();
  now = 125750; assert.equal(timer.stop(), 125750);
  now += 60000; assert.equal(timer.elapsed, 125750); assert.equal(timer.text, '02:05');
  assert.equal(timer.stop(), 125750);
});

test('reset on early exit discards elapsed time until a fresh start', () => {
  let now = 0; const timer = new PlayTimer(() => now); timer.start();
  now = 20000; timer.reset(); assert.equal(timer.text, '00:00');
  now = 50000; assert.equal(timer.text, '00:00');
  timer.start(); assert.equal(timer.text, '00:00');
  now += 1000; assert.equal(timer.text, '00:01');
});

test('restart after completion measures a new session without carrying over the result', () => {
  let now = 0; const timer = new PlayTimer(() => now); timer.start();
  now = 125000; timer.stop(); assert.equal(timer.text, '02:05');
  now += 10000; timer.start(); assert.equal(timer.text, '00:00');
  now += 7000; assert.equal(timer.text, '00:07');
});
