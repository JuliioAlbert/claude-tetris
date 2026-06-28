'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#f06292', // + cruz   - rosa
  '#4db6ac', // U        - teal
  '#aed581', // Y        - lima
  '#fff176', // 1×1 single (recompensa) - amarillo
  '#90a4ae', // 3×3 hueca (reto)        - gris azulado
];

// ---- Skin system ----
const SKINS = {
  retro: {
    colors: COLORS,
  },
  neon: {
    colors: [
      null,
      '#00f0ff', // I - electric cyan
      '#ffe600', // O - electric yellow
      '#cc00ff', // T - electric violet
      '#00ff66', // S - electric green
      '#ff2244', // Z - electric red
      '#4444ff', // J - electric blue
      '#ff8800', // L - electric orange
      '#ff00cc', // + cruz - electric pink
      '#00ffcc', // U - electric teal
      '#aaff00', // Y - electric lime
      '#ffff00', // 1×1 - electric yellow bright
      '#8888ff', // 3×3 - electric periwinkle
    ],
  },
  pastel: {
    colors: [
      null,
      '#a8e6f0', // I - soft cyan
      '#fff3b0', // O - soft yellow
      '#ddb8f0', // T - soft lavender
      '#b8f0c0', // S - soft mint
      '#f0b8b8', // Z - soft rose
      '#b8bcf0', // J - soft periwinkle
      '#f0d0a0', // L - soft peach
      '#f0b8d8', // + cruz - soft pink
      '#a8f0e8', // U - soft aqua
      '#d8f0a8', // Y - soft lime
      '#f8f4a0', // 1×1 - soft lemon
      '#c8d8e8', // 3×3 - soft steel
    ],
  },
  pixel: {
    colors: COLORS,
  },
};

const SKIN_NAMES = ['retro', 'neon', 'pastel', 'pixel'];
const SKIN_LABELS = { retro: 'Retro', neon: 'Neon', pastel: 'Pastel', pixel: 'Pixel' };

let currentSkin = localStorage.getItem('tetris.skin') || 'retro';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  // Piezas especiales
  [[0,8,0],[8,8,8],[0,8,0]],                  // + cruz
  [[9,0,9],[9,9,9]],                           // U
  [[0,10],[10,10],[0,10],[0,10]],              // Y
  [[11]],                                      // 1×1 single (recompensa Tetris)
  [[12,12,12],[12,0,12],[12,12,12]],           // 3×3 hueca (reto)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const SPECIAL_TYPES = [8, 9, 10, 12]; // +, U, Y, 3×3 hueca
const SPECIAL_CHANCE = 0.12;

let gridColor = '#22222e';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let rewardPending = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  if (rewardPending) { rewardPending = false; return makePiece(11); }
  const type = Math.random() < SPECIAL_CHANCE
    ? SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)]
    : Math.floor(Math.random() * 7) + 1;
  return makePiece(type);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    if (cleared === 4) rewardPending = true;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skinColors = SKINS[currentSkin].colors;
  const color = skinColors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const sz = size - 2;

  context.globalAlpha = alpha ?? 1;

  if (currentSkin === 'neon') {
    context.shadowColor = color;
    context.shadowBlur = 10;
    context.fillStyle = color;
    context.fillRect(px, py, sz, sz);
    // inner glow layer
    context.shadowBlur = 4;
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(px + 2, py + 2, sz - 4, sz - 4);
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
  } else if (currentSkin === 'pastel') {
    context.fillStyle = color;
    const r = Math.min(5, sz / 3);
    if (context.roundRect) {
      context.beginPath();
      context.roundRect(px, py, sz, sz, r);
      context.fill();
    } else {
      // Fallback rounded rect via arc path
      context.beginPath();
      context.moveTo(px + r, py);
      context.lineTo(px + sz - r, py);
      context.arcTo(px + sz, py, px + sz, py + r, r);
      context.lineTo(px + sz, py + sz - r);
      context.arcTo(px + sz, py + sz, px + sz - r, py + sz, r);
      context.lineTo(px + r, py + sz);
      context.arcTo(px, py + sz, px, py + sz - r, r);
      context.lineTo(px, py + r);
      context.arcTo(px, py, px + r, py, r);
      context.closePath();
      context.fill();
    }
    // subtle border
    context.strokeStyle = 'rgba(0,0,0,0.10)';
    context.lineWidth = 1;
    context.stroke();
    // soft highlight
    context.fillStyle = 'rgba(255,255,255,0.30)';
    context.fillRect(px + 2, py + 2, sz - 4, 3);
  } else if (currentSkin === 'pixel') {
    context.fillStyle = color;
    context.fillRect(px, py, sz, sz);
    // pixel texture: 3x3 dot grid inside block
    const dotSize = Math.max(1, Math.floor(sz / 8));
    const step = Math.floor(sz / 3);
    context.fillStyle = 'rgba(0,0,0,0.20)';
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        const dotX = px + step * dc + Math.floor(step / 2) - dotSize;
        const dotY = py + step * dr + Math.floor(step / 2) - dotSize;
        context.fillRect(dotX, dotY, dotSize, dotSize);
      }
    }
    // highlight top edge
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(px, py, sz, 3);
  } else {
    // retro (default)
    context.fillStyle = color;
    context.fillRect(px, py, sz, sz);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, sz, 4);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  rewardPending = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Skin selector UI ----
function applySkin(skinName) {
  if (!SKINS[skinName]) return;
  currentSkin = skinName;
  localStorage.setItem('tetris.skin', skinName);
  // Update button active states
  SKIN_NAMES.forEach(name => {
    const btn = document.getElementById('skin-btn-' + name);
    if (btn) btn.classList.toggle('active', name === skinName);
  });
  // Repaint immediately if paused or game over
  if (paused || gameOver) {
    draw();
    drawNext();
  }
}

function buildSkinSelector() {
  const section = document.createElement('div');
  section.className = 'panel-section';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'SKIN';
  section.appendChild(label);

  const btnGroup = document.createElement('div');
  btnGroup.className = 'skin-btn-group';

  SKIN_NAMES.forEach(name => {
    const btn = document.createElement('button');
    btn.id = 'skin-btn-' + name;
    btn.className = 'skin-btn';
    btn.textContent = SKIN_LABELS[name];
    if (name === currentSkin) btn.classList.add('active');
    btn.addEventListener('click', () => applySkin(name));
    btnGroup.appendChild(btn);
  });

  section.appendChild(btnGroup);
  return section;
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle.querySelector('.icon');

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  themeIcon.textContent = isLight ? '☽' : '☀';
  gridColor = isLight ? '#c0c0d8' : '#22222e';
  themeIcon.classList.add('spinning');
  themeIcon.addEventListener('animationend', () => themeIcon.classList.remove('spinning'), { once: true });
});

// Insert skin selector into panel before the controls section
const panel = document.querySelector('.panel');
const controlsSection = panel.querySelector('.controls');
panel.insertBefore(buildSkinSelector(), controlsSection);

init();
