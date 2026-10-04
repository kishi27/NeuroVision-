import test from 'node:test';
import assert from 'node:assert/strict';
import { PairFadeQueue, PAIR_FADE_MS, FINAL_FADE_MS } from './pair-fade-queue.js';

function fixture() {
  let now = 0, nextId = 0;
  const tasks = new Map(), events = [];
  const queue = new PairFadeQueue({
    setTimer(callback, delay) {
      const id = ++nextId;
      tasks.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer: id => tasks.delete(id),
    onChange: () => events.push({ time: now, active: queue.active?.slice() ?? null,
      cleared: [...queue.clearedIds] }),
    onIdle: () => events.push({ time: now, idle: true })
  });
  function advance(ms) {
    const until = now + ms;
    while (tasks.size) {
      const [id, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (task.at > until) break;
      now = task.at; tasks.delete(id); task.callback();
    }
    now = until;
  }
  return { queue, tasks, events, advance };
}

test('one matched pair starts fading immediately but clears only after 800ms', () => {
  const f = fixture(); f.queue.enqueue(['a1', 'a2']);
  assert.equal(PAIR_FADE_MS, 800);
  assert.deepEqual(f.queue.active, ['a1', 'a2']);
  assert.equal(f.queue.clearedIds.size, 0);
  f.advance(799); assert.equal(f.queue.clearedIds.size, 0);
  f.advance(1); assert.deepEqual([...f.queue.clearedIds], ['a1', 'a2']);
  assert.equal(f.queue.active, null); assert.equal(f.tasks.size, 0);
  assert.deepEqual(f.events.at(-1), { time: 800, idle: true });
});

test('a second matched pair waits intact while the first pair fades', () => {
  const f = fixture(); f.queue.enqueue(['a1', 'a2']); f.advance(200);
  const ids = ['b1', 'b2']; f.queue.enqueue(ids); ids[0] = 'changed';
  assert.deepEqual(f.queue.pending, [['b1', 'b2']]);
  assert.deepEqual(f.queue.active, ['a1', 'a2']); assert.equal(f.tasks.size, 1);
  f.advance(600); assert.deepEqual(f.queue.active, ['b1', 'b2']);
  assert.deepEqual([...f.queue.clearedIds], ['a1', 'a2']);
  f.advance(800); assert.equal(f.queue.clearedIds.size, 4);
});

test('three rapid matches fade in FIFO order with exactly one active timer', () => {
  const f = fixture();
  for (const pair of ['a', 'b', 'c']) f.queue.enqueue([`${pair}1`, `${pair}2`]);
  for (const pair of ['a', 'b', 'c']) {
    assert.deepEqual(f.queue.active, [`${pair}1`, `${pair}2`]);
    assert.equal(f.tasks.size, 1); f.advance(800);
  }
  assert.deepEqual(f.events.filter(e => e.active).map(e => e.active[0]), ['a1', 'b1', 'c1']);
  assert.equal(f.queue.clearedIds.size, 6);
});

test('ordinary enqueue alone remains FIFO and notifies idle only after all fades', () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) f.queue.enqueue([`${i}a`, `${i}b`]);
  f.advance(4799);
  assert.equal(f.queue.clearedIds.size, 10);
  assert.equal(f.events.some(e => e.idle), false);
  f.advance(1);
  assert.equal(f.queue.clearedIds.size, 12);
  assert.deepEqual(f.events.at(-1), { time: 4800, idle: true });
});

test('reset cancels an active fade and discards all queued and cleared ids', () => {
  const f = fixture();
  f.queue.enqueue(['a1', 'a2']); f.queue.enqueue(['b1', 'b2']);
  f.advance(800); f.queue.enqueue(['c1', 'c2']);
  f.queue.reset();
  assert.equal(f.queue.active, null); assert.deepEqual(f.queue.pending, []);
  assert.equal(f.queue.clearedIds.size, 0); assert.equal(f.tasks.size, 0);
  const count = f.events.length; f.advance(10000); assert.equal(f.events.length, count);
});

test('an already queued stale callback cannot clear or advance a restarted queue', () => {
  const f = fixture(); f.queue.enqueue(['old1', 'old2']);
  const stale = [...f.tasks.values()][0].callback;
  f.queue.reset(); f.queue.enqueue(['new1', 'new2']);
  const count = f.events.length;
  stale();
  assert.equal(f.events.length, count);
  assert.deepEqual(f.queue.active, ['new1', 'new2']);
  assert.equal(f.queue.clearedIds.size, 0);
  f.advance(800); assert.deepEqual([...f.queue.clearedIds], ['new1', 'new2']);
});

test('a later match after an empty queue starts its own full fade', () => {
  const f = fixture(); f.queue.enqueue(['a1', 'a2']); f.advance(800);
  f.queue.enqueue(['b1', 'b2']); f.advance(799);
  assert.deepEqual([...f.queue.clearedIds], ['a1', 'a2']);
  f.advance(1); assert.equal(f.queue.clearedIds.size, 4);
});

test('finish bypasses all FIFO waits and clears every remaining cell after 600ms', () => {
  const f = fixture(); const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  for (let i = 0; i < 10; i += 2) f.queue.enqueue(ids.slice(i, i + 2));
  f.advance(300); f.queue.finish(ids);
  assert.equal(FINAL_FADE_MS, 600); assert.equal(f.queue.finishing, true);
  assert.deepEqual(f.queue.pending, []); assert.equal(f.tasks.size, 1);
  f.advance(599); assert.equal(f.queue.clearedIds.size, 0);
  f.advance(1); assert.equal(f.queue.clearedIds.size, 12);
  assert.deepEqual(f.events.at(-1), { time: 900, idle: true });
});

test('an old normal fade callback cannot clear the new fast finishing board', () => {
  const f = fixture(); f.queue.enqueue(['a1', 'a2']);
  const old = [...f.tasks.values()][0].callback;
  f.queue.finish(['a1', 'a2', 'b1', 'b2']); old();
  assert.equal(f.queue.clearedIds.size, 0); assert.equal(f.tasks.size, 1);
  f.advance(600); assert.equal(f.queue.clearedIds.size, 4);
  assert.equal(f.events.filter(e => e.idle).length, 1);
});

test('exit during fast finishing invalidates its callback and resets the queue', () => {
  const f = fixture(); f.queue.finish(['old1', 'old2']);
  const old = [...f.tasks.values()][0].callback;
  f.queue.reset(); f.queue.enqueue(['new1', 'new2']); old();
  assert.equal(f.queue.finishing, false); assert.equal(f.queue.clearedIds.size, 0);
  assert.deepEqual(f.queue.active, ['new1', 'new2']);
  f.advance(800); assert.deepEqual([...f.queue.clearedIds], ['new1', 'new2']);
});
