import { Simulation } from './simulation.js';

// ── DOM references ───────────────────────────────────────────────

const canvas        = document.getElementById('simCanvas');
const timeDisplay   = document.getElementById('timeDisplay');
const statusDisplay = document.getElementById('statusDisplay');
const startBtn      = document.getElementById('startBtn');
const generateBtn   = document.getElementById('generateBtn');
const replayBtn     = document.getElementById('replayBtn');
const completeBtn   = document.getElementById('completeBtn');

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
    completeBtn.style.display = 'inline-block';
    completeBtn.disabled = false;
  }
  updateStartBtn();
});

// Update button label when sim completes on its own
sim.onComplete = () => {
  updateStartBtn();
  completeBtn.disabled = true;
};

generateBtn.addEventListener('click', () => {
  sim.generateCity();
  updateStartBtn();
  completeBtn.style.display = 'none';
  completeBtn.disabled = false;
});

completeBtn.addEventListener('click', () => {
  completeBtn.style.display = 'none';
  replayBtn.style.display = 'none';
  sim.completeNow();
});

replayBtn.addEventListener('click', () => {
  sim.replay();
});
