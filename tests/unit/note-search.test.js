const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

test("note search handles blank input, aliases, case, multiple terms and relevance", async () => {
    const { searchNotes } = await import("../../notes/search-core.mjs");
    const entries = [
        { title: "C++ 核心", label: "对象生命周期", trail: "资源管理", description: "借用对象可能产生悬垂引用。", url: "lifetime" },
        { title: "编译器", label: "OSR 与反优化", trail: "动态编译", description: "恢复执行状态。", url: "deopt" },
        { title: "GC", label: "安全点与根扫描", trail: "并发", description: "引用位置由元数据描述。", url: "stw" },
        { title: "另一篇", label: "术语对照", trail: "", description: "提及 OSR 与反优化。", url: "mention" }
    ];
    assert.deepEqual(searchNotes(entries, " \n "), []);
    assert.deepEqual(searchNotes(entries, "C++ UAF").map(item => item.url), ["lifetime"]);
    assert.deepEqual(searchNotes(entries, "ＯＯＰＭＡＰ").map(item => item.url), ["stw"]);
    assert.equal(searchNotes(entries, "DeOpTiMiZaTiOn")[0].url, "deopt");
    assert.equal(searchNotes(entries, "反优化")[0].url, "deopt");
    assert.deepEqual(searchNotes(entries, "编译器 悬垂"), []);
    assert.deepEqual(searchNotes(entries, "<img onerror=alert(1)>"), []);
});

test("generated search results target published chapters and omit deleted notes", async () => {
    const { workspace, notes } = await import("../../scripts/lib/site.mjs");
    const { parseHtml } = await import("../../scripts/lib/html.mjs");
    const { searchNotes } = await import("../../notes/search-core.mjs");
    const html = await readFile(path.join(workspace, "notes/index.html"), "utf8");
    const document = parseHtml(html);
    const data = document.nodes.find(node => node.attributes.id === "note-search-data");
    const entries = JSON.parse(html.slice(data.contentStart, data.contentEnd));
    const destinations = new Set();
    for (const note of notes) {
        const source = await readFile(path.join(workspace, "notes", note.slug, "index.html"), "utf8");
        const url = `./${note.slug}/index.html`;
        destinations.add(url);
        for (const node of parseHtml(source).nodes) if (node.attributes.id) destinations.add(`${url}#${node.attributes.id}`);
    }
    assert.equal(new Set(entries.map(entry => entry.url)).size, entries.length);
    for (const entry of entries) {
        assert.ok(destinations.has(entry.url), `Missing search destination: ${entry.url}`);
        assert.ok(entry.description, `Empty description: ${entry.url}`);
        assert.ok(!entry.url.includes("cpp-memory-diagnostics"));
    }
    for (const query of ["OopMap", "反优化", "悬垂引用", "DNS", "false sharing"]) {
        assert.ok(searchNotes(entries, query).length > 0, `No result for ${query}`);
    }
    assert.ok(!html.includes("readingPaths") && !html.includes("note-paths"));
});
