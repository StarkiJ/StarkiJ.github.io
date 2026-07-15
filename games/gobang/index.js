const BOARD_SIZE = 15;
const CELL_SIZE = 30;
const BOARD_PADDING = 15;
const CANVAS_SIZE = 450;
const EMPTY = 0;
const HUMAN = 1;
const COMPUTER = 2;
const WIN_SCORE = 100000000;
const DIRECTIONS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
];
const HUMAN_PATTERN_SCORES = [0, 200, 400, 2000, 10000];
const COMPUTER_PATTERN_SCORES = [0, 400, 800, 2200, 20000];
const OPEN_THREE_PATTERNS = ["..XXX.", ".XXX..", ".XX.X.", ".X.XX."];
const OPEN_TWO_PATTERNS = ["..XX..", ".X.X..", "..X.X."];
const HARD_SEARCH_TIME_MS = 900;
const HARD_SEARCH_MAX_DEPTH = 6;
const SEARCH_TIMEOUT = Symbol("search-timeout");
const TRANSPOSITION_EXACT = 0;
const TRANSPOSITION_LOWER = 1;
const TRANSPOSITION_UPPER = 2;
const ZOBRIST_TABLE = buildZobristTable();

const boardCanvas = document.getElementById("c1");
const context = boardCanvas.getContext("2d");
const difficultySelect = document.getElementById("difficulty");
const restartButton = document.getElementById("restartButton");
const gameStatus = document.getElementById("gameStatus");
const { patterns: winPatterns, byCell: patternsByCell } = buildWinPatterns();

let board = createBoard();
let gameOver = false;
let isHumanTurn = true;
let moveCount = 0;
let lastMove = null;
let keyboardCursor = { row: 7, col: 7 };
let pixelRatio = 1;
let gameVersion = 0;
let searchDeadline = Infinity;
let searchNodeCount = 0;
let searchHash = 0;
let transpositionTable = new Map();
let lastSearchStats = { depth: 0, nodes: 0, duration: 0, timedOut: false };

function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

function buildZobristTable() {
    let state = 0x9e3779b9;

    function nextRandom() {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    }

    return Array.from({ length: BOARD_SIZE }, () =>
        Array.from({ length: BOARD_SIZE }, () => [nextRandom(), nextRandom()]));
}

function buildWinPatterns() {
    const patterns = [];
    const byCell = Array.from({ length: BOARD_SIZE }, () =>
        Array.from({ length: BOARD_SIZE }, () => []));

    function addPattern(cells) {
        const patternIndex = patterns.length;
        patterns.push(cells);

        cells.forEach(({ row, col }) => {
            byCell[row][col].push(patternIndex);
        });
    }

    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col <= BOARD_SIZE - 5; col += 1) {
            addPattern(Array.from({ length: 5 }, (_, offset) => ({ row, col: col + offset })));
        }
    }

    for (let col = 0; col < BOARD_SIZE; col += 1) {
        for (let row = 0; row <= BOARD_SIZE - 5; row += 1) {
            addPattern(Array.from({ length: 5 }, (_, offset) => ({ row: row + offset, col })));
        }
    }

    for (let row = 0; row <= BOARD_SIZE - 5; row += 1) {
        for (let col = 0; col <= BOARD_SIZE - 5; col += 1) {
            addPattern(Array.from({ length: 5 }, (_, offset) => ({
                row: row + offset,
                col: col + offset
            })));
        }
    }

    for (let row = 0; row <= BOARD_SIZE - 5; row += 1) {
        for (let col = 4; col < BOARD_SIZE; col += 1) {
            addPattern(Array.from({ length: 5 }, (_, offset) => ({
                row: row + offset,
                col: col - offset
            })));
        }
    }

    return { patterns, byCell };
}

