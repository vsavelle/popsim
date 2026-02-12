// ── Tile Types & Colors ──────────────────────────────────────────

import { generateName, generateAddress, resetAddresses } from './names.js';

export const TILE = {
  EMPTY:    0,
  ROAD:     1,
  HOUSE:    2,
  BUSINESS: 3,
  LEISURE:  4,
  EATERY:   5,
};

export const TILE_COLORS = {
  [TILE.EMPTY]:    '#16161a',
  [TILE.ROAD]:     '#555566',
  [TILE.HOUSE]:    '#2d6a4f',
  [TILE.BUSINESS]: '#457b9d',
  [TILE.LEISURE]:  '#7b4daa',
  [TILE.EATERY]:   '#d4812a',
};

// ── City ─────────────────────────────────────────────────────────

export class City {
  /**
   * @param {number} cols  Grid columns
   * @param {number} rows  Grid rows
   */
  constructor(cols = 60, rows = 40) {
    this.cols = cols;
    this.rows = rows;
    this.grid = [];
    this.houses = [];
    this.businesses = [];
    this.leisureSpots = [];
    this.eateries = [];
    /** Map from "x,y" → name string for businesses, leisure, eateries */
    this.tileNames = new Map();
    this.generate();
  }

  /** Build a new random city layout. */
  generate() {
    // 1. Fill with empty
    this.grid = Array.from({ length: this.rows }, () =>
      new Array(this.cols).fill(TILE.EMPTY)
    );
    this.houses = [];
    this.businesses = [];
    this.leisureSpots = [];
    this.eateries = [];
    this.tileNames = new Map();
    resetAddresses();

    // 2. Lay down horizontal roads (full-width rows)
    const hRoads = [];
    let y = 1 + Math.floor(Math.random() * 3);
    while (y < this.rows - 1) {
      hRoads.push(y);
      for (let x = 0; x < this.cols; x++) {
        this.grid[y][x] = TILE.ROAD;
      }
      y += 5 + Math.floor(Math.random() * 4); // spacing 5-8
    }

    // 3. Lay down vertical roads (full-height columns)
    const vRoads = [];
    let x = 1 + Math.floor(Math.random() * 3);
    while (x < this.cols - 1) {
      vRoads.push(x);
      for (let ry = 0; ry < this.rows; ry++) {
        this.grid[ry][x] = TILE.ROAD;
      }
      x += 5 + Math.floor(Math.random() * 4);
    }

    // 4. Place buildings next to roads
    for (let by = 0; by < this.rows; by++) {
      for (let bx = 0; bx < this.cols; bx++) {
        if (this.grid[by][bx] !== TILE.EMPTY) continue;
        if (!this._isAdjacentToRoad(bx, by)) continue;

        const r = Math.random();
        if (r < 0.45) {
          this.grid[by][bx] = TILE.HOUSE;
          this.houses.push({ x: bx, y: by });
          this.tileNames.set(`${bx},${by}`, generateAddress());
        } else if (r < 0.65) {
          this.grid[by][bx] = TILE.BUSINESS;
          this.businesses.push({ x: bx, y: by });
          this.tileNames.set(`${bx},${by}`, generateName('business'));
        } else if (r < 0.80) {
          this.grid[by][bx] = TILE.LEISURE;
          this.leisureSpots.push({ x: bx, y: by });
          this.tileNames.set(`${bx},${by}`, generateName('leisure'));
        } else if (r < 0.88) {
          this.grid[by][bx] = TILE.EATERY;
          this.eateries.push({ x: bx, y: by });
          this.tileNames.set(`${bx},${by}`, generateName('eatery'));
        }
        // else stays empty → open space
      }
    }

    // 5. Safety: guarantee at least one of each building type
    this._ensureMinBuildings();
  }

  /** Convert some houses if a building type is missing. */
  _ensureMinBuildings() {
    while (this.businesses.length < 2 && this.houses.length > 4) {
      const h = this.houses.pop();
      this.grid[h.y][h.x] = TILE.BUSINESS;
      this.businesses.push(h);
      this.tileNames.set(`${h.x},${h.y}`, generateName('business'));
    }
    while (this.leisureSpots.length < 2 && this.houses.length > 4) {
      const h = this.houses.pop();
      this.grid[h.y][h.x] = TILE.LEISURE;
      this.leisureSpots.push(h);
      this.tileNames.set(`${h.x},${h.y}`, generateName('leisure'));
    }
    while (this.eateries.length < 2 && this.houses.length > 4) {
      const h = this.houses.pop();
      this.grid[h.y][h.x] = TILE.EATERY;
      this.eateries.push(h);
      this.tileNames.set(`${h.x},${h.y}`, generateName('eatery'));
    }
  }

  _isAdjacentToRoad(cx, cy) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
        if (this.grid[ny][nx] === TILE.ROAD) return true;
      }
    }
    return false;
  }

  getTile(cx, cy) {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return TILE.EMPTY;
    return this.grid[cy][cx];
  }

  /** Get the name assigned to a tile, or null. */
  getNameAt(cx, cy) {
    return this.tileNames.get(`${cx},${cy}`) || null;
  }
}
