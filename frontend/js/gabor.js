// Handles Gabor patch rendering math and lateral masking layout — implemented in Prompt 4 & Refactored for 2IFC & Global Orientation (Prompt 14)

export const DEFAULT_FLANKER_DISTANCE_DEGREES = 2.0;

/**
 * Fills the entire canvas with flat RGB(127, 127, 127) gray.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function clearToGray(ctx, canvasWidth, canvasHeight) {
  ctx.fillStyle = 'rgb(127, 127, 127)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

/**
 * Draws a simple fixation crosshair (+) at (centerX, centerY).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} centerX - Screen X coordinate
 * @param {number} centerY - Screen Y coordinate
 * @param {number} sizeInPixels - Total span of crosshair arms in pixels (default 20)
 */
export function drawFixationCrosshair(ctx, centerX, centerY, sizeInPixels = 20) {
  const half = sizeInPixels / 2;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = 'rgb(60, 60, 60)';
  ctx.lineWidth = 2;
  // Horizontal line
  ctx.moveTo(centerX - half, centerY);
  ctx.lineTo(centerX + half, centerY);
  // Vertical line
  ctx.moveTo(centerX, centerY - half);
  ctx.lineTo(centerX, centerY + half);
  ctx.stroke();
  ctx.restore();
}

/**
 * Creates a cloned params object for flanker patches with contrast locked to 1.0.
 * @param {Object} targetParams
 * @returns {Object} Flanker params object
 */
function createFlankerParams(targetParams) {
  return {
    ...targetParams,
    contrast: 1.0
  };
}

/**
 * Draws a single Gabor patch centered at (centerX, centerY).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} centerX - X position on canvas (pixels)
 * @param {number} centerY - Y position on canvas (pixels)
 * @param {number} sizeInDegrees - Total patch size (degrees of visual angle)
 * @param {Object} params - Gabor parameters {lambda, theta, psi, sigma, gamma, contrast};
 * optional backgroundRGB and modulationAmplitude control only output luminance/color.
 * @param {number} pixelsPerDegree - Calibration scale factor (pixels per degree)
 */
export function drawGaborPatch(ctx, centerX, centerY, sizeInDegrees, params = {}, pixelsPerDegree) {
  const lambda = params.lambda ?? 0.2;
  const theta = params.theta ?? 0;
  const psi = params.psi ?? 0;
  const sigma = params.sigma ?? 0.3;
  const gamma = params.gamma ?? 1.0;
  const contrast = params.contrast ?? 0.5;
  const backgroundRGB = params.backgroundRGB ?? [127, 127, 127];
  const modulationAmplitude = params.modulationAmplitude ?? 127;

  // Convert degree metrics to pixel units
  const lambda_px = lambda * pixelsPerDegree;
  const sigma_px = sigma * pixelsPerDegree;
  const patchSizePx = Math.max(1, Math.ceil(sizeInDegrees * pixelsPerDegree));

  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const halfSize = patchSizePx / 2;

  const twoPiOverLambda = (2 * Math.PI) / lambda_px;
  const denom = 2 * sigma_px * sigma_px;
  const gammaSq = gamma * gamma;
  const scaledContrast = modulationAmplitude * contrast;

  const imageData = ctx.createImageData(patchSizePx, patchSizePx);
  const data = imageData.data;
  let index = 0;

  for (let py = 0; py < patchSizePx; py++) {
    const y = py - halfSize;
    for (let px = 0; px < patchSizePx; px++) {
      const x = px - halfSize;

      // Step 1a — Rotate coordinates by theta
      const x_rot = x * cosTheta + y * sinTheta;
      const y_rot = -x * sinTheta + y * cosTheta;

      // Step 1b — Compute envelope and carrier
      const envelope = Math.exp(-((x_rot * x_rot) + (gammaSq * y_rot * y_rot)) / denom);
      const carrier = Math.cos((twoPiOverLambda * x_rot) + psi);
      const g = envelope * carrier;

      // Step 1c — Same Gaussian/carrier math; shift RGB base and clip excursion.
      // Defaults preserve the original RGB(127, 127, 127) output exactly.
      const excursion = Math.round(scaledContrast * g);
      data[index] = Math.max(0, Math.min(255, backgroundRGB[0] + excursion));
      data[index + 1] = Math.max(0, Math.min(255, backgroundRGB[1] + excursion));
      data[index + 2] = Math.max(0, Math.min(255, backgroundRGB[2] + excursion));
      data[index + 3] = 255;       // A

      index += 4;
    }
  }

  const drawX = Math.round(centerX - halfSize);
  const drawY = Math.round(centerY - halfSize);
  ctx.putImageData(imageData, drawX, drawY);
}