function isInside(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

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

    if (player === HUMAN) {
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
    context.strokeStyle = player === HUMAN ? "rgba(0, 0, 0, 0.72)" : "rgba(74, 82, 77, 0.48)";
    context.stroke();
}

function drawLastMoveMarker(move) {
    const x = BOARD_PADDING + move.col * CELL_SIZE;
    const y = BOARD_PADDING + move.row * CELL_SIZE;

    context.beginPath();
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fillStyle = move.player === HUMAN ? "#f4dfb1" : "#3156a3";
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

function resetGame() {
    gameVersion += 1;
    board = createBoard();
    gameOver = false;
    isHumanTurn = true;
    moveCount = 0;
    lastMove = null;
    keyboardCursor = { row: 7, col: 7 };
    setStatus("你执黑棋，先手。");
    drawBoard();
}

function placeMove(row, col, player) {
    board[row][col] = player;
    moveCount += 1;
    lastMove = { row, col, player };
    keyboardCursor = { row, col };
    drawBoard();
}

function checkWinAt(row, col, player) {
    return DIRECTIONS.some(([rowStep, colStep]) => {
        let count = 1;

        for (const direction of [-1, 1]) {
            let nextRow = row + rowStep * direction;
            let nextCol = col + colStep * direction;

            while (isInside(nextRow, nextCol) && board[nextRow][nextCol] === player) {
                count += 1;
                nextRow += rowStep * direction;
                nextCol += colStep * direction;
            }
        }

        return count >= 5;
    });
}

function finishAfterMove(row, col, player) {
    if (checkWinAt(row, col, player)) {
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
    const requestedVersion = gameVersion;

    window.setTimeout(() => {
        if (requestedVersion === gameVersion && !gameOver) {
            playComputerTurn();
        }
    }, 60);
}

function playComputerTurn() {
    let move;

    if (difficultySelect.value === "hard") {
        move = getHardComputerMove();
    } else if (difficultySelect.value === "medium") {
        move = getMediumComputerMove();
    } else {
        move = getNormalComputerMove();
    }

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

function getNormalComputerMove() {
    let bestMove = null;
    let bestPrimaryScore = -1;
    let bestSecondaryScore = -1;
    let bestCenterScore = -Infinity;

    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            if (board[row][col] !== EMPTY) {
                continue;
            }

            let humanScore = 0;
            let computerScore = 0;

            patternsByCell[row][col].forEach((patternIndex) => {
                let humanCount = 0;
                let computerCount = 0;

                winPatterns[patternIndex].forEach((cell) => {
                    if (board[cell.row][cell.col] === HUMAN) {
                        humanCount += 1;
                    } else if (board[cell.row][cell.col] === COMPUTER) {
                        computerCount += 1;
                    }
                });

                if (computerCount === 0) {
                    humanScore += HUMAN_PATTERN_SCORES[humanCount] || 0;
                }

                if (humanCount === 0) {
                    computerScore += COMPUTER_PATTERN_SCORES[computerCount] || 0;
                }
            });

            const primaryScore = Math.max(humanScore, computerScore);
            const secondaryScore = Math.min(humanScore, computerScore);
            const centerScore = getCenterScore(row, col);

            if (
                primaryScore > bestPrimaryScore ||
                (primaryScore === bestPrimaryScore && secondaryScore > bestSecondaryScore) ||
                (
                    primaryScore === bestPrimaryScore &&
                    secondaryScore === bestSecondaryScore &&
                    centerScore > bestCenterScore
                )
            ) {
                bestMove = { row, col };
                bestPrimaryScore = primaryScore;
                bestSecondaryScore = secondaryScore;
                bestCenterScore = centerScore;
            }
        }
    }

    return bestMove;
}

function getCenterScore(row, col) {
    const center = Math.floor(BOARD_SIZE / 2);
    return BOARD_SIZE - Math.abs(row - center) - Math.abs(col - center);
}

function getPatternPotential(stoneCount, openEnds) {
    if (stoneCount >= 5) {
        return WIN_SCORE;
    }

    if (stoneCount === 4) {
        return 180000 + openEnds * 90000;
    }

    if (stoneCount === 3) {
        return openEnds === 2 ? 18000 : openEnds === 1 ? 4500 : 600;
    }

    if (stoneCount === 2) {
        return openEnds === 2 ? 1800 : openEnds === 1 ? 360 : 60;
    }

    return openEnds === 2 ? 40 : 10;
}

function analyzePlacedMove(row, col, player) {
    const opponent = player === HUMAN ? COMPUTER : HUMAN;
    const winningCells = new Set();
    let openFours = 0;
    let openThrees = 0;
    let splitThrees = 0;
    let openTwos = 0;

    DIRECTIONS.forEach(([rowStep, colStep]) => {
        const line = [];

        for (let offset = -4; offset <= 4; offset += 1) {
            const currentRow = row + offset * rowStep;
            const currentCol = col + offset * colStep;

            if (!isInside(currentRow, currentCol) || board[currentRow][currentCol] === opponent) {
                line.push("#");
            } else if (board[currentRow][currentCol] === player) {
                line.push("X");
            } else {
                line.push(".");
            }
        }

        const signature = line.join("");

        for (let start = 0; start <= line.length - 5; start += 1) {
            let stoneCount = 0;
            let emptyIndex = -1;
            let isAvailable = true;

            for (let index = 0; index < 5; index += 1) {
                const cell = line[start + index];

                if (cell === "#") {
                    isAvailable = false;
                    break;
                }

                if (cell === "X") {
                    stoneCount += 1;
                } else {
                    emptyIndex = index;
                }
            }

            if (isAvailable && stoneCount === 4) {
                const winningOffset = start + emptyIndex - 4;
                const winningRow = row + winningOffset * rowStep;
                const winningCol = col + winningOffset * colStep;
                winningCells.add(`${winningRow},${winningCol}`);
            }
        }

        if (signature.includes(".XXXX.")) {
            openFours += 1;
        }

        if (OPEN_THREE_PATTERNS.some((pattern) => signature.includes(pattern))) {
            openThrees += 1;
        } else if (signature.includes(".X.X.X.")) {
            splitThrees += 1;
        }

        if (OPEN_TWO_PATTERNS.some((pattern) => signature.includes(pattern))) {
            openTwos += 1;
        }
    });

    return {
        wins: checkWinAt(row, col, player),
        winningMoves: winningCells.size,
        openFours,
        openThrees,
        splitThrees,
        openTwos
    };
}

function getThreatLevel(threat) {
    if (threat.wins) {
        return 6;
    }

    if (threat.winningMoves >= 2) {
        return 5;
    }

    if (threat.winningMoves === 1) {
        return 4;
    }

    if (threat.openThrees >= 2 || (threat.openThrees >= 1 && threat.splitThrees >= 1)) {
        return 3;
    }

    if (threat.openThrees === 1 || threat.splitThrees >= 1) {
        return 2;
    }

    return threat.openTwos >= 2 ? 1 : 0;
}

function inspectMove(row, col, player) {
    if (board[row][col] !== EMPTY) {
        return {
            score: -Infinity,
            threat: {
                wins: false,
                winningMoves: 0,
                openFours: 0,
                openThrees: 0,
                splitThrees: 0,
                openTwos: 0,
                level: 0
            }
        };
    }

    const opponent = player === HUMAN ? COMPUTER : HUMAN;
    let score = getCenterScore(row, col);
    board[row][col] = player;

    try {
        const threat = analyzePlacedMove(row, col, player);
        threat.level = getThreatLevel(threat);

        if (threat.wins) {
            return { score: WIN_SCORE, threat };
        }

        if (threat.winningMoves >= 2) {
            score += 8000000 + threat.openFours * 400000;
        } else if (threat.winningMoves === 1) {
            score += 900000;
        }

        score += threat.openThrees * 52000;
        score += threat.splitThrees * 18000;
        score += threat.openTwos * 2800;

        if (threat.openThrees >= 2) {
            score += 320000;
        } else if (threat.openThrees >= 1 && threat.splitThrees >= 1) {
            score += 180000;
        }

        DIRECTIONS.forEach(([rowStep, colStep]) => {
            for (let start = -4; start <= 0; start += 1) {
                let stoneCount = 0;
                let isAvailable = true;

                for (let offset = 0; offset < 5; offset += 1) {
                    const currentRow = row + (start + offset) * rowStep;
                    const currentCol = col + (start + offset) * colStep;

                    if (!isInside(currentRow, currentCol) || board[currentRow][currentCol] === opponent) {
                        isAvailable = false;
                        break;
                    }

                    if (board[currentRow][currentCol] === player) {
                        stoneCount += 1;
                    }
                }

                if (!isAvailable) {
                    continue;
                }

                let openEnds = 0;
                const beforeRow = row + (start - 1) * rowStep;
                const beforeCol = col + (start - 1) * colStep;
                const afterRow = row + (start + 5) * rowStep;
                const afterCol = col + (start + 5) * colStep;

                if (isInside(beforeRow, beforeCol) && board[beforeRow][beforeCol] === EMPTY) {
                    openEnds += 1;
                }

                if (isInside(afterRow, afterCol) && board[afterRow][afterCol] === EMPTY) {
                    openEnds += 1;
                }

                score += getPatternPotential(stoneCount, openEnds);
            }
        });

        return { score, threat };
    } finally {
        board[row][col] = EMPTY;
    }
}

function scoreMove(row, col, player) {
    return inspectMove(row, col, player).score;
}

function getNearbyEmptyCells() {
    const candidateIndexes = new Set();
    let hasStone = false;

    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            if (board[row][col] === EMPTY) {
                continue;
            }

            hasStone = true;

            for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
                for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
                    const candidateRow = row + rowOffset;
                    const candidateCol = col + colOffset;

                    if (
                        isInside(candidateRow, candidateCol) &&
                        board[candidateRow][candidateCol] === EMPTY
                    ) {
                        candidateIndexes.add(candidateRow * BOARD_SIZE + candidateCol);
                    }
                }
            }
        }
    }

    if (!hasStone) {
        return [{ row: 7, col: 7 }];
    }

    return [...candidateIndexes].map((index) => ({
        row: Math.floor(index / BOARD_SIZE),
        col: index % BOARD_SIZE
    }));
}

