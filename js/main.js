import { Simulation } from './simulation.js';

// ── DOM references ───────────────────────────────────────────────

const canvas        = document.getElementById('simCanvas');
const timeDisplay   = document.getElementById('timeDisplay');
const statusDisplay = document.getElementById('statusDisplay');
const startBtn      = document.getElementById('startBtn');
const generateBtn   = document.getElementById('generateBtn');
const replayBtn     = document.getElementById('replayBtn');

// ── Initialise simulation ────────────────────────────────────────

const sim = new Simulation(canvas, timeDisplay, statusDisplay);

// ── Button label helpers ─────────────────────────────────────────

function updateStartBtn() {
  if (sim.paused) {
    startBtn.textContent = 'Resume Simulation';
  } else if (sim.running) {
    startBtn.textContent = 'Pause Simulation';
  } else {
    startBtn.textContent = 'Start Simulation';
  }
}

// ── Event handlers ───────────────────────────────────────────────

startBtn.addEventListener('click', () => {
  if (sim.paused) {
    sim.resume();
  } else if (sim.running) {
    sim.pause();
  } else {
    sim.stop();
    sim.start();
  }
  updateStartBtn();
});

// Update button label when sim completes on its own
sim.onComplete = () => updateStartBtn();

generateBtn.addEventListener('click', () => {
  sim.generateCity();
  updateStartBtn();
});

replayBtn.addEventListener('click', () => {
  sim.replay();
});
