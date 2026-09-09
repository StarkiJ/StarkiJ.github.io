const form = document.getElementById("groupForm");
const resultPanel = document.getElementById("resultPanel");
const resultTitle = document.getElementById("resultTitle");
const resultCopy = document.getElementById("resultCopy");
const groupContainer = document.getElementById("groupContainer");
const maxPeople = 500;
const random = window.ToolRandom.create({ crypto: window.crypto, allowInsecure: true });

function showError(message) {
    resultPanel.hidden = false;
    resultPanel.classList.add("is-error");
    resultTitle.textContent = "需要再检查一下";
    resultCopy.textContent = message;
    groupContainer.replaceChildren();
}

function getNames() {
    return document.getElementById("names").value
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean);
}

function renderGroups(groups, peopleCount) {
    const groupBoxes = groups.map((group, index) => {
        const box = document.createElement("article");
        const title = document.createElement("h3");
        const list = document.createElement("ul");

        box.className = "group-box";
        title.textContent = `第 ${index + 1} 组`;
        list.className = "group-list";

        group.forEach((person) => {
            const item = document.createElement("li");
            item.textContent = person;
            list.appendChild(item);
        });

        box.append(title, list);
        return box;
    });

    resultPanel.hidden = false;
    resultPanel.classList.remove("is-error");
    resultTitle.textContent = "分组结果";
    resultCopy.textContent = `共 ${peopleCount} 人，分成 ${groups.length} 组。`;
    groupContainer.replaceChildren(...groupBoxes);
}

function generateGroups(event) {
    event.preventDefault();

    const numPeople = Number(document.getElementById("numPeople").value);
    const numGroups = Number(document.getElementById("numGroups").value);
    const names = getNames();

    if (!Number.isInteger(numGroups) || numGroups <= 0 || numGroups > maxPeople) {
        showError(`组数需要在 1 到 ${maxPeople} 之间。`);
        return;
    }

    if (names.length === 0 && (!Number.isInteger(numPeople) || numPeople <= 0 || numPeople > maxPeople)) {
        showError(`未填写名单时，人数需要在 1 到 ${maxPeople} 之间。`);
        return;
    }

    if (names.length > maxPeople) {
        showError(`名单最多支持 ${maxPeople} 人。`);
        return;
    }

    const people = random.shuffle(names.length > 0
        ? names
        : Array.from({ length: numPeople }, (_, index) => `成员 ${index + 1}`));

    if (numGroups > people.length) {
        showError("组数不能大于成员人数。");
        return;
    }

    const groups = Array.from({ length: numGroups }, () => []);

    people.forEach((person, index) => {
        groups[index % numGroups].push(person);
    });

    renderGroups(groups, people.length);
}

form.addEventListener("submit", generateGroups);
