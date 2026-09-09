(function (root, factory) {
    const commonJs = typeof module === "object" && module.exports;
    const api = factory();
    if (commonJs) { module.exports = api; }
    if (root) { root.GobangRules = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function (rules) {
    "use strict";

    const BOARD_SIZE = 15;
    const EMPTY = 0;
    const HUMAN = 1;
    const COMPUTER = 2;
    const DIRECTIONS = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
    ];
    function createBoard() {
        return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
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

    function checkWinAt(board, row, col, player) {
        if (!isInside(row, col) || board[row][col] !== player || player === EMPTY) { return false; }
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

    return { BOARD_SIZE, EMPTY, HUMAN, COMPUTER, DIRECTIONS, createBoard, buildWinPatterns, isInside, checkWinAt };
}));
