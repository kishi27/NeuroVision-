// Dashboard View — implemented in Prompt 10 & 14
import { getSessions, deleteSession } from './api.js';

let chartInstance = null;
let currentFilter = 'all'; // 'week' | 'month' | 'all'
let rawSessions = [];

export async function initDashboardView(onSwitchView) {
  const container = document.getElementById('viewDashboard');
  if (!container) return;

  container.innerHTML = `
    <div id="dashboardLoadingNotice" class="card-panel text-center">
      <p class="instruction-text">Loading dashboard metrics...</p>
    </div>
  `;

  const sessions = await getSessions();

  if (sessions === null) {
    container.innerHTML = `
      <div class="card-panel text-center">
        <h2 class="panel-title" style="color: #f87171;">Server Connection Unavailable</h2>
        <p class="instruction-text">
          Could not reach backend server and no offline sessions were found.
        </p>
        <div class="btn-group text-center" style="justify-content: center;">
          <button id="btnRetryDashboard" class="btn btn-primary">Retry Loading</button>
        </div>
      </div>
    `;
    document.getElementById('btnRetryDashboard')?.addEventListener('click', () => initDashboardView(onSwitchView));
    return;
  }

  rawSessions = sessions;
  renderDashboardLayout(container, onSwitchView);
}

function filterSessions(sessions, filterMode) {
  if (!Array.isArray(sessions)) return [];
  const now = new Date();

  return sessions.filter((s) => {
    const started = new Date(s.started_at);
    if (isNaN(started.getTime())) return false;

    if (filterMode === 'week') {
      const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      return started >= oneWeekAgo;
    }
    if (filterMode === 'month') {
      const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      return started >= oneMonthAgo;
    }
    return true;
  });
}

function getThresholdForAngle(session, targetTheta) {
  const results = session.orientation_results || session.orientationResults;
  if (!Array.isArray(results)) return null;

  const match = results.find((r) => {
    const deg = r.theta_degrees !== undefined ? r.theta_degrees : r.orientationDegrees;
    return Math.abs(deg - targetTheta) < 1.0;
  });

  if (!match) return null;
  const thresh = match.threshold_contrast !== undefined ? match.threshold_contrast : match.thresholdEstimate;
  return thresh !== undefined ? thresh : null;
}

function computeStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => new Date(s.started_at).toISOString().split('T')[0]));

  let streak = 0;
  const today = new Date();
  let checkDate = new Date(today);

  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (days.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      if (streak === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        const yesterdayStr = checkDate.toISOString().split('T')[0];
        if (days.has(yesterdayStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
      }
      break;
    }
  }
  return streak;
}

function computeWeeklySessionsCount(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  const weekSessions = sessions.filter((s) => new Date(s.started_at) >= oneWeekAgo);
  const uniqueDays = new Set(weekSessions.map((s) => new Date(s.started_at).toISOString().split('T')[0]));
  return uniqueDays.size;
}

