const { test } = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../../games/gobang/rules.js");
const { createSearch } = require("../../games/gobang/ai.js");
const { createBoard, checkWinAt, HUMAN, COMPUTER } = rules;

test("wins work in all four directions and at the board edge", () => {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const board = createBoard();
        const startCol = dc < 0 ? 14 : 0;
        for (let i = 0; i < 4; i++) { board[i * dr][startCol + i * dc] = HUMAN; }
        assert.equal(checkWinAt(board, 0, startCol, HUMAN), false);
        board[4 * dr][startCol + 4 * dc] = HUMAN;
        assert.equal(checkWinAt(board, 0, startCol, HUMAN), true);
        assert.equal(checkWinAt(board, 0, startCol, COMPUTER), false);
    }
    assert.equal(checkWinAt(createBoard(), 7, 7, HUMAN), false);
});

for (const difficulty of ["normal", "medium", "hard"]) {
    test(`${difficulty} AI takes a winning move and leaves the supplied board unchanged`, () => {
        const board = createBoard();
        for (let col = 3; col < 7; col++) { board[7][col] = COMPUTER; }
        board[7][2] = HUMAN;
        const before = JSON.stringify(board);
        const move = createSearch().chooseMove(board, difficulty);
        assert.equal(move.row, 7);
        assert.equal(move.col, 7);
        assert.equal(JSON.stringify(board), before);
    });
    test(`${difficulty} AI blocks an immediate loss`, () => {
        const board = createBoard();
        for (let row = 0; row < 4; row++) { board[row][0] = HUMAN; }
        const move = createSearch().chooseMove(board, difficulty);
        assert.equal(move.row, 4);
        assert.equal(move.col, 0);
    });
}

test("hard search returns a legal fallback on timeout and never changes its input", () => {
    const board = createBoard();
    board[7][7] = HUMAN;
    board[7][8] = COMPUTER;
    const before = JSON.stringify(board);
    let elapsed = 0;
    const search = createSearch({ timeBudgetMs: 1, now: () => (elapsed += 1000) });
    const move = search.chooseMove(board, "hard");
    assert.equal(board[move.row][move.col], 0);
    assert.equal(JSON.stringify(board), before);
    assert.equal(search.getLastSearchStats().timedOut, true);
});

test("a full board has no legal move and an empty board starts at the center", () => {
    const search = createSearch();
    assert.deepEqual(search.chooseMove(createBoard(), "normal"), { row: 7, col: 7 });
    assert.equal(search.chooseMove(createBoard().map(row => row.fill(HUMAN)), "normal"), null);
});
