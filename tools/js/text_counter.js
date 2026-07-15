const sourceText = document.getElementById("sourceText");
const clearButton = document.getElementById("clearButton");
const charCount = document.getElementById("charCount");
const charNoSpaceCount = document.getElementById("charNoSpaceCount");
const wordCount = document.getElementById("wordCount");
const lineCount = document.getElementById("lineCount");
const paragraphCount = document.getElementById("paragraphCount");
const graphemeSegmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh-CN", { granularity: "grapheme" })
    : null;
let statsFrameId = 0;

function countCharacters(text) {
    if (!graphemeSegmenter) {
        return Array.from(text).length;
    }

    let count = 0;

    for (const segment of graphemeSegmenter.segment(text)) {
        count += 1;
    }

    return count;
}

function updateStats() {
    const text = sourceText.value;
    const trimmedText = text.trim();
    const chineseCharacters = text.match(/\p{Script=Han}/gu) || [];
    const latinWords = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) || [];
    const lines = trimmedText ? text.split(/\r\n|\r|\n/).length : 0;
    const paragraphs = trimmedText ? trimmedText.split(/\n\s*\n/).filter(Boolean).length : 0;

    charCount.textContent = countCharacters(text);
    charNoSpaceCount.textContent = countCharacters(text.replace(/\s/gu, ""));
    wordCount.textContent = chineseCharacters.length + latinWords.length;
    lineCount.textContent = lines;
    paragraphCount.textContent = paragraphs;
}

function scheduleStatsUpdate() {
    window.cancelAnimationFrame(statsFrameId);
    statsFrameId = window.requestAnimationFrame(() => {
        statsFrameId = 0;
        updateStats();
    });
}

clearButton.addEventListener("click", () => {
    window.cancelAnimationFrame(statsFrameId);
    statsFrameId = 0;
    sourceText.value = "";
    sourceText.focus();
    updateStats();
});

sourceText.addEventListener("input", scheduleStatsUpdate);
updateStats();
