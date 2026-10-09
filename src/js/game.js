// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 1 / 8;
const GHOST_SPEED = 1 / 10;
const GHOST_SPEED_SCATTER = 3 / 32;
const GHOST_SPEED_FRIGHT = 1 / 16;
const GHOST_SPEED_TUNNEL = 1 / 20;
const GHOST_SPEED_EATEN = 1 / 4;

// Authentic scatter/chase timing sequence (level 1) in frames at 60fps
// Sequence: scatter->chase->scatter->chase->scatter->chase->scatter->chase(infinite)
const SCATTER_TIMES = [7, 20, 7, 20, 5, 20, 5, Infinity].map(t => t * 60);
const FRIGHT_TIME = 10 * 60;   // 10 segundos power pellet

// Esquinas de scatter para cada fantasma
const SCATTER_TARGETS = {
  blinky: { x: 25, y: 0 },    // arriba-derecha
  pinky: { x: 2, y: 0 },      // arriba-izquierda
  inky: { x: 27, y: 31 },     // abajo-derecha
  clyde: { x: 0, y: 31 },     // abajo-izquierda
};

// Punto de salida de la pen (puerta)
const PEN_EXIT = { x: 13, y: 11 };

// Frutas/bonus: aparecen en ciertos umbrales de dots restantes
const FRUIT_DATA = [
  { name: 'cherry', points: 100, dotsThreshold: 240, x: 13, y: 17 },
  { name: 'strawberry', points: 300, dotsThreshold: 170, x: 13, y: 17 },
  { name: 'orange', points: 500, dotsThreshold: 100, x: 13, y: 17 },
  { name: 'apple', points: 700, dotsThreshold: 70, x: 13, y: 17 },
  { name: 'melon', points: 1000, dotsThreshold: 40, x: 13, y: 17 },
  { name: 'galaxian', points: 2000, dotsThreshold: 20, x: 13, y: 17 },
  { name: 'bell', points: 3000, dotsThreshold: 10, x: 13, y: 17 },
  { name: 'key', points: 5000, dotsThreshold: 0, x: 13, y: 17 },
];

const FRUIT_DISPLAY_TIME = 10 * 60; // 10 segundos

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map((row) => row.slice());
  // La celda de inicio de Pacman arranca sin dot.
  grid[PACMAN_START.y][PACMAN_START.x] = 0;

  let dots = 0;
  let powerPellets = 0;
  for (const row of grid) {
    for (const v of row) {
      if (v === 2) dots++;
      if (v === 4) powerPellets++;
    }
  }

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    powerPelletsRemaining: powerPellets,
    grid,
    portals: window.createPortalSystem(
      grid,
      window.PORTAL_CONFIG,
      [ PACMAN_START, ...GHOST_STARTS ].map((actor) => actor.x + ':' + actor.y)
    ),
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
      portalCooldown: 0,
    },
    ghosts: GHOST_STARTS.map((g, i) => ({
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      released: false, // todos empiezan en la pen
      releaseDelay: [0, 240, 840, 1260][i], // Blinky, Pinky, Inky, Clyde
      frightened: false,
      eaten: false,
      portalCooldown: 0,
    })),
    mode: 'scatter',
    modeTimer: 0,
    modeIndex: 0,        // index into SCATTER_TIMES (0-7)
    frightTimer: 0,
    ghostsEatenThisFright: 0,
    fruit: null,
    fruitIndex: 0,
    extraLifeGiven: false,
  };
}

