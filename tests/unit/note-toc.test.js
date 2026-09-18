const { test } = require("node:test");
const assert = require("node:assert/strict");

test("note directories preserve chapter/lesson bookmarks and nested sibling structure", async () => {
    const { noteToc } = await import("../../scripts/lib/note-toc.mjs");
    const { parseHtml } = await import("../../scripts/lib/html.mjs");
    const html = noteToc(`<header><h2 id="outside">Outside</h2></header><div class="note-body">
        <section id="part"><h2 id="part-title">Part</h2>
            <section id="chapter"><h3 id="chapter-title">Chapter</h3>
                <div class="note-lesson" id="old-q14"><span id="alias"></span><h4>Copy <code>T&amp;</code></h4></div>
                <h4 id="moving">Move</h4>
            </section>
            <section id="sibling"><h3>Sibling</h3></section>
        </section><section id="end"><h2>End</h2></section></div>`);
    const { nodes, errors } = parseHtml(html);
    assert.deepEqual(errors, []);
    const links = nodes.filter(node => node.tag === "a");
    assert.deepEqual(links.map(node => node.attributes.href), ["#part", "#chapter", "#old-q14", "#moving", "#sibling", "#end"]);
    const depth = node => { let result = 0; for (let p = node.parent; p; p = p.parent) if (p.tag === "ol") result++; return result; };
    assert.deepEqual(links.map(depth), [1, 2, 3, 3, 2, 1]);
    assert.match(html, /Copy T&amp;/);
});

test("note directories omit hidden example headings and escaped source markup", async () => {
    const { noteToc } = await import("../../scripts/lib/note-toc.mjs");
    const html = noteToc(`<div class="note-body"><section id="topic"><h2>Topic</h2>
        <details><summary>Example</summary><h4>main.cpp</h4></details>
        <div hidden><h3>Hidden</h3></div>
        <pre><code>&lt;h3 id="fake"&gt;Source&lt;/h3&gt;</code></pre>
        <h3 id="visible">Visible &lt;T&gt;</h3></section></div>`);
    assert.doesNotMatch(html, /main\.cpp|Hidden|Source|fake/);
    assert.match(html, /href="#visible">Visible &lt;T&gt;/);
});

test("note directories reject ambiguous or missing subsection destinations", async () => {
    const { noteToc } = await import("../../scripts/lib/note-toc.mjs");
    for (const headings of ["<h3>No anchor</h3>", '<h3 id="topic">Duplicate</h3>']) {
        assert.throws(() => noteToc(`<div class="note-body"><section id="topic"><h2>Topic</h2>${headings}</section></div>`), /anchor/);
    }
    assert.throws(() => noteToc('<div class="note-body"></div>'), /Missing note headings/);
});

test("long-note sections remain reachable when chapter details start collapsed", async () => {
    const { noteToc, noteOutline } = await import("../../scripts/lib/note-toc.mjs");
    const { parseHtml } = await import("../../scripts/lib/html.mjs");
    const source = `<div class="note-body"><section class="note-part" id="part"><h2>Part</h2><p>Overview</p>
        <section id="chapter"><h3>Chapter</h3><details><summary>Example</summary><p>Hidden example</p></details>
        <p>Visible explanation.</p><h4 id="detail">Detail</h4><p>Detail explanation.</p></section></section></div>`;
    const outline = noteOutline(source);
    assert.equal(outline[0].part, true);
    assert.equal(outline[0].children[0].description, "Visible explanation.");
    const { nodes, errors } = parseHtml(noteToc(source));
    assert.deepEqual(errors, []);
    const branches = nodes.filter(node => node.attributes.class === "note-toc-branch");
    assert.ok(Object.hasOwn(branches[0].attributes, "open"));
    assert.ok(!Object.hasOwn(branches[1].attributes, "open"));
    assert.deepEqual(nodes.filter(node => node.tag === "a").map(node => node.attributes.href), ["#part", "#chapter", "#detail"]);
});
