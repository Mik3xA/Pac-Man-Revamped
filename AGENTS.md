# AGENTS.md - open-pacman

## Project Overview
Vanilla JS Pac-Man clone. No build tools, no dependencies. Static HTML/CSS/JS only.

## Running the Game
```bash
# Option 1: Open directly in browser
open src/index.html

# Option 2: Local server (recommended)
python3 -m http.server -d src 8000
# then open http://localhost:8000
```

## Project Structure
```
src/
├── index.html      # Entry point
├── css/style.css   # Styles
└── js/
    ├── main.js     # App bootstrap
    ├── game.js     # Game logic
    ├── render.js   # Canvas rendering
    └── maze.js     # Maze data/logic
```

## Key Conventions
- Spanish comments in code (per user instructions)
- English variable/function/class names
- No lint/typecheck/test commands exist
- No package.json, no Node.js dependencies