function getRankedMoves(player, limit = Infinity) {
    const opponent = player === HUMAN ? COMPUTER : HUMAN;

    return getNearbyEmptyCells()
        .map((move) => {
            const attack = inspectMove(move.row, move.col, player);
            const defense = inspectMove(move.row, move.col, opponent);
            const tacticalPriority = Math.max(attack.threat.level, defense.threat.level);

            return {
                ...move,
                attackScore: attack.score,
                defenseScore: defense.score,
                attackThreat: attack.threat,
                defenseThreat: defense.threat,
                tacticalPriority,
                rankScore: attack.score + defense.score * 0.96
            };
        })
        .sort((first, second) =>
            second.tacticalPriority - first.tacticalPriority ||
            second.attackThreat.level - first.attackThreat.level ||
            second.rankScore - first.rankScore ||
            second.attackScore - first.attackScore ||
            getCenterScore(second.row, second.col) - getCenterScore(first.row, first.col))
        .slice(0, limit);
}

function isWinningMove(move, player) {
    board[move.row][move.col] = player;
    const wins = checkWinAt(move.row, move.col, player);
    board[move.row][move.col] = EMPTY;
    return wins;
}

function getImmediateWinningMoves(player) {
    return getNearbyEmptyCells().filter((move) => isWinningMove(move, player));
}

