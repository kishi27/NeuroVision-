// Handles screen calibration math and viewing distance measurement — implemented in Prompt 2 & 9
import { saveCalibrationProfile, getCalibrationProfiles } from './api.js';

const CARD_W_MM = 85.60;
const CARD_H_MM = 53.98;
const CARD_RATIO = CARD_W_MM / CARD_H_MM;

let isStorageAvailable = true;
let memoryProfiles = [];
let lastSaveSyncResult = null;

// Flow state
let currentStep = 'step1_rect'; // 'select_profile' | 'step1_rect' | 'step2_distance' | 'step3_name' | 'step4_confirm'

// Step 1 (Credit Card Sizing) state
let rectWidth = 300;
let rectHeight = 189;
let aspectLocked = true;
let hasAdjusted = false;

// Step 2 (Viewing Distance) state
let pixelsPerMm = null;
let viewingDistanceCm = null;

// Step 3 (Profile Save) state
let pixelsPerDegree = null;
let profileName = '';

let redrawCanvasCallback = null;

export async function initCalibration(redrawCb) {
  redrawCanvasCallback = redrawCb;
  checkStorageSupport();
  bindGlobalEvents();

  // Try to load server profiles first
  const serverProfiles = await getCalibrationProfiles();
  if (Array.isArray(serverProfiles) && serverProfiles.length > 0) {
    saveProfiles(serverProfiles);
  }

  const profiles = getProfiles();
  if (profiles.length > 0) {
    currentStep = 'select_profile';
  } else {
    currentStep = 'step1_rect';
  }

  renderView();
}

function checkStorageSupport() {
  try {
    const testKey = '__test_storage__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    isStorageAvailable = true;
  } catch (e) {
    isStorageAvailable = false;
  }
}

function getProfiles() {
  if (!isStorageAvailable) return memoryProfiles;
  try {
    const data = localStorage.getItem('calibrationProfiles');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return memoryProfiles;
  }
}

function saveProfiles(profilesArray) {
  if (!isStorageAvailable) {
    memoryProfiles = profilesArray;
    return;
  }
  try {
    localStorage.setItem('calibrationProfiles', JSON.stringify(profilesArray));
  } catch (e) {
    memoryProfiles = profilesArray;
  }
}

function getActiveProfileName() {
  if (!isStorageAvailable) {
    return memoryProfiles.length > 0 ? memoryProfiles[memoryProfiles.length - 1].profile_name : null;
  }
  try {
    return localStorage.getItem('activeCalibrationProfile');
  } catch (e) {
    return null;
  }
}

function setActiveProfileName(name) {
  if (isStorageAvailable) {
    try {
      localStorage.setItem('activeCalibrationProfile', name);
    } catch (e) {}
  }
}

export function resetCalibrationFlow() {
  rectWidth = 300;
  rectHeight = 189;
  aspectLocked = true;
  hasAdjusted = false;
  pixelsPerMm = null;
  viewingDistanceCm = null;
  pixelsPerDegree = null;
  profileName = '';
  lastSaveSyncResult = null;

  const profiles = getProfiles();
  if (profiles.length > 0) {
    currentStep = 'select_profile';
  } else {
    currentStep = 'step1_rect';
  }

  renderView();
  if (redrawCanvasCallback) redrawCanvasCallback();
}

export function drawCalibration(ctx, canvasWidth, canvasHeight) {
  if (currentStep === 'step1_rect') {
    const x = Math.round((canvasWidth - rectWidth) / 2);
    
    // Position the rectangle in the lower open area of the viewport below the control card
    const cardPanelEl = document.querySelector('#viewCalibrate .card-panel');
    let minY = 440;
    if (cardPanelEl) {
      const rect = cardPanelEl.getBoundingClientRect();
      minY = Math.max(minY, rect.bottom + 30);
    }
    
    const y = Math.round(Math.max(minY, (canvasHeight - rectHeight) * 0.72));

    ctx.save();
    
    // Fill rectangle with semi-transparent card background preview
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fillRect(x, y, rectWidth, rectHeight);
    
    // Draw bold outer border
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3b82f6';
    ctx.strokeRect(x, y, rectWidth, rectHeight);
    
    // Draw inner dashed line
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.strokeRect(x + 4, y + 4, rectWidth - 8, rectHeight - 8);

    // Label text inside rectangle
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Place Card Here', x + rectWidth / 2, y + rectHeight / 2);

    ctx.restore();
  }
}

