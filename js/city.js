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

  /** Build a new random city layout with zoned districts. */
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

    // ── Compute centre point and radii for zoning ──
    const cx = this.cols / 2;
    const cy = this.rows / 2;
    // Normalised radius: 0 = centre, 1 = corner
    const maxR = Math.sqrt(cx * cx + cy * cy);

    // Commercial zone boundary (inner ~40% of the radius)
    const commercialThreshold = 0.40;

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

    // ── Determine tile budget based on agent usage + 10% surplus ──
    // MAX_AGENTS = 150 (imported via constant below)
    const agentCount   = 150;
    const targetHouses    = Math.ceil(agentCount * 1.10);       // each agent needs 1 home
    const targetBusiness  = Math.ceil(agentCount * 0.25 * 1.10); // ~25% unique workplaces
    const targetLeisure   = Math.ceil(agentCount * 0.15 * 1.10); // ~15% leisure spots
    const targetEatery    = Math.ceil(agentCount * 0.15 * 1.10); // ~15% eateries

    // 4. Collect all road-adjacent empty cells and classify by zone
    const commercialCandidates = [];
    const residentialCandidates = [];

    for (let by = 0; by < this.rows; by++) {
      for (let bx = 0; bx < this.cols; bx++) {
        if (this.grid[by][bx] !== TILE.EMPTY) continue;
        if (!this._isAdjacentToRoad(bx, by)) continue;

        const dx = bx - cx;
        const dy = by - cy;
        const normR = Math.sqrt(dx * dx + dy * dy) / maxR;

        if (normR <= commercialThreshold) {
          commercialCandidates.push({ x: bx, y: by });
        } else {
          residentialCandidates.push({ x: bx, y: by });
        }
      }
    }

    // Shuffle candidates for randomness
    this._shuffleArr(commercialCandidates);
    this._shuffleArr(residentialCandidates);

    // 5. Place commercial tiles in the centre zone
    let bizCount = 0, leisureCount = 0, eatCount = 0;
    const totalCommercial = targetBusiness + targetLeisure + targetEatery;

    for (const pos of commercialCandidates) {
      if (bizCount + leisureCount + eatCount >= totalCommercial) break;

      const r = Math.random();
      if (r < 0.45 && bizCount < targetBusiness) {
        this.grid[pos.y][pos.x] = TILE.BUSINESS;
        this.businesses.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('business'));
        bizCount++;
      } else if (r < 0.72 && leisureCount < targetLeisure) {
        this.grid[pos.y][pos.x] = TILE.LEISURE;
        this.leisureSpots.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('leisure'));
        leisureCount++;
      } else if (eatCount < targetEatery) {
        this.grid[pos.y][pos.x] = TILE.EATERY;
        this.eateries.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('eatery'));
        eatCount++;
      } else if (bizCount < targetBusiness) {
        this.grid[pos.y][pos.x] = TILE.BUSINESS;
        this.businesses.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('business'));
        bizCount++;
      } else if (leisureCount < targetLeisure) {
        this.grid[pos.y][pos.x] = TILE.LEISURE;
        this.leisureSpots.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('leisure'));
        leisureCount++;
      }
    }

    // If commercial zone didn't have enough space, spill into residential
    for (const pos of residentialCandidates) {
      if (bizCount >= targetBusiness && leisureCount >= targetLeisure && eatCount >= targetEatery) break;
      if (bizCount < targetBusiness) {
        this.grid[pos.y][pos.x] = TILE.BUSINESS;
        this.businesses.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('business'));
        bizCount++;
      } else if (leisureCount < targetLeisure) {
        this.grid[pos.y][pos.x] = TILE.LEISURE;
        this.leisureSpots.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('leisure'));
        leisureCount++;
      } else if (eatCount < targetEatery) {
        this.grid[pos.y][pos.x] = TILE.EATERY;
        this.eateries.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateName('eatery'));
        eatCount++;
      }
    }

    // 6. Place houses on the outer ring (residential candidates not yet used)
    let houseCount = 0;
    for (const pos of residentialCandidates) {
      if (houseCount >= targetHouses) break;
      if (this.grid[pos.y][pos.x] !== TILE.EMPTY) continue;  // skip if used for spill

      this.grid[pos.y][pos.x] = TILE.HOUSE;
      this.houses.push(pos);
      this.tileNames.set(`${pos.x},${pos.y}`, generateAddress());
      houseCount++;
    }

    // If outer ring didn't have enough space, place houses in commercial zone gaps
    if (houseCount < targetHouses) {
      for (const pos of commercialCandidates) {
        if (houseCount >= targetHouses) break;
        if (this.grid[pos.y][pos.x] !== TILE.EMPTY) continue;

        this.grid[pos.y][pos.x] = TILE.HOUSE;
        this.houses.push(pos);
        this.tileNames.set(`${pos.x},${pos.y}`, generateAddress());
        houseCount++;
      }
    }

    // 7. Safety: guarantee at least one of each building type
    this._ensureMinBuildings();
  }

  /** Fisher-Yates shuffle helper (in-place) */
  _shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