function getMediumPatternPotential(stoneCount, openEnds) {
    if (stoneCount >= 5) {
        return WIN_SCORE;
    }

    if (stoneCount === 4) {
        return 1000000 + openEnds * 180000;
    }

    if (stoneCount === 3) {
        return openEnds === 2 ? 90000 : openEnds === 1 ? 14000 : 2200;
    }

    if (stoneCount === 2) {
        return openEnds === 2 ? 4500 : openEnds === 1 ? 700 : 120;
    }

    return openEnds === 2 ? 80 : 20;
}

function getMediumMoveScore(row, col, player) {
    if (board[row][col] !== EMPTY) {
        return -Infinity;
    }

    const opponent = player === HUMAN ? COMPUTER : HUMAN;
    let score = getCenterScore(row, col);
    board[row][col] = player;

    try {
        if (checkWinAt(row, col, player)) {
            return WIN_SCORE;
        }

        DIRECTIONS.forEach(([rowStep, colStep]) => {
            for (let start = -4; start <= 0; start += 1) {
                let stoneCount = 0;
                let isAvailable = true;

                for (let offset = 0; offset < 5; offset += 1) {
                    const currentRow = row + (start + offset) * rowStep;
                    const currentCol = col + (start + offset) * colStep;

                    if (!isInside(currentRow, currentCol) || board[currentRow][currentCol] === opponent) {
                        isAvailable = false;
                        break;
                    }

                    if (board[currentRow][currentCol] === player) {
                        stoneCount += 1;
                    }
                }

                if (!isAvailable) {
                    continue;
                }

                let openEnds = 0;
                const beforeRow = row + (start - 1) * rowStep;
                const beforeCol = col + (start - 1) * colStep;
                const afterRow = row + (start + 5) * rowStep;
                const afterCol = col + (start + 5) * colStep;

                if (isInside(beforeRow, beforeCol) && board[beforeRow][beforeCol] === EMPTY) {
                    openEnds += 1;
                }

                if (isInside(afterRow, afterCol) && board[afterRow][afterCol] === EMPTY) {
                    openEnds += 1;
                }

                score += getMediumPatternPotential(stoneCount, openEnds);
            }
        });

        return score;
    } finally {
        board[row][col] = EMPTY;
    }
}

