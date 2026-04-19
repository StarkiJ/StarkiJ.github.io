const COLS = 10;
const ROWS = 20;
const CELL = 30;
const EMPTY = 0;
const START_DROP_INTERVAL = 800;
const MIN_DROP_INTERVAL = 90;
const DROP_STEP = 70;
const BEST_SCORE_KEY = "starki-tetris-best-score";

const PIECES = {
    I: {
        color: "#06b6d4",
        matrix: [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    },
    J: {
        color: "#2563eb",
        matrix: [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0],
        ],
    },
    L: {
        color: "#f97316",
        matrix: [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0],
        ],
    },
    O: {
        color: "#eab308",
        matrix: [
            [1, 1],
            [1, 1],
        ],
    },
    S: {
        color: "#16a34a",
        matrix: [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0],
        ],
    },
    T: {
        color: "#a855f7",
        matrix: [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0],
        ],
    },
    Z: {
        color: "#e11d48",
        matrix: [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0],
        ],
    },
};

const PIECE_TYPES = Object.keys(PIECES);
const LINE_SCORES = [0, 100, 300, 500, 800];

const boardCanvas = document.getElementById("tetrisBoard");
const boardContext = boardCanvas.getContext("2d");
const nextCanvas = document.getElementById("nextPiece");
const nextContext = nextCanvas.getContext("2d");
const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("bestScore");
const levelElement = document.getElementById("level");
const linesElement = document.getElementById("lines");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const boardMessage = document.getElementById("boardMessage");

let board = createBoard();
let bag = [];
let currentPiece = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let bestScore = readBestScore();
let dropInterval = START_DROP_INTERVAL;
let dropCounter = 0;
let lastTime = 0;
let animationFrameId = 0;
let gameState = "idle";

bestScoreElement.textContent = bestScore;
drawBoard();
drawNextPiece();

function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function readBestScore() {
    try {
        const storedBestScore = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) || "0", 10);
        return Number.isFinite(storedBestScore) ? storedBestScore : 0;
    } catch (error) {
        return 0;
    }
}

function cloneMatrix(matrix) {
    return matrix.map((row) => [...row]);
}

function refillBag() {
    const freshBag = [...PIECE_TYPES];

    for (let index = freshBag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [freshBag[index], freshBag[swapIndex]] = [freshBag[swapIndex], freshBag[index]];
    }

    bag.push(...freshBag);
}

function takePiece() {
    if (bag.length === 0) {
        refillBag();
    }

    const type = bag.pop();
    const piece = PIECES[type];

    return {
        type,
        matrix: cloneMatrix(piece.matrix),
        color: piece.color,
        row: 0,
        col: Math.floor((COLS - piece.matrix[0].length) / 2),
    };
}

function resetGame() {
    board = createBoard();
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = START_DROP_INTERVAL;
    dropCounter = 0;
    currentPiece = takePiece();
    nextPiece = takePiece();
    updateStats();
    drawNextPiece();
}

function startGame() {
    cancelAnimationFrame(animationFrameId);
    resetGame();
    gameState = "playing";
    lastTime = 0;
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
        lastTime = 0;
        animationFrameId = requestAnimationFrame(update);
    }
}

