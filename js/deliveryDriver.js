import { findPath } from './pathfinding.js';

/**
 * DeliveryDriver — a blue-dot courier that carries food from an eatery
 * to an agent's workplace, then returns to the same eatery.
 *
 * Lifecycle:  waiting → delivering → dropping_off → returning → done
 *
 * The driver pre-computes the delivery path so it departs at the right
 * time to arrive around lunchStart.
 */
export class DeliveryDriver {
  /**
   * @param {{x:number,y:number}} eatery    Spawn / return location
   * @param {{x:number,y:number}} business  Drop-off location
   * @param {import('./agent.js').Agent} agent  The ordering agent
   * @param {import('./city.js').City} city
   * @param {number} simHoursPerSec  Conversion factor (sim hours per real second)
   */
  constructor(eatery, business, agent, city, simHoursPerSec) {
    this.eatery   = eatery;
    this.business = business;
    this.agent    = agent;
    this.city     = city;
    this.simHoursPerSec = simHoursPerSec;

    this.x = eatery.x;
    this.y = eatery.y;

    this.speed        = 7 + Math.random() * 2;   // slightly faster than regular agents
    this.phase        = 'waiting';                // waiting | delivering | dropping_off | returning | done
    this.path         = null;
    this.pathIndex    = 0;
    this.moveProgress = 0;
    this._dropOffEnd  = 0;                        // sim-hour when drop-off finishes

    // Pre-compute the delivery path so we can schedule departure
    this._deliveryPath = findPath(city, eatery.x, eatery.y, business.x, business.y);

    if (this._deliveryPath && this._deliveryPath.length > 1) {
      // Travel time in sim hours: (steps / speed) real-sec × simHoursPerSec
      const steps = this._deliveryPath.length - 1;
      const travelSimHours = (steps / this.speed) * simHoursPerSec;
      // Depart early enough to arrive at lunchStart
      this.departureTime = Math.max(0, agent.lunchStart - travelSimHours);
    } else {
      // No path or same tile — mark done immediately
      this.phase = 'done';
      this.departureTime = Infinity;
    }
  }

  /**
   * @param {number} simHours     Current in-world hour (0-24)
   * @param {number} deltaSeconds Real seconds since last frame
   */
  update(simHours, deltaSeconds) {
    switch (this.phase) {

      case 'waiting':
        if (simHours >= this.departureTime) {
          this.path         = this._deliveryPath;
          this.pathIndex    = 0;
          this.moveProgress = 0;
          this._deliveryPath = null;
          this.phase = 'delivering';
        }
        break;

      case 'delivering':
        if (this._moveAlongPath(deltaSeconds)) {
          // Arrived at business — start 10-minute drop-off
          this.x = this.business.x;
          this.y = this.business.y;
          this._dropOffEnd = simHours + (10 / 60);   // 10 in-world minutes
          this.phase = 'dropping_off';

          const eateryName =
            this.city.getNameAt(this.eatery.x, this.eatery.y) || 'Eatery';
          this.agent._logEvent('Delivery by ' + eateryName, simHours, eateryName);
        }
        break;

      case 'dropping_off':
        // Stay at business tile for 10 in-world minutes
        if (simHours >= this._dropOffEnd) {
          this._navigateTo(this.eatery);
          this.phase = this.path ? 'returning' : 'done';
        }
        break;

      case 'returning':
        if (this._moveAlongPath(deltaSeconds)) {
          this.phase = 'done';
        }
        break;
    }
  }

  // ── Movement helpers ──────────────────────────────────────────

  _navigateTo(target) {
    const sx = Math.round(this.x);
    const sy = Math.round(this.y);
    this.path         = findPath(this.city, sx, sy, target.x, target.y);
    this.pathIndex    = 0;
    this.moveProgress = 0;
  }

  _moveAlongPath(deltaSeconds) {
    if (!this.path || this.path.length <= 1) return true;

    this.moveProgress += this.speed * deltaSeconds;

    while (this.moveProgress >= 1 && this.pathIndex < this.path.length - 1) {
      this.pathIndex++;
      this.moveProgress -= 1;
    }

    if (this.pathIndex >= this.path.length - 1) {
      const end = this.path[this.path.length - 1];
      this.x    = end.x;
      this.y    = end.y;
      this.path = null;
      return true;
    }

    const curr = this.path[this.pathIndex];
    const next = this.path[this.pathIndex + 1];
    const t    = Math.min(this.moveProgress, 1);
    this.x = curr.x + (next.x - curr.x) * t;
    this.y = curr.y + (next.y - curr.y) * t;
    return false;
  }
}
