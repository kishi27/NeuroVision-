// Main entry point for the Vision Training app frontend
import { initCalibration, drawCalibration, resetCalibrationFlow } from './calibration.js';
import { clearToGray, initGaborDebug } from './gabor.js';
import { initTrainView, cleanupTrainView } from './session.js';
import { initDashboardView } from './dashboard.js';
import { initSettingsView } from './settings.js';
import { retryPendingSync } from './api.js';
import { checkAndFireDailyReminder } from './reminders.js';

const canvas = document.getElementById('trainingCanvas');
const ctx = canvas.getContext('2d');

let currentView = 'calibrate';

const navCalibrate = document.getElementById('navCalibrate');
const navTrain = document.getElementById('navTrain');
const navDashboard = document.getElementById('navDashboard');
const navSettings = document.getElementById('navSettings');

const viewCalibrate = document.getElementById('viewCalibrate');
const viewTrain = document.getElementById('viewTrain');
const viewDashboard = document.getElementById('viewDashboard');
const viewSettings = document.getElementById('viewSettings');

// Attempt automatic background retry sync of offline queue on app load
retryPendingSync();

// Check daily training reminder status on load
checkAndFireDailyReminder();

// Check if ?debug=true mode is active
const isDebugMode = initGaborDebug(ctx, canvas);

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (isDebugMode) {
    initGaborDebug(ctx, canvas);
  } else {
    render();
  }
}

function render() {
  clearToGray(ctx, canvas.width, canvas.height);
  if (currentView === 'calibrate') {
    drawCalibration(ctx, canvas.width, canvas.height);
  }
}

function switchView(targetView) {
  if (currentView === targetView) return;

  if (currentView === 'calibrate') {
    resetCalibrationFlow();
  } else if (currentView === 'train') {
    cleanupTrainView(ctx, canvas);
  }

  currentView = targetView;

  navCalibrate?.classList.toggle('active', currentView === 'calibrate');
  navTrain?.classList.toggle('active', currentView === 'train');
  navDashboard?.classList.toggle('active', currentView === 'dashboard');
  navSettings?.classList.toggle('active', currentView === 'settings');

  if (viewCalibrate) viewCalibrate.style.display = currentView === 'calibrate' ? 'block' : 'none';
  if (viewTrain) viewTrain.style.display = currentView === 'train' ? 'block' : 'none';
  if (viewDashboard) viewDashboard.style.display = currentView === 'dashboard' ? 'block' : 'none';
  if (viewSettings) viewSettings.style.display = currentView === 'settings' ? 'block' : 'none';

  if (currentView === 'calibrate') {
    initCalibration(render);
  } else if (currentView === 'train') {
    initTrainView(ctx, canvas, switchView);
  } else if (currentView === 'dashboard') {
    initDashboardView(switchView);
  } else if (currentView === 'settings') {
    initSettingsView();
  }

  render();
}

if (isDebugMode) {
  if (viewCalibrate) viewCalibrate.style.display = 'none';
  if (viewTrain) viewTrain.style.display = 'none';
  if (viewDashboard) viewDashboard.style.display = 'none';
  if (viewSettings) viewSettings.style.display = 'none';
  const navbar = document.querySelector('.navbar');
  if (navbar) navbar.style.display = 'none';
} else {
  navCalibrate?.addEventListener('click', () => switchView('calibrate'));
  navTrain?.addEventListener('click', () => switchView('train'));
  navDashboard?.addEventListener('click', () => switchView('dashboard'));
  navSettings?.addEventListener('click', () => switchView('settings'));

  switchView('calibrate');
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
