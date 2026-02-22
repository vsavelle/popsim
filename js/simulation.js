import { City, TILE, TILE_COLORS } from './city.js';
import { Agent, formatSimTime } from './agent.js';
import { DeliveryDriver } from './deliveryDriver.js';

// ── Constants ────────────────────────────────────────────────────────

export const CELL_SIZE   = 14;
const SIM_DURATION_REAL  = 180;   // seconds (3 minutes)
const SIM_DURATION_HOURS = 24;    // in-world hours
const MAX_AGENTS         = 150;

const AGENT_COLORS = {
  sleeping:  '#111111',
  home:      '#00ff88',
  traveling: '#ffffff',
  working:   '#ff4444',
  leisure:   '#ff66ff',
  visiting:  '#ffaa33',
};

// Path colours keyed by tile type (lighter for visibility on dark map)
const PATH_COLORS = {
  [TILE.HOUSE]:    '#6eeaaf',
  [TILE.BUSINESS]: '#7ec8f0',
  [TILE.LEISURE]:  '#c49dff',
  [TILE.EATERY]:   '#ffb866',
  default:         '#cccccc',
};

const AGENT_RADIUS = 3;
const SELECT_RADIUS = 6;          // white highlight ring

// ── Simulation ───────────────────────────────────────────────────

