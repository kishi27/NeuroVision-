// Local synthesized feedback only: one lazily created context, no media files.
export class FeedbackAudio {
  constructor(createContext = () => {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    return Context ? new Context() : null;
  }) {
    this.createContext = createContext;
    this.context = null;
    this.voices = new Set();
    this.version = 0;
  }

  getContext() {
    try {
      this.context ??= this.createContext();
      return this.context?.state === 'closed' ? null : this.context;
    } catch {
      return null; // Audio support or permission failure must not stop the game.
    }
  }

  unlock() {
    // Called directly by the user's Start / Restart gesture, without awaiting.
    const context = this.getContext();
    if (context && context.state !== 'running') {
      try { Promise.resolve(context.resume()).catch(() => {}); } catch {}
    }
  }

  playSuccess() {
    // Bell-like partials decay independently: brighter attack, warm ringing tail.
    // The quiet noninteger partial adds a bell character rather than a pure beep.
    const partials = [
      { ratio: 1, volume: 0.20, decay: 1 },
      { ratio: 2, volume: 0.05, decay: 0.70 },
      { ratio: 3, volume: 0.025, decay: 0.45 },
      { ratio: 2.76, volume: 0.008, decay: 0.35 }
    ];
    this.play([
      { frequency: 659.25, offset: 0, duration: 0.23 },
      { frequency: 523.25, offset: 0.30, duration: 0.70 }
    ].flatMap(note => partials.map(partial => ({
      frequency: note.frequency * partial.ratio, offset: note.offset,
      duration: note.duration * partial.decay, type: 'sine', volume: partial.volume,
      attack: 0.003, decayRatio: 0.12, decayFraction: 0.80
    }))));
  }

  playFailure() {
    this.play([
      { frequency: 220, offset: 0, duration: 0.14, type: 'square', volume: 0.16 },
      { frequency: 220, offset: 0.21, duration: 0.24, type: 'square', volume: 0.16 }
    ]);
  }

  playMinuteNotice() {
    // One warm bell note, distinct from the two-note answer chime.
    // Reuse the existing context, envelopes and cancellation safeguards.
    this.play([
      { frequency: 392, offset: 0, duration: 1.10, type: 'sine', volume: 0.36,
        attack: 0.004, decayRatio: 0.16, decayFraction: 0.80 },
      { frequency: 784, offset: 0, duration: 0.72, type: 'sine', volume: 0.065,
        attack: 0.004, decayRatio: 0.16, decayFraction: 0.80 },
      { frequency: 1081.92, offset: 0, duration: 0.42, type: 'sine', volume: 0.015,
        attack: 0.004, decayRatio: 0.16, decayFraction: 0.80 }
    ]);
  }

  play(tones) {
    // Keep fast repeated answers from stacking into a loud chorus.
    this.stop();
    const version = this.version;
    const context = this.getContext();
    if (!context) return;
    const schedule = () => {
      if (version !== this.version || context.state !== 'running') return;
      try {
        const now = context.currentTime;
        for (const tone of tones) this.scheduleTone(context, now, tone);
      } catch {
        this.stop();
      }
    };
    if (context.state === 'running') schedule();
    else {
      // resume is issued during the panel gesture; its late result is guarded.
      try { Promise.resolve(context.resume()).then(schedule).catch(() => {}); } catch {}
    }
  }

  scheduleTone(context, now, tone) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.onended = () => this.release(voice);
    oscillator.type = tone.type;
    const start = now + tone.offset;
    const end = start + tone.duration;
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(tone.volume, start + (tone.attack ?? 0.01));
    // Chimes decay from the attack; the existing buzzer keeps its old envelope.
    gain.gain.exponentialRampToValueAtTime(tone.volume * (tone.decayRatio ?? 0.75),
      start + tone.duration * (tone.decayFraction ?? 0.65));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end);
  }

  release(voice) {
    voice.oscillator.onended = null;
    try { voice.oscillator.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
    this.voices.delete(voice);
  }

  stop() {
    this.version++; // Invalidate all unresolved resume callbacks too.
    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(0);
        voice.gain.gain.setValueAtTime(0, this.context.currentTime);
      } catch {}
      try { voice.oscillator.stop(); } catch {}
      this.release(voice);
    }
    // Oscillator scheduling uses AudioContext time; there are no JS audio timers.
  }
}

// Retained across sessions / views; never construct a context per answer.
export const feedbackAudio = new FeedbackAudio();
