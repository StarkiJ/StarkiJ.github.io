(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    if (root) { root.TextDiffCore = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const maxInlineDiffCellsPerBlock = 2000000;
    const maxLinePairComparisons = 400;

    function buildLcsTable(left, right) {
        const rowCount = left.length + 1;
        const columnCount = right.length + 1;
        const cellCount = rowCount * columnCount;
        const table = new Uint32Array(cellCount);

        for (let row = 1; row < rowCount; row += 1) {
            for (let column = 1; column < columnCount; column += 1) {
                const currentIndex = row * columnCount + column;

                if (left[row - 1] === right[column - 1]) {
                    table[currentIndex] = table[(row - 1) * columnCount + column - 1] + 1;
                } else {
                    table[currentIndex] = Math.max(
                        table[(row - 1) * columnCount + column],
                        table[row * columnCount + column - 1]
                    );
                }
            }
        }

        return table;
    }

    function splitLines(text) {
        if (!text) {
            return [];
        }

        return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    }

    function buildCharacterDiff(oldText, newText) {
        const oldChars = Array.from(oldText);
        const newChars = Array.from(newText);
        const rowCount = oldChars.length + 1;
        const columnCount = newChars.length + 1;
        const cellCount = rowCount * columnCount;
        const maxCells = 1000000;

        if (cellCount > maxCells) {
            return {
                oldParts: [{ text: oldText || " ", type: "change" }],
                newParts: [{ text: newText || " ", type: "change" }],
                score: 0
            };
        }

        const table = buildLcsTable(oldChars, newChars);

        const oldParts = [];
        const newParts = [];
        let row = oldChars.length;
        let column = newChars.length;

        function pushPart(parts, text, type) {
            if (!text) {
                return;
            }

            const previousPart = parts[parts.length - 1];

            if (previousPart && previousPart.type === type) {
                previousPart.text = `${text}${previousPart.text}`;
            } else {
                parts.push({ text, type });
            }
        }

        while (row > 0 && column > 0) {
            if (oldChars[row - 1] === newChars[column - 1]) {
                pushPart(oldParts, oldChars[row - 1], "same");
                pushPart(newParts, newChars[column - 1], "same");
                row -= 1;
                column -= 1;
            } else if (table[(row - 1) * columnCount + column] > table[row * columnCount + column - 1]) {
                pushPart(oldParts, oldChars[row - 1], "change");
                row -= 1;
            } else {
                pushPart(newParts, newChars[column - 1], "change");
                column -= 1;
            }
        }

        while (row > 0) {
            pushPart(oldParts, oldChars[row - 1], "change");
            row -= 1;
        }

        while (column > 0) {
            pushPart(newParts, newChars[column - 1], "change");
            column -= 1;
        }

        oldParts.reverse();
        newParts.reverse();

        return {
            oldParts: oldParts.length ? oldParts : [{ text: " ", type: "change" }],
            newParts: newParts.length ? newParts : [{ text: " ", type: "change" }],
            score: table[oldChars.length * columnCount + newChars.length]
        };
    }

    function pairChangedLines(changeBlock) {
        const deletedLines = changeBlock.filter((line) => line.type === "delete");
        const addedLines = changeBlock.filter((line) => line.type === "add");
        const usedAddedLines = new Set();
        let remainingCellBudget = maxInlineDiffCellsPerBlock;

        function takeCharacterDiff(deletedLine, addedLine) {
            const oldLength = Array.from(deletedLine.value).length;
            const newLength = Array.from(addedLine.value).length;
            const cellCount = (oldLength + 1) * (newLength + 1);

            if (cellCount > remainingCellBudget) {
                return null;
            }

            remainingCellBudget -= cellCount;
            return {
                diff: buildCharacterDiff(deletedLine.value, addedLine.value),
                maxLength: Math.max(oldLength, newLength)
            };
        }

        function applyCharacterDiff(deletedLine, addedLine, characterDiff) {
            deletedLine.parts = characterDiff.oldParts;
            addedLine.parts = characterDiff.newParts;
        }

        if (
            deletedLines.length === addedLines.length ||
            deletedLines.length * addedLines.length > maxLinePairComparisons
        ) {
            const pairCount = Math.min(deletedLines.length, addedLines.length);

            for (let index = 0; index < pairCount; index += 1) {
                const deletedLine = deletedLines[index];
                const addedLine = addedLines[index];
                const candidate = takeCharacterDiff(deletedLine, addedLine);

                if (!candidate) {
                    break;
                }

                applyCharacterDiff(deletedLine, addedLine, candidate.diff);
            }
            return;
        }

        for (const deletedLine of deletedLines) {
            let bestAddedLine = null;
            let bestScore = 0;
            let bestCharacterDiff = null;

            for (const addedLine of addedLines) {
                if (usedAddedLines.has(addedLine)) {
                    continue;
                }

                const candidate = takeCharacterDiff(deletedLine, addedLine);

                if (!candidate) {
                    break;
                }

                const score = candidate.maxLength === 0
                    ? 1
                    : candidate.diff.score / candidate.maxLength;

                if (score > bestScore) {
                    bestScore = score;
                    bestAddedLine = addedLine;
                    bestCharacterDiff = candidate.diff;
                }
            }

            if (bestAddedLine && bestCharacterDiff && bestScore >= 0.35) {
                applyCharacterDiff(deletedLine, bestAddedLine, bestCharacterDiff);
                usedAddedLines.add(bestAddedLine);
            }
        }
    }

    function annotateInlineDifferences(diffLines) {
        let changeBlock = [];

        function flushChangeBlock() {
            if (changeBlock.length > 0) {
                pairChangedLines(changeBlock);
                changeBlock = [];
            }
        }

        diffLines.forEach((line) => {
            if (line.type === "context") {
                flushChangeBlock();
            } else {
                changeBlock.push(line);
            }
        });

        flushChangeBlock();
        return diffLines;
    }

    function buildLineDiff(oldLines, newLines) {
        const rowCount = oldLines.length + 1;
        const columnCount = newLines.length + 1;
        const cellCount = rowCount * columnCount;
        const maxCells = 4000000;

        if (cellCount > maxCells) {
            throw new Error("文本太长了，请分段对比。");
        }

        const table = buildLcsTable(oldLines, newLines);

        const diffLines = [];
        let row = oldLines.length;
        let column = newLines.length;

        while (row > 0 && column > 0) {
            if (oldLines[row - 1] === newLines[column - 1]) {
                diffLines.push({ type: "context", value: oldLines[row - 1] });
                row -= 1;
                column -= 1;
            } else if (table[(row - 1) * columnCount + column] > table[row * columnCount + column - 1]) {
                diffLines.push({ type: "delete", value: oldLines[row - 1] });
                row -= 1;
            } else {
                diffLines.push({ type: "add", value: newLines[column - 1] });
                column -= 1;
            }
        }

        while (row > 0) {
            diffLines.push({ type: "delete", value: oldLines[row - 1] });
            row -= 1;
        }

        while (column > 0) {
            diffLines.push({ type: "add", value: newLines[column - 1] });
            column -= 1;
        }

        return diffLines.reverse();
    }

    return { splitLines, buildLineDiff, buildCharacterDiff, annotateInlineDifferences };
}));
