import { drawGaborPatch } from './gabor.js';
import { getStandardPattern, getStandardPatternIndex, createStandardRoundPattern, selectionSignature } from './standard-patterns.js';
import { feedbackAudio } from './feedback-audio.js';
import { PairFadeQueue, PAIR_FADE_MS, FINAL_FADE_MS } from './pair-fade-queue.js';
import { PlayTimer } from './play-timer.js';

export const TOTAL_ROUNDS = 12;
export const PAIRS_PER_ROUND = 6;
export const MISMATCH_FEEDBACK_MS = 50;

export function createRoundPanels(round, random = Math.random, previousArrangement) {
  const panels = getStandardPattern(round).patches.flatMap(({ id }) =>
    [0, 1].map(copy => ({ id: `round-${round}-${id}-${copy}`, pairId: id, matched: false }))
  );
  let bestPanels, bestScore = -Infinity;
  // Ten bounded Fisher-Yates candidates, generated only at round creation.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = [...panels];
    for (let i = candidate.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
    }
    const positions = new Map();
    let score = 0;
    candidate.forEach((panel, index) => {
      const first = positions.get(panel.pairId);
      if (first === undefined) positions.set(panel.pairId, index);
      else {
        const distance = Math.abs(Math.floor(first / 3) - Math.floor(index / 3))
          + Math.abs(first % 3 - index % 3);
        // Prefer overall separation; discourage direct horizontal/vertical neighbors.
        score += distance - (distance === 1 ? 12 : 0);
      }
    });
    if (score > bestScore) { bestScore = score; bestPanels = candidate; }
  }
  // A rare identical repeat must not reuse the first set's visible arrangement.
  // Rotate once rather than retrying forever with a deterministic test RNG.
  if (previousArrangement?.every((pairId, index) => pairId === bestPanels[index].pairId)) {
    bestPanels.push(bestPanels.shift());
  }
  return bestPanels;
}

// Game state stays independent of canvas dimensions and responsive layout.
export class GaborTouchSession {
  constructor(random = Math.random) {
    this.random = random;
    this.stop();
  }

  stop() {
    this.round = 0;
    this.status = 'idle';
    this.panels = [];
    this.selectedIds = [];
    this.matchedPairs = 0;
    this.roundArrangements = new Map();
    this.pattern = null;
    this.previousSelection = undefined;
  }

  start() {
    this.roundArrangements.clear();
    this.previousSelection = undefined;
    this.round = 1;
    this.beginRound();
  }

  beginRound() {
    const patternIndex = getStandardPatternIndex(this.round);
    this.pattern = createStandardRoundPattern(this.round, this.random, this.previousSelection);
    this.previousSelection = selectionSignature(this.pattern.patches);
    this.panels = createRoundPanels(this.round, this.random, this.roundArrangements.get(patternIndex));
    this.roundArrangements.set(patternIndex, this.panels.map(panel => panel.pairId));
    this.selectedIds = [];
    this.matchedPairs = 0;
    this.status = 'playing';
  }

  select(panelId) {
    if (this.status !== 'playing') return 'ignored';
    const panel = this.panels.find(item => item.id === panelId);
    if (!panel || panel.matched || this.selectedIds.includes(panelId)) return 'ignored';

    this.selectedIds.push(panelId);
    if (this.selectedIds.length === 1) return 'first';

    const first = this.panels.find(item => item.id === this.selectedIds[0]);
    if (first.pairId !== panel.pairId) {
      this.status = 'mismatch';
      return 'mismatch';
    }

    first.matched = true;
    panel.matched = true;
    this.selectedIds = [];
    this.matchedPairs++;
    if (this.matchedPairs === PAIRS_PER_ROUND) {
      this.status = 'round-complete';
      return 'round-complete';
    }
    return 'match';
  }

  resolveMismatch() {
    if (this.status !== 'mismatch') return false;
    this.selectedIds = this.selectedIds.slice(0, 1);
    this.status = 'playing';
    return true;
  }

  advanceRound() {
    if (this.status !== 'round-complete') return false;
    if (this.round === TOTAL_ROUNDS) {
      this.status = 'complete';
    } else {
      this.round++;
      this.beginRound();
    }
    return true;
  }
}

function createPatchImages(pattern) {
  const { patches, pixelsPerDegree, backgroundRGB, modulationAmplitude } = pattern;
  return new Map(patches.map(patch => {
    const params = { ...patch, backgroundRGB, modulationAmplitude: patch.modulationAmplitude ?? modulationAmplitude };
    const source = document.createElement('canvas');
    source.width = source.height = Math.ceil(params.sizeInDegrees * pixelsPerDegree);
    const ctx = source.getContext('2d');
    drawGaborPatch(ctx, source.width / 2, source.height / 2,
      params.sizeInDegrees, params, pixelsPerDegree);
    return [patch.id, source];
  }));
}