function getMediumRankedMoves(player, limit = Infinity) {
    const opponent = player === HUMAN ? COMPUTER : HUMAN;

    return getNearbyEmptyCells()
        .map((move) => {
            const attackScore = getMediumMoveScore(move.row, move.col, player);
            const defenseScore = getMediumMoveScore(move.row, move.col, opponent);
            const primaryScore = Math.max(attackScore, defenseScore);
            const secondaryScore = Math.min(attackScore, defenseScore);

            return {
                ...move,
                attackScore,
                defenseScore,
                rankScore: primaryScore + secondaryScore * 0.12
            };
        })
        .sort((first, second) =>
            second.rankScore - first.rankScore ||
            second.attackScore - first.attackScore ||
            getCenterScore(second.row, second.col) - getCenterScore(first.row, first.col))
        .slice(0, limit);
}

function getMediumComputerMove() {
    const immediateWins = getImmediateWinningMoves(COMPUTER);

    if (immediateWins.length > 0) {
        return getMediumRankedMoves(COMPUTER).find((move) =>
            immediateWins.some((winningMove) => moveMatches(move, winningMove)));
    }

    const requiredBlocks = getImmediateWinningMoves(HUMAN);

    if (requiredBlocks.length > 0) {
        return requiredBlocks
            .map((move) => ({
                ...move,
                attackScore: getMediumMoveScore(move.row, move.col, COMPUTER)
            }))
            .sort((first, second) => second.attackScore - first.attackScore)[0];
    }

    const candidates = getMediumRankedMoves(COMPUTER, 10);
    const replyDepth = moveCount < 7 ? 2 : 3;
    let bestMove = candidates[0] || null;
    let bestScore = -Infinity;
    let alpha = -Infinity;

    for (const move of candidates) {
        board[move.row][move.col] = COMPUTER;
        let score;

        try {
            score = checkWinAt(move.row, move.col, COMPUTER)
                ? WIN_SCORE
                : mediumMinimax(replyDepth, HUMAN, alpha, Infinity);
        } finally {
            board[move.row][move.col] = EMPTY;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }

        alpha = Math.max(alpha, bestScore);
    }

    return bestMove;
}

