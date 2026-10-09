// portal.js
// Generacion, ciclo de vida y utilidades de los portales.

const PORTAL_DIRECTIONS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const PORTAL_DEFAULT_CONFIG = {
  enabled: true,
  initiallyActive: true,
  pairCount: 1,
  spawnInterval: 8,
  portalDuration: 10,
  closeDuration: 0.35,
  teleportCooldown: 0.3,
  minDistance: 14,
  ghostsCanUsePortals: false,
  colors: [ '#00d9ff', '#ff8c00', '#c86bff', '#63ff7b' ],
  hooks: {
    onPortalSpawn: null,
    onTeleport: null,
    onPortalDespawn: null,
  },
};

// Configuracion publica para ajustar el comportamiento sin tocar la logica.
window.PORTAL_CONFIG = PORTAL_DEFAULT_CONFIG;

function secondsToFrames(seconds) {
  if (!Number.isFinite(seconds)) return Infinity;
  return Math.max(1, Math.round(seconds * 60));
}

function normalizePortalConfig(overrides) {
  const source = overrides || {};
  const colors = Array.isArray(source.colors) && source.colors.length
    ? source.colors
    : PORTAL_DEFAULT_CONFIG.colors;
  return {
    ...PORTAL_DEFAULT_CONFIG,
    ...source,
    colors,
    hooks: {
      ...PORTAL_DEFAULT_CONFIG.hooks,
      ...(source.hooks || {}),
    },
    spawnIntervalFrames: secondsToFrames(source.spawnInterval ?? PORTAL_DEFAULT_CONFIG.spawnInterval),
    portalDurationFrames: secondsToFrames(source.portalDuration ?? PORTAL_DEFAULT_CONFIG.portalDuration),
    closeDurationFrames: secondsToFrames(source.closeDuration ?? PORTAL_DEFAULT_CONFIG.closeDuration),
    teleportCooldownFrames: secondsToFrames(source.teleportCooldown ?? PORTAL_DEFAULT_CONFIG.teleportCooldown),
  };
}

function cellKey(x, y) {
  return x + ':' + y;
}

function isPortalCell(grid, x, y) {
  if (y < 1 || y >= grid.length - 1) return false;
  if (x < 1 || x >= grid[0].length - 1) return false;
  return grid[y][x] !== 1 && grid[y][x] !== 3;
}

function isReserved(reservedCells, x, y) {
  return reservedCells.has(cellKey(x, y));
}

function getExitDirections(grid, x, y) {
  return Object.keys(PORTAL_DIRECTIONS).filter((direction) => {
    const offset = PORTAL_DIRECTIONS[direction];
    return isPortalCell(grid, x + offset.x, y + offset.y);
  });
}

function getReachableCells(grid) {
  const start = window.PACMAN_START;
  const visited = new Set();
  const queue = [ { x: start.x, y: start.y } ];

  while (queue.length) {
    const current = queue.shift();
    const key = cellKey(current.x, current.y);
    if (visited.has(key) || !isPortalCell(grid, current.x, current.y)) continue;
    visited.add(key);

    for (const direction of Object.values(PORTAL_DIRECTIONS)) {
      let x = current.x + direction.x;
      const y = current.y + direction.y;
      if (y === window.TUNNEL_ROW && (x < 0 || x >= grid[0].length)) {
        x = x < 0 ? grid[0].length - 1 : 0;
      }
      const nextKey = cellKey(x, y);
      if (!visited.has(nextKey) && isPortalCell(grid, x, y)) {
        queue.push({ x, y });
      }
    }
  }

  return visited;
}

function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getCandidates(grid, reservedCells) {
  const width = grid[0].length;
  const center = width / 2;
  const reachableCells = getReachableCells(grid);
  const candidates = [];

  for (let y = 1; y < grid.length - 1; y++) {
    if (y === window.TUNNEL_ROW) continue;

    for (let x = 1; x < width - 1; x++) {
      if (!reachableCells.has(cellKey(x, y)) || isReserved(reservedCells, x, y)) continue;

      const exitDirections = getExitDirections(grid, x, y);
      if (!exitDirections.length) continue;

      candidates.push({
        x,
        y,
        side: x < center ? 'left' : 'right',
        exitDirections,
      });
    }
  }

  return candidates;
}

