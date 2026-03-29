const SUIT_SYMBOLS = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦"
};

const DIFFICULTIES = {
  1: { label: "单色", suits: ["spades"] },
  2: { label: "双色", suits: ["spades", "hearts"] },
  4: { label: "四色", suits: ["spades", "hearts", "clubs", "diamonds"] }
};

const RANK_LABELS = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K"
};

const INITIAL_SCORE = 500;
const COMPLETE_BONUS = 100;
const MOVE_PENALTY = 1;
const DEAL_PENALTY = 1;
const HINT_FLASH_MS = 1400;
const CARD_MOVE_MS = 240;
const CARD_DEAL_MS = 360;
const CARD_REVEAL_MS = 420;
const COMPLETE_FLIGHT_MS = 720;

const elements = {
  tableau: document.getElementById("tableau"),
  foundationArea: document.getElementById("foundationArea"),
  scoreValue: document.getElementById("scoreValue"),
  moveValue: document.getElementById("moveValue"),
  timeValue: document.getElementById("timeValue"),
  completeValue: document.getElementById("completeValue"),
  messageBox: document.getElementById("messageBox"),
  stockButton: document.getElementById("stockButton"),
  stockLabel: document.getElementById("stockLabel"),
  cardProbe: document.getElementById("cardProbe"),
  newGameBtn: document.getElementById("newGameBtn"),
  dealBtn: document.getElementById("dealBtn"),
  hintBtn: document.getElementById("hintBtn"),
  difficultyPills: document.getElementById("difficultyPills"),
  dragLayer: document.getElementById("dragLayer"),
  fxLayer: document.getElementById("fxLayer"),
  winBanner: document.getElementById("winBanner"),
  winSummary: document.getElementById("winSummary"),
  playAgainBtn: document.getElementById("playAgainBtn")
};

