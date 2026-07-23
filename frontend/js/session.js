// Handles session and trial lifecycle management using Two-Interval Forced-Choice (2IFC) protocol — implemented in Prompt 6, 7, 9, 12 & Refactored for 2IFC & Prompt 14 (Session Modes & Spatial Frequency / Global Orientation)
import { Staircase } from './staircase.js';
import { drawLateralMaskingTrial, drawFixationCrosshair, clearToGray, DEFAULT_FLANKER_DISTANCE_DEGREES } from './gabor.js';
import { saveSession } from './api.js';

// Compensates for nystagmus involuntary eye drift by extending stimulus display to 450ms (from generic 200ms) to allow sufficient retinal motion integration.
export const STIMULUS_DISPLAY_DURATION_MS = 450;

// The four local spatial orientations in radians (0°, 45°, 90°, 135°)
export const ORIENTATIONS_RADIANS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

/**
 * Global layout orientation angles (phi) in degrees.
 * NOTE: phi = 0° (purely horizontal flankers left/right) is intentionally EXCLUDED
 * for nystagmus-safety reasons, as horizontal flankers introduce horizontal spatial tracking
 * tasks on top of involuntary horizontal nystagmus eye drift.
 * Allowed global orientations are 45° (diagonal), 90° (vertical), and 135° (diagonal).
 */
export const GLOBAL_ORIENTATIONS_DEGREES = [45, 90, 135];

export const SESSION_MODES = {
  STANDARD: 'standard',
  SPATIAL_FREQUENCY: 'spatial_frequency',
  GLOBAL_ORIENTATION: 'global_orientation'
};

export const SPATIAL_FREQUENCY_MODE_FIXED_CONTRAST = 0.6;

/**
 * Fisher-Yates shuffle algorithm.
 * @param {Array} array
 * @returns {Array} Shuffled copy of array
 */
function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Converts orientation radians to degree string key ('0', '45', '90', '135')
 * @param {number} rad
 * @returns {string}
 */
export function radToDegKey(rad) {
  const deg = Math.round((rad * 180) / Math.PI);
  return String(deg);
}

/**
 * Sequencer for balanced presentation of the 4 local orientations.
 */
export class OrientationSequencer {
  constructor() {
    this.bag = [];
  }

  next() {
    if (this.bag.length === 0) {
      this.bag = fisherYatesShuffle(ORIENTATIONS_RADIANS);
    }
    return this.bag.pop();
  }

  reset() {
    this.bag = [];
  }

  peekBagContents() {
    return [...this.bag];
  }
}

/**
 * Sequencer for balanced presentation of the 3 allowed global orientations (45°, 90°, 135°).
 */
export class GlobalOrientationSequencer {
  constructor() {
    this.bag = [];
  }

  next() {
    if (this.bag.length === 0) {
      this.bag = fisherYatesShuffle(GLOBAL_ORIENTATIONS_DEGREES);
    }
    return this.bag.pop();
  }

  reset() {
    this.bag = [];
  }

  peekBagContents() {
    return [...this.bag];
  }
}

/**
 * Manages four independent Staircase instances for local orientations (one per theta).
 */
export class OrientationStaircaseManager {
  constructor(staircaseConfig = {}) {
    this.staircases = new Map();
    ORIENTATIONS_RADIANS.forEach((rad) => {
      const key = radToDegKey(rad);
      this.staircases.set(key, new Staircase(staircaseConfig));
    });
  }

  recordResponse(orientationRadians, isCorrect) {
    const key = radToDegKey(orientationRadians);
    const staircase = this.staircases.get(key);
    if (!staircase) {
      throw new Error(`Invalid orientation radians: ${orientationRadians}`);
    }
    return staircase.recordResponse(isCorrect);
  }

  isFullyComplete(minReversals = 8) {
    for (const staircase of this.staircases.values()) {
      if (!staircase.isSessionComplete(minReversals)) {
        return false;
      }
    }
    return true;
  }

  getAllThresholds() {
    const result = {};
    for (const [key, staircase] of this.staircases.entries()) {
      result[key] = staircase.getThresholdEstimate();
    }
    return result;
  }

