// Settings View — implemented in Prompt 12 & Refactored for Prompt 14
import {
  getCalibrationProfiles,
  updateCalibrationProfile,
  deleteCalibrationProfile
} from './api.js';
import {
  isNotificationSupported,
  getReminderSettings,
  setReminderSettings,
  requestNotificationPermission
} from './reminders.js';

export async function initSettingsView() {
  const container = document.getElementById('viewSettings');
  if (!container) return;

  renderSettingsLayout(container);
}

async function renderSettingsLayout(container) {
  let profiles = await getCalibrationProfiles();
  if (!Array.isArray(profiles)) {
    try {
      const data = localStorage.getItem('calibrationProfiles');
      profiles = data ? JSON.parse(data) : [];
    } catch (e) {
      profiles = [];
    }
  }

  const targetStr = localStorage.getItem('weeklySessionTarget');
  let weeklyTarget = parseInt(targetStr, 10);
  if (isNaN(weeklyTarget) || weeklyTarget < 1 || weeklyTarget > 7) {
    weeklyTarget = 3;
  }

  const notifSupported = isNotificationSupported();
  const reminderSettings = getReminderSettings();

  const defaultFlanker = parseFloat(localStorage.getItem('flankerDistanceDegrees')) || 2.0;
  const defaultDuration = parseInt(localStorage.getItem('stimulusDurationMs'), 10) || 450;

  const hasPersonalizedLambda = Boolean(localStorage.getItem('personalizedLambdaByOrientation'));
  const usePersonalizedLambda = localStorage.getItem('usePersonalizedLambda') === 'true';

  container.innerHTML = `
    <!-- 1. Calibration Profile Management -->
    <div class="card-panel">
      <h2 class="panel-title">Calibration Profiles</h2>
      <p class="instruction-text">Manage your saved screen calibration setups below.</p>

      ${profiles.length === 0 ? `
        <div class="helper-text">No saved profiles found. Head to the Calibrate tab to create one.</div>
      ` : `
        <div class="profile-management-list" style="display: flex; flex-direction: column; gap: 12px;">
          ${profiles.map((p, idx) => `
            <div class="profile-item-row" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0, 0, 0, 0.2); padding: 12px 16px; border-radius: 8px;">
              <div>
                <div style="font-weight: 600; font-size: 15px; color: #ffffff;">${escapeHtml(p.profile_name)}</div>
                <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">
                  ${p.pixels_per_degree.toFixed(2)} px/deg • ${p.viewing_distance_cm}cm distance
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-rename" data-id="${p.id || idx}" data-name="${escapeHtml(p.profile_name)}">Rename</button>
                <button class="btn btn-sm btn-delete" style="background: rgba(220, 38, 38, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #f87171;" data-id="${p.id || idx}" data-name="${escapeHtml(p.profile_name)}">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- 2. Consistency & Target Settings -->
    <div class="card-panel">
      <h2 class="panel-title">Consistency Goal</h2>
      <div class="form-group" style="margin-bottom: 0;">
        <label for="settingsTargetInput" class="input-label">Weekly session target</label>
        <p class="helper-text">Target number of sessions per week (recommended: 3 to 5).</p>
        <div style="display: flex; align-items: center; gap: 12px;">
          <input type="number" id="settingsTargetInput" min="1" max="7" value="${weeklyTarget}" class="text-input" style="width: 100px;">
          <span id="targetSaveBadge" style="font-size: 12px; color: #34d399; display: none;">Saved</span>
        </div>
        <div id="settingsTargetError" class="error-msg" style="display: none;"></div>
      </div>
    </div>

    <!-- 3. Reminder Settings -->
    ${notifSupported ? `
      <div class="card-panel">
        <h2 class="panel-title">Daily Training Reminders</h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div class="checkbox-row" style="margin-bottom: 0;">
            <label class="checkbox-label">
              <input type="checkbox" id="settingsReminderToggle" ${reminderSettings.enabled && Notification.permission === 'granted' ? 'checked' : ''}>
              Remind me to train
            </label>
          </div>

          <div id="settingsReminderTimeRow" style="display: ${reminderSettings.enabled && Notification.permission === 'granted' ? 'flex' : 'none'}; align-items: center; gap: 10px;">
            <label for="settingsReminderTimeInput" style="font-size: 13px; color: #9ca3af;">Remind me at:</label>
            <input type="time" id="settingsReminderTimeInput" value="${reminderSettings.time}" class="text-input" style="width: 130px;">
          </div>

          <div id="settingsReminderNotice" class="helper-text" style="display: none; color: #9ca3af; font-size: 12px;"></div>
        </div>
      </div>
    ` : ''}

    <!-- 4. Advanced Settings Accordion -->
    <div class="card-panel">
      <details>
        <summary style="font-size: 16px; font-weight: 600; color: #f3f4f6; cursor: pointer; user-select: none;">
          Advanced Stimulus & Layout Parameters
        </summary>
        
        <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 16px;">
          <div class="checkbox-row" style="margin-bottom: 0;">
            <label class="checkbox-label" style="${!hasPersonalizedLambda ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
              <input type="checkbox" id="usePersonalizedLambdaToggle" ${usePersonalizedLambda ? 'checked' : ''} ${!hasPersonalizedLambda ? 'disabled' : ''}>
              Use personalized spatial frequency (requires completing a Spatial Frequency session first)
            </label>
            ${!hasPersonalizedLambda ? `
              <p class="helper-text" style="color: #9ca3af; font-size: 12px; margin-top: 4px;">Complete a Spatial Frequency session (Mode B) in the Train tab to unlock this setting.</p>
            ` : `
              <p class="helper-text" style="color: #34d399; font-size: 12px; margin-top: 4px;">Personalized lambda values loaded from your Spatial Frequency session.</p>
            `}
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label for="flankerDistanceInput" class="input-label">Flanker Separation Distance (Degrees)</label>
            <p class="helper-text">Distance between the target and the flanking patterns. Default: 2.0°. Only change this if you understand what it does.</p>
            <input type="number" id="flankerDistanceInput" step="0.1" min="0.5" max="4.0" value="${defaultFlanker}" class="text-input" style="width: 140px;">
            <div id="flankerDistanceError" class="error-msg" style="display: none;"></div>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label for="stimulusDurationInput" class="input-label">Stimulus Display Duration (Milliseconds)</label>
            <p class="helper-text">How long each pattern flashes on screen. Nystagmus training uses a slower flash (400-500ms) than standard vision tests (200ms). Default: 450ms. Only change this if you understand what it does.</p>
            <input type="number" id="stimulusDurationInput" step="10" min="300" max="600" value="${defaultDuration}" class="text-input" style="width: 140px;">
            <div id="stimulusDurationError" class="error-msg" style="display: none;"></div>
          </div>
        </div>
      </details>
    </div>
  `;

  bindSettingsEvents(container, profiles);
}

function bindSettingsEvents(container, profiles) {
  // Personalized Spatial Frequency Toggle
  const lambdaToggle = document.getElementById('usePersonalizedLambdaToggle');
  if (lambdaToggle) {
    lambdaToggle.addEventListener('change', (e) => {
      localStorage.setItem('usePersonalizedLambda', e.target.checked ? 'true' : 'false');
    });
  }

  // Profile Rename
  container.querySelectorAll('.btn-rename').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const oldName = btn.getAttribute('data-name');
      const newName = prompt(`Enter new profile name for '${oldName}':`, oldName);
      if (!newName || newName.trim() === '' || newName.trim() === oldName) return;

      const cleanName = newName.trim();
      let localProfiles = [];
      try {
        const data = localStorage.getItem('calibrationProfiles');
        localProfiles = data ? JSON.parse(data) : [];
      } catch (e) {}

      const idx = localProfiles.findIndex((p) => p.profile_name === oldName || String(p.id) === String(id));
      if (idx >= 0) {
        localProfiles[idx].profile_name = cleanName;
        localStorage.setItem('calibrationProfiles', JSON.stringify(localProfiles));
      }

      if (localStorage.getItem('activeCalibrationProfile') === oldName) {
        localStorage.setItem('activeCalibrationProfile', cleanName);
      }

      if (!isNaN(parseInt(id, 10))) {
        await updateCalibrationProfile(parseInt(id, 10), cleanName);
      }

      renderSettingsLayout(container);
    });
  });

  // Profile Delete
  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');

      if (!confirm(`Delete '${name}'? This cannot be undone.`)) return;

      let localProfiles = [];
      try {
        const data = localStorage.getItem('calibrationProfiles');
        localProfiles = data ? JSON.parse(data) : [];
      } catch (e) {}

      const filtered = localProfiles.filter((p) => p.profile_name !== name && String(p.id) !== String(id));
      localStorage.setItem('calibrationProfiles', JSON.stringify(filtered));

      if (localStorage.getItem('activeCalibrationProfile') === name) {
        localStorage.removeItem('activeCalibrationProfile');
      }

      if (!isNaN(parseInt(id, 10))) {
        await deleteCalibrationProfile(parseInt(id, 10));
      }

      renderSettingsLayout(container);
    });
  });

  // Weekly Target Input Validation
  const targetInput = document.getElementById('settingsTargetInput');
  const targetError = document.getElementById('settingsTargetError');
  const targetBadge = document.getElementById('targetSaveBadge');

  if (targetInput) {
    targetInput.addEventListener('input', () => {
      const val = parseInt(targetInput.value.trim(), 10);
      if (isNaN(val) || val < 1 || val > 7) {
        if (targetError) {
          targetError.textContent = 'Please enter a valid weekly session target between 1 and 7.';
          targetError.style.display = 'block';
        }
      } else {
        if (targetError) targetError.style.display = 'none';
        localStorage.setItem('weeklySessionTarget', String(val));
        if (targetBadge) {
          targetBadge.style.display = 'inline';
          setTimeout(() => { targetBadge.style.display = 'none'; }, 1500);
        }
      }
    });
  }

  // Reminder Toggle & Time
  const reminderToggle = document.getElementById('settingsReminderToggle');
  const reminderTimeRow = document.getElementById('settingsReminderTimeRow');
  const reminderTimeInput = document.getElementById('settingsReminderTimeInput');
  const reminderNotice = document.getElementById('settingsReminderNotice');

  if (reminderToggle) {
    reminderToggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        if (reminderNotice) {
          reminderNotice.textContent = 'This will ask your browser for permission to show a daily reminder notification. You can turn this off anytime.';
          reminderNotice.style.display = 'block';
        }
        const perm = await requestNotificationPermission();
        if (perm === 'granted') {
          setReminderSettings(true, reminderTimeInput ? reminderTimeInput.value : '18:00');
          if (reminderTimeRow) reminderTimeRow.style.display = 'flex';
          if (reminderNotice) {
            reminderNotice.textContent = 'Daily reminder active.';
            reminderNotice.style.display = 'block';
          }
        } else {
          e.target.checked = false;
          setReminderSettings(false);
          if (reminderTimeRow) reminderTimeRow.style.display = 'none';
          if (reminderNotice) {
            reminderNotice.textContent = "Notifications weren't allowed. You can enable them later in your browser settings if you change your mind.";
            reminderNotice.style.display = 'block';
          }
        }
      } else {
        setReminderSettings(false);
        if (reminderTimeRow) reminderTimeRow.style.display = 'none';
        if (reminderNotice) reminderNotice.style.display = 'none';
      }
    });
  }

  if (reminderTimeInput) {
    reminderTimeInput.addEventListener('change', (e) => {
      setReminderSettings(reminderToggle ? reminderToggle.checked : false, e.target.value);
    });
  }

  // Advanced Settings Input Validation
  const flankerInput = document.getElementById('flankerDistanceInput');
  const flankerError = document.getElementById('flankerDistanceError');

  if (flankerInput) {
    flankerInput.addEventListener('input', () => {
      const val = parseFloat(flankerInput.value.trim());
      if (isNaN(val) || val < 0.5 || val > 4.0) {
        if (flankerError) {
          flankerError.textContent = 'Flanker separation distance must be between 0.5° and 4.0°.';
          flankerError.style.display = 'block';
        }
      } else {
        if (flankerError) flankerError.style.display = 'none';
        localStorage.setItem('flankerDistanceDegrees', String(val));
      }
    });
  }

  const durationInput = document.getElementById('stimulusDurationInput');
  const durationError = document.getElementById('stimulusDurationError');

  if (durationInput) {
    durationInput.addEventListener('input', () => {
      const val = parseInt(durationInput.value.trim(), 10);
      if (isNaN(val) || val < 300 || val > 600) {
        if (durationError) {
          durationError.textContent = 'Stimulus duration must be between 300ms and 600ms.';
          durationError.style.display = 'block';
        }
      } else {
        if (durationError) durationError.style.display = 'none';
        localStorage.setItem('stimulusDurationMs', String(val));
      }
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
