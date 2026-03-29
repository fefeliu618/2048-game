const GRID_SIZE = 4;
const STORAGE_KEY = "codex-2048-aureate-best-score";
const DIRECTION_LABELS = {
  up: "上",
  down: "下",
  left: "左",
  right: "右"
};

const boardElement = document.getElementById("board");
const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("best-score");
const moveCountElement = document.getElementById("move-count");
const statusPillElement = document.getElementById("status-pill");
const toastElement = document.getElementById("toast");
const overlayElement = document.getElementById("board-overlay");
const overlayEyebrowElement = document.getElementById("overlay-eyebrow");
const overlayTitleElement = document.getElementById("overlay-title");
const overlayTextElement = document.getElementById("overlay-text");
const overlayPrimaryButton = document.getElementById("overlay-primary-btn");
const overlaySecondaryButton = document.getElementById("overlay-secondary-btn");
const newGameButton = document.getElementById("new-game-btn");
const undoButton = document.getElementById("undo-btn");
const hintButton = document.getElementById("hint-btn");

const state = {
  board: createEmptyBoard(),
  score: 0,
  bestScore: getStoredBestScore(),
  moves: 0,
  history: [],
  won: false,
  gameOver: false,
  allowContinue: false,
  highlightNew: new Set(),
  highlightMerged: new Set(),
  pointerStart: null,
  toastTimer: null
};

function createEmptyBoard() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function getStoredBestScore() {
  const storedValue = window.localStorage.getItem(STORAGE_KEY);
  const parsedValue = Number.parseInt(storedValue ?? "0", 10);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function setStoredBestScore(value) {
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

function getEmptyCells(board) {
  const emptyCells = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      if (board[row][column] === 0) {
        emptyCells.push({ row, column });
      }
    }
  }

  return emptyCells;
}

function addRandomTile(board) {
  const emptyCells = getEmptyCells(board);

  if (!emptyCells.length) {
    return null;
  }

  const targetCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  board[targetCell.row][targetCell.column] = Math.random() < 0.9 ? 2 : 4;
  return `${targetCell.row}-${targetCell.column}`;
}

function startNewGame() {
  state.board = createEmptyBoard();
  state.score = 0;
  state.moves = 0;
  state.history = [];
  state.won = false;
  state.gameOver = false;
  state.allowContinue = false;
  state.highlightNew = new Set();
  state.highlightMerged = new Set();

  const firstTile = addRandomTile(state.board);
  const secondTile = addRandomTile(state.board);

  if (firstTile) {
    state.highlightNew.add(firstTile);
  }

  if (secondTile) {
    state.highlightNew.add(secondTile);
  }

  hideOverlay();
  setStatus("新局已开始");
  renderBoard();
  showToast("新的一局开始了，向 2048 冲刺吧。");
}

function saveSnapshot() {
  state.history.push({
    board: cloneBoard(state.board),
    score: state.score,
    moves: state.moves,
    won: state.won,
    gameOver: state.gameOver,
    allowContinue: state.allowContinue
  });

  if (state.history.length > 40) {
    state.history.shift();
  }
}

function undoMove() {
  const previous = state.history.pop();

  if (!previous) {
    showToast("当前没有可以撤销的步骤。");
    return;
  }

  state.board = cloneBoard(previous.board);
  state.score = previous.score;
  state.moves = previous.moves;
  state.won = previous.won;
  state.gameOver = previous.gameOver;
  state.allowContinue = previous.allowContinue;
  state.highlightNew = new Set();
  state.highlightMerged = new Set();

  if (state.gameOver) {
    showOverlay("棋局结束", "已恢复到失败前的状态，继续寻找新的合并机会。", false);
  } else {
    hideOverlay();
  }

  setStatus("已撤销一步");
  renderBoard();
}

function processLine(values) {
  const filtered = values.filter((value) => value !== 0);
  const result = [];
  let scoreGained = 0;
  const mergedIndices = [];

  for (let index = 0; index < filtered.length; index += 1) {
    const current = filtered[index];
    const next = filtered[index + 1];

    if (current !== undefined && current === next) {
      const mergedValue = current * 2;
      result.push(mergedValue);
      scoreGained += mergedValue;
      mergedIndices.push(result.length - 1);
      index += 1;
    } else {
      result.push(current);
    }
  }

  while (result.length < GRID_SIZE) {
    result.push(0);
  }

  return {
    line: result,
    scoreGained,
    mergedIndices
  };
}

