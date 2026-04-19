const GRID_SIZE = 21;
const CELL_SIZE = 28;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const START_INTERVAL = 200;
const MIN_INTERVAL = 70;
const SPEED_STEP = 10;
const FOOD_SCORE = 10;
const BEST_SCORE_KEY = "starki-snake-best-score";

const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

const boardCanvas = document.getElementById("snakeBoard");
const context = boardCanvas.getContext("2d");
const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("bestScore");
const lengthElement = document.getElementById("snakeLength");
const speedElement = document.getElementById("speedLevel");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const boardMessage = document.getElementById("boardMessage");

let snake = createStartSnake();
let direction = DIRECTIONS.right;
let pendingDirection = DIRECTIONS.right;
let food = { x: 15, y: 10 };
let score = 0;
let foodsEaten = 0;
let bestScore = readBestScore();
let moveInterval = START_INTERVAL;
let lastMoveTime = 0;
let animationFrameId = 0;
let gameState = "idle";
let touchStart = null;

bestScoreElement.textContent = bestScore;
updateStats();
drawGame();

function createStartSnake() {
    return [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
    ];
}

function readBestScore() {
    try {
        const storedBestScore = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) || "0", 10);
        return Number.isFinite(storedBestScore) ? storedBestScore : 0;
    } catch (error) {
        return 0;
    }
}

function saveBestScore() {
    if (score <= bestScore) {
        return;
    }

    bestScore = score;
    try {
        localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
    } catch (error) {
        // The game still works when the browser blocks local storage.
    }
    bestScoreElement.textContent = bestScore;
}

function resetGame() {
    snake = createStartSnake();
    direction = DIRECTIONS.right;
    pendingDirection = DIRECTIONS.right;
    score = 0;
    foodsEaten = 0;
    moveInterval = START_INTERVAL;
    food = createFood();
    lastMoveTime = 0;
    updateStats();
    drawGame();
}

function startGame() {
    cancelAnimationFrame(animationFrameId);
    resetGame();
    gameState = "playing";
    startButton.textContent = "重新开始";
    pauseButton.disabled = false;
    pauseButton.textContent = "暂停";
    hideMessage();
    animationFrameId = requestAnimationFrame(update);
}

function togglePause() {
    if (gameState === "playing") {
        gameState = "paused";
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
        pauseButton.textContent = "继续";
        showMessage("已暂停", "按继续或 P 键回到游戏。");
        return;
    }

    if (gameState === "paused") {
        gameState = "playing";
        pauseButton.textContent = "暂停";
        hideMessage();
        lastMoveTime = 0;
        animationFrameId = requestAnimationFrame(update);
    }
}

function endGame() {
    finishGame("游戏结束", "撞到了，按再来一局重新开始。");
}

function finishGame(title, copy) {
    gameState = "gameover";
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    pauseButton.disabled = true;
    startButton.textContent = "再来一局";
    saveBestScore();
    drawGame();
    showMessage(title, copy);
}

function update(time = 0) {
    if (gameState !== "playing") {
        return;
    }

    if (!lastMoveTime) {
        lastMoveTime = time;
    }

    if (time - lastMoveTime >= moveInterval) {
        stepGame();
        lastMoveTime = time;
    }

    if (gameState === "playing") {
        animationFrameId = requestAnimationFrame(update);
    }
}

function stepGame() {
    direction = pendingDirection;

    const head = snake[0];
    const nextHead = {
        x: head.x + direction.x,
        y: head.y + direction.y,
    };
    const willEatFood = isSameCell(nextHead, food);
    const bodyToCheck = willEatFood ? snake : snake.slice(0, -1);

    if (isOutsideBoard(nextHead) || bodyToCheck.some((cell) => isSameCell(cell, nextHead))) {
        endGame();
        return;
    }

    snake.unshift(nextHead);

    if (willEatFood) {
        foodsEaten += 1;
        score += FOOD_SCORE + getSpeedLevel() - 1;
        moveInterval = Math.max(MIN_INTERVAL, START_INTERVAL - (getSpeedLevel() - 1) * SPEED_STEP);

        if (snake.length === GRID_SIZE * GRID_SIZE) {
            updateStats();
            finishGame("通关成功", "整张棋盘都被你填满了。");
            return;
        }

        food = createFood();
        saveBestScore();
    } else {
        snake.pop();
    }

    updateStats();
    drawGame();
}

function setDirection(nextDirectionName) {
    const nextDirection = DIRECTIONS[nextDirectionName];

    if (!nextDirection || gameState !== "playing") {
        return;
    }

    const isReverse = direction.x + nextDirection.x === 0 && direction.y + nextDirection.y === 0;

    if (!isReverse) {
        pendingDirection = nextDirection;
    }
}

function createFood() {
    const emptyCells = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
            const cell = { x, y };

            if (!snake.some((segment) => isSameCell(segment, cell))) {
                emptyCells.push(cell);
            }
        }
    }

    if (emptyCells.length === 0) {
        return { x: 0, y: 0 };
    }

    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function getSpeedLevel() {
    return Math.floor(foodsEaten / 4) + 1;
}

function isOutsideBoard(cell) {
    return cell.x < 0 || cell.x >= GRID_SIZE || cell.y < 0 || cell.y >= GRID_SIZE;
}

function isSameCell(first, second) {
    return first.x === second.x && first.y === second.y;
}

function updateStats() {
    scoreElement.textContent = score;
    bestScoreElement.textContent = bestScore;
    lengthElement.textContent = snake.length;
    speedElement.textContent = getSpeedLevel();
}

function drawGame() {
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawBoard();
    drawFood();
    drawSnake();
}

