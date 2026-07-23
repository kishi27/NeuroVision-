// Handles optional browser notifications for vision training — implemented in Prompt 11
import { getSessions } from './api.js';

export function isNotificationSupported() {
  return 'Notification' in window;
}

export function getReminderSettings() {
  const enabled = localStorage.getItem('remindersEnabled') === 'true';
  const time = localStorage.getItem('reminderTime') || '18:00';
  return { enabled, time };
}

export function setReminderSettings(enabled, time) {
  localStorage.setItem('remindersEnabled', enabled ? 'true' : 'false');
  if (time) localStorage.setItem('reminderTime', time);
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    return 'denied';
  }
}

/**
 * Checks on page load if daily training reminder is due and fires notification
 */
export async function checkAndFireDailyReminder() {
  if (!isNotificationSupported()) return;

  const { enabled, time } = getReminderSettings();
  if (!enabled || Notification.permission !== 'granted') return;

  const todayStr = new Date().toISOString().split('T')[0];
  const lastShown = localStorage.getItem('lastNotificationShownDate');
  if (lastShown === todayStr) return;

  const now = new Date();
  const [targetH, targetM] = time.split(':').map((v) => parseInt(v, 10) || 0);
  const targetTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetH, targetM, 0);

  if (now < targetTimeToday) return;

  const sessions = await getSessions();
  const completedToday = Array.isArray(sessions) && sessions.some((s) => {
    const sDate = new Date(s.started_at).toISOString().split('T')[0];
    return sDate === todayStr;
  });

  if (completedToday) return;

  try {
    new Notification('Vision Training Reminder', {
      body: 'Time for your vision training session.'
    });
    localStorage.setItem('lastNotificationShownDate', todayStr);
  } catch (e) {}
}