function endGame() {
    gameState = "gameover";
    pauseButton.disabled = true;
    startButton.textContent = "再来一局";
    saveBestScore();
    showMessage("游戏结束", "按再来一局重新开始。");
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

function update(time = 0) {
    if (gameState !== "playing") {
        return;
    }

    const delta = lastTime ? time - lastTime : 0;
    lastTime = time;
    dropCounter += delta;

    if (dropCounter >= dropInterval) {
        dropPiece();
    }

    if (gameState !== "playing") {
        return;
    }

    drawBoard();
    animationFrameId = requestAnimationFrame(update);
}

function dropPiece() {
    if (!movePiece(1, 0)) {
        lockPiece();
        clearLines();
        spawnPiece();
    }

    dropCounter = 0;
}

function movePiece(rowOffset, colOffset) {
    if (!currentPiece || gameState !== "playing") {
        return false;
    }

    const nextRow = currentPiece.row + rowOffset;
    const nextCol = currentPiece.col + colOffset;

    if (collides(currentPiece.matrix, nextRow, nextCol)) {
        return false;
    }

    currentPiece.row = nextRow;
    currentPiece.col = nextCol;
    drawBoard();
    return true;
}

function hardDrop() {
    if (!currentPiece || gameState !== "playing") {
        return;
    }

    let distance = 0;

    while (movePiece(1, 0)) {
        distance += 1;
    }

    score += distance * 2;
    dropPiece();
    updateStats();
}

function rotatePiece(direction = 1) {
    if (!currentPiece || gameState !== "playing") {
        return;
    }

    const rotated = rotateMatrix(currentPiece.matrix, direction);
    const kicks = [0, -1, 1, -2, 2];

    for (const kick of kicks) {
        if (!collides(rotated, currentPiece.row, currentPiece.col + kick)) {
            currentPiece.matrix = rotated;
            currentPiece.col += kick;
            drawBoard();
            return;
        }
    }
}

function rotateMatrix(matrix, direction) {
    const size = matrix.length;
    const rotated = Array.from({ length: size }, () => Array(size).fill(EMPTY));

    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            if (direction > 0) {
                rotated[col][size - 1 - row] = matrix[row][col];
            } else {
                rotated[size - 1 - col][row] = matrix[row][col];
            }
        }
    }

    return rotated;
}

function collides(matrix, nextRow, nextCol) {
    for (let row = 0; row < matrix.length; row += 1) {
        for (let col = 0; col < matrix[row].length; col += 1) {
            if (!matrix[row][col]) {
                continue;
            }

            const boardRow = nextRow + row;
            const boardCol = nextCol + col;

            if (boardCol < 0 || boardCol >= COLS || boardRow >= ROWS) {
                return true;
            }

            if (boardRow >= 0 && board[boardRow][boardCol]) {
                return true;
            }
        }
    }

    return false;
}

function lockPiece() {
    forEachBlock(currentPiece, (row, col) => {
        if (row >= 0) {
            board[row][col] = currentPiece.color;
        }
    });
}

function clearLines() {
    let cleared = 0;

    for (let row = ROWS - 1; row >= 0; row -= 1) {
        if (board[row].every(Boolean)) {
            board.splice(row, 1);
            board.unshift(Array(COLS).fill(EMPTY));
            cleared += 1;
            row += 1;
        }
    }

    if (!cleared) {
        return;
    }

    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(MIN_DROP_INTERVAL, START_DROP_INTERVAL - (level - 1) * DROP_STEP);
    score += LINE_SCORES[cleared] * level;
    updateStats();
}

function spawnPiece() {
    currentPiece = nextPiece;
    currentPiece.row = 0;
    currentPiece.col = Math.floor((COLS - currentPiece.matrix[0].length) / 2);
    nextPiece = takePiece();
    drawNextPiece();

    if (collides(currentPiece.matrix, currentPiece.row, currentPiece.col)) {
        drawBoard();
        endGame();
    }
}

function forEachBlock(piece, callback) {
    piece.matrix.forEach((rowCells, row) => {
        rowCells.forEach((cell, col) => {
            if (cell) {
                callback(piece.row + row, piece.col + col);
            }
        });
    });
}

function getGhostPiece() {
    const ghost = {
        ...currentPiece,
        matrix: currentPiece.matrix,
    };

    while (!collides(ghost.matrix, ghost.row + 1, ghost.col)) {
        ghost.row += 1;
    }

    return ghost;
}

