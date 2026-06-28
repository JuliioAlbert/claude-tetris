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

const HS_KEY = 'tetris.highscores';
const HS_MAX = 5;

let gridColor = '#22222e';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const nameInputSection = document.getElementById('name-input-section');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayHighscores = document.getElementById('overlay-highscores');
const overlayHsBody = document.getElementById('overlay-hs-body');
const startOverlay = document.getElementById('start-overlay');
const startHsBody = document.getElementById('start-hs-body');
const startBtn = document.getElementById('start-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let rewardPending = false;
let combo = 0;
let maxCombo = 0;
let scoreSaved = false;

// ---- localStorage helpers ----

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(list));
  } catch (_) { /* storage unavailable */ }
}

function qualifiesForTop(score) {
  const list = loadHighscores();
  return list.length < HS_MAX || score > list[list.length - 1].score;
}

function addHighscore(name, score, lines, maxCombo) {
  const list = loadHighscores();
  const sanitized = String(name).trim().slice(0, 20) || 'Anónimo';
  list.push({ name: sanitized, score, lines, maxCombo });
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, HS_MAX);
  saveHighscores(trimmed);
  return trimmed;
}

function resetHighscores() {
  saveHighscores([]);
}

// ---- Render highscores table ----

function renderHsTable(tbody, list, highlightScore) {
  tbody.textContent = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Sin records aún';
    td.style.textAlign = 'center';
    td.style.opacity = '0.6';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    if (highlightScore !== undefined && entry.score === highlightScore && !tr.dataset.highlighted) {
      tr.classList.add('hs-highlight');
      tr.dataset.highlighted = '1';
    }
    const rank = document.createElement('td');
    rank.textContent = String(idx + 1);
    const nameCell = document.createElement('td');
    nameCell.textContent = entry.name;
    const scoreCell = document.createElement('td');
    scoreCell.textContent = entry.score.toLocaleString();
    const linesCell = document.createElement('td');
    linesCell.textContent = String(entry.lines);
    const comboCell = document.createElement('td');
    comboCell.textContent = String(entry.maxCombo);
    tr.appendChild(rank);
    tr.appendChild(nameCell);
    tr.appendChild(scoreCell);
    tr.appendChild(linesCell);
    tr.appendChild(comboCell);
    tbody.appendChild(tr);
  });
}

// ---- Board & Piece functions ----

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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
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
  const cleared = clearLines();
  if (!cleared) {
    combo = 0;
  }
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
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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

function showGameOverOverlay() {
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} | Líneas: ${lines} | Combo máx: ${maxCombo}`;

  // Determine if score qualifies for top 5
  scoreSaved = false;
  if (qualifiesForTop(score)) {
    nameInputSection.classList.remove('hidden');
    overlayHighscores.classList.add('hidden');
    playerNameInput.value = '';
    // Focus after overlay shows
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    nameInputSection.classList.add('hidden');
    // Show current leaderboard immediately
    const list = loadHighscores();
    renderHsTable(overlayHsBody, list, undefined);
    overlayHighscores.classList.remove('hidden');
  }

  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  showGameOverOverlay();
}

function handleSaveScore() {
  if (scoreSaved) return;
  const name = playerNameInput.value.trim() || 'Anónimo';
  scoreSaved = true;
  const list = addHighscore(name, score, lines, maxCombo);
  nameInputSection.classList.add('hidden');
  renderHsTable(overlayHsBody, list, score);
  overlayHighscores.classList.remove('hidden');
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
    nameInputSection.classList.add('hidden');
    overlayHighscores.classList.add('hidden');
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
  combo = 0;
  maxCombo = 0;
  scoreSaved = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  nameInputSection.classList.add('hidden');
  overlayHighscores.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Start screen ----

function showStartScreen() {
  const list = loadHighscores();
  renderHsTable(startHsBody, list, undefined);
  startOverlay.classList.remove('hidden');
}

startBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  init();
});

// ---- Event listeners ----

saveScoreBtn.addEventListener('click', handleSaveScore);

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSaveScore();
});

restartBtn.addEventListener('click', init);

resetScoresBtn.addEventListener('click', () => {
  resetHighscores();
  // Refresh start screen table if visible
  const list = loadHighscores();
  renderHsTable(startHsBody, list, undefined);
  // If game over overlay is showing the table, refresh it too
  if (!overlayHighscores.classList.contains('hidden')) {
    renderHsTable(overlayHsBody, list, undefined);
  }
});

document.addEventListener('keydown', e => {
  // Block game keys when name input is focused
  if (document.activeElement === playerNameInput) return;
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

// Show start screen on load
showStartScreen();
