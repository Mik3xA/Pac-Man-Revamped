// main.js
// Bucle, teclado y pantallas. Usa createGame/update/draw (globals).

const canvas = document.getElementById( 'game' );
const ctx = canvas.getContext( '2d' );
const overlay = document.getElementById( 'overlay' );

const gameFactory = window.createGame;
const gameUpdater = window.update;
const gameRenderer = window.draw;

let game = null;
let frame = 0;

const KEY_DIR = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
  s: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
};

document.addEventListener( 'keydown', ( e ) => {
  const dir = KEY_DIR[ e.key ] || KEY_DIR[ e.code ];
  if ( !dir ) return;
  e.preventDefault();
  if ( game && game.state === 'playing' ) game.pacman.nextDir = dir;
} );

function showOverlay( title, cls, btnLabel ) {
  overlay.innerHTML =
    '<h1' + ( cls ? ' class="' + cls + '"' : '' ) + '>' + title + '</h1>' +
    '<button id="action-btn">' + btnLabel + '</button>';
  overlay.classList.add( 'show' );
}

function startGame() {
  if ( !gameFactory ) return;
  game = gameFactory();
  game.state = 'playing';
  overlay.classList.remove( 'show' );
}

function showLoadError() {
  overlay.innerHTML =
    '<h1 class="lose">ERROR</h1>' +
    '<p>No se cargaron los archivos del juego.</p>' +
    '<p>Inicia el servidor y recarga la página.</p>' +
    '<button id="action-btn">Reintentar</button>';
  overlay.classList.add( 'show' );
}

// El listener delegado sigue funcionando cuando el overlay reemplaza su botón.
overlay.addEventListener( 'click', ( event ) => {
  if ( event.target.closest( '#action-btn' ) ) {
    if ( gameFactory && gameUpdater && gameRenderer ) {
      startGame();
    } else {
      window.location.reload();
    }
  }
} );

function loop() {
  frame++;
  if ( game.state === 'playing' ) {
    gameUpdater( game );
    if ( game.state === 'won' ) showOverlay( 'GANASTE', 'win', 'Reiniciar' );
    else if ( game.state === 'lost' ) showOverlay( 'PERDISTE', 'lose', 'Reiniciar' );
  }
  gameRenderer( ctx, game, frame );
  requestAnimationFrame( loop );
}

if ( !gameFactory || !gameUpdater || !gameRenderer ) {
  showLoadError();
} else {
  game = gameFactory();
  loop();
}
