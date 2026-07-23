// Handles adaptive staircase procedure algorithm — implemented in Prompt 5 & Refactored for Prompt 14

export class Staircase {
  constructor({
    startContrast = 0.8,
    initialStepSize = 0.3,
    minStepSize = 0.02,
    stepDivisor = 2,
    minContrast = 0.0,
    maxContrast = 1.0,
    minValue,
    maxValue
  } = {}) {
    this.currentContrast = startContrast;
    this.currentStepSize = initialStepSize;
    this.minStepSize = minStepSize;
    this.stepDivisor = stepDivisor;
    this.minContrast = minValue !== undefined ? minValue : minContrast;
    this.maxContrast = maxValue !== undefined ? maxValue : maxContrast;
    this.correctStreak = 0;
    this.lastDirection = null;
    this.reversalContrasts = [];
    this.totalTrials = 0;
    this.history = [];
  }

  recordResponse(isCorrect) {
    this.totalTrials += 1;
    const contrastBeforeUpdate = this.currentContrast;
    let newContrast = this.currentContrast;
    let direction = null;

    if (isCorrect) {
      this.correctStreak += 1;
      if (this.correctStreak === 3) {
        newContrast = this.currentContrast - this.currentStepSize;
        this.correctStreak = 0;
        direction = 'down';
      } else {
        // Streak is 1 or 2: no contrast change, record history entry and return early
        this.history.push({
          trialNumber: this.totalTrials,
          wasCorrect: true,
          contrastBeforeUpdate,
          contrastAfterUpdate: this.currentContrast,
          stepSizeUsed: this.currentStepSize
        });
        return false;
      }
    } else {
      this.correctStreak = 0;
      newContrast = this.currentContrast + this.currentStepSize;
      direction = 'up';
    }

    const stepSizeUsed = this.currentStepSize;
    let isReversal = false;

    // Step 3 — Reversal detection (only runs when contrast/parameter change is actually happening)
    if (this.lastDirection === null) {
      this.lastDirection = direction;
    } else if (direction !== this.lastDirection) {
      isReversal = true;
      // Push current contrast BEFORE applying newContrast
      this.reversalContrasts.push(contrastBeforeUpdate);
      this.currentStepSize = Math.max(this.currentStepSize / this.stepDivisor, this.minStepSize);
      this.lastDirection = direction;
    }

    // Step 4 — Apply parameter change and clamp using configurable bounds
    this.currentContrast = Math.min(this.maxContrast, Math.max(this.minContrast, newContrast));

    // Record history
    this.history.push({
      trialNumber: this.totalTrials,
      wasCorrect: isCorrect,
      contrastBeforeUpdate,
      contrastAfterUpdate: this.currentContrast,
      stepSizeUsed
    });

    return isReversal;
  }

  getThresholdEstimate() {
    if (this.reversalContrasts.length === 0) {
      return null;
    }
    const recent = this.reversalContrasts.slice(-6);
    const sum = recent.reduce((acc, val) => acc + val, 0);
    return sum / recent.length;
  }

  isSessionComplete(minReversals = 8) {
    return this.reversalContrasts.length >= minReversals;
  }

  getCurrentContrast() {
    return this.currentContrast;
  }

  getCurrentStepSize() {
    return this.currentStepSize;
  }

  getReversalCount() {
    return this.reversalContrasts.length;
  }

  getTotalTrials() {
    return this.totalTrials;
  }

  getHistory() {
    return [...this.history];
  }
}
