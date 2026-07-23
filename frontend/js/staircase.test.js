import { Staircase } from './staircase.js';

function runSelfTest() {
  const staircase = new Staircase();
  const sequence = [
    true, true, true, true, true, true, false, true, true, true,
    false, true, true, true, true, true, true, false, false, true,
    true, true
  ];

  console.log('=== Staircase Self-Test Execution ===\n');

  sequence.forEach((wasCorrect, idx) => {
    const isReversal = staircase.recordResponse(wasCorrect);
    const history = staircase.getHistory();
    const lastEntry = history[history.length - 1];

    console.log(
      `Trial ${String(lastEntry.trialNumber).padStart(2)} | ` +
      `Correct: ${String(wasCorrect).padEnd(5)} | ` +
      `Contrast Before: ${lastEntry.contrastBeforeUpdate.toFixed(4)} | ` +
      `Contrast After: ${lastEntry.contrastAfterUpdate.toFixed(4)} | ` +
      `Step Size: ${lastEntry.stepSizeUsed.toFixed(4)} | ` +
      `Reversal: ${isReversal ? 'YES' : 'NO '}`
    );
  });

  console.log('\n=== Summary ===');
  console.log(`Total Trials: ${staircase.getTotalTrials()}`);
  console.log(`Reversal Contrasts: [${staircase.reversalContrasts.map(c => c.toFixed(4)).join(', ')}]`);
  console.log(`Threshold Estimate: ${staircase.getThresholdEstimate() ? staircase.getThresholdEstimate().toFixed(4) : 'N/A'}`);
  console.log(`Session Complete (minReversals=8): ${staircase.isSessionComplete()}`);
}

runSelfTest();