function drawBoard() {
    boardContext.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
    boardContext.fillStyle = "#151a16";
    boardContext.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    drawGrid(boardContext, COLS, ROWS, CELL);

    for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
            if (board[row][col]) {
                drawBlock(boardContext, col, row, board[row][col], 1);
            }
        }
    }

    if (!currentPiece) {
        return;
    }

    if (gameState === "playing") {
        const ghost = getGhostPiece();
        forEachBlock(ghost, (row, col) => drawBlock(boardContext, col, row, currentPiece.color, 0.24));
    }

    forEachBlock(currentPiece, (row, col) => {
        if (row >= 0) {
            drawBlock(boardContext, col, row, currentPiece.color, 1);
        }
    });
}

function drawGrid(context, cols, rows, cellSize) {
    context.strokeStyle = "rgba(255, 255, 255, 0.07)";
    context.lineWidth = 1;

    for (let col = 0; col <= cols; col += 1) {
        context.beginPath();
        context.moveTo(col * cellSize + 0.5, 0);
        context.lineTo(col * cellSize + 0.5, rows * cellSize);
        context.stroke();
    }

    for (let row = 0; row <= rows; row += 1) {
        context.beginPath();
        context.moveTo(0, row * cellSize + 0.5);
        context.lineTo(cols * cellSize, row * cellSize + 0.5);
        context.stroke();
    }
}

function drawBlock(context, col, row, color, alpha) {
    const x = col * CELL;
    const y = row * CELL;

    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    context.fillStyle = "rgba(255, 255, 255, 0.18)";
    context.fillRect(x + 5, y + 5, CELL - 10, 6);
    context.strokeStyle = "rgba(0, 0, 0, 0.25)";
    context.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
    context.restore();
}

function drawNextPiece() {
    nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextContext.fillStyle = "#ffffff";
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    if (!nextPiece) {
        return;
    }

    const previewCell = 24;
    const matrix = nextPiece.matrix;
    const pieceWidth = matrix[0].length * previewCell;
    const pieceHeight = matrix.length * previewCell;
    const offsetX = Math.floor((nextCanvas.width - pieceWidth) / 2);
    const offsetY = Math.floor((nextCanvas.height - pieceHeight) / 2);

    matrix.forEach((rowCells, row) => {
        rowCells.forEach((cell, col) => {
            if (!cell) {
                return;
            }

            drawPreviewBlock(offsetX + col * previewCell, offsetY + row * previewCell, previewCell, nextPiece.color);
        });
    });
}

function drawPreviewBlock(x, y, size, color) {
    nextContext.fillStyle = color;
    nextContext.fillRect(x + 2, y + 2, size - 4, size - 4);
    nextContext.fillStyle = "rgba(255, 255, 255, 0.22)";
    nextContext.fillRect(x + 5, y + 5, size - 10, 5);
    nextContext.strokeStyle = "rgba(0, 0, 0, 0.2)";
    nextContext.strokeRect(x + 2.5, y + 2.5, size - 5, size - 5);
}

function updateStats() {
    scoreElement.textContent = score;
    levelElement.textContent = level;
    linesElement.textContent = lines;
    saveBestScore();
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

    if (gameState !== "playing") {
        return;
    }

    if (action === "left") {
        movePiece(0, -1);
    } else if (action === "right") {
        movePiece(0, 1);
    } else if (action === "down") {
        if (movePiece(1, 0)) {
            score += 1;
            updateStats();
        } else {
            dropPiece();
        }
    } else if (action === "drop") {
        hardDrop();
    } else if (action === "rotate") {
        rotatePiece(1);
    } else if (action === "rotateBack") {
        rotatePiece(-1);
    }
}

startButton.addEventListener("click", () => handleAction("start"));
pauseButton.addEventListener("click", () => handleAction("pause"));

document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
});

document.addEventListener("keydown", (event) => {
    const keyMap = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowDown: "down",
        ArrowUp: "rotate",
        " ": "drop",
        Spacebar: "drop",
        z: "rotateBack",
        Z: "rotateBack",
        p: "pause",
        P: "pause",
    };

    const action = keyMap[event.key];

    if (!action) {
        return;
    }

    event.preventDefault();
    handleAction(action);
});