  getSummary(minReversals = 8) {
    const summary = [];
    for (const [key, staircase] of this.staircases.entries()) {
      const deg = parseInt(key, 10);
      summary.push({
        orientationDegrees: deg,
        thresholdEstimate: staircase.getThresholdEstimate(),
        reversalCount: staircase.getReversalCount(),
        totalTrials: staircase.getTotalTrials(),
        isComplete: staircase.isSessionComplete(minReversals)
      });
    }
    return summary;
  }
}

/**
 * Manages spatial frequency staircases for Mode B (tracks lambda in degrees visual angle).
 */
export class SpatialFrequencyStaircaseManager {
  constructor() {
    this.staircases = new Map();
    ORIENTATIONS_RADIANS.forEach((rad) => {
      const key = radToDegKey(rad);
      // NOTE: this Staircase instance tracks lambda (spatial frequency), not contrast, despite the field names — see Prompt 14
      this.staircases.set(
        key,
        new Staircase({
          startContrast: 0.15,
          initialStepSize: 0.03,
          minStepSize: 0.005,
          stepDivisor: 2,
          minValue: 0.05,
          maxValue: 0.5
        })
      );
    });
  }

  recordResponse(orientationRadians, isCorrect) {
    const key = radToDegKey(orientationRadians);
    const staircase = this.staircases.get(key);
    if (!staircase) {
      throw new Error(`Invalid orientation radians: ${orientationRadians}`);
    }
    return staircase.recordResponse(isCorrect);
  }

  isFullyComplete(minReversals = 6) {
    for (const staircase of this.staircases.values()) {
      if (!staircase.isSessionComplete(minReversals)) {
        return false;
      }
    }
    return true;
  }

  getSummary(minReversals = 6) {
    const summary = [];
    for (const [key, staircase] of this.staircases.entries()) {
      const deg = parseInt(key, 10);
      summary.push({
        orientationDegrees: deg,
        thresholdEstimate: staircase.getThresholdEstimate(),
        reversalCount: staircase.getReversalCount(),
        totalTrials: staircase.getTotalTrials(),
        isComplete: staircase.isSessionComplete(minReversals)
      });
    }
    return summary;
  }
}

/**
 * Manages three independent Staircase instances for global orientations (one per phi: 45°, 90°, 135°).
 */
export class GlobalOrientationStaircaseManager {
  constructor(staircaseConfig = {}) {
    this.staircases = new Map();
    GLOBAL_ORIENTATIONS_DEGREES.forEach((deg) => {
      const key = String(deg);
      this.staircases.set(key, new Staircase(staircaseConfig));
    });
  }

  recordResponse(globalDegrees, isCorrect) {
    const key = String(Math.round(globalDegrees));
    const staircase = this.staircases.get(key);
    if (!staircase) {
      throw new Error(`Invalid global orientation degrees: ${globalDegrees}`);
    }
    return staircase.recordResponse(isCorrect);
  }

  isFullyComplete(minReversals = 8) {
    for (const staircase of this.staircases.values()) {
      if (!staircase.isSessionComplete(minReversals)) {
        return false;
      }
    }
    return true;
  }

  getSummary(minReversals = 8) {
    const summary = [];
    for (const [key, staircase] of this.staircases.entries()) {
      const deg = parseInt(key, 10);
      summary.push({
        orientationDegrees: deg,
        thresholdEstimate: staircase.getThresholdEstimate(),
        reversalCount: staircase.getReversalCount(),
        totalTrials: staircase.getTotalTrials(),
        isComplete: staircase.isSessionComplete(minReversals)
      });
    }
    return summary;
  }
}

// Global session controller state
let isSessionActive = false;
let sessionTimerInterval = null;
let audioCtx = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns or initializes a Web Audio API context for non-blocking beep generation
 */
function getAudioContext() {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Plays a short, non-blocking audio cue beep using Web Audio API
 * @param {number} freq - Tone frequency in Hz (e.g. 440Hz for Int 1, 880Hz for Int 2)
 * @param {number} durationMs - Duration in milliseconds (default 150ms)
 */
function playBeep(freq = 440, durationMs = 150) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (durationMs / 1000));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (durationMs / 1000));
  } catch (e) {
    // Non-blocking catch to ensure timing precision even if audio context is restricted
  }
}

