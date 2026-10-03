import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackAudio } from './feedback-audio.js';

function context(state = 'running') {
  const ctx = { state, currentTime: 10, destination: {}, oscillators: [], gains: [],
    resumeCalls: 0,
    resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); },
    createOscillator() {
      const osc = { frequency: { setValueAtTime: (v, t) => { osc.frequencyValue = v; osc.frequencyTime = t; } },
        connect: target => { osc.target = target; }, disconnect: () => { osc.disconnected = true; },
        start: time => { osc.started = time; }, stop: time => { osc.stops.push(time); }, stops: [] };
      ctx.oscillators.push(osc); return osc;
    },
    createGain() {
      const gain = { gain: {
        setValueAtTime: (v, t) => { gain.value = v; gain.time = t; },
        linearRampToValueAtTime: (v, t) => { gain.peak = v; gain.attackEnd = t; },
        exponentialRampToValueAtTime: (v, t) => { gain.tail = v; gain.end = t;
          if (v > 0.0001) { gain.sustain = v; gain.sustainEnd = t; } },
        cancelScheduledValues: () => { gain.cancelled = true; }
      }, connect: target => { gain.target = target; }, disconnect: () => { gain.disconnected = true; } };
      ctx.gains.push(gain); return gain;
    }
  };
  return ctx;
}

test('context is created only on a gesture, resumed and reused across feedback and sessions', async () => {
  const ctx = context('suspended'); let constructions = 0;
  const audio = new FeedbackAudio(() => { constructions++; return ctx; });
  assert.equal(constructions, 0);
  audio.unlock(); await Promise.resolve();
  assert.equal(ctx.resumeCalls, 1);
  audio.playSuccess(); audio.playFailure(); audio.stop(); audio.unlock(); audio.playSuccess();
  assert.equal(constructions, 1);
});

test('success is a short E5 ding and a longer C5 dong, each with four decaying partials', () => {
  const ctx = context(); const audio = new FeedbackAudio(() => ctx);
  audio.playSuccess();
  assert.deepEqual(ctx.oscillators.map(o => o.frequencyValue), [659.25, 1318.5, 1977.75, 659.25 * 2.76,
    523.25, 1046.5, 1569.75, 523.25 * 2.76]);
  assert.ok(ctx.oscillators.every(o => o.type === 'sine'));
  assert.equal(ctx.oscillators[0].started, 10);
  assert.equal(ctx.oscillators[4].started, 10.30);
  assert.ok(Math.max(...ctx.oscillators.map(o => o.stops[0])) <= 11.01);
  assert.deepEqual(ctx.gains.map(g => g.peak), [0.20, 0.05, 0.025, 0.008, 0.20, 0.05, 0.025, 0.008]);
  assert.ok(ctx.gains.every(g => g.tail === 0.0001));
});

test('failure is two audible low square pulses distinct from success', () => {
  const ctx = context(); const audio = new FeedbackAudio(() => ctx);
  audio.playFailure();
  assert.deepEqual(ctx.oscillators.map(o => o.frequencyValue), [220, 220]);
  assert.ok(ctx.oscillators.every(o => o.type === 'square'));
  assert.ok(Math.max(...ctx.oscillators.map(o => o.stops[0])) <= 10.46);
  assert.ok(ctx.gains.every(g => g.peak === 0.16));
});

test('stop silences and disconnects both current and scheduled voices immediately', () => {
  const ctx = context(); const audio = new FeedbackAudio(() => ctx);
  audio.playSuccess(); audio.stop();
  assert.equal(audio.voices.size, 0);
  assert.ok(ctx.oscillators.every(o => o.stops.includes(undefined) && o.disconnected && o.onended === null));
  assert.ok(ctx.gains.every(g => g.cancelled && g.value === 0 && g.disconnected));
  assert.doesNotThrow(() => audio.stop());
});

test('a late resume cannot play an ended session or overwrite a newer answer', async () => {
  const ctx = context('suspended'); const completions = [];
  ctx.resume = () => new Promise(resolve => completions.push(resolve));
  const audio = new FeedbackAudio(() => ctx);
  audio.playSuccess(); audio.stop(); audio.playFailure();
  ctx.state = 'running';
  completions[0](); await Promise.resolve();
  assert.equal(ctx.oscillators.length, 0);
  completions[1](); await Promise.resolve();
  assert.deepEqual(ctx.oscillators.map(o => o.frequencyValue), [220, 220]);
  audio.stop(); assert.equal(audio.voices.size, 0);
});

test('new feedback cancels previous voices rather than accumulating volume', () => {
  const ctx = context(); const audio = new FeedbackAudio(() => ctx);
  audio.playSuccess(); const old = [...audio.voices]; audio.playFailure();
  assert.equal(audio.voices.size, 2);
  assert.ok(old.every(v => v.oscillator.disconnected && v.gain.value === 0));
  for (const voice of [...audio.voices]) voice.oscillator.onended();
  assert.equal(audio.voices.size, 0);
});

