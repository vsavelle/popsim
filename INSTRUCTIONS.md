# PopSim — Population Simulation Visualizer

## Overview

PopSim is a browser-based simulation of daily life in a procedurally generated city. Agents (represented as colored dots) go about their daily routines — commuting to work, visiting leisure spots, and returning home — all visualized on a canvas grid.

## How It Works

### City Grid

The city is rendered on an HTML5 Canvas as a 60×40 tile grid (14 px per tile). Four tile types exist:

| Tile       | Color       | Description                                  |
|------------|-------------|----------------------------------------------|
| **Road**   | Gray        | Pathways agents use to travel                |
| **House**  | Dark green  | Residential buildings; agents spawn here     |
| **Business** | Steel blue | Workplaces where agents spend working hours |
| **Leisure**  | Purple     | Relaxation spots visited after work          |

Roads are generated as a connected grid of full-width rows and full-height columns with randomized spacing. Buildings are placed on empty tiles adjacent to roads at random.

### Agents

Each house spawns one agent (capped at 150 agents). Every agent has a unique ID starting at **#000**. Agents are drawn as small colored dots whose color reflects their current activity:

| Color          | State        |
|----------------|--------------|
| Black          | Sleeping     |
| Bright green   | At home      |
| White          | Traveling    |
| Red            | At work      |
| Magenta/pink   | At leisure   |

### Selecting Agents

Click any agent dot on the canvas to select it. A selected agent gets a white highlight circle and its ID (e.g. `#042`) displayed above the dot. Click the same dot again (or empty space) to deselect.

### Daily Schedule

Each simulation cycle lasts **2 real-time minutes**, representing **24 in-world hours**.

- **Sleep:** Agents start the day asleep. They go to bed between **8:00 PM – midnight** (randomized).
- **Wake up:** Each agent wakes **30 minutes – 2 hours** before their work start time.
- **Morning commute:** Agents leave home between **6:00 AM – 9:00 AM** (randomized per agent).
- **Work:** Each agent works **7 – 10 hours** (randomized).
- **Leisure (optional):** ~40 % of agents visit a leisure spot for **1 – 3 hours** after work.
- **Evening commute:** All agents return home after their last activity.
- **Bedtime:** Agents go back to sleep at their individual bedtime.

Randomization ensures agents don't all move in lockstep — start times, durations, speeds, and leisure participation all vary.

### Activity Log

After the simulation completes, a **collapsible table** appears below the canvas listing every agent's daily timeline:

- Wake-up time
- Time left home
- Arrived at work / left work
- Arrived at leisure / left leisure (if applicable)
- Arrived home
- Went to sleep

All times are shown in in-world HH:MM format. Expand the "Agent Activity Log" section to view.

### Pathfinding

Agents navigate using **BFS (Breadth-First Search)** on road tiles. Buildings are directly adjacent to roads, so the path goes: building → adjacent road → road network → adjacent road → destination building.

## Controls

| Button               | Action                                                       |
|----------------------|--------------------------------------------------------------|
| **Start Simulation** | Begins the 2-minute simulation cycle                         |
| **Generate New City**| Creates a new random city layout (stops any running sim)     |

## Time Display

Both real elapsed time and the corresponding in-world clock are shown:

```
Real: 0:45 / 2:00  |  In-World: 09:15
```

## Technical Details

- **Zero dependencies** — pure HTML5, CSS3, and vanilla JavaScript (ES modules).
- Canvas-based rendering with `requestAnimationFrame` for 60 fps animation.
- BFS pathfinding per agent trip (efficient array-queue implementation).
- Procedural city generation guaranteeing a fully connected road network.

## Project Structure

```
popsim/
├── index.html          # Main page with canvas and controls
├── style.css           # Dark-theme styling
├── INSTRUCTIONS.md     # This file
└── js/
    ├── main.js         # Entry point, event handlers
    ├── city.js         # City grid generation, tile type constants
    ├── pathfinding.js  # BFS pathfinding on the road network
    ├── agent.js        # Agent class (schedule, movement, state machine)
    └── simulation.js   # Game loop, timing, rendering, agent management
```

## Running

Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari). No build step, bundler, or server is required.

Alternatively, serve locally:

```bash
# Python 3
python3 -m http.server 8000

# Node (npx)
npx serve .
```

Then visit `http://localhost:8000`.
