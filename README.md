# NeuroVision 🧠👁️

> An open-source, calibrated Two-Interval Forced-Choice (2IFC) contrast sensitivity perceptual learning web app designed to train visual cortex acuity using lateral masking Gabor patches.

---

> [!WARNING]
> **Medical Disclaimer:** NeuroVision is an open-source perceptual learning software tool designed for visual cortex training, research exploration, and self-experimentation. It is **not** an FDA-registered medical device and is not intended to diagnose, treat, prevent, or cure any medical condition or eye disease. Always consult a qualified eye care professional (optometrist or ophthalmologist) for clinical eye evaluation.

---

## 🌟 Overview

NeuroVision implements the core principles of **sub-threshold lateral masking perceptual learning** (popularized by clinical systems like *RevitalVision*). By presenting target Gabor patches flanked by high-contrast reference patches at calibrated spatial frequencies and orientations, the application stimulates specific neuronal columns in the primary visual cortex (V1), encouraging neuro-plasticity and improving neural contrast sensitivity.

---

## ✨ Key Features

- **🎯 Two-Interval Forced-Choice (2IFC) Task:** Eliminates spatial guessing bias by presenting two sequential temporal intervals (Interval 1 vs. Interval 2) with distinct audio and visual cues.
- **🪜 Adaptive 3-Down / 1-Up Staircase:** Automatically adjusts contrast or spatial frequency ($\lambda$) on every trial, converging precisely on your 79.4% perceptual threshold limit.
- **📐 Sub-Degree Screen Calibration:** Calibrates precise pixels-per-degree (`px/deg`) scale based on physical credit card measuring and viewing distance to ensure exact visual angle delivery.
- **👁️ Nystagmus-Aware Layout:** Features an extended 450ms stimulus display window (allowing retinal motion integration) and a purely vertical top/bottom flanker arrangement to avoid horizontal tracking demands.
- **🔄 Multi-Parameter Session Modes:**
  - **Mode A (Standard):** Contrast staircases across 4 local stripe orientations ($0^\circ, 45^\circ, 90^\circ, 135^\circ$).
  - **Mode B (Spatial Frequency):** Adaptive $\lambda$ wavelength resolution staircases.
  - **Mode C (Global Orientation):** Flanker layout angle sweeps ($45^\circ, 90^\circ, 135^\circ$).
- **📊 Real-Time Analytics Dashboard:** Built-in progression charts (via Chart.js), streak tracking, CSV export, and printable summary logs.
- **⚡ Offline-First Architecture:** LocalStorage persistence with an automatic background sync queue for the FastAPI/SQLite backend.

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python 3.10+**
- Modern Web Browser (Chrome, Edge, Firefox, or Safari)

### Installation & Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/NeuroVision.git
   cd NeuroVision
   ```

2. **Install Python dependencies:**
   ```bash
   pip install fastapi uvicorn sqlalchemy pydantic
   ```

3. **Start the application:**
   - **On Windows:** Simply double-click `launch_neurovision.bat` (or run `python launch_neurovision.bat`).
   - **Manual Start:**
     ```bash
     # Start Backend API (Terminal 1)
     cd backend
     python -m uvicorn main:app --reload --port 8000

     # Start Frontend Server (Terminal 2)
     python -m http.server 8080 --directory frontend
     ```

4. **Open in browser:**
   Navigate to `http://localhost:8080` and complete screen calibration!

---

## 🛠️ Technology Stack

- **Frontend:** Vanilla JS (ES6+), HTML5 Canvas, Web Audio API, Vanilla CSS (Dark Glassmorphism UI), Chart.js
- **Backend:** FastAPI (Python), SQLAlchemy ORM, Pydantic v2
- **Database:** SQLite

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
