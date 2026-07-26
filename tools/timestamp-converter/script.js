const timestampInput = document.getElementById("timestampInput");
const dateTimeInput = document.getElementById("dateTimeInput");
const nowButton = document.getElementById("nowButton");
const timestampToDateButton = document.getElementById("timestampToDateButton");
const dateToTimestampButton = document.getElementById("dateToTimestampButton");
const resultPanel = document.getElementById("resultPanel");
const resultTitle = document.getElementById("resultTitle");
const resultCopy = document.getElementById("resultCopy");
const detailList = document.getElementById("detailList");

function padNumber(number) {
    return String(number).padStart(2, "0");
}

function formatForDateTimeInput(date) {
    return [
        date.getFullYear(),
        "-",
        padNumber(date.getMonth() + 1),
        "-",
        padNumber(date.getDate()),
        "T",
        padNumber(date.getHours()),
        ":",
        padNumber(date.getMinutes()),
        ":",
        padNumber(date.getSeconds())
    ].join("");
}

function showError(message) {
    resultPanel.hidden = false;
    resultPanel.classList.add("is-error");
    resultTitle.textContent = "需要再检查一下";
    resultCopy.textContent = message;
    detailList.replaceChildren();
}

function showDetails(summary, rows) {
    const items = rows.map(([label, value]) => {
        const item = document.createElement("div");
        const name = document.createElement("span");
        const content = document.createElement("strong");

        item.className = "detail-item";
        name.textContent = label;
        content.textContent = value;
        item.append(name, content);
        return item;
    });

    resultPanel.hidden = false;
    resultPanel.classList.remove("is-error");
    resultTitle.textContent = "转换结果";
    resultCopy.textContent = summary;
    detailList.replaceChildren(...items);
}

function fillCurrentTime() {
    const now = new Date();

    timestampInput.value = Math.floor(now.getTime() / 1000);
    dateTimeInput.value = formatForDateTimeInput(now);
    showDetails("已经填入当前时间。", [
        ["秒级时间戳", String(Math.floor(now.getTime() / 1000))],
        ["毫秒级时间戳", String(now.getTime())],
        ["本地时间", now.toLocaleString()]
    ]);
}

function convertTimestampToDate() {
    const rawValue = timestampInput.value.trim();

    if (!/^-?\d+$/.test(rawValue)) {
        showError("请输入整数时间戳。");
        return;
    }

    const numberValue = Number(rawValue);
    const digitCount = rawValue.replace(/^-?0+(?=\d)/, "").replace("-", "").length;
    const milliseconds = digitCount <= 10 ? numberValue * 1000 : numberValue;
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
        showError("这个时间戳无法转换。");
        return;
    }

    dateTimeInput.value = formatForDateTimeInput(date);
    showDetails("已根据时间戳生成日期。", [
        ["本地时间", date.toLocaleString()],
        ["ISO 时间", date.toISOString()],
        ["秒级时间戳", String(Math.floor(date.getTime() / 1000))],
        ["毫秒级时间戳", String(date.getTime())]
    ]);
}

function convertDateToTimestamp() {
    if (!dateTimeInput.value) {
        showError("请选择一个日期时间。");
        return;
    }

    const date = new Date(dateTimeInput.value);

    if (Number.isNaN(date.getTime())) {
        showError("这个日期时间无法转换。");
        return;
    }

    timestampInput.value = Math.floor(date.getTime() / 1000);
    showDetails("已根据日期生成时间戳。", [
        ["秒级时间戳", String(Math.floor(date.getTime() / 1000))],
        ["毫秒级时间戳", String(date.getTime())],
        ["本地时间", date.toLocaleString()],
        ["ISO 时间", date.toISOString()]
    ]);
}

nowButton.addEventListener("click", fillCurrentTime);
timestampToDateButton.addEventListener("click", convertTimestampToDate);
dateToTimestampButton.addEventListener("click", convertDateToTimestamp);
fillCurrentTime();
