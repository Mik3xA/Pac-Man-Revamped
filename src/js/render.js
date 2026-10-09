// render.js
// Dibujo arcade sobre canvas. Usa game.grid (no MAZE) para reflejar dots comidos.

const TILE = 20;
const WALL_COLOR = '#2121ff';
const DOOR_COLOR = '#ffb8ff';
const DOT_COLOR = '#ffb897';
const POWER_PELLET_COLOR = '#ffb897';

function cellCenter( x, y ) {
  return { cx: x * TILE + TILE / 2, cy: y * TILE + TILE / 2 };
}

// Paredes estilo arcade: lineas finas redondeadas que conectan los centros
// de celdas-pared adyacentes. Produce el trazado continuo del original.
function drawWalls( ctx, grid ) {
  const H = grid.length;
  const W = grid[ 0 ].length;
  ctx.strokeStyle = WALL_COLOR;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for ( let y = 0; y < H; y++ ) {
    for ( let x = 0; x < W; x++ ) {
      if ( grid[ y ][ x ] !== 1 ) continue;
      const { cx, cy } = cellCenter( x, y );
      // Conectar solo hacia derecha y abajo evita trazos duplicados.
      if ( x + 1 < W && grid[ y ][ x + 1 ] === 1 ) {
        ctx.moveTo( cx, cy );
        ctx.lineTo( cx + TILE, cy );
      }
      if ( y + 1 < H && grid[ y + 1 ][ x ] === 1 ) {
        ctx.moveTo( cx, cy );
        ctx.lineTo( cx, cy + TILE );
      }
      // Celda-pared aislada (sin vecino): punto corto para que se vea.
      const lone =
        ( x + 1 >= W || grid[ y ][ x + 1 ] !== 1 ) &&
        ( x - 1 < 0 || grid[ y ][ x - 1 ] !== 1 ) &&
        ( y + 1 >= H || grid[ y + 1 ][ x ] !== 1 ) &&
        ( y - 1 < 0 || grid[ y - 1 ][ x ] !== 1 );
      if ( lone ) {
        ctx.moveTo( cx - 3, cy );
        ctx.lineTo( cx + 3, cy );
      }
    }
  }
  ctx.stroke();
}

function drawDoor( ctx, grid ) {
  const H = grid.length;
  const W = grid[ 0 ].length;
  ctx.strokeStyle = DOOR_COLOR;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for ( let y = 0; y < H; y++ ) {
    for ( let x = 0; x < W; x++ ) {
      if ( grid[ y ][ x ] !== 3 ) continue;
      const px = x * TILE;
      const py = y * TILE + TILE / 2;
      ctx.moveTo( px, py );
      ctx.lineTo( px + TILE, py );
    }
  }
  ctx.stroke();
}

function drawDots( ctx, grid ) {
  ctx.fillStyle = DOT_COLOR;
  for ( let y = 0; y < grid.length; y++ ) {
    for ( let x = 0; x < grid[ 0 ].length; x++ ) {
      if ( grid[ y ][ x ] !== 2 ) continue;
      const { cx, cy } = cellCenter( x, y );
      ctx.beginPath();
      ctx.arc( cx, cy, 2.5, 0, Math.PI * 2 );
      ctx.fill();
    }
  }
}

function drawPowerPellets( ctx, grid, frame ) {
  // Parpadean cada ~15 frames
  const flash = Math.floor( frame / 15 ) % 2 === 0;
  if ( !flash ) return; // invisible mitad del tiempo

  ctx.fillStyle = POWER_PELLET_COLOR;
  for ( let y = 0; y < grid.length; y++ ) {
    for ( let x = 0; x < grid[ 0 ].length; x++ ) {
      if ( grid[ y ][ x ] !== 4 ) continue;
      const { cx, cy } = cellCenter( x, y );
      ctx.beginPath();
      ctx.arc( cx, cy, 6, 0, Math.PI * 2 );
      ctx.fill();
    }
  }
}

function drawPortals( ctx, portalSystem, frame ) {
  if ( !portalSystem || portalSystem.status === 'waiting' ) return;

  let lifecycleScale = 1;
  if ( portalSystem.status === 'active' && portalSystem.openTimer > 0 ) {
    lifecycleScale = 1 - portalSystem.openTimer / portalSystem.config.closeDurationFrames;
  } else if ( portalSystem.status === 'closing' ) {
    lifecycleScale = portalSystem.closeTimer / portalSystem.config.closeDurationFrames;
  }
  lifecycleScale = Math.max( 0, Math.min( 1, lifecycleScale ) );

  for ( const pair of portalSystem.pairs ) {
    for ( const portal of [ pair.entry, pair.exit ] ) {
      const { cx, cy } = cellCenter( portal.x, portal.y );
      const pulse = 1 + Math.sin( ( frame + portal.x * 7 + portal.y * 11 ) * 0.16 ) * 0.1;
      const radius = ( TILE * 0.36 ) * pulse * lifecycleScale;
      if ( radius <= 0 ) continue;

      ctx.save();
      ctx.globalAlpha = lifecycleScale;
      ctx.shadowColor = portal.color;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = portal.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc( cx, cy, radius, 0, Math.PI * 2 );
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.35 * lifecycleScale;
      ctx.fillStyle = portal.color;
      ctx.beginPath();
      ctx.arc( cx, cy, radius * 0.62, 0, Math.PI * 2 );
      ctx.fill();

      ctx.globalAlpha = lifecycleScale;
      ctx.fillStyle = '#fff';
      ctx.font = '8px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText( portal.label, cx, cy );
      ctx.restore();
    }
  }
}

