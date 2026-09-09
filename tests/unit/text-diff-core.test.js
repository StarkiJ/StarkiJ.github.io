const { test } = require("node:test");
const assert = require("node:assert/strict");
const { splitLines, buildLineDiff, buildCharacterDiff, annotateInlineDifferences } = require("../../tools/text-diff/core.js");

test("line splitting preserves empty lines while normalizing newline formats", () => {
    assert.deepEqual(splitLines("a\r\nb\rc\n"), ["a", "b", "c", ""]);
    assert.deepEqual(splitLines(""), []);
});

test("diff reconstructs both inputs and keeps the longest common subsequence", () => {
    const cases = [
        [[], ["added"], 0],
        [["removed"], [], 0],
        [["a", "b", "c"], ["a", "x", "c"], 2],
        [["a", "b", "a"], ["b", "a", "b"], 2],
        [["", "same", ""], ["", "same", ""], 3]
    ];
    for (const [before, after, common] of cases) {
        const result = annotateInlineDifferences(buildLineDiff(before, after));
        assert.deepEqual(result.filter(line => line.type !== "add").map(line => line.value), before);
        assert.deepEqual(result.filter(line => line.type !== "delete").map(line => line.value), after);
        assert.equal(result.filter(line => line.type === "context").length, common);
    }
});

test("character differences retain Unicode characters and isolate a replacement", () => {
    const result = buildCharacterDiff("你好🙂甲", "你好🙂乙");
    assert.equal(result.score, 3);
    assert.deepEqual(result.oldParts, [{ text: "你好🙂", type: "same" }, { text: "甲", type: "change" }]);
    assert.deepEqual(result.newParts, [{ text: "你好🙂", type: "same" }, { text: "乙", type: "change" }]);
});

test("unequal change blocks pair similar lines and leave unrelated additions intact", () => {
    const result = annotateInlineDifferences(buildLineDiff(["hello world"], ["hello there", "unrelated"]));
    const removed = result.find(line => line.type === "delete");
    const related = result.find(line => line.value === "hello there");
    assert.equal(removed.parts.map(part => part.text).join(""), "hello world");
    assert.equal(related.parts.map(part => part.text).join(""), "hello there");
    assert.equal(result.find(line => line.value === "unrelated").parts, undefined);
});

test("large inputs retain the existing bounded allocation and character fallback", () => {
    assert.throws(() => buildLineDiff(Array(2000).fill("x"), Array(2000).fill("x")), /分段/);
    const text = "x".repeat(1000);
    const result = buildCharacterDiff(text, text);
    assert.deepEqual(result.oldParts, [{ text, type: "change" }]);
    assert.equal(result.score, 0);
});
