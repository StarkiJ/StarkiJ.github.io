import { searchNotes } from "./search-core.mjs";

const panel = document.querySelector(".note-search");
const input = document.querySelector("#note-search-input");
const status = document.querySelector("#note-search-status");
const results = document.querySelector("#note-search-results");
const entries = JSON.parse(document.querySelector("#note-search-data").textContent);

function render() {
    const matches = searchNotes(entries, input.value);
    results.replaceChildren();
    results.hidden = !input.value.trim();
    status.textContent = !input.value.trim() ? "" : matches.length
        ? `找到 ${matches.length} 项${matches.length > 40 ? "，显示前 40 项；可增加关键词缩小范围" : ""}`
        : "没有匹配的知识点，试试其他名称或更短的关键词。";
    const fragment = document.createDocumentFragment();
    for (const entry of matches.slice(0, 40)) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = entry.url;
        link.textContent = `${entry.title} → ${entry.label}`;
        item.append(link);
        if (entry.trail) {
            const trail = document.createElement("small");
            trail.textContent = entry.trail;
            item.append(trail);
        }
        const description = document.createElement("p");
        description.textContent = entry.description;
        item.append(description);
        fragment.append(item);
    }
    results.append(fragment);
}

input.addEventListener("input", render);
document.querySelector("#note-search-clear").addEventListener("click", () => {
    input.value = "";
    render();
    input.focus();
});
panel.hidden = false;
render();
