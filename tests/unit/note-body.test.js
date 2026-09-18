const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");

async function fixture(t, files) {
    const root = path.resolve(tmpdir());
    const directory = await mkdtemp(path.join(root, "starki-note-source-test-"));
    t.after(async () => {
        assert.equal(path.dirname(path.resolve(directory)), root);
        await rm(directory, { recursive: true, force: true });
    });
    for (const [name, source] of Object.entries(files)) await writeFile(path.join(directory, name), source);
    return directory;
}

test("note sources assemble complete nested sections in declared order with one directory", async t => {
    const { noteBody } = await import("../../scripts/lib/note-body.mjs");
    const { noteToc } = await import("../../scripts/lib/note-toc.mjs");
    const directory = await fixture(t, {
        "body.html": '<p>Introduction</p>\r\n<!-- include: z-part.html -->\r\n<!-- include: a-end.html -->\r\n',
        "z-part.html": '<section id="part"><h2>Part</h2>\n<!-- include: chapter.html -->\n</section>',
        "chapter.html": '<section id="chapter"><h3>Chapter</h3><a href="../peer/index.html#old">Related</a><pre><code data-source="./example.cpp"></code></pre><pre><code>const char* s = "$&amp;";\n  return 0;\n</code></pre></section>',
        "a-end.html": '<section id="end"><h2>End</h2></section>'
    });
    const body = await noteBody(directory);
    assert.doesNotMatch(body, /include:|\r/);
    assert.match(body, /href="\.\.\/peer\/index\.html#old"/);
    assert.match(body, /data-source="\.\/example\.cpp"><\/code>/);
    assert.ok(body.includes('const char* s = "$&amp;";\n  return 0;\n'));
    const toc = noteToc(`<div class="note-body">${body}</div>`);
    assert.deepEqual([...toc.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ["#part", "#chapter", "#end"]);
});

test("short notes use a single body and chapter edits are read on the next generation", async t => {
    const { noteBody } = await import("../../scripts/lib/note-body.mjs");
    const source = '<section id="topic"><h2>Topic</h2><p>First version</p></section>';
    const directory = await fixture(t, { "body.html": source });
    assert.equal(await noteBody(directory), source);
    await writeFile(path.join(directory, "body.html"), '<!-- include: topic.html -->');
    await writeFile(path.join(directory, "topic.html"), source);
    assert.equal(await noteBody(directory), source);
    await writeFile(path.join(directory, "topic.html"), source.replace("First version", "Revised"));
    assert.match(await noteBody(directory), /Revised/);
});

test("note composition rejects missing, repeated, cyclic and unused chapters", async t => {
    const { noteBody } = await import("../../scripts/lib/note-body.mjs");
    const cases = [
        [{ "body.html": '<!-- include: missing.html -->' }, /ENOENT/],
        [{ "body.html": '<!-- include: chapter.html -->\n<!-- include: chapter.html -->', "chapter.html": '<p>Chapter</p>' }, /Repeated/],
        [{ "body.html": '<!-- include: chapter.html -->', "chapter.html": '<!-- include: body.html -->' }, /Cyclic/],
        [{ "body.html": '<p>Body</p>', "forgotten.html": '<p>Forgotten</p>' }, /Unused/]
    ];
    for (const [files, error] of cases) await assert.rejects(noteBody(await fixture(t, files)), error);
});

test("each fragment must be complete and keep generated code in its original source file", async t => {
    const { noteBody } = await import("../../scripts/lib/note-body.mjs");
    const cases = [
        [{ "body.html": '<!-- include: opening.html -->\n<!-- include: closing.html -->', "opening.html": '<section><h2>Part</h2>', "closing.html": '</section>' }, /Unclosed elements/],
        [{ "body.html": '<html><body><p>Full page</p></body></html>' }, /page wrappers/],
        [{ "body.html": '<!-- generated:note-body:start --><p>Content</p>' }, /generated regions/],
        [{ "body.html": '<pre><code data-source="./main.cpp">Copied code</code></pre>' }, /Keep data-source blocks empty/],
        [{ "body.html": ' \n' }, /Empty note fragment/]
    ];
    for (const [files, error] of cases) await assert.rejects(noteBody(await fixture(t, files)), error);
});

test("include directives must be standalone local filenames outside literal examples", async t => {
    const { noteBody } = await import("../../scripts/lib/note-body.mjs");
    for (const source of [
        '<!-- include: ../escape.html -->',
        '<!-- include: /absolute.html -->',
        '<!-- include: C:\\absolute.html -->',
        '<!-- include: https://example.com/a.html -->',
        '<!-- include chapter.html -->',
        '<p>Text <!-- include: chapter.html --></p>',
        '<pre><code>\n<!-- include: chapter.html -->\n</code></pre>',
        '<!-- include: chapter.html'
    ]) {
        const directory = await fixture(t, { "body.html": source });
        await assert.rejects(noteBody(directory), /Invalid note include|Unclosed note include/);
    }
});

test("body sources are not public article pages", async () => {
    const { workspace, isNoteSource, isOwnedPage } = await import("../../scripts/lib/site.mjs");
    const source = path.join(workspace, "content/notes/example/body.html");
    const page = path.join(workspace, "notes/example/index.html");
    assert.equal(isNoteSource(source), true);
    assert.equal(isOwnedPage(source), false);
    assert.equal(isNoteSource(page), false);
    assert.equal(isOwnedPage(page), true);
});