function drawBoard() {
    for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
            context.fillStyle = (x + y) % 2 === 0 ? "#111a14" : "#0f1712";
            context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.06)";
    context.lineWidth = 1;

    for (let line = 0; line <= GRID_SIZE; line += 1) {
        context.beginPath();
        context.moveTo(line * CELL_SIZE + 0.5, 0);
        context.lineTo(line * CELL_SIZE + 0.5, CANVAS_SIZE);
        context.stroke();
        context.beginPath();
        context.moveTo(0, line * CELL_SIZE + 0.5);
        context.lineTo(CANVAS_SIZE, line * CELL_SIZE + 0.5);
        context.stroke();
    }
}

function drawSnake() {
    for (let index = snake.length - 1; index >= 0; index -= 1) {
        const segment = snake[index];
        const isHead = index === 0;
        drawSnakeSegment(segment, isHead, index);
    }
}

function drawSnakeSegment(segment, isHead, index) {
    const padding = isHead ? 2 : 3;
    const x = segment.x * CELL_SIZE + padding;
    const y = segment.y * CELL_SIZE + padding;
    const size = CELL_SIZE - padding * 2;
    const color = isHead ? "#14b8a6" : index % 2 === 0 ? "#22c55e" : "#2dd4bf";

    context.fillStyle = color;
    fillRoundedRect(x, y, size, size, 7);
    context.fillStyle = "rgba(255, 255, 255, 0.16)";
    fillRoundedRect(x + 5, y + 5, size - 10, 5, 3);

    if (isHead) {
        drawSnakeFace(segment);
    }
}

function drawSnakeFace(head) {
    const centerX = head.x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = head.y * CELL_SIZE + CELL_SIZE / 2;
    const eyeOffset = 6;
    const eyeForward = 5;
    const eyes = getEyePositions(centerX, centerY, eyeOffset, eyeForward);

    context.fillStyle = "#ffffff";
    eyes.forEach((eye) => {
        context.beginPath();
        context.arc(eye.x, eye.y, 3.2, 0, Math.PI * 2);
        context.fill();
    });

    context.fillStyle = "#111612";
    eyes.forEach((eye) => {
        context.beginPath();
        context.arc(eye.x + direction.x, eye.y + direction.y, 1.4, 0, Math.PI * 2);
        context.fill();
    });

    context.strokeStyle = "#ef4444";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX + direction.x * 8, centerY + direction.y * 8);
    context.lineTo(centerX + direction.x * 13, centerY + direction.y * 13);
    context.stroke();
}

function getEyePositions(centerX, centerY, eyeOffset, eyeForward) {
    if (Math.abs(direction.x) > 0) {
        return [
            { x: centerX + direction.x * eyeForward, y: centerY - eyeOffset },
            { x: centerX + direction.x * eyeForward, y: centerY + eyeOffset },
        ];
    }

    return [
        { x: centerX - eyeOffset, y: centerY + direction.y * eyeForward },
        { x: centerX + eyeOffset, y: centerY + direction.y * eyeForward },
    ];
}

function drawFood() {
    const centerX = food.x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = food.y * CELL_SIZE + CELL_SIZE / 2 + 1;

    context.fillStyle = "#be123c";
    context.beginPath();
    context.arc(centerX, centerY, CELL_SIZE * 0.34, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#f59e0b";
    context.beginPath();
    context.arc(centerX - 3, centerY - 4, CELL_SIZE * 0.15, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#7c2d12";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX + 1, centerY - 8);
    context.lineTo(centerX + 5, centerY - 13);
    context.stroke();

    context.fillStyle = "#84cc16";
    context.beginPath();
    context.ellipse(centerX + 9, centerY - 12, 5, 3, -0.4, 0, Math.PI * 2);
    context.fill();
}

function fillRoundedRect(x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);

    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    context.lineTo(x + safeRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    context.lineTo(x, y + safeRadius);
    context.quadraticCurveTo(x, y, x + safeRadius, y);
    context.closePath();
    context.fill();
}

function showMessage(title, copy) {
    boardMessage.hidden = false;
    boardMessage.querySelector("strong").textContent = title;
    boardMessage.querySelector("span").textContent = copy;
}

function hideMessage() {
    boardMessage.hidden = true;
}

function handleAction(action) {
    if (action === "start") {
        startGame();
        return;
    }

    if (action === "pause") {
        togglePause();
        return;
    }

    setDirection(action);
}

startButton.addEventListener("click", () => handleAction("start"));
pauseButton.addEventListener("click", () => handleAction("pause"));

document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
});

document.addEventListener("keydown", (event) => {
    const keyMap = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        W: "up",
        s: "down",
        S: "down",
        a: "left",
        A: "left",
        d: "right",
        D: "right",
        p: "pause",
        P: "pause",
        " ": "start",
        Spacebar: "start",
    };
    const action = keyMap[event.key];

    if (!action) {
        return;
    }

    event.preventDefault();

    if (action === "start" && gameState !== "playing") {
        handleAction("start");
        return;
    }

    if (action !== "start") {
        handleAction(action);
    }
});

boardCanvas.addEventListener("pointerdown", (event) => {
    touchStart = { x: event.clientX, y: event.clientY };
});

boardCanvas.addEventListener("pointerup", (event) => {
    if (!touchStart) {
        return;
    }

    const deltaX = event.clientX - touchStart.x;
    const deltaY = event.clientY - touchStart.y;
    touchStart = null;

    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) {
        return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        handleAction(deltaX > 0 ? "right" : "left");
    } else {
        handleAction(deltaY > 0 ? "down" : "up");
    }
});