function mediumMinimax(depth, player, alpha, beta) {
    if (depth === 0) {
        return evaluateMediumBoard();
    }

    const candidateLimit = depth >= 3 ? 7 : 6;
    const candidates = getMediumRankedMoves(player, candidateLimit);

    if (candidates.length === 0) {
        return 0;
    }

    if (player === COMPUTER) {
        let bestScore = -Infinity;

        for (const move of candidates) {
            board[move.row][move.col] = COMPUTER;
            let score;

            try {
                score = checkWinAt(move.row, move.col, COMPUTER)
                    ? WIN_SCORE + depth * 1000
                    : mediumMinimax(depth - 1, HUMAN, alpha, beta);
            } finally {
                board[move.row][move.col] = EMPTY;
            }

            bestScore = Math.max(bestScore, score);
            alpha = Math.max(alpha, bestScore);

            if (beta <= alpha) {
                break;
            }
        }

        return bestScore;
    }

    let bestScore = Infinity;

    for (const move of candidates) {
        board[move.row][move.col] = HUMAN;
        let score;

        try {
            score = checkWinAt(move.row, move.col, HUMAN)
                ? -WIN_SCORE - depth * 1000
                : mediumMinimax(depth - 1, COMPUTER, alpha, beta);
        } finally {
            board[move.row][move.col] = EMPTY;
        }

        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, bestScore);

        if (beta <= alpha) {
            break;
        }
    }

    return bestScore;
}

function evaluateMediumBoard() {
    const topComputerScores = [0, 0];
    const topHumanScores = [0, 0];

    function recordScore(scores, score) {
        if (score > scores[0]) {
            scores[1] = scores[0];
            scores[0] = score;
        } else if (score > scores[1]) {
            scores[1] = score;
        }
    }

    getNearbyEmptyCells().forEach((move) => {
        recordScore(topComputerScores, getMediumMoveScore(move.row, move.col, COMPUTER));
        recordScore(topHumanScores, getMediumMoveScore(move.row, move.col, HUMAN));
    });

    return (
        topComputerScores[0] + topComputerScores[1] * 0.36 -
        topHumanScores[0] * 1.12 - topHumanScores[1] * 0.42
    );
}

function getTerminalScore(player, ply) {
    return player === COMPUTER
        ? WIN_SCORE - ply * 1000
        : -WIN_SCORE + ply * 1000;
}

function calculateSearchHash() {
    let hash = 0;

    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            const player = board[row][col];

            if (player !== EMPTY) {
                hash ^= ZOBRIST_TABLE[row][col][player - 1];
            }
        }
    }

    return hash >>> 0;
}

function placeSearchMove(move, player) {
    board[move.row][move.col] = player;
    searchHash = (searchHash ^ ZOBRIST_TABLE[move.row][move.col][player - 1]) >>> 0;
}

function removeSearchMove(move, player) {
    board[move.row][move.col] = EMPTY;
    searchHash = (searchHash ^ ZOBRIST_TABLE[move.row][move.col][player - 1]) >>> 0;
}

function checkSearchDeadline() {
    searchNodeCount += 1;

    if ((searchNodeCount & 31) === 0 && performance.now() >= searchDeadline) {
        throw SEARCH_TIMEOUT;
    }
}

function getSearchCandidateLimit(depth) {
    if (depth >= 5) {
        return 10;
    }

    if (depth === 4) {
        return 9;
    }

    if (depth === 3) {
        return 8;
    }

    return depth === 2 ? 7 : 6;
}

function getRootCandidateLimit(depth) {
    if (depth >= 6) {
        return 10;
    }

    if (depth === 5) {
        return 12;
    }

    return depth === 4 ? 15 : 18;
}

function moveMatches(first, second) {
    return first && second && first.row === second.row && first.col === second.col;
}