function move(direction) {
  if (state.gameOver) {
    showToast("本局已结束，点击重新开始继续。");
    return;
  }

  saveSnapshot();

  const nextBoard = createEmptyBoard();
  const mergedPositions = new Set();
  let moved = false;
  let scoreGained = 0;

  for (let index = 0; index < GRID_SIZE; index += 1) {
    let sourceLine;

    if (direction === "left" || direction === "right") {
      sourceLine = state.board[index].slice();
      if (direction === "right") {
        sourceLine.reverse();
      }
    } else {
      sourceLine = state.board.map((row) => row[index]);
      if (direction === "down") {
        sourceLine.reverse();
      }
    }

    const processed = processLine(sourceLine);
    let targetLine = processed.line.slice();
    scoreGained += processed.scoreGained;

    const mergedLineIndices =
      direction === "right" || direction === "down"
        ? processed.mergedIndices.map((value) => GRID_SIZE - 1 - value)
        : processed.mergedIndices;

    if (direction === "right" || direction === "down") {
      targetLine.reverse();
    }

    if (direction === "left" || direction === "right") {
      nextBoard[index] = targetLine;

      for (const column of mergedLineIndices) {
        mergedPositions.add(`${index}-${column}`);
      }
    } else {
      for (let row = 0; row < GRID_SIZE; row += 1) {
        nextBoard[row][index] = targetLine[row];
      }

      for (const row of mergedLineIndices) {
        mergedPositions.add(`${row}-${index}`);
      }
    }
  }

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      if (state.board[row][column] !== nextBoard[row][column]) {
        moved = true;
      }
    }
  }

  if (!moved) {
    state.history.pop();
    setStatus("这个方向无法移动");
    showToast(`向${DIRECTION_LABELS[direction]}滑动没有发生变化。`);
    renderBoard();
    return;
  }

  state.board = nextBoard;
  state.score += scoreGained;
  state.moves += 1;
  state.highlightMerged = mergedPositions;
  state.highlightNew = new Set();

  const newTilePosition = addRandomTile(state.board);
  if (newTilePosition) {
    state.highlightNew.add(newTilePosition);
  }

  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    setStoredBestScore(state.bestScore);
  }

  const highestTile = Math.max(...state.board.flat());
  if (highestTile >= 2048 && !state.won) {
    state.won = true;
    state.allowContinue = false;
    showOverlay("达成 2048", "你已经解锁目标方块，是否继续挑战更高分数？", true);
    setStatus("恭喜达成 2048");
  } else if (!hasAvailableMoves(state.board)) {
    state.gameOver = true;
    showOverlay("棋局结束", "棋盘已经没有可用移动，点击再来一局重新冲刺。", false);
    setStatus("棋局结束");
  } else {
    hideOverlay();
    setStatus(`向${DIRECTION_LABELS[direction]}移动成功`);
  }

  renderBoard();
}

function hasAvailableMoves(board) {
  if (getEmptyCells(board).length > 0) {
    return true;
  }

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const currentValue = board[row][column];
      const rightValue = board[row]?.[column + 1];
      const downValue = board[row + 1]?.[column];

      if (currentValue === rightValue || currentValue === downValue) {
        return true;
      }
    }
  }

  return false;
}

function showOverlay(title, description, canContinue) {
  overlayEyebrowElement.textContent = canContinue ? "Milestone Unlocked" : "Round Complete";
  overlayTitleElement.textContent = title;
  overlayTextElement.textContent = description;
  overlayPrimaryButton.textContent = canContinue ? "继续挑战" : "重新开始";
  overlaySecondaryButton.textContent = canContinue ? "再来一局" : "关闭弹层";
  overlaySecondaryButton.hidden = !canContinue;
  overlayElement.classList.remove("is-hidden");
}

function hideOverlay() {
  overlayElement.classList.add("is-hidden");
}

function setStatus(message) {
  statusPillElement.textContent = message;
}

function renderBoard() {
  boardElement.innerHTML = "";

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const value = state.board[row][column];
      const cellElement = document.createElement("div");
      const key = `${row}-${column}`;

      cellElement.className = "board-cell";
      cellElement.setAttribute("data-position", key);

      if (value) {
        const tileElement = document.createElement("div");
        tileElement.className = [
          "tile",
          `tile-${value}`,
          value > 2048 ? "tile-super" : "",
          value >= 1024 ? "tile-large" : "",
          state.highlightNew.has(key) ? "is-new" : "",
          state.highlightMerged.has(key) ? "is-merged" : ""
        ]
          .filter(Boolean)
          .join(" ");
        tileElement.textContent = String(value);
        tileElement.setAttribute("aria-label", `方块 ${value}`);
        cellElement.appendChild(tileElement);
      }

      boardElement.appendChild(cellElement);
    }
  }

  scoreElement.textContent = String(state.score);
  bestScoreElement.textContent = String(state.bestScore);
  moveCountElement.textContent = String(state.moves);
  undoButton.disabled = state.history.length === 0;

  state.highlightNew = new Set();
  state.highlightMerged = new Set();
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("is-visible");

  state.toastTimer = window.setTimeout(() => {
    toastElement.classList.remove("is-visible");
  }, 2200);
}