function bindGlobalEvents() {
  window.removeEventListener('keydown', handleKeyDown);
  window.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e) {
  const viewCalibrate = document.getElementById('viewCalibrate');
  if (!viewCalibrate || viewCalibrate.style.display === 'none') return;
  if (currentStep !== 'step1_rect') return;

  const step = e.shiftKey ? 10 : 1;

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    adjustWidth(step);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    adjustWidth(-step);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    adjustHeight(step);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    adjustHeight(-step);
  }
}

function adjustWidth(delta) {
  let newW = rectWidth + delta;
  newW = Math.max(50, Math.min(2000, newW));
  if (newW !== rectWidth || !hasAdjusted) {
    rectWidth = newW;
    hasAdjusted = true;
    if (aspectLocked) {
      let newH = Math.round(rectWidth / CARD_RATIO);
      newH = Math.max(30, Math.min(1300, newH));
      rectHeight = newH;
      rectWidth = Math.round(rectHeight * CARD_RATIO);
    }
    updateStep1UI();
    if (redrawCanvasCallback) redrawCanvasCallback();
  }
}

function adjustHeight(delta) {
  let newH = rectHeight + delta;
  newH = Math.max(30, Math.min(1300, newH));
  if (newH !== rectHeight || !hasAdjusted) {
    rectHeight = newH;
    hasAdjusted = true;
    if (aspectLocked) {
      let newW = Math.round(rectHeight * CARD_RATIO);
      newW = Math.max(50, Math.min(2000, newW));
      rectWidth = newW;
      rectHeight = Math.round(rectWidth / CARD_RATIO);
    }
    updateStep1UI();
    if (redrawCanvasCallback) redrawCanvasCallback();
  }
}

function updateStep1UI() {
  const dimsEl = document.getElementById('rectDimensions');
  if (dimsEl) {
    dimsEl.textContent = `${rectWidth}px × ${rectHeight}px`;
  }
  const btnConfirm = document.getElementById('btnConfirmRect');
  if (btnConfirm) {
    btnConfirm.disabled = !hasAdjusted;
  }
}

