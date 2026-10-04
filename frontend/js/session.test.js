import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOTAL_ROUNDS, PAIRS_PER_ROUND, MISMATCH_FEEDBACK_MS, createRoundPanels, GaborTouchSession
} from './session.js';
import {
  TEMPORARY_STANDARD_PATTERNS, getStandardPattern, getStandardPatternIndex
} from './standard-patterns.js';
import { PairFadeQueue, PAIR_FADE_MS } from './pair-fade-queue.js';

function seededRandom(seed = 12345) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function groups(game) {
  return [...Map.groupBy(game.panels, panel => panel.pairId).values()];
}

function finishRound(game) {
  for (const [a, b] of groups(game)) {
    assert.equal(game.select(a.id), 'first');
    game.select(b.id);
  }
}

test('1000 generated rounds each contain 12 unique panels and exactly six duplicated types', () => {
  const random = seededRandom();
  for (let round = 1; round <= 1000; round++) {
    const panels = createRoundPanels(round, random);
    assert.equal(panels.length, 12);
    assert.equal(new Set(panels.map(panel => panel.id)).size, 12);
    const pairs = Map.groupBy(panels, panel => panel.pairId);
    assert.equal(pairs.size, PAIRS_PER_ROUND);
    for (const copies of pairs.values()) assert.equal(copies.length, 2);
    assert.ok(panels.every(panel => !panel.matched));
  }
});

test('shuffle generates varied arrangements rather than paired source order', () => {
  const random = seededRandom();
  const arrangements = new Set();
  for (let round = 1; round <= 30; round++) {
    arrangements.add(createRoundPanels(round, random).map(panel => panel.pairId).join(','));
  }
  assert.ok(arrangements.size > 20);
});

test('a repeated tap on the first panel never counts as a pair', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const id = game.panels[0].id;
  assert.equal(game.select(id), 'first');
  for (let i = 0; i < 100; i++) assert.equal(game.select(id), 'ignored');
  assert.deepEqual(game.selectedIds, [id]);
  assert.equal(game.matchedPairs, 0);
  assert.equal(game.advanceRound(), false);
  assert.equal(game.select('unknown-panel'), 'ignored');
});

test('pair spacing reduces adjacent pairs and increases distance without losing varied layouts', t => {
  function measures(ids) {
    const pairs = Map.groupBy(ids.map((id,index) => ({id,index})), p => p.id);
    let adjacent = 0, distance = 0;
    for (const [a,b] of pairs.values()) {
      const d = Math.abs(Math.floor(a.index/3)-Math.floor(b.index/3)) + Math.abs(a.index%3-b.index%3);
      adjacent += Number(d === 1); distance += d;
    }
    return { adjacent, distance };
  }
  const totals = { plainAdjacent:0, spacedAdjacent:0, plainDistance:0, spacedDistance:0 };
  const arrangements = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    const random = seededRandom(seed);
    const plain = getStandardPattern(1).patches.flatMap(p => [p.id,p.id]);
    for (let i = plain.length-1; i > 0; i--) {
      const j = Math.floor(random()*(i+1)); [plain[i],plain[j]] = [plain[j],plain[i]];
    }
    const spaced = createRoundPanels(1,seededRandom(seed)).map(p => p.pairId);
    const a = measures(plain), b = measures(spaced);
    totals.plainAdjacent += a.adjacent; totals.spacedAdjacent += b.adjacent;
    totals.plainDistance += a.distance; totals.spacedDistance += b.distance;
    arrangements.add(spaced.join(','));
  }
  assert.ok(totals.spacedAdjacent < totals.plainAdjacent * .5, 'Direct neighbors become substantially less frequent');
  assert.ok(totals.spacedDistance > totals.plainDistance, 'Pairs are farther apart overall');
  assert.ok(arrangements.size > 900, 'The result retains varied randomized layouts');
  t.diagnostic(JSON.stringify({...totals,distinctArrangements:arrangements.size}));
});

test('spacing uses exactly ten candidates even with constant RNG and repeated arrangements', () => {
  for (const value of [0,.5,.999999]) {
    let calls = 0;
    const random = () => { calls++; return value; };
    const first = createRoundPanels(1,random);
    assert.equal(calls,110);
    const next = createRoundPanels(7,random,first.map(p=>p.pairId));
    assert.equal(calls,220);
    assert.notDeepEqual(next.map(p=>p.pairId),first.map(p=>p.pairId));
    assert.equal(new Set(next.map(p=>p.id)).size,12);
    assert.ok([...Map.groupBy(next,p=>p.pairId).values()].every(pair=>pair.length===2));
  }
});

test('an unmatched panel becomes the next first selection while a matched pair is still fading', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const [[a,b],[next]] = groups(game);
  let finishFade, delay;
  const fades = new PairFadeQueue({onChange:()=>{},onIdle:()=>{},clearTimer:()=>{},
    setTimer:(callback,ms)=>{finishFade=callback;delay=ms;return 1;}});
  game.select(a.id); assert.equal(game.select(b.id),'match');
  fades.enqueue([a.id,b.id]);
  assert.equal(delay,800); assert.equal(delay,PAIR_FADE_MS);
  assert.equal(game.status,'playing');
  assert.deepEqual(fades.active,[a.id,b.id]);
  assert.equal(fades.clearedIds.size,0);
  assert.equal(game.select(next.id),'first');
  assert.deepEqual(game.selectedIds,[next.id]);
  assert.equal(game.select(a.id),'ignored');
  finishFade();
  assert.deepEqual(game.selectedIds,[next.id]);
  assert.equal(game.status,'playing');
});