export function initTrainView(container) {
  const game = new GaborTouchSession();
  const playTimer = new PlayTimer();
  let timeDisplayInterval;
  let feedbackTimer;
  let sessionVersion = 0;
  let minuteNotified = false;
  const fades = new PairFadeQueue({
    onChange: () => updatePanels(),
    onIdle: () => {
      if (game.status !== 'round-complete') return;
      if (!game.advanceRound()) return;
      if (game.status === 'complete') renderComplete();
      else renderRound();
    }
  });

  function schedule(callback, delay) {
    clearTimeout(feedbackTimer);
    const version = sessionVersion;
    feedbackTimer = setTimeout(() => {
      // A callback from an ended session must never touch a new session/view.
      if (version !== sessionVersion) return;
      feedbackTimer = undefined;
      callback();
    }, delay);
  }

  function startSession() {
    feedbackAudio.stop();
    feedbackAudio.unlock();
    fades.reset();
    clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
    sessionVersion++;
    clearInterval(timeDisplayInterval);
    playTimer.start();
    minuteNotified = false;
    game.start();
    renderRound();
    const version = sessionVersion;
    // Update only the display; the elapsed value always comes from the clock.
    timeDisplayInterval = setInterval(() => {
      if (version !== sessionVersion) return;
      updateTimeDisplay();
    }, 250);
  }

  function updateTimeDisplay() {
    const display = container.querySelector('#hudTime');
    if (!display) return;
    display.textContent = playTimer.text;
    const elapsed = playTimer.elapsed;
    if (!minuteNotified && elapsed >= 60000) {
      // Mark first, even when audio cannot play; delayed ticks never retry.
      minuteNotified = true;
      feedbackAudio.playMinuteNotice();
    }
    container.querySelector('.clock-second').setAttribute('transform',
      `rotate(${(elapsed % 60000) / 60000 * 360} 20 20)`);
    container.querySelector('.clock-minute').setAttribute('transform',
      `rotate(${(elapsed % 3600000) / 3600000 * 360} 20 20)`);
  }

  function endSession() {
    feedbackAudio.stop();
    fades.reset();
    clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
    sessionVersion++;
    clearInterval(timeDisplayInterval);
    timeDisplayInterval = undefined;
    playTimer.reset();
    minuteNotified = false;
    game.stop();
    renderStart();
  }

  function updatePanels(message) {
    container.querySelector('#hudPairs').textContent = `${game.matchedPairs} / ${PAIRS_PER_ROUND}`;
    if (message !== undefined) container.querySelector('#touchFeedback').textContent = message;
    container.querySelector('#gaborGrid').classList.toggle('is-round-finishing', fades.finishing);
    for (const button of container.querySelectorAll('.gabor-panel')) {
      const panel = game.panels.find(item => item.id === button.dataset.panelId);
      const selected = game.selectedIds.includes(panel.id);
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-matched', panel.matched);
      // Preserve an in-progress cell fade while the entire grid fades faster.
      if (!fades.finishing) button.classList.toggle('is-fading', fades.active?.includes(panel.id) ?? false);
      button.classList.toggle('is-cleared', fades.clearedIds.has(panel.id));
      button.classList.toggle('is-mismatch', selected && game.status === 'mismatch');
      button.disabled = panel.matched || game.status !== 'playing';
      if (panel.matched && document.activeElement === button) button.blur();
      button.setAttribute('aria-hidden', String(panel.matched));
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${panel.matched ? '一致済みの' : ''}パネル ${button.dataset.position}`);
    }
  }

  function handleSelection(panelId) {
    const pairIds = [...game.selectedIds, panelId];
    const result = game.select(panelId);
    if (result === 'ignored') return;
    if (result === 'first') {
      updatePanels('もう1枚、同じ模様を選んでください。');
    } else if (result === 'mismatch') {
      feedbackAudio.playFailure();
      updatePanels('模様が違います。もう一度。');
      schedule(() => {
        if (game.resolveMismatch()) updatePanels('もう1枚、同じ模様を選んでください。');
      }, MISMATCH_FEEDBACK_MS);
    } else if (result === 'match' || result === 'round-complete') {
      feedbackAudio.playSuccess();
      updatePanels(result === 'match' ? '一致しました。' : '6ペア完成！');
      if (result === 'round-complete') fades.finish(game.panels.map(panel => panel.id));
      else fades.enqueue(pairIds);
    }
  }

  function renderRound() {
    // Preserve the final chime's ringing tail across the quick round transition.
    fades.reset();
    const patternIndex = getStandardPatternIndex(game.round);
    const pattern = game.pattern;
    const images = createPatchImages(pattern);
    container.innerHTML = `
      <div class="session-hud" aria-label="トレーニングの進行状況">
        <div class="hud-item">
          <span id="hudRound" class="hud-value">${game.round} / ${TOTAL_ROUNDS}</span>
          <span class="hud-label">ラウンド</span>
        </div>
        <div class="hud-item">
          <span id="hudPairs" class="hud-value">0 / ${PAIRS_PER_ROUND}</span>
          <span class="hud-label">ペア</span>
        </div>
        <div class="touch-stopwatch">
          <svg class="touch-clock" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
            <circle class="clock-face" cx="20" cy="20" r="17" />
            <path class="clock-marks" d="M20 3v3 M37 20h-3 M20 37v-3 M3 20h3" />
            <line class="clock-minute" x1="20" y1="20" x2="20" y2="10" />
            <line class="clock-second" x1="20" y1="23" x2="20" y2="6" />
            <circle class="clock-pin" cx="20" cy="20" r="2" />
          </svg>
          <span id="hudTime" class="touch-timer" role="timer" aria-label="経過時間" aria-live="off">${playTimer.text}</span>
        </div>
        <button id="btnEndSession" class="btn btn-sm">終了</button>
      </div>
      <div class="card-panel touch-game-card" data-pattern-index="${patternIndex}">
        <div id="gaborGrid" class="gabor-grid" role="group" aria-label="ラウンド ${game.round} の12パネル"></div>
        <p id="touchFeedback" class="touch-feedback" role="status" aria-atomic="true">同じ模様を2枚選んでください。</p>
      </div>
    `;
    updateTimeDisplay();
    container.querySelector('#btnEndSession').addEventListener('click', endSession);
    const grid = container.querySelector('#gaborGrid');
    grid.style.setProperty('--round-fade-duration', `${FINAL_FADE_MS}ms`);
    game.panels.forEach((panel, index) => {
      const source = images.get(panel.pairId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-response gabor-panel';
      // Fade the entire cell, including its pattern background, without reflow.
      button.style.backgroundColor = `rgb(${pattern.backgroundRGB.join(', ')})`;
      button.style.setProperty('--pair-fade-duration', `${PAIR_FADE_MS}ms`);
      button.dataset.panelId = panel.id;
      button.dataset.pairId = panel.pairId;
      const patch = pattern.patches.find(item => item.id === panel.pairId);
      button.dataset.lineCount = patch.visualLineCount;
      button.dataset.orientation = patch.orientationDegrees;
      button.dataset.position = index + 1;
      button.setAttribute('aria-label', `パネル ${index + 1}`);
      button.setAttribute('aria-pressed', 'false');
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.setAttribute('aria-hidden', 'true');
      // Both copies use the SAME pre-rendered source; no per-panel random math.
      canvas.getContext('2d').drawImage(source, 0, 0);
      button.appendChild(canvas);
      const marker = document.createElement('span');
      marker.className = 'panel-match-marker';
      marker.textContent = '✓';
      marker.setAttribute('aria-hidden', 'true');
      button.appendChild(marker);
      grid.appendChild(button);
    });
    grid.addEventListener('click', event => {
      const button = event.target.closest('.gabor-panel');
      if (button && grid.contains(button)) handleSelection(button.dataset.panelId);
    });
  }

  function renderComplete() {
    // Completion is confirmed immediately after the final fast board fade.
    playTimer.stop();
    clearInterval(timeDisplayInterval);
    timeDisplayInterval = undefined;
    container.innerHTML = `
      <div class="card-panel text-center touch-complete">
        <h1 class="panel-title">完了</h1>
        <div class="dimensions-badge">${TOTAL_ROUNDS}ラウンド完了</div>
        <p class="instruction-text">トレーニング完了</p>
        <p class="touch-result-time"><span>今回のタイム</span><br><strong id="completeTime" class="touch-timer">${playTimer.text}</strong></p>
        <div class="btn-group touch-actions">
          <button id="btnRestartSession" class="btn btn-primary">もう一度</button>
        </div>
      </div>
    `;
    container.querySelector('#btnRestartSession').addEventListener('click', startSession);
  }

  function renderStart() {
    // Reuse the same start card for the initial view and an interrupted session.
    container.innerHTML = `
      <div class="card-panel text-center">
        <h1 class="panel-title">ガボールタッチ</h1>
        <p class="instruction-text">同じ模様のガボールパッチを2つずつ見つけてください。<br>6組すべて見つけると次のラウンドへ進みます。</p>
        <div class="dimensions-badge">12パネル · 12ラウンド</div>
        <div class="btn-group touch-actions">
          <button id="btnStartSession" class="btn btn-primary">トレーニング開始</button>
        </div>
      </div>
    `;
    container.querySelector('#btnStartSession').addEventListener('click', startSession);
  }

  renderStart();
}