function renderDashboardLayout(container, onSwitchView) {
  const totalSessionsCount = rawSessions.length;

  if (totalSessionsCount === 0) {
    container.innerHTML = `
      <div class="card-panel text-center">
        <h2 class="panel-title">No Training History Yet</h2>
        <p class="instruction-text">
          You haven't completed any vision training sessions yet.
        </p>
        <div class="btn-group text-center" style="justify-content: center;">
          <button id="btnEmptyTrain" class="btn btn-primary">Start First Session</button>
        </div>
      </div>
    `;
    document.getElementById('btnEmptyTrain')?.addEventListener('click', () => onSwitchView('train'));
    return;
  }

  const currentStreak = computeStreak(rawSessions);
  const weeklyCount = computeWeeklySessionsCount(rawSessions);

  const targetStr = localStorage.getItem('weeklySessionTarget');
  let weeklyTarget = parseInt(targetStr, 10);
  if (isNaN(weeklyTarget) || weeklyTarget < 1 || weeklyTarget > 7) {
    weeklyTarget = 3;
  }

  container.innerHTML = `
    <!-- Top Metrics Overview -->
    <div class="metrics-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
      <div class="card-panel text-center" style="margin-bottom: 0;">
        <span class="hud-label">Current Streak</span>
        <div style="font-size: 28px; font-weight: 700; color: #38bdf8; margin-top: 4px;">
          ${currentStreak} ${currentStreak === 1 ? 'day' : 'days'} 🔥
        </div>
      </div>

      <div class="card-panel text-center" style="margin-bottom: 0;">
        <span class="hud-label">This Week's Goal</span>
        <div style="font-size: 28px; font-weight: 700; color: ${weeklyCount >= weeklyTarget ? '#34d399' : '#facc15'}; margin-top: 4px;">
          ${weeklyCount} / ${weeklyTarget} sessions
        </div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
          ${weeklyCount >= weeklyTarget ? 'Goal reached!' : `${weeklyTarget - weeklyCount} more needed`}
        </div>
      </div>

      <div class="card-panel text-center" style="margin-bottom: 0;">
        <span class="hud-label">Total Completed</span>
        <div style="font-size: 28px; font-weight: 700; color: #a78bfa; margin-top: 4px;">
          ${totalSessionsCount} sessions
        </div>
      </div>
    </div>

    <!-- Filter Controls Bar -->
    <div class="card-panel" style="margin-bottom: 20px;">
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;">
        <div class="btn-group" style="margin: 0;">
          <button id="btnFilterAll" class="btn filter-tab ${currentFilter === 'all' ? 'active' : ''}">All Time</button>
          <button id="btnFilterMonth" class="btn filter-tab ${currentFilter === 'month' ? 'active' : ''}">Past 30 Days</button>
          <button id="btnFilterWeek" class="btn filter-tab ${currentFilter === 'week' ? 'active' : ''}">Past 7 Days</button>
        </div>

        <div class="btn-group hide-on-print" style="margin: 0; gap: 8px;">
          <button id="btnExportCSV" class="btn" style="background: rgba(255, 255, 255, 0.12); font-size: 13px;">📥 Export CSV</button>
          <button id="btnPrintSummary" class="btn" style="background: rgba(255, 255, 255, 0.12); font-size: 13px;">🖨️ Print Report</button>
        </div>
      </div>
    </div>

    <!-- Main Chart Panel (Standard Mode Contrast Sensitivity) -->
    <div id="chartContainer" class="card-panel" style="margin-bottom: 20px;">
      <h3 style="font-size: 16px; margin-bottom: 4px; color: #f3f4f6;">Standard Mode Contrast Sensitivity Progression</h3>
      <p style="font-size: 12px; color: #9ca3af; margin-bottom: 16px;">Lower contrast values indicate higher visual sensitivity.</p>
      <div style="position: relative; height: 320px; width: 100%;">
        <canvas id="dashboardChart"></canvas>
      </div>
    </div>

    <!-- Empty Filter Notice -->
    <div id="filterEmptyNotice" class="card-panel text-center" style="display: none;">
      <p class="instruction-text">No sessions completed during the selected time period.</p>
    </div>

    <!-- Main Training History Table (Standard Mode) -->
    <div class="card-panel">
      <h3 style="font-size: 16px; margin-bottom: 12px; color: #f3f4f6;">Standard Mode Contrast Threshold Log</h3>
      <div class="table-wrapper">
        <table id="dashboardTable" class="summary-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Duration</th>
              <th>Trials</th>
              <th>Correct</th>
              <th>Accuracy</th>
              <th>0°</th>
              <th>45°</th>
              <th>90°</th>
              <th>135°</th>
              <th class="hide-on-print">Actions</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- Separate Table for Spatial Frequency & Global Orientation History -->
    <div class="card-panel" style="margin-top: 20px;">
      <h3 style="font-size: 16px; margin-bottom: 8px; color: #60a5fa;">Spatial Frequency & Global Orientation Session History</h3>
      <p style="font-size: 12px; color: #9ca3af; margin-bottom: 16px;">
        View Spatial Frequency (Mode B) and Global Orientation (Mode C) session history separately below.
      </p>
      <div id="advancedModesHistoryContainer"></div>
    </div>
  `;

  bindFilterEvents(container, onSwitchView);
  updateDashboardContent(container, onSwitchView);
}

function bindFilterEvents(container, onSwitchView) {
  const setFilter = (mode) => {
    currentFilter = mode;
    document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
    document.getElementById(`btnFilter${mode.charAt(0).toUpperCase() + mode.slice(1)}`)?.classList.add('active');
    updateDashboardContent(container, onSwitchView);
  };

  document.getElementById('btnFilterWeek')?.addEventListener('click', () => setFilter('week'));
  document.getElementById('btnFilterMonth')?.addEventListener('click', () => setFilter('month'));
  document.getElementById('btnFilterAll')?.addEventListener('click', () => setFilter('all'));

  document.getElementById('btnExportCSV')?.addEventListener('click', () => {
    exportCurrentViewCSV();
  });

  document.getElementById('btnPrintSummary')?.addEventListener('click', () => {
    window.print();
  });
}