function drawPacman( ctx, p, frame ) {
  const { cx, cy } = cellCenter( p.x, p.y );
  let rot = 0;
  if ( p.dir === 'right' ) rot = 0;
  else if ( p.dir === 'down' ) rot = Math.PI / 2;
  else if ( p.dir === 'left' ) rot = Math.PI;
  else if ( p.dir === 'up' ) rot = -Math.PI / 2;

  // Boca animada: abre/cierra con el frame.
  const open = ( Math.sin( frame * 0.3 ) * 0.5 + 0.5 ) * 0.28 + 0.02;

  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.moveTo( cx, cy );
  ctx.arc( cx, cy, TILE / 2 - 1, rot + open * Math.PI, rot - open * Math.PI );
  ctx.closePath();
  ctx.fill();
}

// Dibuja frutas/bonus
function drawFruit( ctx, fruit, frame ) {
  if ( !fruit ) return;
  const { cx, cy } = cellCenter( fruit.data.x, fruit.data.y );
  const name = fruit.data.name;
  ctx.font = '16px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Colores y simbolos simples para cada fruta
  const fruitStyles = {
    cherry: { color: '#ff0000', char: '🍒' },
    strawberry: { color: '#ff4444', char: '🍓' },
    orange: { color: '#ff8800', char: '🍊' },
    apple: { color: '#00cc00', char: '🍎' },
    melon: { color: '#00aa00', char: '🍈' },
    galaxian: { color: '#ffff00', char: '✦' },
    bell: { color: '#ffff88', char: '🔔' },
    key: { color: '#ffdd00', char: '🔑' },
  };
  const style = fruitStyles[ name ] || { color: '#fff', char: '?' };
  ctx.fillStyle = style.color;
  ctx.fillText( style.char, cx, cy );
}

function drawGhost( ctx, g, color, frame, frightMode, frightTimer ) {
  const { cx, cy } = cellCenter( g.x, g.y );
  const r = TILE / 2 - 1;
  const top = cy - r;
  const bottom = cy + r;
  const left = cx - r;
  const right = cx + r;

  // Modo frightened: cuerpo azul, parpadea blanco/azul al final
  let bodyColor = color;
  let drawEyes = true;
  if ( frightMode && g.frightened ) {
    const flashRate = frightTimer > FRIGHT_FLASH_TIME - 3 * 60 ? 5 : 15; // parpadeo rapido al final
    const flash = Math.floor( frame / flashRate ) % 2 === 0;
    bodyColor = flash ? '#ffffff' : '#0000ff';
    drawEyes = false; // ojos no se ven en modo fright
  }
  // Fantasma comido (ojos volviendo a la pen)
  if ( g.eaten ) {
    bodyColor = 'transparent';
    drawEyes = true;
  }

  // Cuerpo
  if ( bodyColor !== 'transparent' ) {
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc( cx, cy - 1, r, Math.PI, 0, false ); // cabeza
    ctx.lineTo( right, bottom );
    // falda ondulada (3 picos)
    ctx.lineTo( right - r * 0.66, bottom - 4 );
    ctx.lineTo( cx, bottom );
    ctx.lineTo( left + r * 0.66, bottom - 4 );
    ctx.lineTo( left, bottom );
    ctx.closePath();
    ctx.fill();
  }

  // Ojos
  if ( drawEyes ) {
    const dir = DIRS[ g.dir ] || { x: 0, y: 0 };
    const ex = dir.x * 1.6;
    const ey = dir.y * 1.6;
    for ( const off of [ -3.5, 3.5 ] ) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc( cx + off, cy - 1, 3, 0, Math.PI * 2 );
      ctx.fill();
      if ( !g.frightened ) { // ojos normales
        ctx.fillStyle = '#0000bb';
        ctx.beginPath();
        ctx.arc( cx + off + ex, cy - 1 + ey, 1.5, 0, Math.PI * 2 );
        ctx.fill();
      } else { // ojos asustados (mirando arriba)
        ctx.fillStyle = '#0000bb';
        ctx.beginPath();
        ctx.arc( cx + off, cy - 1 - 1.5, 1.5, 0, Math.PI * 2 );
        ctx.fill();
      }
    }
  }
}

function drawHUD( ctx, game, W ) {
  ctx.fillStyle = '#fff';
  ctx.font = '14px "Courier New", monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText( 'SCORE ' + game.score, 8, 4 );
  ctx.textAlign = 'right';
  ctx.fillText( 'VIDAS ' + game.lives, W * TILE - 8, 4 );
}

const GHOST_COLOR_MAP = {
  blinky: '#ff0000',   // rojo - perseguidor
  pinky: '#ffb8ff',    // rosa - emboscada
  inky: '#00ffff',     // cyan - impredecible
  clyde: '#ffb852',    // naranja - timido
};

const FRIGHT_FLASH_TIME = 10 * 60; // debe coincidir con game.js

function draw( ctx, game, frame ) {
  const grid = game.grid;
  const W = grid[ 0 ].length;
  const H = grid.length;

  ctx.fillStyle = '#000';
  ctx.fillRect( 0, 0, W * TILE, H * TILE );

  drawWalls( ctx, grid );
  drawDoor( ctx, grid );
  drawDots( ctx, grid );
  drawPowerPellets( ctx, grid, frame );
  drawPortals( ctx, game.portals, frame );
  drawPacman( ctx, game.pacman, frame );
  game.ghosts.forEach( ( g ) =>
    drawGhost( ctx, g, GHOST_COLOR_MAP[ g.kind ] || '#ff0000', frame, game.mode === 'fright', game.modeTimer )
  );
  if ( game.fruit ) drawFruit( ctx, game.fruit, frame );
  drawHUD( ctx, game, W );
}

window.draw = draw;
