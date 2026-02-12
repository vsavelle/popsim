// ── Random Name Generator for city buildings ────────────────────

const BUSINESS_PREFIXES = [
  'Apex', 'Vertex', 'Summit', 'Pinnacle', 'Core', 'Nova', 'Vanguard',
  'Pacific', 'Atlas', 'Meridian', 'Sterling', 'Crestwood', 'Irongate',
  'Bridgeport', 'Harmon', 'Whitfield', 'Graystone', 'Blackwell',
  'Evergreen', 'Northstar', 'Redstone', 'Blueridge', 'Ashford',
];

const BUSINESS_SUFFIXES = [
  'Industries', 'Solutions', 'Corp', 'Group', 'Partners', 'Logistics',
  'Dynamics', 'Technologies', 'Consulting', 'Associates', 'Holdings',
  'Ventures', 'Systems', 'Capital', 'Global', 'Labs', 'Services',
  'Analytics', 'Digital', 'Networks',
];

const LEISURE_PREFIXES = [
  'The Golden', 'Blue', 'Silver', 'Green', 'Sunset', 'Moonlit',
  'Crystal', 'Velvet', 'Starlight', 'Coral', 'The Rustic', 'The Cozy',
  'Emerald', 'The Lazy', 'Royal', 'The Twilight', 'Harbour',
  'Lakeside', 'The Grand', 'Wild',
];

const LEISURE_SUFFIXES = [
  'Lounge', 'Park', 'Garden', 'Spa', 'Theater', 'Bowling Alley',
  'Arcade', 'Club', 'Cinema', 'Retreat', 'Pool Hall', 'Gallery',
  'Rec Center', 'Arena', 'Plaza', 'Studio', 'Pavilion', 'Den',
  'Hideaway', 'Gym',
];

const EATERY_PREFIXES = [
  'The Hungry', 'Golden', 'Red', 'Blue', 'Silver', 'Lucky', 'Smoky',
  'Crispy', 'Salty', 'Tasty', 'The Rusty', 'The Jolly', 'Wild',
  'Mama\'s', 'Papa\'s', 'Uncle\'s', 'The Little', 'Big', 'The Old',
  'Sunny',
];

const EATERY_SUFFIXES = [
  'Diner', 'Grill', 'Bistro', 'Café', 'Kitchen', 'Tavern',
  'Eatery', 'Noodle Bar', 'Pizza', 'BBQ', 'Burger Joint',
  'Sushi Bar', 'Taqueria', 'Bakery', 'Deli', 'Creamery',
  'Steakhouse', 'Wok', 'Cantina', 'Chophouse',
];

const STREET_NAMES = [
  'Maple', 'Oak', 'Cedar', 'Elm', 'Pine', 'Birch', 'Willow', 'Spruce',
  'Aspen', 'Hazel', 'Poplar', 'Walnut', 'Cherry', 'Laurel', 'Magnolia',
  'Sycamore', 'Juniper', 'Chestnut', 'Alder', 'Cypress', 'Hemlock',
  'Linden', 'Rowan', 'Thistle', 'Clover', 'Briar', 'Fern', 'Sage',
  'Summit', 'Ridge', 'Valley', 'Creek', 'Meadow', 'Brook', 'Hill',
  'Lake', 'River', 'Stone', 'Iron', 'Amber', 'Coral', 'Frost',
  'Ivory', 'Slate', 'Cobalt', 'Harbor', 'Haven', 'Glen', 'Crest',
];

const _usedAddresses = new Set();

function _pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a unique random address like "742 Maple".
 * @returns {string}
 */
export function generateAddress() {
  let addr;
  let tries = 0;
  do {
    const num = 100 + Math.floor(Math.random() * 900); // 100–999
    const street = _pick(STREET_NAMES);
    addr = `${num} ${street}`;
    tries++;
  } while (_usedAddresses.has(addr) && tries < 200);
  _usedAddresses.add(addr);
  return addr;
}

/** Clear used addresses (call when generating a new city). */
export function resetAddresses() {
  _usedAddresses.clear();
}

/**
 * Generate a random name appropriate for the given building type.
 * @param {'business'|'leisure'|'eatery'} type
 * @returns {string}
 */
export function generateName(type) {
  switch (type) {
    case 'business':
      return `${_pick(BUSINESS_PREFIXES)} ${_pick(BUSINESS_SUFFIXES)}`;
    case 'leisure':
      return `${_pick(LEISURE_PREFIXES)} ${_pick(LEISURE_SUFFIXES)}`;
    case 'eatery':
      return `${_pick(EATERY_PREFIXES)} ${_pick(EATERY_SUFFIXES)}`;
    default:
      return 'Unknown';
  }
}