test('mismatch locks rapid input until cleared and preserves positions', () => {
  assert.equal(MISMATCH_FEEDBACK_MS,50);
  const game = new GaborTouchSession(seededRandom()); game.start();
  const [[a], [b], [c]] = groups(game);
  const order = game.panels.map(panel => panel.id);
  game.select(a.id);
  assert.equal(game.select(b.id), 'mismatch');
  for (let i = 0; i < 100; i++) assert.equal(game.select(c.id), 'ignored');
  assert.deepEqual(game.selectedIds, [a.id, b.id]);
  assert.equal(game.matchedPairs, 0);
  assert.equal(game.advanceRound(), false);
  assert.equal(game.resolveMismatch(), true);
  assert.equal(game.resolveMismatch(), false);
  assert.deepEqual(game.selectedIds, [a.id]);
  assert.equal(game.status, 'playing');
  assert.deepEqual(game.panels.map(panel => panel.id), order);
});

test('matching marks precisely two panels; both refuse repeated selection', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const [a, b] = groups(game)[0];
  const order = game.panels.map(panel => panel.id);
  game.select(a.id);
  assert.equal(game.select(b.id), 'match');
  assert.equal(game.matchedPairs, 1);
  assert.equal(game.panels.filter(panel => panel.matched).length, 2);
  assert.equal(game.select(a.id), 'ignored');
  assert.equal(game.select(b.id), 'ignored');
  assert.deepEqual(game.selectedIds, []);
  assert.deepEqual(game.panels.map(panel => panel.id), order);
});

test('five pairs cannot advance; the sixth locks the board for round transition', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const pairs = groups(game);
  for (const [a, b] of pairs.slice(0, 5)) { game.select(a.id); game.select(b.id); }
  assert.equal(game.matchedPairs, 5);
  assert.equal(game.round, 1);
  assert.equal(game.status, 'playing');
  assert.equal(game.advanceRound(), false);
  game.select(pairs[5][0].id);
  assert.equal(game.select(pairs[5][1].id), 'round-complete');
  assert.equal(game.status, 'round-complete');
  assert.equal(game.panels.filter(panel => panel.matched).length, 12);
  assert.equal(game.select(pairs[0][0].id), 'ignored');
  assert.equal(game.advanceRound(), true);
  assert.equal(game.round, 2);
  assert.equal(game.matchedPairs, 0);
});

test('COMPLETE requires all 72 pairs across exactly 12 rounds, with no Round 13', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  let totalPairs = 0;
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    assert.equal(game.round, round);
    assert.equal(game.status, 'playing');
    assert.equal(game.advanceRound(), false);
    finishRound(game);
    totalPairs += game.matchedPairs;
    assert.equal(game.status, 'round-complete');
    assert.equal(game.advanceRound(), true);
    assert.equal(game.status, round === TOTAL_ROUNDS ? 'complete' : 'playing');
  }
  assert.equal(totalPairs, 72);
  assert.equal(game.round, 12);
  assert.equal(game.advanceRound(), false);
  assert.equal(game.select(game.panels[0].id), 'ignored');
});

test('restart clears completion, selection, and every matched flag', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  for (let i = 0; i < TOTAL_ROUNDS; i++) { finishRound(game); game.advanceRound(); }
  game.start();
  assert.equal(game.round, 1);
  assert.equal(game.status, 'playing');
  assert.equal(game.matchedPairs, 0);
  assert.deepEqual(game.selectedIds, []);
  assert.equal(game.panels.length, 12);
  assert.ok(game.panels.every(panel => !panel.matched));
  const [a, b] = groups(game)[0];
  game.select(a.id);
  assert.equal(game.select(b.id), 'match');
});

test('starting again during mismatch resets state without accepting a stale resolution', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const [[a], [b]] = groups(game);
  game.select(a.id); game.select(b.id);
  game.start();
  assert.equal(game.resolveMismatch(), false);
  assert.deepEqual(game.selectedIds, []);
  assert.equal(game.matchedPairs, 0);
});

test('stop discards selection, matches, mismatch, and pending round transition', () => {
  for (const state of ['selected', 'matched', 'mismatch', 'round-complete']) {
    const game = new GaborTouchSession(seededRandom()); game.start();
    const [[a, b], [c]] = groups(game);
    game.select(a.id);
    if (state === 'matched') game.select(b.id);
    if (state === 'mismatch') game.select(c.id);
    if (state === 'round-complete') {
      game.select(b.id);
      for (const [first, second] of groups(game).slice(1)) {
        game.select(first.id); game.select(second.id);
      }
    }
    game.stop();
    assert.equal(game.round, 0);
    assert.equal(game.status, 'idle');
    assert.equal(game.matchedPairs, 0);
    assert.deepEqual(game.panels, []);
    assert.deepEqual(game.selectedIds, []);
    assert.equal(game.select(a.id), 'ignored');
    assert.equal(game.resolveMismatch(), false);
    assert.equal(game.advanceRound(), false);
    game.start();
    assert.equal(game.round, 1);
    assert.equal(game.status, 'playing');
    assert.ok(game.panels.every(panel => !panel.matched));
  }
});