const state = {
  difficulty: 1,
  tableau: [],
  stock: [],
  completed: [],
  score: INITIAL_SCORE,
  moves: 0,
  selectedRun: null,
  startTime: 0,
  timerId: null,
  gameWon: false,
  drag: {
    active: false,
    source: null,
    offsetX: 0,
    offsetY: 0,
    hoveredColumn: null
  },
  suppressClick: false,
  hintTimeout: null
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function init() {
  bindEvents();
  newGame(1);
}

function bindEvents() {
  elements.newGameBtn.addEventListener("click", () => newGame(state.difficulty));
  elements.dealBtn.addEventListener("click", dealFromStock);
  elements.stockButton.addEventListener("click", dealFromStock);
  elements.hintBtn.addEventListener("click", showHint);
  elements.playAgainBtn.addEventListener("click", () => newGame(state.difficulty));

  elements.difficultyPills.addEventListener("click", (event) => {
    const button = event.target.closest(".difficulty-pill");
    if (!button) {
      return;
    }
    const suits = Number(button.dataset.suits);
    if (!DIFFICULTIES[suits] || suits === state.difficulty) {
      return;
    }
    newGame(suits);
  });

  elements.tableau.addEventListener("click", onTableauClick);
  elements.tableau.addEventListener("mousedown", onTableauMouseDown);
  elements.tableau.addEventListener("dragstart", preventDefault);
  document.addEventListener("selectstart", onDocumentSelectStart);
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
}

function preventDefault(event) {
  event.preventDefault();
}

function onDocumentSelectStart(event) {
  const target = event.target instanceof Element ? event.target : event.target.parentElement;
  if (state.drag.active || target?.closest(".app-shell")) {
    event.preventDefault();
  }
}

function isDesktopDragEnabled() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function newGame(difficulty) {
  clearTimeout(state.hintTimeout);
  stopTimer();
  document.body.classList.remove("is-dragging");
  elements.dragLayer.textContent = "";
  elements.fxLayer.textContent = "";
  state.difficulty = difficulty;
  state.tableau = Array.from({ length: 10 }, () => []);
  state.stock = [];
  state.completed = [];
  state.score = INITIAL_SCORE;
  state.moves = 0;
  state.selectedRun = null;
  state.gameWon = false;
  elements.winBanner.classList.add("hidden");
  dealInitialLayout(createShuffledDeck(difficulty));
  state.startTime = Date.now();
  startTimer();
  updateDifficultyUI();
  setMessage(`${DIFFICULTIES[difficulty].label}模式开始。把同花色 K 到 A 连成整组即可收走。`);
  render({ type: "newGame" });
}

function createShuffledDeck(difficulty) {
  const suits = DIFFICULTIES[difficulty].suits;
  const suitCopies = 8 / suits.length;
  const deck = [];

  let id = 0;
  for (const suit of suits) {
    for (let copy = 0; copy < suitCopies; copy += 1) {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push({
          id: `card-${id}`,
          suit,
          rank,
          faceUp: false
        });
        id += 1;
      }
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function dealInitialLayout(deck) {
  for (let columnIndex = 0; columnIndex < 10; columnIndex += 1) {
    const cardsToDeal = columnIndex < 4 ? 6 : 5;
    for (let count = 0; count < cardsToDeal; count += 1) {
      const card = deck.pop();
      card.faceUp = count === cardsToDeal - 1;
      state.tableau[columnIndex].push(card);
    }
  }
  state.stock = deck;
}

function render(meta = {}) {
  const previousSnapshot = captureCardSnapshot();
  renderStats();
  renderStock();
  renderFoundation();
  renderTableau();

  window.requestAnimationFrame(() => {
    animateScene(previousSnapshot, meta);
  });
}

function captureCardSnapshot() {
  const snapshot = new Map();

  document.querySelectorAll(".card").forEach((card) => {
    snapshot.set(card.dataset.cardId, {
      rect: card.getBoundingClientRect(),
      faceUp: card.classList.contains("face-up")
    });
  });

  return snapshot;
}

function animateScene(previousSnapshot, meta) {
  animateCards(previousSnapshot, meta);

  if (meta.completedRuns && meta.completedRuns.length > 0) {
    animateCompletedRuns(previousSnapshot, meta.completedRuns);
    pulseElement(elements.scoreValue, "metric-bump");
    pulseElement(elements.completeValue, "metric-bump");
  }

  if (meta.type === "deal") {
    pulseElement(elements.stockButton, "is-dealing");
  }

  if (meta.type === "move" || meta.type === "deal") {
    pulseElement(elements.moveValue, "metric-bump");
  }
}

function animateCards(previousSnapshot, meta) {
  const dealtCardIds = new Set(meta.dealtCardIds || []);
  const movedCardIds = new Set(meta.movedCardIds || []);
  const cards = elements.tableau.querySelectorAll(".card");

  cards.forEach((card) => {
    const currentRect = card.getBoundingClientRect();
    const previous = previousSnapshot.get(card.dataset.cardId);

    if (previous) {
      const deltaX = previous.rect.left - currentRect.left;
      const deltaY = previous.rect.top - currentRect.top;
      const movedDistance = Math.abs(deltaX) + Math.abs(deltaY);

      if (movedDistance > 0.5 && !prefersReducedMotion()) {
        const emphasized = movedCardIds.has(card.dataset.cardId);
        card.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(${emphasized ? 1.02 : 1})`,
              opacity: 0.98
            },
            {
              transform: "translate(0, 0) scale(1)",
              opacity: 1
            }
          ],
          {
            duration: emphasized ? CARD_MOVE_MS + 40 : CARD_MOVE_MS,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)"
          }
        );
      }

      if (!previous.faceUp && card.classList.contains("face-up")) {
        pulseElement(card, "is-revealed", CARD_REVEAL_MS);
      }

      return;
    }

    if (prefersReducedMotion()) {
      return;
    }

    if (dealtCardIds.has(card.dataset.cardId)) {
      const stockRect = elements.stockButton.getBoundingClientRect();
      const deltaX = stockRect.left - currentRect.left;
      const deltaY = stockRect.top - currentRect.top;
      card.animate(
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px) scale(0.92)`,
            opacity: 0.35
          },
          {
            transform: "translate(0, 0) scale(1)",
            opacity: 1
          }
        ],
        {
          duration: CARD_DEAL_MS,
          easing: "cubic-bezier(0.2, 0.85, 0.24, 1)"
        }
      );
      return;
    }

    if (meta.type === "newGame") {
      const columnIndex = Number(card.dataset.column);
      const cardIndex = Number(card.dataset.index);
      const delay = Math.min(240, columnIndex * 28 + cardIndex * 10);
      card.animate(
        [
          {
            transform: "translateY(-18px) scale(0.96)",
            opacity: 0
          },
          {
            transform: "translateY(0) scale(1)",
            opacity: 1
          }
        ],
        {
          duration: 340,
          delay,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards"
        }
      );
    }
  });
}

function renderStats() {
  elements.scoreValue.textContent = String(Math.max(0, state.score));
  elements.moveValue.textContent = String(state.moves);
  elements.completeValue.textContent = `${state.completed.length} / 8`;
}

function renderStock() {
  const stacks = Math.floor(state.stock.length / 10);
  elements.stockButton.dataset.stacks = String(stacks);
  elements.stockButton.disabled = stacks === 0 || state.gameWon;
  elements.stockButton.classList.toggle("disabled", stacks === 0 || state.gameWon);
  elements.stockButton.setAttribute("aria-label", stacks > 0 ? `发一行牌，剩余 ${stacks} 叠` : "已经发完");
  elements.stockLabel.textContent = stacks > 0 ? String(stacks) : "";
  elements.stockLabel.classList.toggle("hidden", stacks === 0);
}

function renderFoundation() {
  elements.foundationArea.textContent = "";

  for (let index = 0; index < 8; index += 1) {
    const slot = document.createElement("div");
    slot.className = "foundation-slot";
    slot.dataset.index = String(index);
    if (state.completed[index]) {
      slot.classList.add("completed");
      const stack = document.createElement("div");
      stack.className = "foundation-stack";
      stack.innerHTML = `<strong>${SUIT_SYMBOLS[state.completed[index].suit]}</strong>`;
      slot.appendChild(stack);
    }
    elements.foundationArea.appendChild(slot);
  }
}

function animateCompletedRuns(previousSnapshot, completedRuns) {
  completedRuns.forEach((run, runIndex) => {
    const anchorCard = previousSnapshot.get(run.cards[0].id);
    const destinationSlot = elements.foundationArea.children[run.foundationIndex];
    if (!anchorCard || !destinationSlot) {
      return;
    }

    const sourceRect = anchorCard.rect;
    const targetRect = destinationSlot.getBoundingClientRect();
    createCompletionFlight(run, sourceRect, targetRect, runIndex);
    window.setTimeout(() => {
      pulseElement(destinationSlot, "slot-celebrate", 820);
      createFoundationBurst(targetRect, run.suit);
    }, Math.min(220, runIndex * 80) + COMPLETE_FLIGHT_MS - 160);
  });
}

function createCompletionFlight(run, sourceRect, targetRect, runIndex) {
  if (prefersReducedMotion()) {
    return;
  }

  const flight = document.createElement("div");
  flight.className = "completion-flight";
  flight.style.left = `${sourceRect.left}px`;
  flight.style.top = `${sourceRect.top}px`;
  flight.style.width = `${sourceRect.width}px`;
  flight.style.height = `${sourceRect.height}px`;

  const sampleCards = [run.cards[0], run.cards[5], run.cards[12]].filter(Boolean);
  sampleCards.forEach((card, index) => {
    const flightCard = document.createElement("div");
    flightCard.className = `completion-flight-card suit-${card.suit}`;
    flightCard.style.left = `${index * 6}px`;
    flightCard.style.top = `${index * 18}px`;
    flightCard.innerHTML = `
      <span class="flight-rank">${rankLabel(card.rank)}</span>
      <span class="flight-suit">${SUIT_SYMBOLS[card.suit]}</span>
    `;
    flight.appendChild(flightCard);
  });

  elements.fxLayer.appendChild(flight);

  const deltaX = targetRect.left + (targetRect.width - sourceRect.width) / 2 - sourceRect.left;
  const deltaY = targetRect.top + (targetRect.height - sourceRect.height) / 2 - sourceRect.top;
  const rotation = deltaX >= 0 ? 8 : -8;

  const animation = flight.animate(
    [
      {
        transform: "translate(0, 0) scale(1) rotate(0deg)",
        opacity: 1,
        filter: "drop-shadow(0 16px 28px rgba(0, 0, 0, 0.35))"
      },
      {
        transform: `translate(${deltaX * 0.82}px, ${deltaY * 0.82}px) scale(0.72) rotate(${rotation}deg)`,
        opacity: 0.92,
        filter: "drop-shadow(0 14px 26px rgba(240, 210, 122, 0.26))",
        offset: 0.76
      },
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(0.48) rotate(${rotation * 1.25}deg)`,
        opacity: 0,
        filter: "drop-shadow(0 10px 18px rgba(240, 210, 122, 0.18))"
      }
    ],
    {
      duration: COMPLETE_FLIGHT_MS,
      delay: Math.min(220, runIndex * 80),
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "forwards"
    }
  );

  animation.finished.finally(() => {
    flight.remove();
  });
}

function createFoundationBurst(targetRect, suit) {
  if (prefersReducedMotion()) {
    return;
  }

  const burst = document.createElement("div");
  burst.className = "foundation-burst";
  burst.style.left = `${targetRect.left + targetRect.width / 2}px`;
  burst.style.top = `${targetRect.top + targetRect.height / 2}px`;
  burst.textContent = SUIT_SYMBOLS[suit];
  elements.fxLayer.appendChild(burst);

  window.setTimeout(() => {
    burst.remove();
  }, 720);
}

function pulseElement(element, className, duration = 420) {
  if (!element) {
    return;
  }

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);

  window.setTimeout(() => {
    element.classList.remove(className);
  }, duration);
}

function renderTableau() {
  elements.tableau.textContent = "";
  clearDropTargets();

  state.tableau.forEach((column, columnIndex) => {
    const columnEl = document.createElement("div");
    columnEl.className = "column";
    columnEl.dataset.column = String(columnIndex);

    if (column.length === 0) {
      columnEl.classList.add("empty");
      columnEl.style.height = `${Math.max(getCardHeight(), 140)}px`;
    } else {
      const positions = computeCardPositions(column);
      const totalHeight = positions[positions.length - 1] + getCardHeight() + 12;
      columnEl.style.height = `${totalHeight}px`;

      column.forEach((card, cardIndex) => {
        const cardEl = buildCardElement(card, columnIndex, cardIndex);
        cardEl.style.top = `${positions[cardIndex]}px`;
        columnEl.appendChild(cardEl);
      });
    }

    elements.tableau.appendChild(columnEl);
  });
}

function buildCardElement(card, columnIndex, cardIndex) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `card ${card.faceUp ? "face-up" : "face-down"} suit-${card.suit}`;
  button.dataset.column = String(columnIndex);
  button.dataset.index = String(cardIndex);
  button.dataset.cardId = card.id;
  button.setAttribute("aria-label", card.faceUp ? `${rankLabel(card.rank)}${SUIT_SYMBOLS[card.suit]}` : "背面牌");

  const movable = card.faceUp && isMovableRun(columnIndex, cardIndex);
  if (movable) {
    button.classList.add("is-movable");
  }

  if (isSelectedRun(columnIndex, cardIndex)) {
    button.classList.add("is-selected");
  }

  const face = document.createElement("span");
  face.className = "card-face";

  if (card.faceUp) {
    const content = document.createElement("span");
    content.className = "card-content";
    content.innerHTML = `
      <span class="card-corner top">
        <span class="card-rank">${rankLabel(card.rank)}</span>
        <span class="card-suit">${SUIT_SYMBOLS[card.suit]}</span>
      </span>
      <span class="card-center">${SUIT_SYMBOLS[card.suit]}</span>
      <span class="card-corner bottom">
        <span class="card-rank">${rankLabel(card.rank)}</span>
        <span class="card-suit">${SUIT_SYMBOLS[card.suit]}</span>
      </span>
    `;
    face.appendChild(content);
  }

  button.appendChild(face);
  return button;
}

function computeCardPositions(column) {
  const facedownStep = 18;
  const faceupStep = Math.max(22, Math.round(getCardHeight() * 0.22));
  const positions = [];
  let currentTop = 0;

  column.forEach((card, index) => {
    positions[index] = currentTop;
    currentTop += card.faceUp ? faceupStep : facedownStep;
  });

  return positions;
}

function getCardHeight() {
  const probeHeight = elements.cardProbe.getBoundingClientRect().height;
  return probeHeight > 0 ? probeHeight : 82;
}

function rankLabel(rank) {
  return RANK_LABELS[rank] || String(rank);
}

function onTableauClick(event) {
  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }

  if (state.gameWon) {
    return;
  }

  const cardEl = event.target.closest(".card");
  const columnEl = event.target.closest(".column");

  if (!columnEl) {
    clearSelection();
    return;
  }

  const targetColumn = Number(columnEl.dataset.column);

  if (cardEl) {
    const targetIndex = Number(cardEl.dataset.index);
    handleCardTap(targetColumn, targetIndex);
    return;
  }

  if (state.selectedRun && tryMoveSelectedRun(targetColumn)) {
    return;
  }

  clearSelection();
}

function handleCardTap(columnIndex, cardIndex) {
  const card = state.tableau[columnIndex][cardIndex];
  if (!card || !card.faceUp) {
    clearSelection();
    return;
  }

  if (state.selectedRun) {
    const sameSelection = state.selectedRun.column === columnIndex && state.selectedRun.startIndex === cardIndex;
    if (sameSelection) {
      clearSelection();
      return;
    }

    if (tryMoveSelectedRun(columnIndex)) {
      return;
    }
  }

  if (isMovableRun(columnIndex, cardIndex)) {
    state.selectedRun = { column: columnIndex, startIndex: cardIndex };
    setMessage("已选中一组牌。点击目标列即可移动，桌面端也可以直接拖拽。");
    renderTableau();
    return;
  }

  clearSelection();
  setMessage("这张牌当前不能整组移动。只有同花色连续降序的一组牌可以一起搬动。");
}

function onTableauMouseDown(event) {
  if (state.gameWon || event.button !== 0 || !isDesktopDragEnabled()) {
    return;
  }

  const cardEl = event.target.closest(".card");
  if (!cardEl) {
    return;
  }

  const columnIndex = Number(cardEl.dataset.column);
  const cardIndex = Number(cardEl.dataset.index);
  if (!isMovableRun(columnIndex, cardIndex)) {
    return;
  }

  event.preventDefault();
  const column = state.tableau[columnIndex];
  const cards = column.slice(cardIndex);
  state.drag.active = true;
  state.drag.source = { column: columnIndex, startIndex: cardIndex, cards };
  state.drag.offsetX = event.clientX - cardEl.getBoundingClientRect().left;
  state.drag.offsetY = event.clientY - cardEl.getBoundingClientRect().top;
  state.drag.hoveredColumn = null;
  state.selectedRun = { column: columnIndex, startIndex: cardIndex };
  document.body.classList.add("is-dragging");
  renderTableau();
}

function onWindowMouseMove(event) {
  if (!state.drag.active || !state.drag.source) {
    return;
  }

  event.preventDefault();
  drawDragStack(event.clientX, event.clientY);

  const hovered = getColumnFromPoint(event.clientX, event.clientY);
  state.drag.hoveredColumn = hovered;
  highlightDropTarget(hovered, state.drag.source);
}

function onWindowMouseUp(event) {
  if (!state.drag.active) {
    return;
  }

  const targetColumn = getColumnFromPoint(event.clientX, event.clientY);
  const moved = targetColumn !== null && tryMoveRun(state.drag.source.column, state.drag.source.startIndex, targetColumn);

  cleanupDragState();
  state.suppressClick = true;

  if (!moved) {
    renderTableau();
  }
}

function drawDragStack(clientX, clientY) {
  if (!state.drag.source) {
    return;
  }

  elements.dragLayer.textContent = "";
  const stack = document.createElement("div");
  stack.className = "drag-stack";
  stack.style.left = `${clientX - state.drag.offsetX}px`;
  stack.style.top = `${clientY - state.drag.offsetY}px`;

  const positions = computeCardPositions(state.drag.source.cards);
  state.drag.source.cards.forEach((card, index) => {
    const cardEl = buildCardElement(card, state.drag.source.column, state.drag.source.startIndex + index);
    cardEl.style.top = `${positions[index]}px`;
    stack.appendChild(cardEl);
  });

  elements.dragLayer.appendChild(stack);
}

function cleanupDragState() {
  state.drag.active = false;
  state.drag.source = null;
  state.drag.hoveredColumn = null;
  document.body.classList.remove("is-dragging");
  elements.dragLayer.textContent = "";
  clearDropTargets();
}

function getColumnFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  const column = element ? element.closest(".column") : null;
  if (!column) {
    return null;
  }
  return Number(column.dataset.column);
}

function highlightDropTarget(columnIndex, source) {
  clearDropTargets();
  if (columnIndex === null || !source) {
    return;
  }

  if (!canPlaceRun(source.column, source.startIndex, columnIndex)) {
    return;
  }

  const columnEl = elements.tableau.querySelector(`.column[data-column="${columnIndex}"]`);
  if (columnEl) {
    columnEl.classList.add("is-drop-target");
  }
}

function clearDropTargets() {
  elements.tableau.querySelectorAll(".column").forEach((column) => {
    column.classList.remove("is-drop-target", "hint-glow");
  });
  elements.tableau.querySelectorAll(".card").forEach((card) => {
    card.classList.remove("hint-flash");
  });
}

function isSelectedRun(columnIndex, cardIndex) {
  return Boolean(
    state.selectedRun &&
    state.selectedRun.column === columnIndex &&
    state.selectedRun.startIndex <= cardIndex
  );
}

function isMovableRun(columnIndex, startIndex) {
  const column = state.tableau[columnIndex];
  if (!column || !column[startIndex] || !column[startIndex].faceUp) {
    return false;
  }

  for (let index = startIndex; index < column.length - 1; index += 1) {
    const current = column[index];
    const next = column[index + 1];
    if (!next.faceUp || current.suit !== next.suit || current.rank !== next.rank + 1) {
      return false;
    }
  }

  return true;
}

function canPlaceRun(fromColumn, startIndex, targetColumn) {
  if (fromColumn === targetColumn) {
    return false;
  }

  const sourceColumn = state.tableau[fromColumn];
  const targetStack = state.tableau[targetColumn];
  const movingCard = sourceColumn[startIndex];
  if (!movingCard || !movingCard.faceUp || !isMovableRun(fromColumn, startIndex)) {
    return false;
  }

  if (targetStack.length === 0) {
    return true;
  }

  const destinationCard = targetStack[targetStack.length - 1];
  return destinationCard.faceUp && destinationCard.rank === movingCard.rank + 1;
}

function tryMoveSelectedRun(targetColumn) {
  if (!state.selectedRun) {
    return false;
  }

  const moved = tryMoveRun(state.selectedRun.column, state.selectedRun.startIndex, targetColumn);
  if (!moved) {
    setMessage("不能放到这一列。目标牌必须比移动牌大 1，或者直接放入空列。");
  }
  return moved;
}

function tryMoveRun(fromColumn, startIndex, targetColumn) {
  if (!canPlaceRun(fromColumn, startIndex, targetColumn)) {
    return false;
  }

  const source = state.tableau[fromColumn];
  const movedCards = source.splice(startIndex);
  state.tableau[targetColumn].push(...movedCards);
  afterSuccessfulMove(fromColumn, targetColumn, movedCards, false);
  return true;
}

function afterSuccessfulMove(fromColumn, targetColumn, movedCards, fromStock) {
  const revealedIds = [];
  const completedRuns = [];
  const sourceReveal = revealTopCard(fromColumn);
  if (sourceReveal) {
    revealedIds.push(sourceReveal);
  }

  clearSelection(false);
  state.moves += 1;
  state.score -= fromStock ? DEAL_PENALTY : MOVE_PENALTY;

  const removedFromSource = settleColumn(fromColumn, completedRuns, revealedIds);
  const removedFromTarget = settleColumn(targetColumn, completedRuns, revealedIds);
  const removed = removedFromSource || removedFromTarget;

  const movedText = fromStock ? "已为每一列发出一张新牌。" : `已移动 ${movedCards.length} 张牌。`;
  setMessage(removed ? `${movedText} 成功收走一整组同花色顺子。` : movedText);
  render({
    type: fromStock ? "deal" : "move",
    movedCardIds: movedCards.map((card) => card.id),
    completedRuns,
    revealedIds
  });
  checkWin();
}

function revealTopCard(columnIndex) {
  const column = state.tableau[columnIndex];
  if (!column || column.length === 0) {
    return null;
  }
  const topCard = column[column.length - 1];
  if (!topCard.faceUp) {
    topCard.faceUp = true;
    return topCard.id;
  }
  return null;
}

function removeCompletedSequence(columnIndex) {
  const column = state.tableau[columnIndex];
  if (!column || column.length < 13) {
    return null;
  }

  const slice = column.slice(-13);
  const firstSuit = slice[0].suit;

  for (let index = 0; index < slice.length; index += 1) {
    const card = slice[index];
    if (!card.faceUp || card.suit !== firstSuit || card.rank !== 13 - index) {
      return null;
    }
  }

  const completedRun = {
    suit: firstSuit,
    foundationIndex: state.completed.length,
    cards: slice.map((card) => ({
      id: card.id,
      suit: card.suit,
      rank: card.rank
    }))
  };

  column.splice(column.length - 13, 13);
  state.completed.push({ suit: firstSuit });
  state.score += COMPLETE_BONUS;
  return completedRun;
}

function settleColumn(columnIndex, completedRuns = [], revealedIds = []) {
  let removedAny = false;
  let completedRun = removeCompletedSequence(columnIndex);

  while (completedRun) {
    removedAny = true;
    completedRuns.push(completedRun);
    const revealedId = revealTopCard(columnIndex);
    if (revealedId) {
      revealedIds.push(revealedId);
    }
    completedRun = removeCompletedSequence(columnIndex);
  }

  return removedAny;
}

function dealFromStock() {
  if (state.gameWon) {
    return;
  }

  if (state.stock.length === 0) {
    setMessage("没有可发的新牌了。");
    return;
  }

  const emptyColumn = state.tableau.findIndex((column) => column.length === 0);
  if (emptyColumn !== -1) {
    setMessage("存在空列时不能发新牌，请先把牌移入空列。");
    return;
  }

  const dealtCards = [];
  const completedRuns = [];
  const revealedIds = [];
  for (let columnIndex = 0; columnIndex < 10; columnIndex += 1) {
    const card = state.stock.pop();
    card.faceUp = true;
    state.tableau[columnIndex].push(card);
    dealtCards.push(card);
    settleColumn(columnIndex, completedRuns, revealedIds);
  }

  clearSelection(false);
  state.moves += 1;
  state.score -= DEAL_PENALTY;
  setMessage("新的一行已经发出。");
  render({
    type: "deal",
    dealtCardIds: dealtCards.map((card) => card.id),
    completedRuns,
    revealedIds
  });
  checkWin();
}

function showHint() {
  if (state.gameWon) {
    return;
  }

  clearTimeout(state.hintTimeout);
  clearDropTargets();

  const hint = findHint();
  if (!hint) {
    setMessage("暂时没有明显可走的整组移动，可以考虑发新牌或整理空列。");
    return;
  }

  const sourceColumn = elements.tableau.querySelector(`.column[data-column="${hint.fromColumn}"]`);
  const targetColumn = elements.tableau.querySelector(`.column[data-column="${hint.toColumn}"]`);
  const sourceCard = elements.tableau.querySelector(
    `.card[data-column="${hint.fromColumn}"][data-index="${hint.startIndex}"]`
  );

  if (sourceColumn) {
    sourceColumn.classList.add("hint-glow");
  }
  if (targetColumn) {
    targetColumn.classList.add("hint-glow");
  }
  if (sourceCard) {
    sourceCard.classList.add("hint-flash");
  }

  setMessage(`提示：尝试把 ${rankLabel(hint.rank)}${SUIT_SYMBOLS[hint.suit]} 移到第 ${hint.toColumn + 1} 列。`);
  state.hintTimeout = window.setTimeout(clearDropTargets, HINT_FLASH_MS);
}

function findHint() {
  for (let fromColumn = 0; fromColumn < state.tableau.length; fromColumn += 1) {
    const column = state.tableau[fromColumn];
    for (let startIndex = 0; startIndex < column.length; startIndex += 1) {
      if (!isMovableRun(fromColumn, startIndex)) {
        continue;
      }

      for (let toColumn = 0; toColumn < state.tableau.length; toColumn += 1) {
        if (canPlaceRun(fromColumn, startIndex, toColumn)) {
          return {
            fromColumn,
            startIndex,
            toColumn,
            rank: column[startIndex].rank,
            suit: column[startIndex].suit
          };
        }
      }
    }
  }

  return null;
}

function clearSelection(shouldRender = true) {
  if (!state.selectedRun) {
    return;
  }
  state.selectedRun = null;
  if (shouldRender) {
    renderTableau();
  }
}

function setMessage(message) {
  elements.messageBox.textContent = message;
}

function updateDifficultyUI() {
  elements.difficultyPills.querySelectorAll(".difficulty-pill").forEach((pill) => {
    pill.classList.toggle("active", Number(pill.dataset.suits) === state.difficulty);
  });
}

function checkWin() {
  if (state.completed.length < 8) {
    return;
  }

  state.gameWon = true;
  stopTimer();
  clearSelection(false);
  render({ type: "win" });
  elements.winSummary.textContent = `你用了 ${state.moves} 步，最终得分 ${Math.max(0, state.score)}。`;
  elements.winBanner.classList.remove("hidden");
  setMessage("全部 8 组已经收齐，漂亮。");
}

function startTimer() {
  updateTimer();
  state.timerId = window.setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimer() {
  const elapsedMs = Date.now() - state.startTime;
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  elements.timeValue.textContent = `${minutes}:${seconds}`;
}

init();
