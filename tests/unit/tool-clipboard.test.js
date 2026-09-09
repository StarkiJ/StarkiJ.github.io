const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { createDocument } = require("../helpers/dom.js");

function loadTool(name) {
    const document = createDocument();
    const element = id => document.getElementById(id);
    element("passwordLength").value = "16";
    element("useLowercase").checked = true;
    element("oldText").value = "before\nsame";
    element("newText").value = "after\nsame";
    const navigator = {};
    const context = vm.createContext({ document, navigator, Event, window: { crypto: webcrypto, setTimeout, clearTimeout } });
    if (name === "text-diff") context.window.TextDiffCore = require("../../tools/text-diff/core.js");
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../tools", name, "script.js"), "utf8"), context);
    return { element, navigator, dispatch: (id, type) => element(id).dispatchEvent(new Event(type)) };
}

for (const name of ["password-generator", "text-diff"]) {
    for (const failure of ["unavailable", "rejected"]) {
        test(`${name}: ${failure} clipboard preserves output and permits retry`, async () => {
            const { element, navigator, dispatch } = loadTool(name);
            if (name === "text-diff") await dispatch("diffForm", "submit");
            const ids = name === "text-diff"
                ? ["diffOutput", "diffStats", "oldHighlightLayer", "newHighlightLayer"] : ["passwordOutput"];
            const before = ids.map(id => ({ text: element(id).textContent, children: [...element(id).children] }));
            if (failure === "rejected") navigator.clipboard = { writeText: async () => { throw new Error("Denied"); } };
            await dispatch("copyButton", "click");
            assert.match(element("resultCopy").textContent, /手动选中/);
            ids.forEach((id, i) => {
                assert.equal(element(id).textContent, before[i].text);
                assert.deepEqual(element(id).children, before[i].children);
            });
            let copied;
            navigator.clipboard = { writeText: async value => { copied = value; } };
            await dispatch("copyButton", "click");
            assert.equal(copied, name === "text-diff" ? "-before\n+after\n same" : before[0].text);
            assert.equal(element("copyButton").textContent, "已复制");
            assert.equal(element("resultPanel").classList.has("is-error"), false);
            assert.doesNotMatch(element("resultCopy").textContent, /失败|手动/);
        });
    }
    test(`${name}: invalid input clears the previous result`, async () => {
        const { element, dispatch } = loadTool(name);
        if (name === "text-diff") {
            await dispatch("diffForm", "submit");
            element("oldText").value = element("newText").value = "";
            await dispatch("diffForm", "submit");
            assert.equal(element("diffOutput").children.length, 0);
            assert.equal(element("diffStats").children.length, 0);
        } else {
            element("passwordLength").value = "1";
            await dispatch("passwordForm", "submit");
            assert.equal(element("passwordOutput").textContent, "");
        }
        await dispatch("copyButton", "click");
        assert.match(element("resultCopy").textContent, /请先生成/);
    });
}
