const { BOARD_SIZE, EMPTY, HUMAN, COMPUTER, createBoard, isInside } = window.GobangRules;
const search = window.GobangAI.createSearch();
const CELL_SIZE = 30;
const BOARD_PADDING = 15;
const CANVAS_SIZE = 450;

const boardCanvas = document.getElementById("c1");
const context = boardCanvas.getContext("2d");
const pieceColorSelect = document.getElementById("pieceColor");
const difficultySelect = document.getElementById("difficulty");
const restartButton = document.getElementById("restartButton");
const gameStatus = document.getElementById("gameStatus");

let board = createBoard();
let gameOver = false;
let isHumanTurn = true;
let moveCount = 0;
let lastMove = null;
let keyboardCursor = { row: 7, col: 7 };
let pixelRatio = 1;
let gameVersion = 0;
let humanPlaysBlack = true;

function setupCanvas() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    boardCanvas.width = Math.round(CANVAS_SIZE * pixelRatio);
    boardCanvas.height = Math.round(CANVAS_SIZE * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawBoard();
}

function drawBoard() {
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.fillStyle = "#f4dfb1";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    context.beginPath();
    context.strokeStyle = "rgba(92, 70, 36, 0.72)";
    context.lineWidth = 1;

    for (let index = 0; index < BOARD_SIZE; index += 1) {
        const coordinate = BOARD_PADDING + index * CELL_SIZE;
        context.moveTo(BOARD_PADDING, coordinate);
        context.lineTo(CANVAS_SIZE - BOARD_PADDING, coordinate);
        context.moveTo(coordinate, BOARD_PADDING);
        context.lineTo(coordinate, CANVAS_SIZE - BOARD_PADDING);
    }

    context.stroke();
    drawStarPoints();

    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            if (board[row][col] !== EMPTY) {
                drawPiece(row, col, board[row][col]);
            }
        }
    }

    if (lastMove) {
        drawLastMoveMarker(lastMove);
    }

    if (document.activeElement === boardCanvas && !gameOver) {
        drawKeyboardCursor();
    }
}

function drawStarPoints() {
    const starPoints = [
        [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
    ];

    context.fillStyle = "rgba(76, 57, 29, 0.86)";
    starPoints.forEach(([row, col]) => {
        context.beginPath();
        context.arc(
            BOARD_PADDING + col * CELL_SIZE,
            BOARD_PADDING + row * CELL_SIZE,
            3,
            0,
            Math.PI * 2
        );
        context.fill();
    });
}

function drawPiece(row, col, player) {
    const x = BOARD_PADDING + col * CELL_SIZE;
    const y = BOARD_PADDING + row * CELL_SIZE;
    const gradient = context.createRadialGradient(x - 4, y - 5, 2, x, y, 13);

    if (isBlackPiece(player)) {
        gradient.addColorStop(0, "#5b615f");
        gradient.addColorStop(0.45, "#252928");
        gradient.addColorStop(1, "#050606");
    } else {
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.72, "#f0f2ef");
        gradient.addColorStop(1, "#b9c0bb");
    }

    context.beginPath();
    context.arc(x, y, 13, 0, Math.PI * 2);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = isBlackPiece(player) ? "rgba(0, 0, 0, 0.72)" : "rgba(74, 82, 77, 0.48)";
    context.stroke();
}

function drawLastMoveMarker(move) {
    const x = BOARD_PADDING + move.col * CELL_SIZE;
    const y = BOARD_PADDING + move.row * CELL_SIZE;

    context.beginPath();
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fillStyle = isBlackPiece(move.player) ? "#f4dfb1" : "#3156a3";
    context.fill();
}

function drawKeyboardCursor() {
    const x = BOARD_PADDING + keyboardCursor.col * CELL_SIZE;
    const y = BOARD_PADDING + keyboardCursor.row * CELL_SIZE;

    context.beginPath();
    context.arc(x, y, 16, 0, Math.PI * 2);
    context.strokeStyle = "#0f766e";
    context.lineWidth = 2;
    context.stroke();
}

function setStatus(message) {
    gameStatus.textContent = message;
}

function isBlackPiece(player) {
    return humanPlaysBlack ? player === HUMAN : player === COMPUTER;
}