test('missing API, constructor failure, resume rejection and closed context remain silent without throwing', async () => {
  for (const factory of [() => null, () => { throw new Error('unavailable'); },
    () => ({ state: 'closed' }), () => ({ state: 'suspended', resume: () => Promise.reject(new Error('blocked')) }),
    () => ({ state: 'suspended', resume: () => { throw new Error('blocked'); } })]) {
    const audio = new FeedbackAudio(factory);
    assert.doesNotThrow(() => { audio.unlock(); audio.playSuccess(); audio.playFailure(); audio.stop(); });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(audio.voices.size, 0);
  }
});

test('node creation or connection failures clean up and do not escape to game handlers', () => {
  for (const fail of ['createGain', 'connect']) {
    const ctx = context();
    if (fail === 'createGain') ctx.createGain = () => { throw new Error('audio failed'); };
    else ctx.destination = null, ctx.createGain = () => ({ gain: { setValueAtTime() {},
      linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() { throw new Error('audio failed'); }, disconnect() {} });
    const audio = new FeedbackAudio(() => ctx);
    assert.doesNotThrow(() => audio.playSuccess());
    assert.equal(audio.voices.size, 0);
  }
});

test('chime naturally decays while the unchanged failure buzzer retains its original envelope', () => {
  const ctx = context(); const audio = new FeedbackAudio(() => ctx);
  audio.playSuccess(); audio.playFailure();
  for (const [i, gain] of ctx.gains.entries()) {
    assert.equal(gain.sustain, gain.peak * (i < 8 ? 0.12 : 0.75));
    assert.ok(gain.sustainEnd > gain.attackEnd && gain.sustainEnd < gain.end);
    assert.ok(gain.peak < 0.3);
  }
});

test('success notes have a silent gap, a longer second note and combined gain headroom', () => {
  const ctx = context(); new FeedbackAudio(() => ctx).playSuccess();
  const [ding, overtone, , , dong] = ctx.oscillators;
  assert.ok(dong.started - ding.stops[0] >= 0.05);
  assert.ok(dong.stops[0] - dong.started > 3 * (ding.stops[0] - ding.started));
  assert.equal(overtone.started, ding.started);
  assert.ok(ctx.gains.slice(0, 4).reduce((sum, g) => sum + g.peak, 0) < 0.3);
});

test('failure is two separated 220Hz buzzes with a longer second pulse', () => {
  const ctx = context(); new FeedbackAudio(() => ctx).playFailure();
  const [first, second] = ctx.oscillators;
  assert.ok(second.started - first.stops[0] >= 0.06);
  assert.ok(second.stops[0] - second.started > first.stops[0] - first.started);
  assert.ok(ctx.oscillators.every(o => o.frequencyValue < 523.25));
});

test('success partials have a short attack and higher partials decay before the fundamental', () => {
  const ctx = context(); new FeedbackAudio(() => ctx).playSuccess();
  for (const offset of [0, 4]) {
    const fundamental = ctx.oscillators[offset];
    for (const overtone of ctx.oscillators.slice(offset + 1, offset + 4)) {
      assert.equal(overtone.started, fundamental.started);
      assert.ok(overtone.stops[0] < fundamental.stops[0]);
    }
    assert.ok(Math.abs(ctx.gains[offset].attackEnd - fundamental.started - 0.003) < 1e-8);
    assert.equal(ctx.gains[offset].sustain, ctx.gains[offset].peak * 0.12);
  }
});

test('minute notice is one audible 1100ms note with decaying partials on the reused context', () => {
  const ctx = context(); let created = 0;
  const audio = new FeedbackAudio(() => { created++; return ctx; });
  audio.unlock(); audio.playMinuteNotice();
  assert.equal(created, 1);
  assert.deepEqual(ctx.oscillators.map(o => o.frequencyValue), [392, 784, 1081.92]);
  assert.ok(ctx.oscillators.every(o => o.type === 'sine' && o.started === 10));
  assert.ok(Math.abs(ctx.oscillators[0].stops[0] - 11.10) < 1e-8);
  assert.deepEqual(ctx.gains.map(g=>g.peak),[.36,.065,.015]);
  assert.ok(ctx.gains.reduce((sum,g) => sum + g.peak, 0) < 0.5);
  assert.ok(ctx.gains.every(g => g.sustain === g.peak * 0.16));
  assert.ok(ctx.gains.every(g => Math.abs(g.attackEnd-10-.004)<1e-8));
  audio.stop(); assert.equal(audio.voices.size, 0);
});

test('minute notice cannot survive exit or an old suspended resume, and audio failure stays safe', async () => {
  const ctx = context('suspended'); let resume;
  ctx.resume = () => new Promise(resolve => { resume = resolve; });
  const audio = new FeedbackAudio(() => ctx); audio.playMinuteNotice(); audio.stop();
  ctx.state = 'running'; resume(); await Promise.resolve();
  assert.equal(ctx.oscillators.length, 0);
  for (const factory of [() => null, () => { throw Error('unavailable'); },
    () => ({ state: 'suspended', resume: () => Promise.reject(Error('blocked')) })]) {
    const unavailable = new FeedbackAudio(factory);
    assert.doesNotThrow(() => unavailable.playMinuteNotice());
    await Promise.resolve(); await Promise.resolve();
    assert.equal(unavailable.voices.size, 0);
  }
});