/**
 * Displays a 150ms visual border cue and plays a distinct audio beep for Interval 1 or 2
 * @param {HTMLCanvasElement} canvas
 * @param {number} intervalNum - 1 or 2
 */
async function flashIntervalCue(canvas, intervalNum) {
  const borderStyle = intervalNum === 1 ? '4px solid #3b82f6' : '4px solid #10b981';
  const audioFreq = intervalNum === 1 ? 440 : 880;

  // Asynchronous non-blocking audio playback
  playBeep(audioFreq, 150);

  if (canvas) {
    canvas.style.border = borderStyle;
    canvas.style.boxSizing = 'border-box';
  }

  await sleep(150);

  if (canvas) {
    canvas.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  }
}

/**
 * Entry point for initializing the Train View
 */
export function initTrainView(ctx, canvas, onSwitchView) {
  cleanupTrainView(ctx, canvas);
  const container = document.getElementById('viewTrain');
  if (!container) return;

  const activeName = localStorage.getItem('activeCalibrationProfile');
  const profilesData = localStorage.getItem('calibrationProfiles');

  let activeProfile = null;
  if (profilesData) {
    try {
      const profiles = JSON.parse(profilesData);
      activeProfile = profiles.find((p) => p.profile_name === activeName) || profiles[0];
    } catch (e) {}
  }

  if (!activeProfile || !activeProfile.pixels_per_degree) {
    container.innerHTML = `
      <div class="card-panel text-center">
        <h2 class="panel-title">Calibration Required</h2>
        <p class="instruction-text">
          You need to calibrate your screen before training. Please go to the Calibrate tab first.
        </p>
        <div class="btn-group text-center" style="justify-content: center;">
          <button id="btnGoToCalibrate" class="btn btn-primary">Go to Calibration</button>
        </div>
      </div>
    `;
    const btn = document.getElementById('btnGoToCalibrate');
    if (btn) {
      btn.addEventListener('click', () => onSwitchView('calibrate'));
    }
    return;
  }

  const inProgressDataStr = localStorage.getItem('inProgressSession');
  if (inProgressDataStr) {
    let savedTimeStr = 'a previous session';
    let parsedSession = null;
    try {
      parsedSession = JSON.parse(inProgressDataStr);
      if (parsedSession && parsedSession.sessionStartTime) {
        savedTimeStr = new Date(parsedSession.sessionStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } catch (e) {}

    container.innerHTML = `
      <div class="card-panel text-center">
        <h2 class="panel-title">Unfinished Session Detected</h2>
        <p class="instruction-text">
          You have an unfinished session saved from <strong>${savedTimeStr}</strong> (${parsedSession?.totalTrials || 0} trials completed).<br>
          Would you like to resume where you left off or start fresh?
        </p>
        <div class="btn-group" style="justify-content: center; gap: 12px;">
          <button id="btnResumeSession" class="btn btn-primary">Resume Session</button>
          <button id="btnDiscardSession" class="btn" style="background: rgba(220, 38, 38, 0.2); border-color: rgba(248, 113, 113, 0.4); color: #fca5a5;">Discard and Start Fresh</button>
        </div>
      </div>
    `;

    document.getElementById('btnResumeSession')?.addEventListener('click', () => {
      const mode = parsedSession?.sessionMode || SESSION_MODES.STANDARD;
      startTrainingSession(ctx, canvas, activeProfile, container, false, parsedSession, mode);
    });

    document.getElementById('btnDiscardSession')?.addEventListener('click', () => {
      localStorage.removeItem('inProgressSession');
      renderPreSessionCard(container, activeProfile, ctx, canvas);
    });
    return;
  }

  renderPreSessionCard(container, activeProfile, ctx, canvas);
}

function renderPreSessionCard(container, activeProfile, ctx, canvas) {
  container.innerHTML = `
    <div class="card-panel text-center">
      <h2 class="panel-title">Visual Cortex Training (2IFC)</h2>
      <p class="instruction-text">
        Active Profile: <strong>${escapeHtml(activeProfile.profile_name)}</strong> (${activeProfile.pixels_per_degree.toFixed(2)} px/deg)<br>
        Two-Interval Forced-Choice (2IFC) Protocol.
      </p>

      <!-- Session Mode Selector (defaults to Standard) -->
      <div style="margin: 16px 0; background: rgba(0, 0, 0, 0.25); padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.08);">
        <label for="sessionModeSelect" style="display: block; font-size: 13px; font-weight: 600; color: #93c5fd; margin-bottom: 8px;">
          Select Session Mode:
        </label>
        <select id="sessionModeSelect" class="select-input" style="max-width: 360px; margin: 0 auto; display: block; background: #0f172a; color: #ffffff; padding: 8px 12px; border-radius: 8px; border: 1px solid #3b82f6;">
          <option value="standard" selected>Mode A: Standard (Contrast & Local Orientation)</option>
          <option value="spatial_frequency">Mode B: Spatial Frequency (Lambda Sweep)</option>
          <option value="global_orientation">Mode C: Global Orientation (Layout Angle Sweep)</option>
        </select>
        <div id="modeDescriptionText" style="font-size: 12px; color: #9ca3af; margin-top: 8px; line-height: 1.4;">
          Trains contrast sensitivity across 4 local stripe orientations (0°, 45°, 90°, 135°) with top/bottom flankers.
        </div>
      </div>

      <!-- Quick Visual Guide Accordion -->
      <details style="margin: 16px 0 20px; text-align: left; background: rgba(2, 6, 23, 0.6); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
        <summary style="cursor: pointer; font-size: 14px; font-weight: 600; color: #60a5fa; user-select: none;">
          ❓ How to Play (Click to Expand Guide)
        </summary>
        <div style="margin-top: 12px; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
          <p style="margin-bottom: 8px;"><strong>1. What you see:</strong> Each trial presents two sequential intervals (Interval 1 & Interval 2), announced by distinct border cues and audio beeps.</p>
          <p style="margin-bottom: 8px;"><strong>2. Your task:</strong> Reference flankers appear in BOTH intervals, but the center target Gabor patch appears in <strong>ONLY ONE</strong> of the two intervals. Determine which interval contained the target.</p>
          <p style="margin-bottom: 8px;"><strong>3. Keyboard Shortcuts:</strong></p>
          <ul style="margin-left: 20px; margin-bottom: 8px;">
            <li>Press <strong>1</strong> for Interval 1</li>
            <li>Press <strong>2</strong> for Interval 2</li>
          </ul>
        </div>
      </details>

      <div class="btn-group" style="justify-content: center; gap: 12px;">
        <button id="btnStartPractice" class="btn" style="background: rgba(255, 255, 255, 0.12);">Start Practice Mode</button>
        <button id="btnStartSession" class="btn btn-primary" style="padding: 10px 24px;">Start Real Session</button>
      </div>
    </div>
  `;

  const modeSelect = document.getElementById('sessionModeSelect');
  const modeDesc = document.getElementById('modeDescriptionText');

  if (modeSelect && modeDesc) {
    modeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      if (mode === SESSION_MODES.SPATIAL_FREQUENCY) {
        modeDesc.textContent = 'Mode B: Trains spatial frequency resolution (lambda) across 4 local orientations at fixed easy contrast (0.60).';
      } else if (mode === SESSION_MODES.GLOBAL_ORIENTATION) {
        modeDesc.textContent = 'Mode C: Sweeps global flanker layout angles (45°, 90°, 135°) at fixed vertical stripe orientation (90°).';
      } else {
        modeDesc.textContent = 'Mode A: Trains contrast sensitivity across 4 local stripe orientations (0°, 45°, 90°, 135°) with top/bottom flankers.';
      }
    });
  }

  document.getElementById('btnStartPractice')?.addEventListener('click', () => {
    const selectedMode = modeSelect ? modeSelect.value : SESSION_MODES.STANDARD;
    startTrainingSession(ctx, canvas, activeProfile, container, true, null, selectedMode);
  });

  document.getElementById('btnStartSession')?.addEventListener('click', () => {
    const selectedMode = modeSelect ? modeSelect.value : SESSION_MODES.STANDARD;
    startTrainingSession(ctx, canvas, activeProfile, container, false, null, selectedMode);
  });
}