function aligned(v) {
  return Math.abs(v - Math.round(v)) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall(grid, x, y, actor) {
  if (y < 0 || y >= grid.length) return true;
  if (x < 0 || x >= grid[0].length) return true;
  const v = grid[y][x];
  if (v === 1) return true;
  if (v === 3 && actor === 'pacman') return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove(grid, x, y, dir, actor) {
  const d = DIRS[dir];
  if (!d) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if (ty === TUNNEL_ROW && (tx < 0 || tx >= grid[0].length)) return true;
  return !isWall(grid, tx, ty, actor);
}

function wrapTunnel(a, width) {
  if (Math.round(a.y) === TUNNEL_ROW) {
    if (a.x < 0) a.x = width - 1;
    else if (a.x > width - 1) a.x = 0;
  }
}

function moveActor(game, actor, speed, actorType, onCell) {
  const grid = game.grid;
  const width = grid[0].length;
  const atCell = aligned(actor.x) && aligned(actor.y);

  if (atCell) {
    actor.x = Math.round(actor.x);
    actor.y = Math.round(actor.y);
    onCell();
  }

  const direction = DIRS[actor.dir];
  if (!direction) {
    return;
  }
  if (atCell && !canMove(grid, actor.x, actor.y, actor.dir, actorType)) {
    return;
  }

  const nextX = actor.x + direction.x * speed;
  const nextY = actor.y + direction.y * speed;
  const movingHorizontally = direction.x !== 0;
  const position = movingHorizontally ? actor.x : actor.y;
  const nextPosition = movingHorizontally ? nextX : nextY;
  const source = direction.x > 0 || direction.y > 0
    ? Math.floor(position)
    : Math.ceil(position);
  const target = source + (movingHorizontally ? direction.x : direction.y);
  const crossesCell = !atCell && (direction.x > 0 || direction.y > 0
    ? nextPosition >= target
    : nextPosition <= target);

  if (crossesCell) {
    const sourceX = movingHorizontally ? source : Math.round(actor.x);
    const sourceY = movingHorizontally ? Math.round(actor.y) : source;

    if (!canMove(grid, sourceX, sourceY, actor.dir, actorType)) {
      actor.x = sourceX;
      actor.y = sourceY;
      return;
    }

    actor.x = movingHorizontally ? target : sourceX;
    actor.y = movingHorizontally ? sourceY : target;
  } else {
    actor.x = nextX;
    actor.y = nextY;
  }

  wrapTunnel(actor, width);
}

function getPortalReservedCells(game) {
  const actors = [ game.pacman, ...game.ghosts ];
  return actors.map((actor) => Math.round(actor.x) + ':' + Math.round(actor.y));
}

function updatePortalCooldown(actor) {
  if (actor.portalCooldown > 0) actor.portalCooldown--;
}

function tryTeleport(game, actor, actorType) {
  const portalSystem = game.portals;
  if (!portalSystem || portalSystem.status === 'waiting') return;
  if (actor.portalCooldown > 0) return;
  if (actorType === 'ghost' && !portalSystem.config.ghostsCanUsePortals) return;

  const sourcePortal = window.getPortalAt(
    portalSystem,
    Math.round(actor.x),
    Math.round(actor.y)
  );
  if (!sourcePortal) return;

  const targetPortal = window.getLinkedPortal(portalSystem, sourcePortal);
  if (!targetPortal) return;

  const preservedDirection = actor.dir;
  let exitDirection = preservedDirection;
  if (!canMove(game.grid, targetPortal.x, targetPortal.y, exitDirection, actorType)) {
    exitDirection = targetPortal.exitDir;
  }

  const offset = DIRS[exitDirection];
  if (offset && canMove(game.grid, targetPortal.x, targetPortal.y, exitDirection, actorType)) {
    actor.x = targetPortal.x + offset.x;
    actor.y = targetPortal.y + offset.y;
    actor.dir = exitDirection;
  } else {
    actor.x = targetPortal.x;
    actor.y = targetPortal.y;
  }

  actor.portalCooldown = portalSystem.config.teleportCooldownFrames;
  window.emitPortalTeleport(portalSystem, actor, sourcePortal, targetPortal);
}

function movePacman(game) {
  const p = game.pacman;
  const grid = game.grid;

  moveActor(game, p, p.speed, 'pacman', () => {
    // Aplicar giro pendiente si es posible.
    if (p.nextDir && canMove(grid, p.x, p.y, p.nextDir, 'pacman')) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }

    if (grid[p.y][p.x] === 2) {
      grid[p.y][p.x] = 0;
      game.score += 10;
      game.dotsRemaining--;
      checkFruitSpawn(game);
    }

    if (grid[p.y][p.x] === 4) {
      grid[p.y][p.x] = 0;
      game.score += 50;
      game.powerPelletsRemaining--;
      activateFrightMode(game);
    }

    if (game.fruit && p.x === game.fruit.data.x && p.y === game.fruit.data.y) {
      game.score += game.fruit.data.points;
      game.fruit = null;
    }

    tryTeleport(game, p, 'pacman');
  });
}

// Activa modo frightened cuando Pac-Man come power pellet
function activateFrightMode(game) {
  game.mode = 'fright';
  game.modeTimer = 0;
  game.ghostsEatenThisFright = 0;
  game.ghosts.forEach(g => {
    if (!g.eaten) {
      g.frightened = true;
      g.speed = GHOST_SPEED_FRIGHT;
      // Invertir direccion al entrar en fright
      g.dir = OPPOSITE[g.dir];
    }
  });
}

// Desactiva modo frightened
function deactivateFrightMode(game) {
  game.mode = game.modeIndex >= 7 ? 'chase' : (game.modeIndex % 2 === 0 ? 'scatter' : 'chase');
  game.modeTimer = 0;
  game.ghosts.forEach(g => {
    if (g.eaten) return;
    g.frightened = false;
    g.speed = GHOST_SPEED;
  });
}

// Verifica si debe aparecer una fruta
function checkFruitSpawn(game) {
  if (game.fruit) return; // ya hay fruta activa
  if (game.fruitIndex >= FRUIT_DATA.length) return; // no mas frutas

  const nextFruit = FRUIT_DATA[game.fruitIndex];
  if (game.dotsRemaining <= nextFruit.dotsThreshold) {
    game.fruit = { data: nextFruit, timer: FRUIT_DISPLAY_TIME };
    game.fruitIndex++;
  }
}

// Calcula el objetivo (target tile) para un fantasma segun su tipo y modo
function getGhostTarget(game, ghost) {
  const p = game.pacman;
  const px = Math.round(p.x);
  const py = Math.round(p.y);

  // Los ojos vuelven directamente a la puerta de la pen.
  if (ghost.eaten) {
    return PEN_EXIT;
  }

  // Modo scatter: ir a esquina asignada
  if (game.mode === 'scatter') {
    return SCATTER_TARGETS[ghost.kind];
  }

  // Modo fright: movimiento aleatorio puro (sin huir de Pac-Man)
  if (game.mode === 'fright') {
    return { x: Math.random() * 28, y: Math.random() * 31 };
  }

  // Modo chase: comportamiento especifico por tipo
  switch (ghost.kind) {
    case 'blinky': {
      // Persecucion directa: objetivo = posicion actual de Pac-Man
      return { x: px, y: py };
    }
    case 'pinky': {
      // Emboscada: objetivo = 4 tiles delante de Pac-Man
      const d = DIRS[p.dir];
      return { x: px + d.x * 4, y: py + d.y * 4 };
    }
    case 'inky': {
      // Impredecible: vector desde Blinky a Pac-Man, doblado
      const blinky = game.ghosts.find(g => g.kind === 'blinky');
      if (!blinky) return { x: px, y: py };
      const bx = Math.round(blinky.x);
      const by = Math.round(blinky.y);
      const vx = px - bx;
      const vy = py - by;
      return { x: px + vx, y: py + vy };
    }
    case 'clyde': {
      // Timido: persigue si esta lejos (>8 tiles), huye a esquina si cerca
      const gx = Math.round(ghost.x);
      const gy = Math.round(ghost.y);
      const dist = Math.abs(gx - px) + Math.abs(gy - py);
      if (dist > 8) {
        return { x: px, y: py };
      }
      return SCATTER_TARGETS.clyde;
    }
    default:
      return { x: px, y: py };
  }
}

// Decide la siguiente direccion del fantasma usando BFS/greedy hacia objetivo
function decideGhost(game, ghost) {
  const grid = game.grid;
  const target = getGhostTarget(game, ghost);

  const options = Object.keys(DIRS).filter(
    (dir) => dir !== OPPOSITE[ghost.dir] && canMove(grid, ghost.x, ghost.y, dir, 'ghost')
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : ['' + OPPOSITE[ghost.dir]];

  // Mantener la salida de la pen controlada hasta llegar sobre la puerta.
  const gy = Math.round(ghost.y);
  if (!ghost.eaten && gy <= PEN_EXIT.y) {
    ghost.released = true;
  }
  const inPen = gy > PEN_EXIT.y && (!ghost.released || ghost.eaten);

  if (inPen) {
    // Los fantasmas salen y regresan por la misma puerta.
    if (choices.includes('up')) {
      ghost.dir = 'up';
      return;
    }
  }

  // En modo fright, los fantasmas no revierten direccion (ya se invirtio al entrar)
  // Greedy: elegir la direccion que minimice distancia Manhattan al objetivo
  let best = choices[0];
  let bestDist = Infinity;
  for (const dir of choices) {
    const d = DIRS[dir];
    const nx = Math.round(ghost.x) + d.x;
    const ny = Math.round(ghost.y) + d.y;
    const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }
  ghost.dir = best;
}

function moveGhost(game, ghost) {
  // Timer de liberacion escalonado
  if (!ghost.released && ghost.releaseDelay > 0) {
    ghost.releaseDelay--;
    return; // no se mueve hasta que llega su turno
  }

  // Actualizar velocidad segun modo y posicion
  if (ghost.eaten) {
    ghost.speed = GHOST_SPEED_EATEN;
  } else if (game.mode === 'fright' && ghost.frightened) {
    ghost.speed = GHOST_SPEED_FRIGHT;
  } else if (Math.round(ghost.y) === TUNNEL_ROW) {
    // En tunel (fila 14): velocidad reducida para fantasmas
    ghost.speed = GHOST_SPEED_TUNNEL;
  } else if (game.mode === 'scatter') {
    ghost.speed = GHOST_SPEED_SCATTER;
  } else {
    ghost.speed = GHOST_SPEED; // chase mode base speed
  }

  moveActor(game, ghost, ghost.speed, 'ghost', () => {
    decideGhost(game, ghost);
    tryTeleport(game, ghost, 'ghost');
  });
}

function resetPositions(game) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  p.portalCooldown = 0;
  game.ghosts.forEach((g, i) => {
    g.x = GHOST_STARTS[i].x;
    g.y = GHOST_STARTS[i].y;
    g.dir = 'up';
    g.released = false; // todos empiezan en la pen
    g.releaseDelay = [0, 240, 840, 1260][i];
    g.frightened = false;
    g.eaten = false;
    g.speed = GHOST_SPEED;
    g.portalCooldown = 0;
  });
  game.mode = 'scatter';
  game.modeTimer = 0;
  game.modeIndex = 0;
  game.frightTimer = 0;
  game.ghostsEatenThisFright = 0;
  // Fruta se mantiene (no se resetea al perder vida)
}

function collides(a, b) {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

// Actualiza timer de modo scatter/chase/fright
function updateModeTimer(game) {
  game.modeTimer++;

  if (game.mode === 'fright') {
    if (game.modeTimer >= FRIGHT_TIME) {
      game.modeTimer = 0;
      deactivateFrightMode(game);
    }
    return;
  }

  // Scatter/Chase timing using authentic sequence
  const currentTime = SCATTER_TIMES[game.modeIndex] || Infinity;
  if (game.modeTimer >= currentTime) {
    game.modeTimer = 0;
    game.modeIndex = Math.min(game.modeIndex + 1, 7); // cap at 7 (infinite chase)

    if (game.mode === 'scatter') {
      game.mode = 'chase';
    } else if (game.mode === 'chase') {
      game.mode = game.modeIndex >= 7 ? 'chase' : 'scatter';
    }
  }
}

// Actualiza timer de fruta
function updateFruitTimer(game) {
  if (game.fruit) {
    game.fruit.timer--;
    if (game.fruit.timer <= 0) {
      game.fruit = null;
    }
  }
}

function update(game) {
  updatePortalSystem(game.portals, game.grid, getPortalReservedCells(game));
  updatePortalCooldown(game.pacman);
  game.ghosts.forEach(updatePortalCooldown);
  movePacman(game);
  updateModeTimer(game);
  updateFruitTimer(game);

  // Vida extra a 10,000 puntos
  if (!game.extraLifeGiven && game.score >= 10000) {
    game.lives++;
    game.extraLifeGiven = true;
  }

  game.ghosts.forEach((g) => moveGhost(game, g));

  for (const g of game.ghosts) {
    if (collides(game.pacman, g)) {
      if (game.mode === 'fright' && g.frightened && !g.eaten) {
        // Pac-Man come fantasma
        g.eaten = true;
        g.frightened = false;
        g.speed = GHOST_SPEED_EATEN; // volver a pen mas rapido
        game.ghostsEatenThisFright++;
        const points = [200, 400, 800, 1600][game.ghostsEatenThisFright - 1] || 1600;
        game.score += points;
        // El fantasma vuelve a la pen (ojos)
        g.dir = OPPOSITE[g.dir];
      } else if (!g.eaten) {
        // Pac-Man muere
        game.lives--;
        if (game.lives <= 0) {
          game.state = 'lost';
          return;
        }
        resetPositions(game);
        break;
      }
    }
  }

  // Fantasmas comidos vuelven a la pen y "reviven"
  game.ghosts.forEach(g => {
    if (g.eaten && Math.round(g.x) === PEN_EXIT.x && Math.round(g.y) === PEN_EXIT.y) {
      const start = GHOST_STARTS.find(startPosition => startPosition.kind === g.kind);
      g.eaten = false;
      g.frightened = false;
      g.x = start.x;
      g.y = start.y;
      g.dir = 'up';
      g.released = false;
      g.releaseDelay = 60; // espera antes de salir otra vez
      g.speed = GHOST_SPEED;
    }
  });

  if (game.dotsRemaining <= 0 && game.powerPelletsRemaining <= 0) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
