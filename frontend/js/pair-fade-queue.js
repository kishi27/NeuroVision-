export const PAIR_FADE_MS = 1000;
export const FINAL_FADE_MS = 800;

// Visual lifecycle only: matching and input remain owned by the game session.
export class PairFadeQueue {
  constructor({ onChange, onIdle,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = id => clearTimeout(id) }) {
    this.onChange = onChange;
    this.onIdle = onIdle;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.version = 0;
    this.reset();
  }

  reset() {
    this.version++;
    this.clearTimer(this.timer);
    this.timer = undefined;
    this.pending = [];
    this.active = null;
    this.clearedIds = new Set();
    this.finishing = false;
  }

  enqueue(panelIds) {
    if (this.finishing) return;
    this.pending.push([...panelIds]);
    if (!this.active) this.startNext();
  }

  finish(panelIds) {
    // All answers are known: cancel FIFO observation time and clear the board.
    this.version++;
    this.clearTimer(this.timer);
    this.pending = [];
    this.active = panelIds.filter(id => !this.clearedIds.has(id));
    this.finishing = true;
    this.onChange();
    this.scheduleCompletion(FINAL_FADE_MS);
  }

  startNext() {
    this.active = this.pending.shift() ?? null;
    if (!this.active) {
      this.onIdle();
      return;
    }
    this.onChange();
    this.scheduleCompletion(PAIR_FADE_MS);
  }

  scheduleCompletion(delay) {
    const version = this.version;
    this.timer = this.setTimer(() => {
      // Even a callback already queued before reset cannot affect a new game.
      if (version !== this.version) return;
      this.timer = undefined;
      for (const id of this.active) this.clearedIds.add(id);
      this.active = null;
      this.onChange();
      if (this.finishing) this.onIdle();
      else this.startNext();
    }, delay);
  }
}