/**
 * Renders a 2IFC lateral masking stimulus interval with global orientation support.
 * Target is always rendered at dead center (centerX, centerY).
 * Flankers rotate around the center point based on globalOrientationDegrees (phi).
 * Default globalOrientationDegrees = 90 (vertical top/bottom flankers).
 * If targetPresent is false, only flankers are rendered.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} centerX - Screen center X
 * @param {number} centerY - Screen center Y
 * @param {Object} targetParams - Gabor params for target
 * @param {number} flankerDistanceDegrees - Distance from target to flankers in degrees
 * @param {number} sizeInDegrees - Patch size in degrees
 * @param {number} pixelsPerDegree - Calibration scale (px/deg)
 * @param {boolean} targetPresent - Whether target patch is rendered in this interval (default true)
 * @param {number} globalOrientationDegrees - Global layout rotation angle phi in degrees (default 90°)
 */
export function drawLateralMaskingTrial(
  ctx,
  centerX,
  centerY,
  targetParams,
  flankerDistanceDegrees = DEFAULT_FLANKER_DISTANCE_DEGREES,
  sizeInDegrees = 2.0,
  pixelsPerDegree = 40,
  targetPresent = true,
  globalOrientationDegrees = 90
) {
  // 1. Convert flanker distance to pixels
  const flankerDistance_px = flankerDistanceDegrees * pixelsPerDegree;

  // 2. Compute flanker positions using global orientation angle phi around center
  const phiRad = (globalOrientationDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phiRad);
  const sinPhi = Math.sin(phiRad);

  const flanker1X = centerX + flankerDistance_px * cosPhi;
  const flanker1Y = centerY + flankerDistance_px * sinPhi;

  const flanker2X = centerX - flankerDistance_px * cosPhi;
  const flanker2Y = centerY - flankerDistance_px * sinPhi;

  const flankerParams = createFlankerParams(targetParams);

  // 3. Clear canvas to flat gray
  clearToGray(ctx, ctx.canvas.width, ctx.canvas.height);

  // 4. Render flankers first at contrast 1.0
  drawGaborPatch(ctx, flanker1X, flanker1Y, sizeInDegrees, flankerParams, pixelsPerDegree);
  drawGaborPatch(ctx, flanker2X, flanker2Y, sizeInDegrees, flankerParams, pixelsPerDegree);

  // 5. Render target last at dead center (centerX, centerY) if present in this interval
  if (targetPresent) {
    drawGaborPatch(ctx, centerX, centerY, sizeInDegrees, targetParams, pixelsPerDegree);
  }
}

/**
 * Initializes debug panel if URL query contains ?debug=true
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean} True if debug mode is active
 */