function updateDashboardContent(container, onSwitchView) {
  const allFilteredSessions = filterSessions(rawSessions, currentFilter);

  // Filter ONLY standard mode sessions for the primary chart and contrast log
  const standardSessions = allFilteredSessions.filter((s) => !s.session_mode || s.session_mode === 'standard');
  const otherModeSessions = allFilteredSessions.filter((s) => s.session_mode && s.session_mode !== 'standard');

  const chartBox = document.getElementById('chartContainer');
  const noticeEl = document.getElementById('filterEmptyNotice');
  const tableEl = document.getElementById('dashboardTable');

  if (allFilteredSessions.length === 0) {
    if (chartBox) chartBox.style.display = 'none';
    if (tableEl) tableEl.style.display = 'none';
    if (noticeEl) noticeEl.style.display = 'block';
    return;
  }

  if (noticeEl) noticeEl.style.display = 'none';

  if (standardSessions.length > 0) {
    if (chartBox) chartBox.style.display = 'block';
    if (tableEl) tableEl.style.display = 'table';
    renderChart(standardSessions);
    renderTable(standardSessions, container, onSwitchView);
  } else {
    if (chartBox) chartBox.style.display = 'none';
    if (tableEl) tableEl.style.display = 'none';
  }

  renderAdvancedModesTable(otherModeSessions, container, onSwitchView);
}

function renderChart(sessions) {
  const canvas = document.getElementById('dashboardChart');
  if (!canvas) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const labels = sessions.map((s) => {
    const d = new Date(s.started_at);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  });

  const datasets = [
    {
      label: '0° (Horizontal)',
      data: sessions.map((s) => getThresholdForAngle(s, 0)),
      borderColor: '#3b82f6',
      backgroundColor: '#3b82f6',
      spanGaps: true,
      tension: 0.2
    },
    {
      label: '45°',
      data: sessions.map((s) => getThresholdForAngle(s, 45)),
      borderColor: '#f97316',
      backgroundColor: '#f97316',
      spanGaps: true,
      tension: 0.2
    },
    {
      label: '90° (Vertical)',
      data: sessions.map((s) => getThresholdForAngle(s, 90)),
      borderColor: '#14b8a6',
      backgroundColor: '#14b8a6',
      spanGaps: true,
      tension: 0.2
    },
    {
      label: '135°',
      data: sessions.map((s) => getThresholdForAngle(s, 135)),
      borderColor: '#e11d48',
      backgroundColor: '#e11d48',
      spanGaps: true,
      tension: 0.2
    }
  ];

  const ctx = canvas.getContext('2d');
  chartInstance = new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#9ca3af', font: { size: 11 } }
        },
        y: {
          title: {
            display: true,
            text: 'Contrast Threshold',
            color: '#9ca3af',
            font: { size: 12 }
          },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#9ca3af', font: { size: 11 } },
          min: 0,
          max: 1.0
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f3f4f6', font: { size: 12 } }
        }
      }
    }
  });
}

