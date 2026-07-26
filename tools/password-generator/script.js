const characterSets = {
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    numbers: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.<>?"
};
const similarCharacters = /[0Ool1I]/g;
const form = document.getElementById("passwordForm");
const copyButton = document.getElementById("copyButton");
const resultPanel = document.getElementById("resultPanel");
const resultTitle = document.getElementById("resultTitle");
const resultCopy = document.getElementById("resultCopy");
const passwordOutput = document.getElementById("passwordOutput");
const uint32Range = 0x100000000;

function getRandomIndex(max) {
    if (!window.crypto || !window.crypto.getRandomValues) {
        throw new Error("安全随机数不可用");
    }

    const randomValues = new Uint32Array(1);
    const unbiasedLimit = uint32Range - (uint32Range % max);

    do {
        window.crypto.getRandomValues(randomValues);
    } while (randomValues[0] >= unbiasedLimit);

    return randomValues[0] % max;
}

function pickOne(characters) {
    return characters[getRandomIndex(characters.length)];
}

function shuffleCharacters(characters) {
    const shuffled = [...characters];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = getRandomIndex(index + 1);
        [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    return shuffled.join("");
}

function showError(message) {
    resultPanel.hidden = false;
    resultPanel.classList.add("is-error");
    resultTitle.textContent = "需要再检查一下";
    resultCopy.textContent = message;
    passwordOutput.textContent = "";
}

function getSelectedSets() {
    const avoidSimilar = document.getElementById("avoidSimilar").checked;
    const selectedSets = [];

    [
        ["useLowercase", characterSets.lowercase],
        ["useUppercase", characterSets.uppercase],
        ["useNumbers", characterSets.numbers],
        ["useSymbols", characterSets.symbols]
    ].forEach(([id, characters]) => {
        if (document.getElementById(id).checked) {
            const filtered = avoidSimilar ? characters.replace(similarCharacters, "") : characters;

            if (filtered) {
                selectedSets.push(filtered);
            }
        }
    });

    return selectedSets;
}

function generatePassword(event) {
    event.preventDefault();

    const passwordLength = Number(document.getElementById("passwordLength").value);
    const selectedSets = getSelectedSets();

    if (!Number.isInteger(passwordLength) || passwordLength < 4 || passwordLength > 64) {
        showError("密码长度需要在 4 到 64 之间。");
        return;
    }

    if (selectedSets.length === 0) {
        showError("请至少选择一种字符类型。");
        return;
    }

    if (selectedSets.length > passwordLength) {
        showError("密码长度不能小于已选择的字符类型数量。");
        return;
    }

    const allCharacters = selectedSets.join("");
    let passwordCharacters;

    try {
        passwordCharacters = selectedSets.map(pickOne);

        while (passwordCharacters.length < passwordLength) {
            passwordCharacters.push(pickOne(allCharacters));
        }

        passwordOutput.textContent = shuffleCharacters(passwordCharacters);
    } catch (error) {
        showError("当前环境无法提供安全随机数，请改用最新版浏览器并通过 HTTPS 访问。");
        return;
    }

    resultPanel.hidden = false;
    resultPanel.classList.remove("is-error");
    resultTitle.textContent = "生成结果";
    resultCopy.textContent = `长度 ${passwordLength}，使用了 ${selectedSets.length} 种字符类型。`;
    copyButton.textContent = "复制密码";
}

async function copyPassword() {
    const password = passwordOutput.textContent;

    if (!password) {
        showError("请先生成一个密码。");
        return;
    }

    if (!navigator.clipboard) {
        showError("当前浏览器不支持自动复制，请手动选中密码复制。");
        return;
    }

    try {
        await navigator.clipboard.writeText(password);
        copyButton.textContent = "已复制";
    } catch (error) {
        showError("复制失败了，请手动选中密码复制。");
    }
}

form.addEventListener("submit", generatePassword);
copyButton.addEventListener("click", copyPassword);
form.dispatchEvent(new Event("submit"));