/**
 * Starts an active 2IFC session loop supporting Modes A, B, and C
 */
async function startTrainingSession(ctx, canvas, profile, container, isPractice = false, resumedSession = null, selectedMode = SESSION_MODES.STANDARD) {
  isSessionActive = true;
  const pixelsPerDegree = profile.pixels_per_degree;

  // Read dynamic settings overrides if set
  const activeDurationMs = parseInt(localStorage.getItem('stimulusDurationMs'), 10) || STIMULUS_DISPLAY_DURATION_MS;
  const activeFlankerDist = parseFloat(localStorage.getItem('flankerDistanceDegrees')) || DEFAULT_FLANKER_DISTANCE_DEGREES;

  // Personalized spatial frequency setting check for Mode A / Mode C
  const usePersonalizedLambda = localStorage.getItem('usePersonalizedLambda') === 'true';
  let personalizedLambdaMap = null;
  if (usePersonalizedLambda) {
    try {
      const data = localStorage.getItem('personalizedLambdaByOrientation');
      if (data) personalizedLambdaMap = JSON.parse(data);
    } catch (e) {}
  }

  // Initialize Sequencer and Staircase Manager based on selectedMode
  let localSequencer = null;
  let globalSequencer = null;
  let staircaseManager = null;
  let targetReversals = 8;

  if (selectedMode === SESSION_MODES.SPATIAL_FREQUENCY) {
    localSequencer = new OrientationSequencer();
    staircaseManager = new SpatialFrequencyStaircaseManager();
    targetReversals = 6; // Mode B defaults to 6 reversals for spatial frequency
  } else if (selectedMode === SESSION_MODES.GLOBAL_ORIENTATION) {
    globalSequencer = new GlobalOrientationSequencer();
    staircaseManager = new GlobalOrientationStaircaseManager();
    targetReversals = 8;
  } else {
    // Standard Mode A
    localSequencer = new OrientationSequencer();
    staircaseManager = new OrientationStaircaseManager();
    targetReversals = 8;
  }

  const sessionStartTime = resumedSession?.sessionStartTime ? new Date(resumedSession.sessionStartTime).getTime() : Date.now();
  let totalTrials = resumedSession?.totalTrials || 0;
  let totalCorrect = resumedSession?.totalCorrect || 0;

  const elapsedSecOnResume = Math.floor((Date.now() - sessionStartTime) / 1000);
  let timeRemainingSec = Math.max(0, (30 * 60) - elapsedSecOnResume);

  const modeLabels = {
    standard: 'Standard Mode',
    spatial_frequency: 'Spatial Frequency Mode',
    global_orientation: 'Global Orientation Mode'
  };
  const modeTitle = modeLabels[selectedMode] || 'Standard Mode';

  // Build Session HUD Overlay for 2IFC
  container.innerHTML = `
    <div class="session-hud">
      <div class="hud-item">
        <span class="hud-label">${modeTitle} ${isPractice ? '(Practice)' : ''}</span>
        <span class="hud-value" id="hudTimer">${Math.floor(timeRemainingSec / 60).toString().padStart(2, '0')}:${(timeRemainingSec % 60).toString().padStart(2, '0')}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">Trials</span>
        <span class="hud-value" id="hudTrials">${totalTrials}</span>
      </div>
    </div>

    <div id="responseContainer" class="response-panel" style="display: none;">
      <p class="response-prompt">
        Which interval contained the center target patch?<br>
        <span style="font-size: 12px; color: #94a3b8; display: block; margin-top: 4px;">
          Keyboard: Press [1] for Interval 1 &bull; Press [2] for Interval 2
        </span>
      </p>
      <div class="response-buttons" style="justify-content: center; gap: 16px;">
        <button class="btn btn-response" id="btnRespInterval1" disabled style="min-width: 160px;">Interval 1 (1)</button>
        <button class="btn btn-response" id="btnRespInterval2" disabled style="min-width: 160px;">Interval 2 (2)</button>
      </div>
    </div>
  `;

  const timerEl = document.getElementById('hudTimer');
  const trialsEl = document.getElementById('hudTrials');
  const respPanel = document.getElementById('responseContainer');

  const btnInterval1 = document.getElementById('btnRespInterval1');
  const btnInterval2 = document.getElementById('btnRespInterval2');

  // Start 30-minute timer
  sessionTimerInterval = setInterval(() => {
    timeRemainingSec -= 1;
    if (timeRemainingSec <= 0) {
      timeRemainingSec = 0;
      clearInterval(sessionTimerInterval);
    }
    const mins = Math.floor(timeRemainingSec / 60);
    const secs = timeRemainingSec % 60;
    if (timerEl) {
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }, 1000);

  // 2IFC Trial execution loop
  while (isSessionActive) {
    if (timeRemainingSec <= 0 || staircaseManager.isFullyComplete(targetReversals)) {
      break;
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Step 3.1 — Fixation crosshair for 500ms
    clearToGray(ctx, canvas.width, canvas.height);
    drawFixationCrosshair(ctx, centerX, centerY, 20);
    await sleep(500);
    if (!isSessionActive) break;

    // Step 3.2 — Blank ISI for 200ms
    clearToGray(ctx, canvas.width, canvas.height);
    await sleep(200);
    if (!isSessionActive) break;

    // Randomly choose target interval (1 or 2) BEFORE Interval 1 starts
    const targetInterval = Math.random() < 0.5 ? 1 : 2;

    // Determine trial parameters according to selectedMode
    let currentTheta = Math.PI / 2; // Default 90° (vertical stripes)
    let currentPhi = 90;            // Default 90° (vertical flankers)
    let currentContrast = 0.5;
    let currentLambda = 0.2;

    if (selectedMode === SESSION_MODES.SPATIAL_FREQUENCY) {
      // Mode B: Sweep local theta (0, 45, 90, 135), track lambda, contrast fixed at 0.6
      currentTheta = localSequencer.next();
      currentPhi = 90;
      currentContrast = SPATIAL_FREQUENCY_MODE_FIXED_CONTRAST;

      const degKey = radToDegKey(currentTheta);
      const staircase = staircaseManager.staircases.get(degKey);
      currentLambda = staircase.getCurrentContrast(); // Repurposed for lambda
    } else if (selectedMode === SESSION_MODES.GLOBAL_ORIENTATION) {
      // Mode C: Sweep global phi (45, 90, 135), track contrast, theta fixed at 90°
      currentPhi = globalSequencer.next();
      currentTheta = Math.PI / 2;

      const phiKey = String(currentPhi);
      const staircase = staircaseManager.staircases.get(phiKey);
      currentContrast = staircase.getCurrentContrast();

      if (personalizedLambdaMap && personalizedLambdaMap['90']) {
        currentLambda = personalizedLambdaMap['90'];
      }
    } else {
      // Mode A: Standard (Sweep local theta 0, 45, 90, 135, track contrast, phi fixed at 90°)
      currentTheta = localSequencer.next();
      currentPhi = 90;

      const degKey = radToDegKey(currentTheta);
      const staircase = staircaseManager.staircases.get(degKey);
      currentContrast = staircase.getCurrentContrast();

      if (personalizedLambdaMap && personalizedLambdaMap[degKey]) {
        currentLambda = personalizedLambdaMap[degKey];
      }
    }

    const targetParams = {
      lambda: currentLambda,
      theta: currentTheta,
      psi: 0,
      sigma: 0.3,
      gamma: 1.0,
      contrast: currentContrast
    };

    // Step 3.3 — Interval 1 cue (150ms)
    await flashIntervalCue(canvas, 1);
    if (!isSessionActive) break;

    // Step 3.4 — Interval 1 stimulus display (450ms)
    drawLateralMaskingTrial(
      ctx,
      centerX,
      centerY,
      targetParams,
      activeFlankerDist,
      2.0,
      pixelsPerDegree,
      targetInterval === 1, // targetPresent in Interval 1
      currentPhi
    );
    await sleep(activeDurationMs);
    if (!isSessionActive) break;

    // Step 3.5 — Blank inter-stimulus gap for 500ms
    clearToGray(ctx, canvas.width, canvas.height);
    await sleep(500);
    if (!isSessionActive) break;

    // Step 3.6 — Interval 2 cue (150ms)
    await flashIntervalCue(canvas, 2);
    if (!isSessionActive) break;

    // Step 3.7 — Interval 2 stimulus display (450ms)
    drawLateralMaskingTrial(
      ctx,
      centerX,
      centerY,
      targetParams,
      activeFlankerDist,
      2.0,
      pixelsPerDegree,
      targetInterval === 2, // targetPresent in Interval 2
      currentPhi
    );
    await sleep(activeDurationMs);
    if (!isSessionActive) break;

    // Step 3.8 — Clear canvas to gray immediately after Interval 2 ends
    clearToGray(ctx, canvas.width, canvas.height);

    // Step 3.9 — Show response buttons & wait for user selection (1 or 2)
    if (respPanel) respPanel.style.display = 'block';
    setButtonsState(false);

    const userSelectedInterval = await getResponseClick(btnInterval1, btnInterval2);
    setButtonsState(true);
    if (respPanel) respPanel.style.display = 'none';

    if (!isSessionActive) break;

    // Step 3.10 — Score response & update staircase
    const isCorrect = userSelectedInterval === targetInterval;

    if (selectedMode === SESSION_MODES.GLOBAL_ORIENTATION) {
      staircaseManager.recordResponse(currentPhi, isCorrect);
    } else {
      staircaseManager.recordResponse(currentTheta, isCorrect);
    }

    totalTrials += 1;
    if (isCorrect) totalCorrect += 1;
    if (trialsEl) trialsEl.textContent = String(totalTrials);

    // Mid-session autosave every 10 trials
    if (!isPractice && totalTrials % 10 === 0) {
      try {
        localStorage.setItem(
          'inProgressSession',
          JSON.stringify({
            sessionStartTime: new Date(sessionStartTime).toISOString(),
            totalTrials,
            totalCorrect,
            sessionMode: selectedMode,
            orientationSummary: staircaseManager.getSummary(targetReversals)
          })
        );
      } catch (e) {}
    }
  }

  if (isSessionActive) {
    await finishTrainingSession(container, sessionStartTime, totalTrials, totalCorrect, staircaseManager, profile, isPractice, selectedMode, targetReversals);
  }
}

function setButtonsState(disabled) {
  const btn1 = document.getElementById('btnRespInterval1');
  const btn2 = document.getElementById('btnRespInterval2');

  [btn1, btn2].forEach((b) => {
    if (b) {
      b.disabled = disabled;
    }
  });
}

function getResponseClick(btnInterval1, btnInterval2) {
  return new Promise((resolve) => {
    const cleanup = () => {
      btnInterval1.removeEventListener('click', onInterval1);
      btnInterval2.removeEventListener('click', onInterval2);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onKey);
    };

    const handler = (choice) => {
      cleanup();
      resolve(choice);
    };

    const onInterval1 = () => handler(1);
    const onInterval2 = () => handler(2);

    const onKey = (e) => {
      const key = e.key ? e.key.toLowerCase() : '';
      const code = e.code ? e.code : '';

      const isInt1 = key === '1' || code === 'Digit1' || code === 'Numpad1';
      const isInt2 = key === '2' || code === 'Digit2' || code === 'Numpad2';

      if (isInt1) {
        e.preventDefault();
        handler(1);
      } else if (isInt2) {
        e.preventDefault();
        handler(2);
      }
    };

    btnInterval1.addEventListener('click', onInterval1);
    btnInterval2.addEventListener('click', onInterval2);
    window.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
  });
}

/**
 * Handles session end completion and summary rendering
 */
async function finishTrainingSession(container, sessionStartTime, totalTrials, totalCorrect, staircaseManager, profile, isPractice = false, selectedMode = SESSION_MODES.STANDARD, targetReversals = 8) {
  isSessionActive = false;
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);

  if (!isPractice) {
    localStorage.removeItem('inProgressSession');
    localStorage.setItem(`hasCompletedFirstSession_${profile.profile_name}`, 'true');
  }

  const sessionEndTime = new Date().toISOString();
  const elapsedSec = Math.round((Date.now() - sessionStartTime) / 1000);
  const elapsedMins = Math.floor(elapsedSec / 60);
  const elapsedSecs = elapsedSec % 60;
  const timeStr = `${elapsedMins}m ${elapsedSecs}s`;

  const accuracy = totalTrials > 0 ? ((totalCorrect / totalTrials) * 100).toFixed(1) : '0.0';
  const orientationResults = staircaseManager.getSummary(targetReversals);

  // If Mode B (Spatial Frequency) session completed in full mode, save personalized lambda map to localStorage
  if (!isPractice && selectedMode === SESSION_MODES.SPATIAL_FREQUENCY) {
    try {
      const lambdaMap = {};
      orientationResults.forEach((r) => {
        if (r.thresholdEstimate !== null) {
          lambdaMap[String(r.orientationDegrees)] = r.thresholdEstimate;
        }
      });
      localStorage.setItem('personalizedLambdaByOrientation', JSON.stringify(lambdaMap));
    } catch (e) {}
  }

  const finalResultsObject = {
    sessionStartTime: new Date(sessionStartTime).toISOString(),
    sessionEndTime,
    totalTrials,
    totalCorrect,
    calibration_profile_id: profile && profile.id ? profile.id : null,
    sessionMode: selectedMode,
    orientationResults
  };

  if (!isPractice) {
    await saveSession(finalResultsObject);
  }

  const valueHeaderLabel = selectedMode === SESSION_MODES.SPATIAL_FREQUENCY ? 'Lambda Threshold (deg)' : 'Threshold Contrast';

  container.innerHTML = `
    <div class="card-panel">
      <h2 class="panel-title text-center">
        ${isPractice ? 'Practice session complete (not saved)' : 'Session Complete!'}
      </h2>

      ${isPractice ? `
        <div style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(96, 165, 250, 0.3); padding: 8px 12px; border-radius: 6px; font-size: 13px; text-align: center; margin-bottom: 16px;">
          Practice session — results were not saved to history.
        </div>
      ` : ''}

      <div class="profile-details-grid">
        <div class="detail-item">
          <span class="detail-label">Mode:</span>
          <span class="detail-value highlight">${selectedMode.toUpperCase()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Duration:</span>
          <span class="detail-value">${timeStr}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Total Trials:</span>
          <span class="detail-value">${totalTrials}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Accuracy:</span>
          <span class="detail-value highlight">${accuracy}%</span>
        </div>
      </div>

      <h3 style="font-size: 15px; margin: 16px 0 8px; color: #f3f4f6;">Per-Orientation Results</h3>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Orientation</th>
            <th>${valueHeaderLabel}</th>
            <th>Reversals</th>
            <th>Trials</th>
          </tr>
        </thead>
        <tbody>
          ${orientationResults.map((r) => `
            <tr>
              <td>${r.orientationDegrees}°</td>
              <td>${r.thresholdEstimate !== null ? r.thresholdEstimate.toFixed(4) : 'N/A'}</td>
              <td>${r.reversalCount}</td>
              <td>${r.totalTrials}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="btn-group" style="justify-content: center; margin-top: 20px;">
        <button id="btnSessionDone" class="btn btn-primary">Done</button>
      </div>
    </div>
  `;

  document.getElementById('btnSessionDone')?.addEventListener('click', () => {
    initTrainView(null, null, null);
  });
}

/**
 * Cleans up session loop state when switching views
 */
export function cleanupTrainView(ctx, canvas) {
  isSessionActive = false;
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
  if (ctx && canvas) {
    clearToGray(ctx, canvas.width, canvas.height);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