function renderTable(sessions, container, onSwitchView) {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  const displaySessions = [...sessions].reverse();

  tbody.innerHTML = displaySessions.map((s) => {
    const startDate = new Date(s.started_at);
    const endDate = new Date(s.ended_at);
    const durationSec = Math.max(0, Math.round((endDate - startDate) / 1000));
    const durMins = Math.floor(durationSec / 60);
    const durSecs = durationSec % 60;
    const durStr = `${durMins}m ${durSecs}s`;

    const totalTrials = s.total_trials !== undefined ? s.total_trials : s.totalTrials;
    const totalCorrect = s.total_correct !== undefined ? s.total_correct : s.totalCorrect;
    const pct = totalTrials > 0 ? ((totalCorrect / totalTrials) * 100).toFixed(1) + '%' : '0.0%';

    const formatVal = (targetTheta) => {
      const v = getThresholdForAngle(s, targetTheta);
      return v !== null ? v.toFixed(4) : '—';
    };

    return `
      <tr>
        <td>${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${durStr}</td>
        <td>${totalTrials}</td>
        <td>${totalCorrect}</td>
        <td>${pct}</td>
        <td>${formatVal(0)}</td>
        <td>${formatVal(45)}</td>
        <td>${formatVal(90)}</td>
        <td>${formatVal(135)}</td>
        <td class="hide-on-print">
          <button class="btn btn-sm btn-delete-session" data-id="${s.id}" style="background: rgba(220, 38, 38, 0.2); color: #fca5a5; border-color: rgba(248, 113, 113, 0.3);">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-delete-session').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const idStr = e.target.getAttribute('data-id');
      if (!idStr) return;
      btn.disabled = true;
      btn.textContent = 'Deleting...';
      const ok = await deleteSession(idStr);
      if (ok) {
        initDashboardView(onSwitchView);
      } else {
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    });
  });
}

function renderAdvancedModesTable(otherSessions, container, onSwitchView) {
  const box = document.getElementById('advancedModesHistoryContainer');
  if (!box) return;

  if (otherSessions.length === 0) {
    box.innerHTML = `
      <div class="helper-text" style="color: #9ca3af; font-size: 13px;">
        No Spatial Frequency (Mode B) or Global Orientation (Mode C) sessions recorded in this time filter.
      </div>
    `;
    return;
  }

  const sfSessions = otherSessions.filter((s) => s.session_mode === 'spatial_frequency');
  const goSessions = otherSessions.filter((s) => s.session_mode === 'global_orientation');

  box.innerHTML = `
    ${sfSessions.length > 0 ? `
      <h4 style="font-size: 14px; color: #a78bfa; margin: 12px 0 8px;">Spatial Frequency (Mode B) Sessions</h4>
      <div class="table-wrapper" style="margin-bottom: 16px;">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Trials</th>
              <th>Correct</th>
              <th>0° Lambda</th>
              <th>45° Lambda</th>
              <th>90° Lambda</th>
              <th>135° Lambda</th>
            </tr>
          </thead>
          <tbody>
            ${sfSessions.map((s) => {
              const startDate = new Date(s.started_at);
              const formatLambda = (deg) => {
                const v = getThresholdForAngle(s, deg);
                return v !== null ? v.toFixed(4) + '°' : '—';
              };
              return `
                <tr>
                  <td>${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>${s.total_trials || s.totalTrials}</td>
                  <td>${s.total_correct || s.totalCorrect}</td>
                  <td>${formatLambda(0)}</td>
                  <td>${formatLambda(45)}</td>
                  <td>${formatLambda(90)}</td>
                  <td>${formatLambda(135)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    ${goSessions.length > 0 ? `
      <h4 style="font-size: 14px; color: #38bdf8; margin: 12px 0 8px;">Global Orientation (Mode C) Sessions</h4>
      <div class="table-wrapper">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Trials</th>
              <th>Correct</th>
              <th>45° Global Phi</th>
              <th>90° Global Phi</th>
              <th>135° Global Phi</th>
            </tr>
          </thead>
          <tbody>
            ${goSessions.map((s) => {
              const startDate = new Date(s.started_at);
              const formatPhi = (deg) => {
                const v = getThresholdForAngle(s, deg);
                return v !== null ? v.toFixed(4) : '—';
              };
              return `
                <tr>
                  <td>${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>${s.total_trials || s.totalTrials}</td>
                  <td>${s.total_correct || s.totalCorrect}</td>
                  <td>${formatPhi(45)}</td>
                  <td>${formatPhi(90)}</td>
                  <td>${formatPhi(135)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}

function exportCurrentViewCSV() {
  const filteredSessions = filterSessions(rawSessions, currentFilter);
  if (filteredSessions.length === 0) return;

  const exportSessions = [...filteredSessions].reverse();

  const headers = [
    'Date',
    'Session Mode',
    'Duration (minutes)',
    'Total Trials',
    'Total Correct',
    'Percent Correct',
    'Result 1',
    'Result 2',
    'Result 3',
    'Result 4'
  ];

  const rows = exportSessions.map((s) => {
    const startDate = new Date(s.started_at);
    const endDate = new Date(s.ended_at);
    const durMins = ((endDate - startDate) / (1000 * 60)).toFixed(2);
    const totalTrials = s.total_trials !== undefined ? s.total_trials : s.totalTrials;
    const totalCorrect = s.total_correct !== undefined ? s.total_correct : s.totalCorrect;
    const pct = totalTrials > 0 ? ((totalCorrect / totalTrials) * 100).toFixed(1) : '0.0';
    const mode = s.session_mode || 'standard';

    const getCsvVal = (targetTheta) => {
      const v = getThresholdForAngle(s, targetTheta);
      return v !== null ? v.toFixed(4) : '';
    };

    return [
      `"${startDate.toISOString()}"`,
      `"${mode}"`,
      durMins,
      totalTrials,
      totalCorrect,
      pct,
      getCsvVal(0),
      getCsvVal(45),
      getCsvVal(90),
      getCsvVal(135)
    ].join(',');
  });

  const csvString = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const filterSlugMap = {
    week: 'this-week',
    month: 'this-month',
    all: 'all-time'
  };
  const filterSlug = filterSlugMap[currentFilter] || 'all-time';
  const todayStr = new Date().toISOString().split('T')[0];
  const filename = `vision-training-export-${filterSlug}-${todayStr}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