export function initGaborDebug(ctx, canvas) {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') !== 'true') return false;

  let debugContainer = document.getElementById('debugPanel');
  if (!debugContainer) {
    debugContainer = document.createElement('div');
    debugContainer.id = 'debugPanel';
    debugContainer.className = 'debug-panel';
    document.body.appendChild(debugContainer);
  }

  // Determine calibration scale
  let pixelsPerDegree = 40;
  let hasProfile = false;

  try {
    const activeName = localStorage.getItem('activeCalibrationProfile');
    const profilesData = localStorage.getItem('calibrationProfiles');
    if (profilesData) {
      const profiles = JSON.parse(profilesData);
      const activeProf = profiles.find(p => p.profile_name === activeName) || profiles[0];
      if (activeProf && activeProf.pixels_per_degree) {
        pixelsPerDegree = activeProf.pixels_per_degree;
        hasProfile = true;
      }
    }
  } catch (e) {}

  const state = {
    viewMode: 'lateral', // 'single' | 'lateral'
    lambda: 0.2,
    thetaDeg: 0,
    psiDeg: 0,
    sigma: 0.3,
    gamma: 1.0,
    contrast: 0.5,
    sizeInDegrees: 2.0,
    flankerDistanceDegrees: DEFAULT_FLANKER_DISTANCE_DEGREES,
    globalOrientationDegrees: 90,
    targetPresent: true,
    showCrosshair: true
  };

  function renderDebugControls() {
    debugContainer.innerHTML = `
      <div class="debug-header">
        <h3>Gabor 2IFC Debug Tool</h3>
        ${!hasProfile ? '<div class="debug-warning">No calibration profile found — using fallback 40 px/degree for debug preview only.</div>' : ''}
        
        <div class="debug-tab-group">
          <button id="btnTabSingle" class="debug-tab ${state.viewMode === 'single' ? 'active' : ''}">Single Patch</button>
          <button id="btnTabLateral" class="debug-tab ${state.viewMode === 'lateral' ? 'active' : ''}">Lateral Masking (2IFC)</button>
        </div>
      </div>

      <div class="debug-slider-group">
        ${state.viewMode === 'lateral' ? `
          <div class="slider-row">
            <label for="dbgFlankerDist">Flanker Distance: <span id="valFlankerDist">${state.flankerDistanceDegrees.toFixed(1)}°</span></label>
            <input type="range" id="dbgFlankerDist" min="0.5" max="4.0" step="0.1" value="${state.flankerDistanceDegrees}">
          </div>

          <div class="slider-row">
            <label for="dbgPhi">Global Orientation (Phi): <span id="valPhi">${state.globalOrientationDegrees}°</span></label>
            <input type="range" id="dbgPhi" min="45" max="135" step="45" value="${state.globalOrientationDegrees}">
            <div class="slider-ticks">
              <span>45°</span><span>90° (Vertical)</span><span>135°</span>
            </div>
          </div>
        ` : ''}

        <div class="slider-row">
          <label for="dbgLambda">Lambda (Wavelength): <span id="valLambda">${state.lambda.toFixed(2)}°</span></label>
          <input type="range" id="dbgLambda" min="0.05" max="1.0" step="0.01" value="${state.lambda}">
        </div>

        <div class="slider-row">
          <label for="dbgTheta">Theta (Local Orientation): <span id="valTheta">${state.thetaDeg}° (${((state.thetaDeg * Math.PI) / 180).toFixed(2)} rad)</span></label>
          <input type="range" id="dbgTheta" min="0" max="180" step="1" value="${state.thetaDeg}">
          <div class="slider-ticks">
            <span>0°</span><span>45°</span><span>90°</span><span>135°</span><span>180°</span>
          </div>
        </div>

        <div class="slider-row">
          <label for="dbgPsi">Psi (Phase): <span id="valPsi">${state.psiDeg}° (${((state.psiDeg * Math.PI) / 180).toFixed(2)} rad)</span></label>
          <input type="range" id="dbgPsi" min="0" max="360" step="1" value="${state.psiDeg}">
        </div>

        <div class="slider-row">
          <label for="dbgSigma">Sigma (Gaussian Envelope): <span id="valSigma">${state.sigma.toFixed(2)}°</span></label>
          <input type="range" id="dbgSigma" min="0.05" max="1.0" step="0.01" value="${state.sigma}">
        </div>

        <div class="slider-row">
          <label for="dbgGamma">Gamma (Aspect Ratio): <span id="valGamma">${state.gamma.toFixed(2)}</span></label>
          <input type="range" id="dbgGamma" min="0.1" max="1.0" step="0.01" value="${state.gamma}">
        </div>

        <div class="slider-row">
          <label for="dbgContrast">Target Contrast: <span id="valContrast">${state.contrast.toFixed(2)}</span></label>
          <input type="range" id="dbgContrast" min="0.0" max="1.0" step="0.01" value="${state.contrast}">
          ${state.viewMode === 'lateral' ? '<span class="flanker-lock-note">Flankers locked at contrast 1.0</span>' : ''}
        </div>

        ${state.viewMode === 'lateral' ? `
          <div class="checkbox-row mt-2">
            <label class="checkbox-label">
              <input type="checkbox" id="dbgTargetPresent" ${state.targetPresent ? 'checked' : ''}>
              Render target at center (Target Present)
            </label>
          </div>
          <div class="checkbox-row mt-2">
            <label class="checkbox-label">
              <input type="checkbox" id="dbgCrosshair" ${state.showCrosshair ? 'checked' : ''}>
              Show fixation crosshair
            </label>
          </div>
        ` : ''}
      </div>
    `;

    bindSliderEvents();
  }

  function bindSliderEvents() {
    const btnTabSingle = document.getElementById('btnTabSingle');
    const btnTabLateral = document.getElementById('btnTabLateral');

    if (btnTabSingle) {
      btnTabSingle.addEventListener('click', () => {
        state.viewMode = 'single';
        renderDebugControls();
        drawDebugView();
      });
    }

    if (btnTabLateral) {
      btnTabLateral.addEventListener('click', () => {
        state.viewMode = 'lateral';
        renderDebugControls();
        drawDebugView();
      });
    }

    const bind = (id, key, isFloat, updateLabel) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', (e) => {
        state[key] = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
        if (updateLabel) updateLabel();
        drawDebugView();
      });
    };

    bind('dbgFlankerDist', 'flankerDistanceDegrees', true, () => {
      const el = document.getElementById('valFlankerDist');
      if (el) el.textContent = `${state.flankerDistanceDegrees.toFixed(1)}°`;
    });
    bind('dbgPhi', 'globalOrientationDegrees', false, () => {
      const el = document.getElementById('valPhi');
      if (el) el.textContent = `${state.globalOrientationDegrees}°`;
    });
    bind('dbgLambda', 'lambda', true, () => {
      const el = document.getElementById('valLambda');
      if (el) el.textContent = `${state.lambda.toFixed(2)}°`;
    });
    bind('dbgTheta', 'thetaDeg', false, () => {
      const rad = (state.thetaDeg * Math.PI) / 180;
      const el = document.getElementById('valTheta');
      if (el) el.textContent = `${state.thetaDeg}° (${rad.toFixed(2)} rad)`;
    });
    bind('dbgPsi', 'psiDeg', false, () => {
      const rad = (state.psiDeg * Math.PI) / 180;
      const el = document.getElementById('valPsi');
      if (el) el.textContent = `${state.psiDeg}° (${rad.toFixed(2)} rad)`;
    });
    bind('dbgSigma', 'sigma', true, () => {
      const el = document.getElementById('valSigma');
      if (el) el.textContent = `${state.sigma.toFixed(2)}°`;
    });
    bind('dbgGamma', 'gamma', true, () => {
      const el = document.getElementById('valGamma');
      if (el) el.textContent = `${state.gamma.toFixed(2)}`;
    });
    bind('dbgContrast', 'contrast', true, () => {
      const el = document.getElementById('valContrast');
      if (el) el.textContent = `${state.contrast.toFixed(2)}`;
    });

    const chkTargetPresent = document.getElementById('dbgTargetPresent');
    if (chkTargetPresent) {
      chkTargetPresent.addEventListener('change', (e) => {
        state.targetPresent = e.target.checked;
        drawDebugView();
      });
    }

    const chkCrosshair = document.getElementById('dbgCrosshair');
    if (chkCrosshair) {
      chkCrosshair.addEventListener('change', (e) => {
        state.showCrosshair = e.target.checked;
        drawDebugView();
      });
    }
  }

  function drawDebugView() {
    clearToGray(ctx, canvas.width, canvas.height);
    const targetParams = {
      lambda: state.lambda,
      theta: (state.thetaDeg * Math.PI) / 180,
      psi: (state.psiDeg * Math.PI) / 180,
      sigma: state.sigma,
      gamma: state.gamma,
      contrast: state.contrast
    };

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    if (state.viewMode === 'single') {
      drawGaborPatch(ctx, centerX, centerY, state.sizeInDegrees, targetParams, pixelsPerDegree);
    } else {
      drawLateralMaskingTrial(
        ctx,
        centerX,
        centerY,
        targetParams,
        state.flankerDistanceDegrees,
        state.sizeInDegrees,
        pixelsPerDegree,
        state.targetPresent,
        state.globalOrientationDegrees
      );

      if (state.showCrosshair) {
        drawFixationCrosshair(ctx, centerX, centerY, 20);
      }
    }
  }

  renderDebugControls();
  drawDebugView();

  return true;
}
