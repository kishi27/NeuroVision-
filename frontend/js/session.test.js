import {
  STIMULUS_DISPLAY_DURATION_MS,
  ORIENTATIONS_RADIANS,
  OrientationSequencer,
  OrientationStaircaseManager,
  radToDegKey
} from './session.js';

function runSessionConfigTest() {
  console.log('=== Step 1 — Timing Constant ===');
  console.log(`STIMULUS_DISPLAY_DURATION_MS = ${STIMULUS_DISPLAY_DURATION_MS} ms\n`);

  console.log('=== Step 2 — OrientationSequencer Test (12 calls) ===');
  const sequencer = new OrientationSequencer();
  const sequence12 = [];

  for (let i = 1; i <= 12; i++) {
    const rad = sequencer.next();
    const deg = Math.round((rad * 180) / Math.PI);
    sequence12.push(deg);
  }

  console.log(`12-trial sequence (Degrees): [${sequence12.join(', ')}]`);
  console.log(`Block 1 (1-4)  : [${sequence12.slice(0, 4).join(', ')}]`);
  console.log(`Block 2 (5-8)  : [${sequence12.slice(4, 8).join(', ')}]`);
  console.log(`Block 3 (9-12) : [${sequence12.slice(8, 12).join(', ')}]\n`);

  console.log('=== Step 3 & 4 — OrientationStaircaseManager Test ===');
  const manager = new OrientationStaircaseManager();

  // 44 trial pairs cycling round-robin through [0, 45, 90, 135]
  const orientationsDeg = [0, 45, 90, 135];

  // Scripted responses per trial index (11 cycles of 4 orientations = 44 trials)
  // Let's give 0° a lot of reversals to test independence
  const responses = [
    true, true, true, false,   // Cycle 1
    true, true, true, false,   // Cycle 2
    false, true, true, true,   // Cycle 3
    true, false, true, false,  // Cycle 4
    true, true, true, true,    // Cycle 5
    false, true, false, true,  // Cycle 6
    true, true, true, false,   // Cycle 7
    false, true, true, true,   // Cycle 8
    true, false, true, false,  // Cycle 9
    true, true, true, true,    // Cycle 10
    false, true, false, true   // Cycle 11
  ];

  responses.forEach((isCorrect, idx) => {
    const deg = orientationsDeg[idx % 4];
    const rad = (deg * Math.PI) / 180;
    manager.recordResponse(rad, isCorrect);
  });

  console.log('All Thresholds Estimate:', manager.getAllThresholds());
  console.log('\nFull Summary per Orientation:');
  console.table(manager.getSummary());
  console.log(`\nisFullyComplete(minReversals=8): ${manager.isFullyComplete(8)}`);
}

runSessionConfigTest();
