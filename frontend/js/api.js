// Handles backend API requests for logging session & calibration results — implemented in Prompt 9, 12 & 14

const API_BASE_URL = 'http://localhost:8000';

function getPendingQueue() {
  try {
    const data = localStorage.getItem('pendingSync');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function savePendingQueue(queue) {
  try {
    localStorage.setItem('pendingSync', JSON.stringify(queue));
  } catch (e) {}
}

function getLocalSessions() {
  try {
    const data = localStorage.getItem('localSessions');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalSession(payload) {
  try {
    const list = getLocalSessions();
    const fp = getSessionFingerprint(payload.sessionStartTime, payload.totalTrials, payload.totalCorrect);
    const existingIdx = list.findIndex(
      s => getSessionFingerprint(s.started_at || s.sessionStartTime, s.total_trials || s.totalTrials, s.total_correct || s.totalCorrect) === fp
    );

    const formattedItem = {
      id: `local_${Date.now()}`,
      started_at: payload.sessionStartTime,
      ended_at: payload.sessionEndTime,
      total_trials: payload.totalTrials,
      total_correct: payload.totalCorrect,
      session_mode: payload.sessionMode || payload.session_mode || 'standard',
      orientation_results: payload.orientationResults || payload.orientation_results,
      isLocal: true
    };

    if (existingIdx >= 0) {
      list[existingIdx] = formattedItem;
    } else {
      list.push(formattedItem);
    }

    localStorage.setItem('localSessions', JSON.stringify(list));
  } catch (e) {}
}

/**
 * Computes a unique session fingerprint matching started_at (within 60s), total_trials, and total_correct
 */
function getSessionFingerprint(startedAt, totalTrials, totalCorrect) {
  if (!startedAt) return '';
  const timeMs = new Date(startedAt).getTime();
  const minuteBucket = Math.floor(timeMs / 60000);
  const trials = totalTrials !== undefined ? totalTrials : 0;
  const correct = totalCorrect !== undefined ? totalCorrect : 0;
  return `${minuteBucket}_${trials}_${correct}`;
}

function queueForRetry(type, payload) {
  const queue = getPendingQueue();
  if (type === 'session' && payload.sessionStartTime) {
    const fp = getSessionFingerprint(payload.sessionStartTime, payload.totalTrials, payload.totalCorrect);
    const isDuplicate = queue.some(
      item => item.type === 'session' && item.payload && getSessionFingerprint(item.payload.sessionStartTime, item.payload.totalTrials, item.payload.totalCorrect) === fp
    );
    if (isDuplicate) return;
  }
  queue.push({
    type,
    payload,
    queuedAt: new Date().toISOString()
  });
  savePendingQueue(queue);
}

/**
 * POST /calibration profile to backend (with local retry queue fallback)
 */
export async function saveCalibrationProfile(profile) {
  try {
    const res = await fetch(`${API_BASE_URL}/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });

    if (!res.ok) {
      queueForRetry('calibration', profile);
      return { success: false, queued: true, localOnly: true };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    queueForRetry('calibration', profile);
    return { success: false, queued: true, localOnly: true };
  }
}

/**
 * GET /calibration profiles from backend
 */
export async function getCalibrationProfiles() {
  try {
    const res = await fetch(`${API_BASE_URL}/calibration`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * PUT /calibration/{id} rename profile
 */
export async function updateCalibrationProfile(id, profile_name) {
  try {
    const res = await fetch(`${API_BASE_URL}/calibration/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_name })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * DELETE /calibration/{id} profile
 */
export async function deleteCalibrationProfile(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/calibration/${id}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * POST /sessions result to backend (with local retry queue fallback)
 */
export async function saveSession(sessionPayload) {
  // Always save to permanent localSessions store immediately
  saveLocalSession(sessionPayload);

  try {
    const res = await fetch(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionPayload)
    });

    if (!res.ok) {
      queueForRetry('session', sessionPayload);
      return { success: false, queued: true, localOnly: true };
    }

    const data = await res.json();
    
    // Server saved successfully — clear any pending queue items with matching fingerprint
    const fp = getSessionFingerprint(sessionPayload.sessionStartTime, sessionPayload.totalTrials, sessionPayload.totalCorrect);
    const queue = getPendingQueue();
    const cleanQueue = queue.filter(item => {
      if (item.type === 'session' && item.payload) {
        const itemFp = getSessionFingerprint(item.payload.sessionStartTime, item.payload.totalTrials, item.payload.totalCorrect);
        return itemFp !== fp;
      }
      return true;
    });
    savePendingQueue(cleanQueue);

    return { success: true, data };
  } catch (err) {
    queueForRetry('session', sessionPayload);
    return { success: false, queued: true, localOnly: true };
  }
}

/**
 * GET /sessions list from backend (merges, deduplicates, and populates orientation results & session_mode)
 */
export async function getSessions() {
  let serverSessions = [];
  let isServerDown = false;

  try {
    const res = await fetch(`${API_BASE_URL}/sessions`);
    if (res.ok) {
      serverSessions = await res.json();
    } else {
      isServerDown = true;
    }
  } catch (err) {
    isServerDown = true;
  }

  const localSessions = getLocalSessions();
  const queue = getPendingQueue();

  // Helper map of all local payloads with orientation results & mode
  const localMap = new Map();
  for (const s of [...localSessions, ...queue.map(q => q.payload).filter(Boolean)]) {
    const fp = getSessionFingerprint(s.started_at || s.sessionStartTime, s.total_trials || s.totalTrials, s.total_correct || s.totalCorrect);
    const results = s.orientation_results || s.orientationResults;
    const mode = s.session_mode || s.sessionMode || 'standard';
    if (fp) {
      localMap.set(fp, { results, mode });
    }
  }

  // Deduplicate server sessions by fingerprint and ensure orientation results & session_mode are populated
  const uniqueServerSessions = [];
  const seenFingerprints = new Set();

  for (const s of serverSessions) {
    const fp = getSessionFingerprint(s.started_at, s.total_trials, s.total_correct);
    if (fp && !seenFingerprints.has(fp)) {
      seenFingerprints.add(fp);
      
      const localData = localMap.get(fp);
      if (!s.session_mode && localData && localData.mode) {
        s.session_mode = localData.mode;
      }
      if (!s.session_mode) {
        s.session_mode = 'standard';
      }

      if (!Array.isArray(s.orientation_results) || s.orientation_results.length === 0) {
        if (localData && localData.results) {
          s.orientation_results = localData.results;
        }
      }
      
      uniqueServerSessions.push(s);
    }
  }

  // Add any purely local sessions not yet present on server
  const extraLocalSessions = [];
  for (const s of localSessions) {
    const fp = getSessionFingerprint(s.started_at || s.sessionStartTime, s.total_trials || s.totalTrials, s.total_correct || s.totalCorrect);
    if (fp && !seenFingerprints.has(fp)) {
      seenFingerprints.add(fp);
      s.session_mode = s.session_mode || s.sessionMode || 'standard';
      extraLocalSessions.push(s);
    }
  }

  const combined = [...uniqueServerSessions, ...extraLocalSessions];

  if (isServerDown && combined.length === 0) {
    return null;
  }

  return combined;
}

/**
 * GET /sessions/{id} details from backend
 */
export async function getSessionById(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/sessions/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * DELETE /sessions/{id} from backend
 */
export async function deleteSession(id) {
  if (typeof id === 'string' && id.startsWith('local_')) {
    const list = getLocalSessions();
    const remaining = list.filter(s => s.id !== id);
    localStorage.setItem('localSessions', JSON.stringify(remaining));
    return true;
  }

  if (typeof id === 'string' && id.startsWith('pending_')) {
    const queue = getPendingQueue();
    const remaining = queue.filter((item, idx) => `pending_${idx}` !== id);
    savePendingQueue(remaining);
    return true;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/sessions/${id}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Processes queued items in localStorage.pendingSync on app load
 */
export async function retryPendingSync() {
  const queue = getPendingQueue();
  if (queue.length === 0) return;

  const remainingQueue = [];

  for (const item of queue) {
    try {
      if (item.type === 'calibration') {
        const res = await fetch(`${API_BASE_URL}/calibration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });
        if (!res.ok) {
          remainingQueue.push(item);
        }
      } else if (item.type === 'session') {
        const res = await fetch(`${API_BASE_URL}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });
        if (!res.ok) {
          remainingQueue.push(item);
        }
      }
    } catch (err) {
      remainingQueue.push(item);
    }
  }

  savePendingQueue(remainingQueue);
}
