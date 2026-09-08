const { test } = require("node:test");
const assert = require("node:assert/strict");

test("static inspection ignores comments, scripts and escaped examples when collecting anchors", async () => {
    const { parseHtml } = await import("../../scripts/lib/html.mjs");
    const parsed = parseHtml(`<!doctype html><html><head><script>const sample = '<div id="fake">';</script></head>
        <body><!-- <div id="comment"> --><textarea><h1 id="input">literal text</h1></textarea>
        <h1 id="real" title="a > b">Title</h1><pre><code>&lt;div id=&quot;sample&quot;&gt;</code></pre>
        <a href="#r&#101;al">Jump</a><input disabled></body></html>`);
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.nodes.filter(node => node.attributes.id).map(node => node.attributes.id), ["real"]);
    assert.equal(parsed.nodes.find(node => node.tag === "a").attributes.href, "#real");
    assert.equal(parsed.codeText(parsed.nodes.find(node => node.tag === "code")), '<div id="sample">');
});

test("static inspection reports misnested markup and duplicate attributes", async () => {
    const { parseHtml, decodeHtml } = await import("../../scripts/lib/html.mjs");
    assert.match(parseHtml('<div><span></div>').errors.join(" "), /Unexpected.*Unclosed/);
    assert.match(parseHtml('<p id="a" id="b"></p>').errors.join(" "), /Duplicate attribute/);
    assert.equal(decodeHtml("&amp;lt; &#x27; &#65;"), "&lt; ' A");
});
