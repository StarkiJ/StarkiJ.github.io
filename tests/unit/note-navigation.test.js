const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const vm = require("node:vm");
const path = require("node:path");

test("note navigation preserves chapter links across mobile collapse, controls and hash changes", async () => {
    const script = await readFile(path.join(__dirname, "../../notes/note-navigation.js"), "utf8");
    for (const mobile of [false, true]) {
        const handlers = {};
        const panel = { open: true };
        const part = { tagName: "DETAILS", open: true, parentElement: panel };
        const chapter = { tagName: "DETAILS", open: false, parentElement: part };
        const controls = { hidden: true };
        const link = { hash: "#detail", parentElement: chapter, attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            removeAttribute(name) { delete this.attributes[name]; } };
        const button = name => ({ addEventListener(event, handler) { handlers[name] = handler; } });
        const elements = { ".note-toc-panel": panel, ".note-toc-controls": controls,
            "[data-toc-expand]": button("expand"), "[data-toc-collapse]": button("collapse") };
        const toc = { querySelector: selector => elements[selector], querySelectorAll: selector =>
            selector === ".note-toc-branch" ? [part, chapter] : selector === "a" ? [link] : link.attributes["aria-current"] ? [link] : [] };
        const context = { document: { querySelector: () => toc }, location: { hash: "" },
            window: { matchMedia: () => ({ matches: mobile }), addEventListener(event, handler) { handlers[event] = handler; } } };
        vm.runInNewContext(script, context);
        assert.equal(panel.open, !mobile);
        assert.equal(controls.hidden, false);
        handlers.expand();
        assert.equal(chapter.open, true);
        handlers.collapse();
        assert.equal(part.open, true);
        assert.equal(chapter.open, false);
        context.location.hash = "#detail";
        handlers.hashchange();
        assert.equal(chapter.open, true);
        assert.equal(link.attributes["aria-current"], "location");
        assert.equal(panel.open, !mobile);
        context.location.hash = "#%ZZ";
        assert.doesNotThrow(handlers.hashchange);
        assert.equal(link.attributes["aria-current"], undefined);
    }
});