function handleKeydown(event) {
  const keyToDirectionMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right"
  };

  const direction = keyToDirectionMap[event.key];
  if (!direction) {
    return;
  }

  event.preventDefault();
  move(direction);
}

function handlePointerDown(event) {
  if (!event.isPrimary) {
    return;
  }

  boardElement.setPointerCapture?.(event.pointerId);

  state.pointerStart = {
    x: event.clientX,
    y: event.clientY
  };
}

function handlePointerUp(event) {
  if (!event.isPrimary || !state.pointerStart) {
    return;
  }

  if (boardElement.hasPointerCapture?.(event.pointerId)) {
    boardElement.releasePointerCapture(event.pointerId);
  }

  const deltaX = event.clientX - state.pointerStart.x;
  const deltaY = event.clientY - state.pointerStart.y;
  const threshold = 28;

  state.pointerStart = null;

  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) {
    return;
  }

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    move(deltaX > 0 ? "right" : "left");
  } else {
    move(deltaY > 0 ? "down" : "up");
  }
}

function handlePointerCancel(event) {
  if (event?.pointerId !== undefined && boardElement.hasPointerCapture?.(event.pointerId)) {
    boardElement.releasePointerCapture(event.pointerId);
  }

  state.pointerStart = null;
}

function simulateMove(board, direction) {
  const simulatedBoard = cloneBoard(board);
  let moved = false;
  let scoreGain = 0;

  for (let index = 0; index < GRID_SIZE; index += 1) {
    let sourceLine;

    if (direction === "left" || direction === "right") {
      sourceLine = simulatedBoard[index].slice();
      if (direction === "right") {
        sourceLine.reverse();
      }
    } else {
      sourceLine = simulatedBoard.map((row) => row[index]);
      if (direction === "down") {
        sourceLine.reverse();
      }
    }

    const processed = processLine(sourceLine);
    let targetLine = processed.line.slice();

    if (direction === "right" || direction === "down") {
      targetLine.reverse();
    }

    scoreGain += processed.scoreGained;

    if (direction === "left" || direction === "right") {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        if (simulatedBoard[index][column] !== targetLine[column]) {
          moved = true;
        }
      }
      simulatedBoard[index] = targetLine;
    } else {
      for (let row = 0; row < GRID_SIZE; row += 1) {
        if (simulatedBoard[row][index] !== targetLine[row]) {
          moved = true;
        }
        simulatedBoard[row][index] = targetLine[row];
      }
    }
  }

  return {
    board: simulatedBoard,
    moved,
    scoreGain
  };
}

function getBestHintDirection() {
  const directions = ["up", "right", "down", "left"];
  let bestDirection = null;
  let bestScore = -Infinity;

  for (const direction of directions) {
    const simulation = simulateMove(state.board, direction);

    if (!simulation.moved) {
      continue;
    }

    const emptyCount = getEmptyCells(simulation.board).length;
    const maxTile = Math.max(...simulation.board.flat());
    const edgeBonus = simulation.board[GRID_SIZE - 1][0] === maxTile ? 8 : 0;
    const totalScore = simulation.scoreGain * 3 + emptyCount * 5 + edgeBonus;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestDirection = direction;
    }
  }

  return bestDirection;
}

function showHint() {
  const bestDirection = getBestHintDirection();

  if (!bestDirection) {
    showToast("目前没有可用提示，棋盘已经无法移动。");
    return;
  }

  showToast(`建议优先向${DIRECTION_LABELS[bestDirection]}移动，尽量保留更多空位。`);
}

overlayPrimaryButton.addEventListener("click", () => {
  if (state.won && !state.allowContinue && !state.gameOver) {
    state.allowContinue = true;
    hideOverlay();
    setStatus("继续挑战更高分");
    return;
  }

  startNewGame();
});

overlaySecondaryButton.addEventListener("click", () => {
  if (state.won && !state.allowContinue && !state.gameOver) {
    startNewGame();
    return;
  }

  hideOverlay();
});

newGameButton.addEventListener("click", startNewGame);
undoButton.addEventListener("click", undoMove);
hintButton.addEventListener("click", showHint);
window.addEventListener("keydown", handleKeydown, { passive: false });
boardElement.addEventListener("pointerdown", handlePointerDown);
boardElement.addEventListener("pointerup", handlePointerUp);
boardElement.addEventListener("pointercancel", handlePointerCancel);
boardElement.addEventListener("pointerleave", handlePointerCancel);

bestScoreElement.textContent = String(state.bestScore);
startNewGame();