export class Simulation {
  /**
   * @param {HTMLCanvasElement}  canvas
   * @param {HTMLElement}        timeDisplay
   * @param {HTMLElement}        statusDisplay
   */
  constructor(canvas, timeDisplay, statusDisplay) {
    this.canvas        = canvas;
    this.ctx           = canvas.getContext('2d');
    this.timeDisplay   = timeDisplay;
    this.statusDisplay = statusDisplay;

    this.city          = null;
    this.agents        = [];
    this.drivers       = [];
    this.running       = false;
    this.paused        = false;
    this.startTime     = 0;
    this.lastFrameTime = 0;
    this.animFrameId   = null;
    this.selectedAgent = null;   // reference to clicked agent
    this.selectedTile  = null;   // { x, y } of clicked building tile

    // ── Pause tracking ──
    this._pauseStart   = 0;     // performance.now() when paused
    this._pausedTotal  = 0;     // total real ms spent paused

    // ── Replay system ──
    this._frameCache    = [];     // array of frame snapshots
    this._cachedLogs    = null;   // agent logs from the original run
    this._cachedPaths   = null;   // agent pathHistory from the original run
    this._cachedPassedBy = null;  // agent passedByTiles from the original run
    this._replaying     = false;
    this._replayIndex   = 0;
    this._replayStart   = 0;

    // ── Callback ──
    this.onComplete     = null;   // called when sim finishes

    // Click-to-select handler
    this.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));

    this.generateCity();
  }

  // ── City generation ──────────────────────────────────────────

  generateCity() {
    this.stop();
    this._stopReplay();

    const cols = Math.floor(this.canvas.width  / CELL_SIZE);
    const rows = Math.floor(this.canvas.height / CELL_SIZE);

    this.city   = new City(cols, rows);
    this.agents = [];
    this.drivers = [];
    this.selectedAgent = null;
    this.selectedTile  = null;
    this._frameCache   = [];
    this._cachedLogs    = null;
    this._cachedPaths   = null;
    this._cachedPassedBy = null;

    // Clear activity table if present
    this._clearActivityTable();

    this._renderCity();
    this._setStatus('City generated. Press Start to begin simulation.');
    this._resetTimeDisplay();
  }

  // ── Simulation lifecycle ─────────────────────────────────────

  start() {
    if (this.running || this._replaying) return;
    if (!this.city) return;

    this._createAgents();
    this._frameCache = [];

    if (this.agents.length === 0) {
      this._setStatus('No agents could be created — generate a new city.');
      return;
    }

    this.running       = true;
    this.paused        = false;
    this._pauseStart   = 0;
    this._pausedTotal  = 0;
    this.startTime     = performance.now();
    this.lastFrameTime = this.startTime;
    this.selectedAgent = null;
    this.selectedTile  = null;

    this._clearActivityTable();
    this._hideReplayBtn();
    console.log(`Drivers created: ${this.drivers.length} / ${this.agents.filter(a => a.ordersDelivery).length} ordering agents`);
    this._setStatus(`Simulation running — ${this.agents.length} agents, ${this.drivers.length} deliveries`);
    this._loop();
  }

  stop() {
    this.running = false;
    this.paused  = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  completeNow() {
    if (!this.running) return;
    // If paused, account for paused time
    if (this.paused) {
      this._pausedTotal += performance.now() - this._pauseStart;
      this._pauseStart = 0;
      this.paused = false;
    }
    // Cancel the running animation loop
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    // Fast-forward: step through remaining sim time in small increments
    const now = performance.now();
    let elapsed = (now - this.startTime - this._pausedTotal) / 1000;
    const stepReal = 1;  // 1-second real-time steps
    while (elapsed < SIM_DURATION_REAL) {
      elapsed += stepReal;
      if (elapsed > SIM_DURATION_REAL) elapsed = SIM_DURATION_REAL;
      const simHours = (elapsed / SIM_DURATION_REAL) * SIM_DURATION_HOURS;
      for (const agent of this.agents) {
        agent.update(simHours, stepReal);
      }
      for (const driver of this.drivers) {
        driver.update(simHours, stepReal);
      }
      this._recordFrame(elapsed, simHours);
    }
    // Render final state
    this._render(SIM_DURATION_HOURS);
    this._updateTimeDisplay(SIM_DURATION_REAL, SIM_DURATION_HOURS);
    this._setStatus('Simulation complete!');
    this.running = false;
    this.paused  = false;
    this._cachedLogs  = this.agents.map(a => [...a.log.map(e => ({...e}))]);
    this._cachedPaths = this.agents.map(a =>
      a.pathHistory.map(p => ({ path: [...p.path], tileType: p.tileType }))
    );
    this._cachedPassedBy = this.agents.map(a => new Map(a.passedByTiles));
    this._buildActivityTable();
    if (this.onComplete) this.onComplete();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this._pauseStart = performance.now();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this._setStatus('Simulation paused.');
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this._pausedTotal += performance.now() - this._pauseStart;
    this._pauseStart = 0;
    this.lastFrameTime = performance.now();
    this._setStatus(`Simulation running — ${this.agents.length} agents, ${this.drivers.length} deliveries`);
    this._loop();
  }

  _stopReplay() {
    this._replaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  // ── Replay ──────────────────────────────────────────────────

  replay() {
    if (this._frameCache.length === 0) return;
    this.stop();
    this._stopReplay();

    this._replaying   = true;
    this._replayIndex = 0;
    this._replayStart = performance.now();
    this.selectedAgent = null;
    this.selectedTile  = null;

    this._clearActivityTable();
    this._setStatus('Replaying…');
    this._replayLoop();
  }

  _replayLoop() {
    if (!this._replaying) return;

    const elapsed = (performance.now() - this._replayStart) / 1000;
    // Find the frame whose realTime is closest to elapsed
    while (this._replayIndex < this._frameCache.length - 1 &&
           this._frameCache[this._replayIndex + 1].realTime <= elapsed) {
      this._replayIndex++;
    }

    const frame = this._frameCache[this._replayIndex];
    this._applyFrame(frame);
    this._render(frame.simHours);
    this._updateTimeDisplay(frame.realTime, frame.simHours);

    if (this._replayIndex >= this._frameCache.length - 1) {
      this._replaying = false;
      this._setStatus('Replay complete!');
      // Restore original logs and path histories so table is accurate
      if (this._cachedLogs) {
        for (let i = 0; i < this.agents.length; i++) {
          this.agents[i].log = this._cachedLogs[i];
        }
      }
      if (this._cachedPaths) {
        for (let i = 0; i < this.agents.length; i++) {
          this.agents[i].pathHistory = this._cachedPaths[i];
        }
      }
      if (this._cachedPassedBy) {
        for (let i = 0; i < this.agents.length; i++) {
          this.agents[i].passedByTiles = this._cachedPassedBy[i];
        }
      }
      this._buildActivityTable();
      this._showReplayBtn();
      return;
    }

    this.animFrameId = requestAnimationFrame(() => this._replayLoop());
  }

  _recordFrame(realTime, simHours) {
    const agents = this.agents.map(a => ({
      x: a.x, y: a.y, state: a.state, phase: a.phase, id: a.id
    }));
    const drivers = this.drivers.map(d => ({
      x: d.x, y: d.y, phase: d.phase, agentId: d.agent.id
    }));
    this._frameCache.push({ realTime, simHours, agents, drivers });
  }

  _applyFrame(frame) {
    for (const snap of frame.agents) {
      const agent = this.agents.find(a => a.id === snap.id);
      if (agent) {
        agent.x = snap.x;
        agent.y = snap.y;
        agent.state = snap.state;
        agent.phase = snap.phase;
      }
    }
    for (let i = 0; i < frame.drivers.length; i++) {
      const snap = frame.drivers[i];
      if (this.drivers[i]) {
        this.drivers[i].x = snap.x;
        this.drivers[i].y = snap.y;
        this.drivers[i].phase = snap.phase;
      }
    }
  }

  _showReplayBtn() {
    const btn = document.getElementById('replayBtn');
    if (btn) btn.style.display = 'inline-block';
  }

  _hideReplayBtn() {
    const btn = document.getElementById('replayBtn');
    if (btn) btn.style.display = 'none';
  }

  // ── Main loop ────────────────────────────────────────────────

  _loop() {
    if (!this.running || this.paused) return;

    const now          = performance.now();
    const elapsedTotal = (now - this.startTime - this._pausedTotal) / 1000; // real seconds (minus paused)
    const deltaSeconds = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    // End condition
    if (elapsedTotal >= SIM_DURATION_REAL) {
      this._recordFrame(SIM_DURATION_REAL, SIM_DURATION_HOURS);
      this._render(SIM_DURATION_HOURS);
      this._updateTimeDisplay(SIM_DURATION_REAL, SIM_DURATION_HOURS);
      this._setStatus('Simulation complete!');
      this.running = false;
      this.paused  = false;
      // Cache logs + path histories so replay can restore them
      this._cachedLogs  = this.agents.map(a => [...a.log.map(e => ({...e}))]);
      this._cachedPaths = this.agents.map(a =>
        a.pathHistory.map(p => ({ path: [...p.path], tileType: p.tileType }))
      );
      this._cachedPassedBy = this.agents.map(a => new Map(a.passedByTiles));
      this._buildActivityTable();
      this._showReplayBtn();
      if (this.onComplete) this.onComplete();
      return;
    }

    // Map real time → sim hours
    const simHours = (elapsedTotal / SIM_DURATION_REAL) * SIM_DURATION_HOURS;

    // Update every agent
    for (const agent of this.agents) {
      agent.update(simHours, deltaSeconds);
    }

    // Update delivery drivers
    for (const driver of this.drivers) {
      driver.update(simHours, deltaSeconds);
    }

    this._render(simHours);
    this._updateTimeDisplay(elapsedTotal, simHours);
    this._recordFrame(elapsedTotal, simHours);

    this.animFrameId = requestAnimationFrame(() => this._loop());
  }

  // ── Rendering ────────────────────────────────────────────────

  _render(_simHours) {
    this._renderCity();
    this._renderSelectedTile();
    this._renderAgentPaths();
    this._renderAgents();
    this._renderDrivers();
  }

  _renderCity() {
    const ctx  = this.ctx;
    const grid = this.city.grid;
    const cols = this.city.cols;
    const rows = this.city.rows;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = TILE_COLORS[grid[y][x]];
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;

    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(cols * CELL_SIZE, y * CELL_SIZE);
      ctx.stroke();
    }
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, rows * CELL_SIZE);
      ctx.stroke();
    }
  }

  _renderSelectedTile() {
    if (!this.selectedTile) return;
    const ctx = this.ctx;
    const { x, y } = this.selectedTile;
    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;

    // White outline around the tile
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    // Name label above the tile
    const name = this.city.getNameAt(x, y);
    if (name) {
      ctx.fillStyle   = '#ffffff';
      ctx.font        = 'bold 9px sans-serif';
      ctx.textAlign   = 'center';

      const labelX = px + CELL_SIZE / 2;
      const labelY = py - 4;

      // Background for readability
      const metrics = ctx.measureText(name);
      const padX = 3;
      const padY = 2;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(
        labelX - metrics.width / 2 - padX,
        labelY - 9 - padY,
        metrics.width + padX * 2,
        12 + padY
      );
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, labelX, labelY);
    }
  }

  _renderAgentPaths() {
    if (!this.selectedAgent) return;
    const agent = this.selectedAgent;
    const ctx = this.ctx;

    // Draw all recorded path segments
    for (const entry of agent.pathHistory) {
      this._drawPathLine(ctx, entry.path, entry.tileType);
    }

    // Also draw the current active path if agent is mid-travel
    if (agent.path && agent.path.length > 1) {
      const originTile = this.city.getTile(agent.path[0].x, agent.path[0].y);
      this._drawPathLine(ctx, agent.path, originTile);
    }
  }

  _drawPathLine(ctx, path, tileType) {
    if (!path || path.length < 2) return;
    const color = PATH_COLORS[tileType] || PATH_COLORS.default;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.globalAlpha = 0.85;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';

    ctx.beginPath();
    ctx.moveTo(
      path[0].x * CELL_SIZE + CELL_SIZE / 2,
      path[0].y * CELL_SIZE + CELL_SIZE / 2
    );
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(
        path[i].x * CELL_SIZE + CELL_SIZE / 2,
        path[i].y * CELL_SIZE + CELL_SIZE / 2
      );
    }
    ctx.stroke();

    // Draw small circles at start and end
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    for (const pt of [path[0], path[path.length - 1]]) {
      ctx.beginPath();
      ctx.arc(
        pt.x * CELL_SIZE + CELL_SIZE / 2,
        pt.y * CELL_SIZE + CELL_SIZE / 2,
        3, 0, Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  _renderAgents() {
    const ctx = this.ctx;

    // Build a set of agent IDs that are currently sharing a tile with a dropping-off driver
    const sharedAgentIds = new Set();
    for (const driver of this.drivers) {
      if (driver.phase === 'dropping_off') {
        sharedAgentIds.add(driver.agent.id);
      }
    }

    // Detect visiting agents and home agents sharing tiles
    const visitingAgentIds = new Set();
    const visitedTiles = new Set();
    for (const agent of this.agents) {
      if (agent.phase === 'at_friend' && agent.friendHome) {
        visitingAgentIds.add(agent.id);
        visitedTiles.add(`${Math.round(agent.x)},${Math.round(agent.y)}`);
      }
    }
    const homeAgentsAtVisitedTile = new Set();
    for (const agent of this.agents) {
      if (!visitingAgentIds.has(agent.id)) {
        const key = `${Math.round(agent.x)},${Math.round(agent.y)}`;
        if (visitedTiles.has(key)) {
          homeAgentsAtVisitedTile.add(agent.id);
        }
      }
    }

    for (const agent of this.agents) {
      let px = agent.x * CELL_SIZE + CELL_SIZE / 2;
      const py = agent.y * CELL_SIZE + CELL_SIZE / 2;

      // Offset left when sharing tile with delivery driver
      if (sharedAgentIds.has(agent.id)) {
        px -= AGENT_RADIUS + 1;
      }

      // Offset for friend visits: home agent left, visiting agent right
      if (homeAgentsAtVisitedTile.has(agent.id)) {
        px -= AGENT_RADIUS + 1;
      } else if (visitingAgentIds.has(agent.id)) {
        px += AGENT_RADIUS + 1;
      }

      // Determine dot color
      let dotColor;
      if (sharedAgentIds.has(agent.id)) {
        // Agent receiving delivery: always red (working)
        dotColor = '#ff4444';
      } else if (visitingAgentIds.has(agent.id)) {
        // Visitor is always white
        dotColor = '#ffffff';
      } else if (homeAgentsAtVisitedTile.has(agent.id)) {
        // Home owner: green unless sleeping → black
        dotColor = agent.state === 'sleeping' ? '#111111' : '#00ff88';
      } else {
        dotColor = AGENT_COLORS[agent.state] || '#888';
      }

      // Draw dot
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(px, py, AGENT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // If this agent is selected, draw highlight ring + ID label
      if (agent === this.selectedAgent) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, SELECT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        // ID label above the dot
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(agent.idStr, px, py - SELECT_RADIUS - 3);
      }
    }
  }

  _renderDrivers() {
    const ctx = this.ctx;
    for (const driver of this.drivers) {
      // Only show while actively moving or dropping off
      if (driver.phase === 'waiting' || driver.phase === 'done') continue;

      let px = driver.x * CELL_SIZE + CELL_SIZE / 2;
      const py = driver.y * CELL_SIZE + CELL_SIZE / 2;

      // Offset right when dropping off (sharing tile with agent)
      if (driver.phase === 'dropping_off') {
        px += AGENT_RADIUS + 1;
      }

      // Slightly larger blue dot for visibility
      ctx.fillStyle = '#4488ff';
      ctx.beginPath();
      ctx.arc(px, py, AGENT_RADIUS + 1, 0, Math.PI * 2);
      ctx.fill();

      // White outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, AGENT_RADIUS + 1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Click-to-select ─────────────────────────────────────────────

  _handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // 1. Check agent clicks first (agents are on top of tiles)
    const clickRadius = CELL_SIZE;
    let closest = null;
    let closestDist = Infinity;

    for (const agent of this.agents) {
      const px = agent.x * CELL_SIZE + CELL_SIZE / 2;
      const py = agent.y * CELL_SIZE + CELL_SIZE / 2;
      const dx = mx - px;
      const dy = my - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < clickRadius && dist < closestDist) {
        closest = agent;
        closestDist = dist;
      }
    }

    if (closest) {
      // Toggle agent selection, clear tile selection
      this.selectedAgent = closest === this.selectedAgent ? null : closest;
      this.selectedTile  = null;
    } else {
      // 2. Check tile clicks (only named tiles: business, leisure, eatery)
      this.selectedAgent = null;
      const tileX = Math.floor(mx / CELL_SIZE);
      const tileY = Math.floor(my / CELL_SIZE);

      if (this.city) {
        const t = this.city.getTile(tileX, tileY);
        if (t === TILE.BUSINESS || t === TILE.LEISURE || t === TILE.EATERY || t === TILE.HOUSE) {
          const same = this.selectedTile &&
                       this.selectedTile.x === tileX &&
                       this.selectedTile.y === tileY;
          this.selectedTile = same ? null : { x: tileX, y: tileY };
        } else {
          this.selectedTile = null;
        }
      }
    }

    // Re-render if sim is not actively animating
    if (!this.running || this.paused) {
      this._render(SIM_DURATION_HOURS);
    }
  }

  // ── UI helpers ───────────────────────────────────────────────

  _updateTimeDisplay(realElapsed, simHours) {
    const rMin = Math.floor(realElapsed / 60);
    const rSec = Math.floor(realElapsed % 60);
    const tMin = Math.floor(SIM_DURATION_REAL / 60);
    const tSec = Math.floor(SIM_DURATION_REAL % 60);

    const sH = Math.floor(simHours) % 24;
    const sM = Math.floor((simHours % 1) * 60);

    this.timeDisplay.textContent =
      `Real: ${rMin}:${String(rSec).padStart(2, '0')} / ` +
      `${tMin}:${String(tSec).padStart(2, '0')}  |  ` +
      `In-World: ${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;
  }

  _resetTimeDisplay() {
    this.timeDisplay.textContent = 'Real: 0:00 / 3:00  |  In-World: 00:00';
  }

  _setStatus(msg) {
    if (this.statusDisplay) this.statusDisplay.textContent = msg;
  }

  // ── Agent creation ───────────────────────────────────────────

  _createAgents() {
    this.agents = [];

    const { houses, businesses, leisureSpots, eateries } = this.city;

    if (houses.length === 0 || businesses.length === 0) {
      this._setStatus('Not enough buildings — please generate a new city.');
      return;
    }

    // Pick up to MAX_AGENTS random houses
    const pool = houses.length > MAX_AGENTS
      ? this._shuffle([...houses]).slice(0, MAX_AGENTS)
      : [...houses];

    let idCounter = 0;
    for (const home of pool) {
      const workplace   = businesses[Math.floor(Math.random() * businesses.length)];
      const leisureSpot = leisureSpots.length > 0
        ? leisureSpots[Math.floor(Math.random() * leisureSpots.length)]
        : null;
      const eatery = eateries.length > 0
        ? eateries[Math.floor(Math.random() * eateries.length)]
        : null;

      this.agents.push(new Agent(idCounter++, home, workplace, leisureSpot, eatery, this.city));
    }

    // ── Create delivery drivers for agents that order in ──────────
    this.drivers = [];
    const simHoursPerSec = SIM_DURATION_HOURS / SIM_DURATION_REAL;

    for (const agent of this.agents) {
      if (!agent.ordersDelivery) continue;

      // Driver spawns at the agent's favourite eatery
      this.drivers.push(
        new DeliveryDriver(agent.eatery, agent.workplace, agent, this.city, simHoursPerSec)
      );
    }

    // ── Assign friend homes for potential visits ──────────────
    for (const agent of this.agents) {
      if (!agent.wantsToVisitFriend) continue;

      const candidates = this.agents.filter(other => {
        if (other === agent) return false;
        const dx = Math.abs(agent.home.x - other.home.x);
        const dy = Math.abs(agent.home.y - other.home.y);
        return (dx + dy) < 30;
      });

      if (candidates.length > 0) {
        const friend = candidates[Math.floor(Math.random() * candidates.length)];
        agent.friendHome  = { x: friend.home.x, y: friend.home.y };
        agent.friendAgent = friend;
      }
    }
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Activity Table (post-simulation) ───────────────────────────

  _clearActivityTable() {
    const container = document.getElementById('activityTableContainer');
    if (container) container.innerHTML = '';
  }

  _buildActivityTable() {
    const container = document.getElementById('activityTableContainer');
    if (!container) return;
    container.innerHTML = '';

    // Outer collapsible wrapper
    const outerDetails = document.createElement('details');
    const outerSummary = document.createElement('summary');
    outerSummary.textContent = `Agent Activity Log (${this.agents.length} agents)`;
    outerDetails.appendChild(outerSummary);

    const list = document.createElement('div');
    list.classList.add('agent-log-list');

    for (const a of this.agents) {
      const events = a.log;

      // Each agent is a collapsible row
      const agentDetails = document.createElement('details');
      agentDetails.classList.add('agent-row');

      const agentSummary = document.createElement('summary');
      agentSummary.classList.add('agent-row-summary');

      // Clickable agent ID that selects the agent on the canvas
      const idSpan = document.createElement('span');
      idSpan.classList.add('agent-id-link');
      idSpan.textContent = a.idStr;
      idSpan.title = 'Click to show paths on map';
      idSpan.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Toggle selection
        this.selectedAgent = this.selectedAgent === a ? null : a;
        this.selectedTile  = null;
        // Re-render canvas to show / hide paths
        this._render(SIM_DURATION_HOURS);

        // Highlight active row
        container.querySelectorAll('.agent-row-summary').forEach(
          s => s.classList.remove('agent-selected')
        );
        if (this.selectedAgent === a) {
          agentSummary.classList.add('agent-selected');
        }
      });
      agentSummary.appendChild(idSpan);
      agentDetails.appendChild(agentSummary);

      if (events.length === 0) {
        const empty = document.createElement('div');
        empty.classList.add('agent-row-body');
        empty.textContent = 'No activity recorded.';
        agentDetails.appendChild(empty);
      } else {
        const table = document.createElement('table');
        table.classList.add('agent-event-table');
        table.innerHTML = `<thead><tr><th>Event</th><th>Time</th><th>Delta Time</th><th>Location</th></tr></thead>`;
        const tbody = document.createElement('tbody');
        for (let i = 0; i < events.length; i++) {
          const entry = events[i];
          const tr = document.createElement('tr');
          const loc = entry.location || '';
          let delta = '';
          if (i < events.length - 1) {
            const diffHours = events[i + 1].time - entry.time;
            const diffMin = Math.round(diffHours * 60);
            if (diffMin < 60) {
              delta = `${diffMin}m`;
            } else {
              const h = Math.floor(diffMin / 60);
              const m = diffMin % 60;
              delta = m > 0 ? `${h}h ${m}m` : `${h}h`;
            }
          }
          tr.innerHTML = `<td>${entry.event}</td><td>${formatSimTime(entry.time)}</td><td class="delta-cell">${delta}</td><td class="loc-cell">${loc}</td>`;
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        agentDetails.appendChild(table);
      }

      // ── Travel Details button ──
      if (a.passedByTiles && a.passedByTiles.size > 0) {
        const detailsWrap = document.createElement('div');
        detailsWrap.classList.add('travel-details-wrap');

        const detailsBtn = document.createElement('button');
        detailsBtn.classList.add('travel-details-btn');
        detailsBtn.textContent = 'Travel Details';

        const detailsPanel = document.createElement('div');
        detailsPanel.classList.add('travel-details-panel');
        detailsPanel.style.display = 'none';

        // Build sorted list from passedByTiles map
        const sorted = [...a.passedByTiles.entries()].sort((a, b) => b[1] - a[1]);
        const detTbl = document.createElement('table');
        detTbl.classList.add('agent-event-table', 'travel-details-table');
        detTbl.innerHTML = `<thead><tr><th>Place</th><th>Times Passed</th></tr></thead>`;
        const dtbody = document.createElement('tbody');
        for (const [name, count] of sorted) {
          const tr = document.createElement('tr');
          tr.innerHTML = count > 1
            ? `<td>${name} x ${count}</td><td>${count}</td>`
            : `<td>${name}</td><td>1</td>`;
          dtbody.appendChild(tr);
        }
        detTbl.appendChild(dtbody);
        detailsPanel.appendChild(detTbl);

        detailsBtn.addEventListener('click', () => {
          const showing = detailsPanel.style.display !== 'none';
          detailsPanel.style.display = showing ? 'none' : 'block';
          detailsBtn.textContent = showing ? 'Travel Details' : 'Hide Details';
        });

        detailsWrap.appendChild(detailsBtn);
        detailsWrap.appendChild(detailsPanel);
        agentDetails.appendChild(detailsWrap);
      }

      list.appendChild(agentDetails);
    }

    outerDetails.appendChild(list);
    container.appendChild(outerDetails);
  }
}
