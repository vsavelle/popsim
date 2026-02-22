import { findPath } from './pathfinding.js';
import { TILE } from './city.js';

// ── Helper: format sim hours as HH:MM string ───────────────────
export function formatSimTime(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Agent — one simulated person living in the city.
 *
 * Lifecycle per 24-hour sim day:
 *   sleeping → wake(home) → commute → work → commute home
 *   → (optional: leave home → leisure → commute home)
 *   → evening at home → sleep
 *
 * Rule: agent must be home at least 1 hour before bedtime.
 */
export class Agent {
  /**
   * @param {number} id
   * @param {{x:number,y:number}} home
   * @param {{x:number,y:number}} workplace
   * @param {{x:number,y:number}|null} leisureSpot
   * @param {{x:number,y:number}|null} eatery
   * @param {import('./city.js').City} city
   */
  constructor(id, home, workplace, leisureSpot, eatery, city) {
    this.id = id;
    this.home = home;
    this.workplace = workplace;
    this.leisureSpot = leisureSpot;
    this.eatery = eatery;
    this.city = city;

    // Current visual position (fractional for smooth interpolation)
    this.x = home.x;
    this.y = home.y;

    // Visible state: 'sleeping' | 'home' | 'traveling' | 'working' | 'leisure'
    this.state = 'sleeping';

    // Movement (defined early — used in schedule calculations)
    this.path         = null;
    this.pathIndex    = 0;
    this.moveProgress = 0;
    this.speed        = 5 + Math.random() * 3;

    // ── Randomised daily schedule (in sim hours 0-24) ──
    this.workStart    = 6 + Math.random() * 3;                     // 06:00 – 09:00
    this.wakeUpTime   = this.workStart - (0.5 + Math.random() * 1.5);
    this.workDuration = 7 + Math.random() * 3;                     // 7 – 10 hours
    this.workEnd      = this.workStart + this.workDuration;

    // Lunch: 40-60% of agents pick their favourite eatery
    this.takesLunch = Math.random() < (0.4 + Math.random() * 0.2) && this.eatery !== null;
    this.lunchDuration = 0.5 + Math.random() * 0.5;               // 30–60 min
    if (this.takesLunch) {
      const rawLunchTime = this.workStart + this.workDuration / 2;
      this.lunchStart = Math.round(rawLunchTime * 2) / 2;         // nearest half-hour
      this.lunchEnd   = this.lunchStart + this.lunchDuration;
    } else {
      this.lunchStart = Infinity;
      this.lunchEnd   = Infinity;
    }
    this._hadLunch = false;

    // Distance-based delivery probability: farther eateries are more likely,
    // but even close ones have a chance (busy / lazy / preference).
    this.ordersDelivery = false;
    this._orderedDelivery = false;   // tracks if order event was logged
    this._deliveryDone = false;      // set by driver when drop-off finishes
    this._eatingDuration = (13 + Math.random() * 5) / 60;  // 13–18 min in sim hours
    this._deliveryArrivedTime = 0;   // sim-hour when delivery arrived (for work extension)
    if (this.takesLunch) {
      const dx = Math.abs(this.workplace.x - this.eatery.x);
      const dy = Math.abs(this.workplace.y - this.eatery.y);
      const dist = Math.max(dx, dy);
      // Far (>15): always order; mid (8-15): ~55% chance; close (<8): ~25% chance
      let deliveryChance;
      if (dist > 15)      deliveryChance = 1.0;
      else if (dist >= 8) deliveryChance = 0.55;
      else                deliveryChance = 0.25;
      if (Math.random() < deliveryChance) {
        this.ordersDelivery = true;
        // Order placed ~30 min (±5 min) before lunchStart (when delivery arrives)
        this.orderTime = this.lunchStart - (25 + Math.random() * 10) / 60;
      }
    }

    this.wantsLeisure    = Math.random() < 0.4;
    this.leisureDuration = 1 + Math.random() * 2;

    // Friend visit: 30% chance (destination assigned by Simulation after creation)
    this.wantsToVisitFriend = Math.random() < 0.3;
    this.friendHome   = null;   // another agent's home tile (set externally)
    this.friendAgent  = null;   // reference to that agent
    this.visitDuration = 0.5 + Math.random() * 1;  // 30–90 min

    this.bedTime = 20 + Math.random() * 4;
    this.curfew  = this.bedTime - 1;

    // ── Activity log (event-based) ──
    // Each entry: { event: string, time: number, location?: string }
    this.log = [];

    // ── Path history (for visualisation) ──
    // Each entry: { path: [{x,y},...], tileType: TILE_TYPE }
    this.pathHistory = [];

    // ── Passed-by tracking (tiles adjacent to travel route) ──
    // Map: tileName → count
    this.passedByTiles = new Map();
    this._lastTrackedTile = -1;   // pathIndex of last scan

    this.phase = 'sleeping';
  }

  /** Formatted ID string like #000 */
  get idStr() {
    return '#' + String(this.id).padStart(3, '0');
  }

  /**
   * Advance the agent one frame.
   * @param {number} simHours     Current in-world hour (0-24)
   * @param {number} deltaSeconds Real seconds since last frame
   */
  update(simHours, deltaSeconds) {
    switch (this.phase) {

      case 'sleeping':
        if (simHours >= this.wakeUpTime) {
          this.phase = 'waiting_for_work';
          this.state = 'home';
          this._logEvent('Wake up', simHours, this._nameAt(this.home));
        }
        break;

      case 'waiting_for_work':
        if (simHours >= this.workStart) {
          this._navigateTo(this.workplace);
          if (this.path) {
            this.phase = 'commuting_to_work';
            this.state = 'traveling';
            this._logEvent('Left home', simHours, this._nameAt(this.home));
          }
        }
        break;

      case 'commuting_to_work':
        if (this._moveAlongPath(deltaSeconds)) {
          this.phase = 'at_work';
          this.state = 'working';
          this._logEvent('Arrived work', simHours, this._nameAt(this.workplace));
        }
        break;

      case 'at_work':
        // Check delivery order (separate from lunch — happens ~30 min before)
        if (this.ordersDelivery && !this._orderedDelivery && simHours >= this.orderTime) {
          this._orderedDelivery = true;
          this._logEvent('Ordered delivery', simHours, this._nameAt(this.eatery));
        }
        // Delivery finished — start eating
        if (this._deliveryDone) {
          this._deliveryDone = false;
          this._eatingEndTime = simHours + this._eatingDuration;
          this.phase = 'eating_delivery';
          this.state = 'leisure';
          this._logEvent('Eating', simHours, this._nameAt(this.workplace));
          break;
        }
        // Check lunch first (only once)
        if (!this._hadLunch && this.takesLunch && simHours >= this.lunchStart) {
          this._hadLunch = true;

          if (this.ordersDelivery) {
            break;   // remain in at_work phase — driver is on the way
          }

          this._logEvent('Left for lunch', simHours, this._nameAt(this.workplace));
          this._navigateTo(this.eatery);
          if (this.path) {
            this.phase = 'commuting_to_lunch';
            this.state = 'traveling';
          }
          break;
        }
        if (simHours >= this.workEnd) {
          this._logEvent('Left work', simHours, this._nameAt(this.workplace));
          this._headHome(simHours, 'commuting_home_from_work');
        }
        break;

      case 'eating_delivery':
        if (simHours >= this._eatingEndTime) {
          // Extend work end by the total break time (delivery wait + eating)
          const breakTime = simHours - this._deliveryArrivedTime;
          this.workEnd += breakTime;
          this.phase = 'at_work';
          this.state = 'working';
          this._logEvent('Returned to work', simHours, this._nameAt(this.workplace));
        }
        break;

      case 'commuting_to_lunch':
        // Safety: if past work-end, abort lunch and head home
        if (simHours >= this.workEnd) {
          this._logEvent('Left work', simHours);
          this._headHome(simHours, 'commuting_home_from_work');
          break;
        }
        if (this._moveAlongPath(deltaSeconds)) {
          this.phase = 'at_lunch';
          this.state = 'leisure';
          this._logEvent('Arrived eatery', simHours, this._nameAt(this.eatery));
        }
        break;

      case 'at_lunch':
        // Safety: if past work-end, head straight home from eatery
        if (simHours >= this.workEnd) {
          this._logEvent('Left eatery (late)', simHours, this._nameAt(this.eatery));
          this._headHome(simHours, 'commuting_home_from_work');
          break;
        }
        if (simHours >= this.lunchEnd) {
          this._logEvent('Left eatery', simHours, this._nameAt(this.eatery));
          this._navigateTo(this.workplace);
          if (this.path) {
            this.phase = 'returning_from_lunch';
            this.state = 'traveling';
          } else {
            this.phase = 'at_work';
            this.state = 'working';
          }
        }
        break;

      case 'returning_from_lunch':
        // Safety: if past work-end, redirect home
        if (simHours >= this.workEnd && !this.path) {
          this._logEvent('Left work', simHours);
          this._headHome(simHours, 'commuting_home_from_work');
          break;
        }
        if (this._moveAlongPath(deltaSeconds)) {
          this.phase = 'at_work';
          this.state = 'working';
          this._logEvent('Returned to work', simHours, this._nameAt(this.workplace));
        }
        break;

      case 'commuting_home_from_work':
        if (this._moveAlongPath(deltaSeconds)) {
          this.state = 'home';
          this._logEvent('Arrived home', simHours, this._nameAt(this.home));
          this._decideLeisure(simHours);
        }
        break;

      case 'at_home_considering_leisure':
        if (simHours >= this._leisureDepartureTime) {
          this._navigateTo(this.leisureSpot);
          if (this.path) {
            this.phase = 'commuting_to_leisure';
            this.state = 'traveling';
            this._logEvent('Left home', simHours, this._nameAt(this.home));
          } else {
            this.phase = 'at_home_evening';
          }
        }
        break;

      case 'commuting_to_leisure':
        if (this._moveAlongPath(deltaSeconds)) {
          this.phase = 'at_leisure';
          this.state = 'leisure';
          this._logEvent('Arrived leisure', simHours, this._nameAt(this.leisureSpot));
        }
        break;

      case 'at_leisure':
        if (simHours >= this._leisureEndTime) {
          this._logEvent('Left leisure', simHours, this._nameAt(this.leisureSpot));
          this._headHome(simHours, 'commuting_home_from_leisure');
        }
        break;

      case 'commuting_home_from_leisure':
        if (this._moveAlongPath(deltaSeconds)) {
          this.state = 'home';
          this._logEvent('Arrived home', simHours, this._nameAt(this.home));
          this._decideFriendVisit(simHours);
        }
        break;

      case 'at_home_considering_friend_visit':
        if (simHours >= this._friendVisitDepartureTime) {
          this._navigateTo(this.friendHome);
          if (this.path) {
            this.phase = 'commuting_to_friend';
            this.state = 'traveling';
            this._logEvent('Left for friend\'s home', simHours, this._nameAt(this.home));
          } else {
            this.phase = 'at_home_evening';
          }
        }
        break;

      case 'commuting_to_friend':
        if (this._moveAlongPath(deltaSeconds)) {
          this.phase = 'at_friend';
          this.state = 'visiting';
          this._logEvent('Arrived friend\'s home', simHours, this._nameAt(this.friendHome));
        }
        break;

      case 'at_friend':
        if (simHours >= this._friendVisitEndTime) {
          this._logEvent('Left friend\'s home', simHours, this._nameAt(this.friendHome));
          this._headHome(simHours, 'commuting_home_from_friend');
        }
        break;

      case 'commuting_home_from_friend':
        if (this._moveAlongPath(deltaSeconds)) {
          this.phase = 'at_home_evening';
          this.state = 'home';
          this._logEvent('Arrived home', simHours, this._nameAt(this.home));
        }
        break;

      case 'at_home_evening':
        if (simHours >= this.bedTime) {
          this.phase = 'asleep_night';
          this.state = 'sleeping';
          this._logEvent('Went to sleep', simHours, this._nameAt(this.home));
        }
        break;
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  _logEvent(event, simHours, location) {
    const entry = { event, time: simHours };
    if (location) entry.location = location;
    this.log.push(entry);
  }

  /** Get the city-assigned name for a tile position, or null */
  _nameAt(pos) {
    if (!pos) return null;
    return this.city.getNameAt(pos.x, pos.y);
  }

  /**
   * After arriving home from work, decide whether to go out for leisure.
   * Must have enough time to do leisure AND get home 1 hr before bedtime.
   */
  _decideLeisure(simHours) {
    if (this.wantsLeisure && this.leisureSpot) {
      // Estimate: 0.5 hr rest at home + leisure duration + ~0.5 hr commute buffer
      const estimatedReturn = simHours + 0.5 + this.leisureDuration + 0.5;
      if (estimatedReturn <= this.curfew) {
        // Schedule departure after a short rest at home
        this._leisureDepartureTime = simHours + 0.3 + Math.random() * 0.4; // 18–42 min rest
        this._leisureEndTime = this._leisureDepartureTime + 0.2 + this.leisureDuration; // small travel buffer + duration
        this.phase = 'at_home_considering_leisure';
        return;
      }
    }
    // No leisure — check for friend visit
    this._decideFriendVisit(simHours);
  }

  /**
   * After arriving home (from work or leisure), decide whether to visit a friend.
   */
  _decideFriendVisit(simHours) {
    if (this.wantsToVisitFriend && this.friendHome) {
      // Estimate: short rest + visit duration + commute buffer
      const estimatedReturn = simHours + 0.3 + this.visitDuration + 0.5;
      if (estimatedReturn <= this.curfew) {
        this._friendVisitDepartureTime = simHours + 0.2 + Math.random() * 0.3;
        this._friendVisitEndTime = this._friendVisitDepartureTime + 0.2 + this.visitDuration;
        this.phase = 'at_home_considering_friend_visit';
        return;
      }
    }
    this.phase = 'at_home_evening';
  }

  _headHome(simHours, nextPhase) {
    this._navigateTo(this.home);
    if (this.path) {
      this.phase = nextPhase;
      this.state = 'traveling';
    } else {
      // Already home or unreachable — snap state
      this.x = this.home.x;
      this.y = this.home.y;
      this.state = 'home';
      this._logEvent('Arrived home', simHours, this._nameAt(this.home));
      if (nextPhase === 'commuting_home_from_work') {
        this._decideLeisure(simHours);
      } else if (nextPhase === 'commuting_home_from_leisure') {
        this._decideFriendVisit(simHours);
      } else {
        this.phase = 'at_home_evening';
      }
    }
  }

  _navigateTo(target) {
    const sx = Math.round(this.x);
    const sy = Math.round(this.y);
    this.path = findPath(this.city, sx, sy, target.x, target.y);
    this.pathIndex = 0;
    this.moveProgress = 0;
    this._lastTrackedTile = -1;

    // Record for path visualisation
    if (this.path && this.path.length > 1) {
      const originTile = this.city.getTile(sx, sy);
      this.pathHistory.push({
        path: this.path.map(p => ({ x: p.x, y: p.y })),
        tileType: originTile,
      });
      // Track adjacent tiles at the starting position
      this._trackNearbyTiles();
    }
  }

  /**
   * Scan tiles adjacent to the agent's current path tile for named buildings.
   */
  _trackNearbyTiles() {
    if (!this.path || this.pathIndex === this._lastTrackedTile) return;
    this._lastTrackedTile = this.pathIndex;

    const pos = this.path[this.pathIndex];
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dx, dy] of dirs) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const t = this.city.getTile(nx, ny);
      if (t === TILE.BUSINESS || t === TILE.LEISURE || t === TILE.EATERY) {
        const name = this.city.getNameAt(nx, ny);
        if (name) {
          this.passedByTiles.set(name, (this.passedByTiles.get(name) || 0) + 1);
        }
      }
    }
  }

  /**
   * Move the agent along its current path.
   * @returns {boolean} true when the agent has arrived at the destination.
   */
  _moveAlongPath(deltaSeconds) {
    if (!this.path || this.path.length <= 1) return true;

    this.moveProgress += this.speed * deltaSeconds;

    // Advance whole tiles
    while (this.moveProgress >= 1 && this.pathIndex < this.path.length - 1) {
      this.pathIndex++;
      this.moveProgress -= 1;
      this._trackNearbyTiles();
    }

    // Check arrival
    if (this.pathIndex >= this.path.length - 1) {
      const end = this.path[this.path.length - 1];
      this.x = end.x;
      this.y = end.y;
      this.path = null;
      return true;
    }

    // Smooth interpolation between current and next tile
    const curr = this.path[this.pathIndex];
    const next = this.path[this.pathIndex + 1];
    const t = Math.min(this.moveProgress, 1);
    this.x = curr.x + (next.x - curr.x) * t;
    this.y = curr.y + (next.y - curr.y) * t;
    return false;
  }
}