function prioritizeMove(candidates, preferredMove) {
    if (!preferredMove) {
        return candidates;
    }

    return [...candidates].sort((first, second) => {
        if (moveMatches(first, preferredMove)) {
            return -1;
        }

        if (moveMatches(second, preferredMove)) {
            return 1;
        }

        return 0;
    });
}

function getHardComputerMove() {
    const startedAt = performance.now();
    lastSearchStats = { depth: 0, nodes: 0, duration: 0, timedOut: false };
    const immediateWins = getImmediateWinningMoves(COMPUTER);

    if (immediateWins.length > 0) {
        const winningMove = getRankedMoves(COMPUTER).find((move) =>
            immediateWins.some((winningMove) =>
                winningMove.row === move.row && winningMove.col === move.col));
        lastSearchStats.duration = performance.now() - startedAt;
        return winningMove;
    }

    const requiredBlocks = getImmediateWinningMoves(HUMAN);

    if (requiredBlocks.length > 0) {
        const blockingMove = requiredBlocks
            .map((move) => ({ ...move, attackScore: scoreMove(move.row, move.col, COMPUTER) }))
            .sort((first, second) => second.attackScore - first.attackScore)[0];
        lastSearchStats.duration = performance.now() - startedAt;
        return blockingMove;
    }

    const candidates = getRankedMoves(COMPUTER, 18);
    let bestMove = candidates[0] || null;
    const maximumDepth = moveCount < 6 ? 5 : HARD_SEARCH_MAX_DEPTH;
    searchDeadline = startedAt + HARD_SEARCH_TIME_MS;
    searchNodeCount = 0;
    searchHash = calculateSearchHash();
    transpositionTable = new Map();

    for (let depth = 2; depth <= maximumDepth; depth += 1) {
        let iterationBestMove = bestMove;
        let iterationBestScore = -Infinity;
        let alpha = -Infinity;

        try {
            const orderedCandidates = prioritizeMove(candidates, bestMove)
                .slice(0, getRootCandidateLimit(depth));

            for (const move of orderedCandidates) {
                checkSearchDeadline();
                placeSearchMove(move, COMPUTER);
                let score;

                try {
                    score = checkWinAt(move.row, move.col, COMPUTER)
                        ? getTerminalScore(COMPUTER, 0)
                        : minimax(depth - 1, HUMAN, alpha, Infinity, 1, 2);
                } finally {
                    removeSearchMove(move, COMPUTER);
                }

                if (score > iterationBestScore) {
                    iterationBestScore = score;
                    iterationBestMove = move;
                }

                alpha = Math.max(alpha, iterationBestScore);
            }

            bestMove = iterationBestMove;
            lastSearchStats.depth = depth;

            if (iterationBestScore >= WIN_SCORE - 100000) {
                break;
            }
        } catch (error) {
            if (error !== SEARCH_TIMEOUT) {
                throw error;
            }

            lastSearchStats.timedOut = true;
            break;
        }
    }

    searchDeadline = Infinity;
    lastSearchStats.nodes = searchNodeCount;
    lastSearchStats.duration = performance.now() - startedAt;
    return bestMove;
}