test('stopping in Round 1, 6, or 12 returns to idle and restarts from Round 1', () => {
  for (const target of [1, 6, 12]) {
    const game = new GaborTouchSession(seededRandom()); game.start();
    while (game.round < target) { finishRound(game); game.advanceRound(); }
    assert.equal(game.round, target);
    game.stop();
    assert.equal(game.status, 'idle');
    assert.equal(game.round, 0);
    game.start();
    assert.equal(game.round, 1);
    assert.equal(game.matchedPairs, 0);
    assert.deepEqual(game.selectedIds, []);
  }
});

test('12 rounds use six pattern sets in fixed order twice, ending only after Pattern 6', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const sequence = [];
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    sequence.push(getStandardPatternIndex(game.round) + 1);
    assert.strictEqual(getStandardPattern(round), TEMPORARY_STANDARD_PATTERNS[(round - 1) % 6]);
    assert.deepEqual(new Set(game.panels.map(p => p.pairId)), new Set(getStandardPattern(round).patches.map(p => p.id)));
    finishRound(game); game.advanceRound();
    assert.equal(game.status, round === 12 ? 'complete' : 'playing');
  }
  assert.deepEqual(sequence, [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
});

test('each provisional pattern has six distinct, immutable full parameter sets', () => {
  assert.equal(TEMPORARY_STANDARD_PATTERNS.length, 6);
  assert.equal(new Set(TEMPORARY_STANDARD_PATTERNS.map(p => p.backgroundRGB.join(','))).size, 6);
  for (const pattern of TEMPORARY_STANDARD_PATTERNS) {
    assert.equal(pattern.patches.length, 6);
    assert.equal(new Set(pattern.patches.map(({ id, ...params }) => JSON.stringify(params))).size, 6);
    assert.ok(new Set(pattern.patches.map(p => p.lambda)).size > 1);
    assert.ok(new Set(pattern.patches.map(p => p.sigma)).size > 1);
    assert.ok(Object.isFrozen(pattern) && Object.isFrozen(pattern.patches));
    for (const patch of pattern.patches) {
      for (const key of ['theta', 'lambda', 'psi', 'contrast', 'sizeInDegrees', 'sigma', 'gamma']) assert.ok(Number.isFinite(patch[key]));
      assert.ok(patch.lambda > 0 && patch.sigma > 0 && patch.gamma > 0);
      assert.ok(patch.contrast > 0 && patch.contrast <= 1);
      assert.ok(Object.isFrozen(patch));
    }
  }
});

test('repeated patterns receive new arrangements even if RNG repeats identical output', () => {
  for (const random of [seededRandom(), () => 0]) {
    const game = new GaborTouchSession(random); game.start();
    const firstSet = [];
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      const arrangement = game.panels.map(panel => panel.pairId);
      if (round <= 6) firstSet.push(arrangement);
      else assert.notDeepEqual(arrangement, firstSet[round - 7]);
      assert.equal(Map.groupBy(game.panels, p => p.pairId).size, 6);
      finishRound(game); game.advanceRound();
    }
    game.stop();
    assert.equal(game.roundArrangements.size, 0);
    game.start();
    assert.equal(game.roundArrangements.size, 1);
  }
});

test('two wrong second choices keep the original first panel until its true partner matches', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const [[a, partner], [b], [c], [next]] = groups(game);
  const order = game.panels.map(p => p.id);
  game.select(a.id);
  for (const wrong of [b, c]) {
    assert.equal(game.select(wrong.id), 'mismatch');
    assert.equal(game.select(next.id), 'ignored');
    assert.equal(game.resolveMismatch(), true);
    assert.deepEqual(game.selectedIds, [a.id]);
    assert.equal(game.select(a.id), 'ignored');
    assert.ok(game.panels.every(p => !p.matched));
  }
  assert.equal(game.select(partner.id), 'match');
  assert.deepEqual(game.selectedIds, []);
  assert.deepEqual(game.panels.filter(p => p.matched).map(p => p.id).sort(), [a.id, partner.id].sort());
  assert.equal(game.select(next.id), 'first');
  assert.deepEqual(game.selectedIds, [next.id]);
  assert.deepEqual(game.panels.map(p => p.id), order);
});

test('stopping after mismatch resolution clears the retained first panel', () => {
  const game = new GaborTouchSession(seededRandom()); game.start();
  const [[a], [b]] = groups(game);
  game.select(a.id); game.select(b.id); game.resolveMismatch();
  assert.deepEqual(game.selectedIds, [a.id]);
  game.stop(); game.start();
  assert.deepEqual(game.selectedIds, []);
  assert.equal(game.matchedPairs, 0);
});
