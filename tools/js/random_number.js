const form = document.getElementById("randomNumberForm");
const resultPanel = document.getElementById("resultPanel");
const resultTitle = document.getElementById("resultTitle");
const resultCopy = document.getElementById("resultCopy");
const randomNumberContainer = document.getElementById("randomNumberContainer");
const maxResultCount = 1000;
const safeIntegerRange = 0x20000000000000;
const randomValues = new Uint32Array(2);

function showError(message) {
    resultPanel.hidden = false;
    resultPanel.classList.add("is-error");
    resultTitle.textContent = "需要再检查一下";
    resultCopy.textContent = message;
    randomNumberContainer.replaceChildren();
}

function showNumbers(numbers, minValue, maxValue, allowDuplicates) {
    const chips = numbers.map((number) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = number;
        return chip;
    });

    resultPanel.hidden = false;
    resultPanel.classList.remove("is-error");
    resultTitle.textContent = "随机数";
    resultCopy.textContent = `范围 ${minValue} 到 ${maxValue}，共 ${numbers.length} 个，${allowDuplicates ? "允许重复" : "不允许重复"}。`;
    randomNumberContainer.replaceChildren(...chips);
}

function getRandomOffset(range) {
    if (!window.crypto || !window.crypto.getRandomValues) {
        return Math.floor(Math.random() * range);
    }

    const unbiasedLimit = safeIntegerRange - (safeIntegerRange % range);
    let randomValue;

    do {
        window.crypto.getRandomValues(randomValues);
        randomValue = (randomValues[0] & 0x001fffff) * 0x100000000 + randomValues[1];
    } while (randomValue >= unbiasedLimit);

    return randomValue % range;
}

function sampleUniqueNumbers(minValue, range, count) {
    const swaps = new Map();
    const numbers = [];

    for (let index = 0; index < count; index += 1) {
        const remaining = range - index;
        const randomOffset = getRandomOffset(remaining);
        const selectedOffset = swaps.has(randomOffset) ? swaps.get(randomOffset) : randomOffset;
        const lastOffset = remaining - 1;
        const replacementOffset = swaps.has(lastOffset) ? swaps.get(lastOffset) : lastOffset;

        swaps.set(randomOffset, replacementOffset);
        numbers.push(minValue + selectedOffset);
    }

    return numbers;
}

function generateRandomNumbers(event) {
    event.preventDefault();

    const minValue = Number(document.getElementById("minValue").value);
    const maxValue = Number(document.getElementById("maxValue").value);
    const count = Number(document.getElementById("count").value);
    const allowDuplicates = document.getElementById("allowDuplicates").value === "true";

    if (!Number.isSafeInteger(minValue) || !Number.isSafeInteger(maxValue) || !Number.isInteger(count) || count <= 0) {
        showError("请输入有效的数值范围和生成个数。");
        return;
    }

    if (count > maxResultCount) {
        showError(`一次最多生成 ${maxResultCount} 个随机数。`);
        return;
    }

    if (minValue > maxValue) {
        showError("最小值不能大于最大值。");
        return;
    }

    const range = maxValue - minValue + 1;

    if (!Number.isSafeInteger(range) || range <= 0) {
        showError("数值范围过大，请缩小后重试。");
        return;
    }

    if (!allowDuplicates && count > range) {
        showError("不允许重复时，生成个数不能超过可选数字总数。");
        return;
    }

    let numbers = [];

    if (allowDuplicates) {
        for (let index = 0; index < count; index += 1) {
            numbers.push(getRandomOffset(range) + minValue);
        }
    } else {
        numbers = sampleUniqueNumbers(minValue, range, count);
    }

    showNumbers(numbers, minValue, maxValue, allowDuplicates);
}

form.addEventListener("submit", generateRandomNumbers);
