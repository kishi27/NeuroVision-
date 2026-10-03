export function formatElapsed(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Only this session's elapsed time is kept in memory. UI ticks never add time.
export class PlayTimer {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.stoppedElapsed = 0;
  }

  start() {
    this.reset();
    this.startedAt = this.now();
  }

  get elapsed() {
    return this.startedAt === null ? this.stoppedElapsed : Math.max(0, this.now() - this.startedAt);
  }

  stop() {
    this.stoppedElapsed = this.elapsed;
    this.startedAt = null;
    return this.stoppedElapsed;
  }

  get text() {
    return formatElapsed(this.elapsed);
  }
}
