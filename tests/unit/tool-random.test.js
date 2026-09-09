const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../../tools/shared/random.js");

function sequence(rows) {
    return { getRandomValues(values) {
        assert.ok(rows.length, "unexpected random draw");
        values.set(rows.shift());
        return values;
    } };
}

test("32-bit sampling rejects the biased tail", () => {
    const rows = [[0xffffffff], [2]];
    const random = create({ crypto: sequence(rows) });
    assert.equal(random.integer(3), 2);
    assert.equal(rows.length, 0);
});

test("53-bit sampling supports wide ranges and rejects the biased tail", () => {
    const rows = [[0x001fffff, 0xffffffff], [1, 9]];
    assert.equal(create({ crypto: sequence(rows) }).integer(0x100000001), 8);
    assert.equal(rows.length, 0);
});

test("password-grade sampling never silently falls back to Math.random", () => {
    assert.throws(() => create({ random: assert.fail }).integer(10), /安全随机数不可用/);
    assert.equal(create({ allowInsecure: true, random: () => 0.9 }).integer(10), 9);
});

test("shuffle preserves membership, leaves its input intact, and can select either endpoint", () => {
    const input = ["a", "b", "c"];
    const shuffled = create({ crypto: sequence([[0], [1]]) }).shuffle(input);
    assert.deepEqual(input, ["a", "b", "c"]);
    assert.deepEqual(shuffled, ["c", "b", "a"]);
    assert.deepEqual([...shuffled].sort(), input);
});

test("invalid integer ranges fail before requesting randomness", () => {
    const random = create({ crypto: { getRandomValues: assert.fail } });
    for (const range of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => random.integer(range), RangeError);
    }
});