function distanceBetween(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function chooseExitDirection(candidate, reservedCells) {
  const options = shuffle(candidate.exitDirections).filter((direction) => {
    const offset = PORTAL_DIRECTIONS[direction];
    return !isReserved(reservedCells, candidate.x + offset.x, candidate.y + offset.y);
  });
  return options[0] || candidate.exitDirections[0];
}

function choosePair(candidates, usedCells, minDistance) {
  const left = shuffle(candidates.filter((candidate) => candidate.side === 'left'));
  const right = shuffle(candidates.filter((candidate) => candidate.side === 'right'));

  for (const entry of left) {
    if (usedCells.has(cellKey(entry.x, entry.y))) continue;

    for (const exit of right) {
      if (usedCells.has(cellKey(exit.x, exit.y))) continue;
      if (distanceBetween(entry, exit) < minDistance) continue;
      return { entry, exit };
    }
  }

  return null;
}

function emitPortalHook(system, hookName, ...args) {
  const hook = system.config.hooks[hookName];
  if (typeof hook === 'function') hook(...args);
}

function createPortalEndpoint(pairId, label, candidate, color, reservedCells) {
  return {
    id: pairId + '-' + label.toLowerCase(),
    pairId,
    label,
    x: candidate.x,
    y: candidate.y,
    exitDir: chooseExitDirection(candidate, reservedCells),
    color,
  };
}

function spawnPortalPairs(system, grid, reservedCells) {
  const reserved = new Set(reservedCells || []);
  const candidates = getCandidates(grid, reserved);
  const usedCells = new Set(reserved);
  const pairs = [];

  for (let index = 0; index < system.config.pairCount; index++) {
    const selected = choosePair(candidates, usedCells, system.config.minDistance);
    if (!selected) break;

    const pairId = 'portal-pair-' + system.nextPairId++;
    const color = system.config.colors[index % system.config.colors.length];
    const entry = createPortalEndpoint(pairId, 'A', selected.entry, color, usedCells);
    const exit = createPortalEndpoint(pairId, 'B', selected.exit, color, usedCells);

    pairs.push({ id: pairId, color, entry, exit });
    usedCells.add(cellKey(entry.x, entry.y));
    usedCells.add(cellKey(exit.x, exit.y));

    emitPortalHook(system, 'onPortalSpawn', { x: entry.x, y: entry.y }, color, entry);
    emitPortalHook(system, 'onPortalSpawn', { x: exit.x, y: exit.y }, color, exit);
  }

  system.pairs = pairs;
  system.status = pairs.length ? 'active' : 'waiting';
  system.portalTimer = system.config.portalDurationFrames;
  system.openTimer = system.config.closeDurationFrames;
  system.spawnTimer = system.config.spawnIntervalFrames;
}

function createPortalSystem(grid, config, reservedCells) {
  const system = {
    config: normalizePortalConfig(config),
    pairs: [],
    status: 'waiting',
    portalTimer: 0,
    spawnTimer: 0,
    closeTimer: 0,
    openTimer: 0,
    animationFrame: 0,
    nextPairId: 1,
  };

  if (system.config.enabled && system.config.initiallyActive) {
    spawnPortalPairs(system, grid, reservedCells);
  } else if (system.config.enabled) {
    system.spawnTimer = system.config.spawnIntervalFrames;
  }

  return system;
}

function getPortalAt(system, x, y) {
  if (!system || system.status === 'waiting') return null;

  for (const pair of system.pairs) {
    if (pair.entry.x === x && pair.entry.y === y) return pair.entry;
    if (pair.exit.x === x && pair.exit.y === y) return pair.exit;
  }
  return null;
}

function getLinkedPortal(system, sourcePortal) {
  const pair = system.pairs.find((candidate) => candidate.id === sourcePortal.pairId);
  if (!pair) return null;
  return pair.entry.id === sourcePortal.id ? pair.exit : pair.entry;
}

function updatePortalSystem(system, grid, reservedCells) {
  if (!system || !system.config.enabled) return;
  system.animationFrame++;

  if (system.status === 'active') {
    if (system.openTimer > 0) system.openTimer--;

    if (system.portalTimer !== Infinity) {
      system.portalTimer--;
      if (system.portalTimer <= 0) {
        system.status = 'closing';
        system.closeTimer = system.config.closeDurationFrames;
        emitPortalHook(system, 'onPortalDespawn');
      }
    }
    return;
  }

  if (system.status === 'closing') {
    system.closeTimer--;
    if (system.closeTimer <= 0) {
      system.pairs = [];
      system.status = 'waiting';
      system.spawnTimer = system.config.spawnIntervalFrames;
    }
    return;
  }

  system.spawnTimer--;
  if (system.spawnTimer <= 0) spawnPortalPairs(system, grid, reservedCells);
}

function emitPortalTeleport(system, entity, sourcePortal, targetPortal) {
  emitPortalHook(system, 'onTeleport', entity, sourcePortal, targetPortal);
}

window.createPortalSystem = createPortalSystem;
window.getPortalAt = getPortalAt;
window.getLinkedPortal = getLinkedPortal;
window.updatePortalSystem = updatePortalSystem;
window.emitPortalTeleport = emitPortalTeleport;
