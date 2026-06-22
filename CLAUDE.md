# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step. Open directly or serve locally:

```bash
open index.html                  # macOS
python3 -m http.server 8000      # then visit http://localhost:8000
```

## Architecture

Three files, no dependencies, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the board, `<canvas id="next-canvas">` (120×120px) for the preview, HUD spans (`#score`, `#lines`, `#level`), and `#overlay` for PAUSE / GAME OVER states.
- **`style.css`** — Dark/retro aesthetic. Flexbox layout, CSS variables for colors, `backdrop-filter` on overlay.
- **`game.js`** — All game logic (~300 lines, `'use strict'`, ES6+).

## game.js internals

**State** (module-level `let` vars): `board` (2D array, 0=empty, 1–7=piece color index), `current`/`next` (piece objects with `{type, shape, x, y}`), `score`, `lines`, `level`, `paused`, `gameOver`, `lastTime`, `dropAccum`, `dropInterval`, `animId`.

**Key functions:**
- `collide(shape, ox, oy)` — bounds + overlap check against `board`
- `rotateCW(shape)` — transpose + row-reverse; produces a new matrix
- `tryRotate()` — applies `rotateCW` then wall-kicks `[0, -1, 1, -2, 2]` columns
- `ghostY()` — projects `current` straight down until `collide`
- `lockPiece()` → `merge()` → `clearLines()` → `spawn()`; `spawn()` calls `endGame()` if new piece already collides
- `loop(ts)` — `requestAnimationFrame` loop; accumulates `dropAccum`, triggers auto-drop or `lockPiece` when `dropAccum >= dropInterval`
- `draw()` — clears canvas, draws grid, board cells, ghost (α=0.2), current piece
- `init()` — full reset, cancels previous `animId`, starts new loop

**Tunable constants** (top of `game.js`): `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`. If `COLS`/`ROWS`/`BLOCK` change, update canvas `width`/`height` in `index.html` (`COLS×BLOCK` × `ROWS×BLOCK`).

**Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × level. Soft drop +1/row, hard drop +2/cell fallen. Level = `floor(lines/10)+1`. Speed = `max(100, 1000 − (level−1)×90)` ms/drop.