function minimax(depth, player, alpha, beta, ply = 0, extensionBudget = 2) {
    checkSearchDeadline();
    const opponent = player === HUMAN ? COMPUTER : HUMAN;
    const currentWins = getImmediateWinningMoves(player);

    if (currentWins.length > 0) {
        return getTerminalScore(player, ply);
    }

    const opponentWins = getImmediateWinningMoves(opponent);

    if (opponentWins.length > 1) {
        return getTerminalScore(opponent, ply + 1);
    }

    if (depth <= 0 && extensionBudget <= 0) {
        return evaluateBoard();
    }

    const cacheKey = `${searchHash}:${player}:${extensionBudget}`;
    const cached = transpositionTable.get(cacheKey);
    const originalAlpha = alpha;
    const originalBeta = beta;

    if (cached && cached.depth >= depth) {
        if (cached.flag === TRANSPOSITION_EXACT) {
            return cached.score;
        }

        if (cached.flag === TRANSPOSITION_LOWER) {
            alpha = Math.max(alpha, cached.score);
        } else if (cached.flag === TRANSPOSITION_UPPER) {
            beta = Math.min(beta, cached.score);
        }

        if (alpha >= beta) {
            return cached.score;
        }
    }

    let candidates;
    let nextExtensionBudget = extensionBudget;

    if (opponentWins.length === 1) {
        candidates = opponentWins;

        if (depth <= 0) {
            nextExtensionBudget -= 1;
        }
    } else if (depth <= 0) {
        const forcingMoves = getRankedMoves(player, 6)
            .filter((move) => move.attackThreat.level >= 3)
            .slice(0, 4);

        if (forcingMoves.length === 0) {
            return evaluateBoard();
        }

        candidates = forcingMoves;
        nextExtensionBudget -= 1;
    } else {
        candidates = getRankedMoves(player, getSearchCandidateLimit(depth));
    }

    candidates = prioritizeMove(candidates, cached?.bestMove);

    if (candidates.length === 0) {
        return evaluateBoard();
    }

    const nextDepth = depth > 0 ? depth - 1 : 0;
    let bestMove = candidates[0];
    let bestScore;

    if (player === COMPUTER) {
        bestScore = -Infinity;

        for (const move of candidates) {
            placeSearchMove(move, COMPUTER);
            let score;

            try {
                score = checkWinAt(move.row, move.col, COMPUTER)
                    ? getTerminalScore(COMPUTER, ply)
                    : minimax(
                        nextDepth,
                        HUMAN,
                        alpha,
                        beta,
                        ply + 1,
                        nextExtensionBudget
                    );
            } finally {
                removeSearchMove(move, COMPUTER);
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            alpha = Math.max(alpha, bestScore);

            if (beta <= alpha) {
                break;
            }
        }

    } else {
        bestScore = Infinity;

        for (const move of candidates) {
            placeSearchMove(move, HUMAN);
            let score;

            try {
                score = checkWinAt(move.row, move.col, HUMAN)
                    ? getTerminalScore(HUMAN, ply)
                    : minimax(
                        nextDepth,
                        COMPUTER,
                        alpha,
                        beta,
                        ply + 1,
                        nextExtensionBudget
                    );
            } finally {
                removeSearchMove(move, HUMAN);
            }

            if (score < bestScore) {
                bestScore = score;
                bestMove = move;
            }

            beta = Math.min(beta, bestScore);

            if (beta <= alpha) {
                break;
            }
        }
    }

    let flag = TRANSPOSITION_EXACT;

    if (bestScore <= originalAlpha) {
        flag = TRANSPOSITION_UPPER;
    } else if (bestScore >= originalBeta) {
        flag = TRANSPOSITION_LOWER;
    }

    transpositionTable.set(cacheKey, { depth, score: bestScore, flag, bestMove });
    return bestScore;
}

function evaluateBoard() {
    const topComputerScores = [0, 0, 0];
    const topHumanScores = [0, 0, 0];

    function recordScore(scores, score) {
        for (let index = 0; index < scores.length; index += 1) {
            if (score > scores[index]) {
                scores.splice(index, 0, score);
                scores.pop();
                break;
            }
        }
    }

    getNearbyEmptyCells().forEach((move) => {
        recordScore(topComputerScores, scoreMove(move.row, move.col, COMPUTER));
        recordScore(topHumanScores, scoreMove(move.row, move.col, HUMAN));
    });

    return (
        topComputerScores[0] + topComputerScores[1] * 0.48 + topComputerScores[2] * 0.18 -
        topHumanScores[0] * 1.08 - topHumanScores[1] * 0.52 - topHumanScores[2] * 0.2
    );
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
difficultySelect.addEventListener("change", resetGame);
window.addEventListener("resize", () => {
    const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    if (nextPixelRatio !== pixelRatio) {
        setupCanvas();
    }
});

setupCanvas();
resetGame();