function renderView() {
  const container = document.getElementById('viewCalibrate');
  if (!container) return;

  const profiles = getProfiles();
  const activeName = getActiveProfileName() || (profiles.length > 0 ? profiles[0].profile_name : null);

  let html = '';

  if (!isStorageAvailable) {
    html += `
      <div class="warning-banner">
        Your browser is blocking local storage — calibration won't be remembered between sessions.
      </div>
    `;
  }

  if (profiles.length > 0) {
    html += `
      <div class="profile-select-card">
        <label for="profileSelect" class="input-label">Active calibration profile</label>
        <select id="profileSelect" class="select-input">
          <option value="__NEW__">+ New Profile</option>
          ${profiles.map(p => `
            <option value="${escapeHtml(p.profile_name)}" ${p.profile_name === activeName && currentStep === 'select_profile' ? 'selected' : ''}>
              ${escapeHtml(p.profile_name)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  if (currentStep === 'select_profile' && profiles.length > 0) {
    const selectedProfile = profiles.find(p => p.profile_name === activeName) || profiles[0];
    setActiveProfileName(selectedProfile.profile_name);

    html += `
      <div class="card-panel">
        <h2 class="panel-title">${escapeHtml(selectedProfile.profile_name)}</h2>
        <div class="profile-details-grid">
          <div class="detail-item">
            <span class="detail-label">Pixels per degree:</span>
            <span class="detail-value highlight">${selectedProfile.pixels_per_degree.toFixed(2)} px/deg</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Viewing distance:</span>
            <span class="detail-value">${selectedProfile.viewing_distance_cm} cm</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Pixels per mm:</span>
            <span class="detail-value">${selectedProfile.pixels_per_mm.toFixed(2)} px/mm</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Screen resolution:</span>
            <span class="detail-value">${selectedProfile.screen_resolution_w} × ${selectedProfile.screen_resolution_h}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Calibrated on:</span>
            <span class="detail-value">${new Date(selectedProfile.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="btn-group">
          <button id="btnRecalibrateActive" class="btn btn-primary">Recalibrate this profile</button>
        </div>
      </div>
    `;
  } else if (currentStep === 'step1_rect') {
    html += `
      <div class="card-panel">
        <h2 class="panel-title">Step 1: Credit Card Sizing</h2>
        <p class="instruction-text">
          Hold a credit or debit card flat against your screen on the blue rectangle below. Use the arrow keys (or the +/- buttons) to resize until its edges match your card.
        </p>

        <div class="dimensions-badge" id="rectDimensions">${rectWidth}px × ${rectHeight}px</div>

        <div class="controls-section">
          <div class="control-row">
            <span class="control-label">Width:</span>
            <button class="btn btn-sm" id="btnWMinus10">Width -10</button>
            <button class="btn btn-sm" id="btnWMinus">Width -</button>
            <button class="btn btn-sm" id="btnWPlus">Width +</button>
            <button class="btn btn-sm" id="btnWPlus10">Width +10</button>
          </div>
          <div class="control-row">
            <span class="control-label">Height:</span>
            <button class="btn btn-sm" id="btnHMinus10">Height -10</button>
            <button class="btn btn-sm" id="btnHMinus">Height -</button>
            <button class="btn btn-sm" id="btnHPlus">Height +</button>
            <button class="btn btn-sm" id="btnHPlus10">Height +10</button>
          </div>
        </div>

        <div class="checkbox-row">
          <label class="checkbox-label">
            <input type="checkbox" id="aspectLock" ${aspectLocked ? 'checked' : ''}>
            Aspect Ratio Lock (85.60 : 53.98)
          </label>
        </div>

        <div class="btn-group">
          <button id="btnConfirmRect" class="btn btn-primary" ${!hasAdjusted ? 'disabled' : ''}>Confirm Card Size</button>
        </div>
      </div>
    `;
  } else if (currentStep === 'step2_distance') {
    html += `
      <div class="card-panel">
        <h2 class="panel-title">Step 2: Viewing Distance</h2>
        <div class="form-group">
          <label for="distanceInput" class="input-label">Viewing distance from screen (in centimeters)</label>
          <p class="helper-text">
            Measure the distance from your eyes to the screen with a tape measure or ruler. If you don't have one handy, a rough estimate: an outstretched arm is about 60-70cm, and 5 feet is about 150cm.
          </p>
          <input type="number" id="distanceInput" class="text-input" placeholder="150" step="any">
          <div id="distanceError" class="error-msg" style="display: none;"></div>
        </div>

        <div class="btn-group">
          <button id="btnContinueDistance" class="btn btn-primary" disabled>Continue</button>
        </div>
      </div>
    `;
  } else if (currentStep === 'step3_name') {
    html += `
      <div class="card-panel">
        <h2 class="panel-title">Step 3: Save Calibration Profile</h2>
        <div class="form-group">
          <label for="profileNameInput" class="input-label">Name this setup</label>
          <input type="text" id="profileNameInput" class="text-input" placeholder="My Screen">
        </div>

        <div class="btn-group">
          <button id="btnSaveProfile" class="btn btn-primary" disabled>Save Calibration Profile</button>
        </div>
      </div>
    `;
  } else if (currentStep === 'step4_confirm') {
    const isOffline = lastSaveSyncResult && lastSaveSyncResult.queued;
    html += `
      <div class="card-panel text-center">
        <h2 class="panel-title">Calibration Complete</h2>
        <p class="confirmation-text">
          Calibration saved successfully. Pixels per degree: <strong>${pixelsPerDegree.toFixed(2)}</strong>.
        </p>

        <div class="btn-group" style="justify-content: center;">
          <button id="btnRecalibrateFresh" class="btn btn-primary">Recalibrate</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  attachEventListeners();
  if (redrawCanvasCallback) redrawCanvasCallback();
}

function attachEventListeners() {
  const profileSel = document.getElementById('profileSelect');
  if (profileSel) {
    profileSel.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === '__NEW__') {
        rectWidth = 300;
        rectHeight = 189;
        aspectLocked = true;
        hasAdjusted = false;
        currentStep = 'step1_rect';
        renderView();
        if (redrawCanvasCallback) redrawCanvasCallback();
      } else {
        setActiveProfileName(val);
        currentStep = 'select_profile';
        renderView();
        if (redrawCanvasCallback) redrawCanvasCallback();
      }
    });
  }

  const btnRecalibrateActive = document.getElementById('btnRecalibrateActive');
  if (btnRecalibrateActive) {
    btnRecalibrateActive.addEventListener('click', () => {
      rectWidth = 300;
      rectHeight = 189;
      aspectLocked = true;
      hasAdjusted = false;
      currentStep = 'step1_rect';
      renderView();
      if (redrawCanvasCallback) redrawCanvasCallback();
    });
  }

  // Step 1 controls
  const aspectCheckbox = document.getElementById('aspectLock');
  if (aspectCheckbox) {
    aspectCheckbox.addEventListener('change', (e) => {
      aspectLocked = e.target.checked;
    });
  }

  const btnWMinus10 = document.getElementById('btnWMinus10');
  const btnWMinus = document.getElementById('btnWMinus');
  const btnWPlus = document.getElementById('btnWPlus');
  const btnWPlus10 = document.getElementById('btnWPlus10');
  if (btnWMinus10) btnWMinus10.addEventListener('click', () => adjustWidth(-10));
  if (btnWMinus) btnWMinus.addEventListener('click', () => adjustWidth(-1));
  if (btnWPlus) btnWPlus.addEventListener('click', () => adjustWidth(1));
  if (btnWPlus10) btnWPlus10.addEventListener('click', () => adjustWidth(10));

  const btnHMinus10 = document.getElementById('btnHMinus10');
  const btnHMinus = document.getElementById('btnHMinus');
  const btnHPlus = document.getElementById('btnHPlus');
  const btnHPlus10 = document.getElementById('btnHPlus10');
  if (btnHMinus10) btnHMinus10.addEventListener('click', () => adjustHeight(-10));
  if (btnHMinus) btnHMinus.addEventListener('click', () => adjustHeight(-1));
  if (btnHPlus) btnHPlus.addEventListener('click', () => adjustHeight(1));
  if (btnHPlus10) btnHPlus10.addEventListener('click', () => adjustHeight(10));

  const btnConfirmRect = document.getElementById('btnConfirmRect');
  if (btnConfirmRect) {
    btnConfirmRect.addEventListener('click', () => {
      pixelsPerMm = rectWidth / CARD_W_MM;
      currentStep = 'step2_distance';
      renderView();
      if (redrawCanvasCallback) redrawCanvasCallback();
    });
  }

  // Step 2 controls
  const distanceInput = document.getElementById('distanceInput');
  const distanceError = document.getElementById('distanceError');
  const btnContinueDistance = document.getElementById('btnContinueDistance');

  if (distanceInput) {
    distanceInput.addEventListener('input', () => {
      const valStr = distanceInput.value.trim();
      if (valStr === '') {
        distanceError.textContent = 'Please enter your viewing distance in centimeters.';
        distanceError.style.display = 'block';
        btnContinueDistance.disabled = true;
        return;
      }

      const val = parseFloat(valStr);
      if (isNaN(val)) {
        distanceError.textContent = 'Please enter your viewing distance in centimeters.';
        distanceError.style.display = 'block';
        btnContinueDistance.disabled = true;
      } else if (val <= 20 || val >= 500) {
        distanceError.textContent = 'Please enter a realistic viewing distance between 20cm and 500cm.';
        distanceError.style.display = 'block';
        btnContinueDistance.disabled = true;
      } else {
        distanceError.style.display = 'none';
        btnContinueDistance.disabled = false;
      }
    });
  }

  if (btnContinueDistance) {
    btnContinueDistance.addEventListener('click', () => {
      const val = parseFloat(distanceInput.value.trim());
      viewingDistanceCm = val;
      currentStep = 'step3_name';
      renderView();
      if (redrawCanvasCallback) redrawCanvasCallback();
    });
  }

  // Step 3 controls
  const profileNameInput = document.getElementById('profileNameInput');
  const btnSaveProfile = document.getElementById('btnSaveProfile');

  if (profileNameInput) {
    profileNameInput.addEventListener('input', () => {
      const valStr = profileNameInput.value.trim();
      btnSaveProfile.disabled = valStr === '';
    });
  }

  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async () => {
      profileName = profileNameInput.value.trim();
      const viewingDistanceMm = viewingDistanceCm * 10;
      pixelsPerDegree = pixelsPerMm * viewingDistanceMm * Math.tan(Math.PI / 180);

      const profile = {
        profile_name: profileName,
        pixels_per_mm: pixelsPerMm,
        viewing_distance_cm: viewingDistanceCm,
        pixels_per_degree: pixelsPerDegree,
        screen_resolution_w: window.screen.width,
        screen_resolution_h: window.screen.height,
        created_at: new Date().toISOString()
      };

      const profiles = getProfiles();
      const existingIdx = profiles.findIndex(p => p.profile_name === profile.profile_name);
      if (existingIdx >= 0) {
        profiles[existingIdx] = profile;
      } else {
        profiles.push(profile);
      }
      saveProfiles(profiles);
      setActiveProfileName(profile.profile_name);

      // Attempt POST to backend API via api.js
      lastSaveSyncResult = await saveCalibrationProfile(profile);

      currentStep = 'step4_confirm';
      renderView();
      if (redrawCanvasCallback) redrawCanvasCallback();
    });
  }

  // Step 4 controls
  const btnRecalibrateFresh = document.getElementById('btnRecalibrateFresh');
  if (btnRecalibrateFresh) {
    btnRecalibrateFresh.addEventListener('click', () => {
      resetCalibrationFlow();
    });
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