function scheduleComputerTurn(delay = 60) {
    const requestedVersion = gameVersion;

    window.setTimeout(() => {
        if (requestedVersion === gameVersion && !gameOver) {
            playComputerTurn();
        }
    }, delay);
}

function resetGame() {
    gameVersion += 1;
    board = createBoard();
    gameOver = false;
    humanPlaysBlack = pieceColorSelect.value === "black";
    isHumanTurn = humanPlaysBlack;
    moveCount = 0;
    lastMove = null;
    keyboardCursor = { row: 7, col: 7 };
    boardCanvas.setAttribute(
        "aria-label",
        `五子棋棋盘，你执${humanPlaysBlack ? "黑棋" : "白棋"}。使用方向键移动，回车或空格落子`
    );
    setStatus(humanPlaysBlack ? "你执黑棋，先手。" : "你执白棋，电脑先手，正在思考…");
    drawBoard();

    if (!humanPlaysBlack) {
        scheduleComputerTurn(120);
    }
}

function placeMove(row, col, player) {
    board[row][col] = player;
    moveCount += 1;
    lastMove = { row, col, player };
    keyboardCursor = { row, col };
    drawBoard();
}

function finishAfterMove(row, col, player) {
    if (window.GobangRules.checkWinAt(board, row, col, player)) {
        gameOver = true;
        isHumanTurn = false;
        setStatus(player === HUMAN ? "你赢了！" : "电脑获胜，再试一次。");
        return true;
    }

    if (moveCount === BOARD_SIZE * BOARD_SIZE) {
        gameOver = true;
        isHumanTurn = false;
        setStatus("棋盘已满，本局平局。");
        return true;
    }

    return false;
}

function handleHumanMove(row, col) {
    if (gameOver || !isHumanTurn || !isInside(row, col) || board[row][col] !== EMPTY) {
        return;
    }

    placeMove(row, col, HUMAN);

    if (finishAfterMove(row, col, HUMAN)) {
        return;
    }

    isHumanTurn = false;
    setStatus("电脑思考中…");
    scheduleComputerTurn();
}

function playComputerTurn() {
    const move = search.chooseMove(board, difficultySelect.value);

    if (!move) {
        gameOver = true;
        setStatus("棋盘已满，本局平局。");
        return;
    }

    placeMove(move.row, move.col, COMPUTER);

    if (finishAfterMove(move.row, move.col, COMPUTER)) {
        return;
    }

    isHumanTurn = true;
    setStatus("轮到你落子。");
}

function getCanvasCell(event) {
    const bounds = boardCanvas.getBoundingClientRect();
    const logicalX = (event.clientX - bounds.left) * (CANVAS_SIZE / bounds.width);
    const logicalY = (event.clientY - bounds.top) * (CANVAS_SIZE / bounds.height);

    return {
        row: Math.round((logicalY - BOARD_PADDING) / CELL_SIZE),
        col: Math.round((logicalX - BOARD_PADDING) / CELL_SIZE)
    };
}

boardCanvas.addEventListener("click", (event) => {
    boardCanvas.focus({ preventScroll: true });
    const cell = getCanvasCell(event);
    handleHumanMove(cell.row, cell.col);
});

boardCanvas.addEventListener("keydown", (event) => {
    const keyDirections = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1]
    };
    const direction = keyDirections[event.key];

    if (direction) {
        event.preventDefault();
        keyboardCursor.row = Math.max(0, Math.min(BOARD_SIZE - 1, keyboardCursor.row + direction[0]));
        keyboardCursor.col = Math.max(0, Math.min(BOARD_SIZE - 1, keyboardCursor.col + direction[1]));
        drawBoard();
        return;
    }

    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleHumanMove(keyboardCursor.row, keyboardCursor.col);
    }
});

boardCanvas.addEventListener("focus", drawBoard);
boardCanvas.addEventListener("blur", drawBoard);
restartButton.addEventListener("click", resetGame);
pieceColorSelect.addEventListener("change", resetGame);
difficultySelect.addEventListener("change", resetGame);
window.addEventListener("resize", () => {
    const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    if (nextPixelRatio !== pixelRatio) {
        setupCanvas();
    }
});

setupCanvas();
resetGame();
