import { TILE } from './city.js';

/**
 * BFS pathfinding on the city road network.
 *
 * The start and end tiles can be non-road tiles (buildings).
 * The algorithm walks only on ROAD tiles plus the exact destination tile.
 *
 * @param {import('./city.js').City} city
 * @param {number} sx  Start tile X
 * @param {number} sy  Start tile Y
 * @param {number} ex  End tile X
 * @param {number} ey  End tile Y
 * @returns {{x:number, y:number}[] | null}  Array of tile coords, or null if unreachable
 */
export function findPath(city, sx, sy, ex, ey) {
  if (sx === ex && sy === ey) return [{ x: sx, y: sy }];

  const cols = city.cols;
  const rows = city.rows;
  const key = (px, py) => py * cols + px;

  const cameFrom = new Map();
  const startKey = key(sx, sy);
  cameFrom.set(startKey, null);

  // Use an array-based queue with a head pointer (avoids expensive shift())
  const queue = [[sx, sy]];
  let head = 0;

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  while (head < queue.length) {
    const [cx, cy] = queue[head++];

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;

      const k = key(nx, ny);
      if (cameFrom.has(k)) continue;

      const tile = city.grid[ny][nx];
      // Allow walking on roads, or stepping onto the exact destination tile
      if (tile !== TILE.ROAD && !(nx === ex && ny === ey)) continue;

      cameFrom.set(k, key(cx, cy));

      // Reached destination → reconstruct path
      if (nx === ex && ny === ey) {
        const path = [];
        let ck = k;
        while (ck !== null) {
          path.unshift({ x: ck % cols, y: Math.floor(ck / cols) });
          ck = cameFrom.get(ck);
        }
        return path;
      }

      queue.push([nx, ny]);
    }
  }

  return null; // no path exists
}
