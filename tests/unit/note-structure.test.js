const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const kinds = { overview: "基础综述", topic: "深入专题", practice: "实现练习" };

test("topic groups preserve editorial order across article kinds; other categories retain kind grouping", async () => {
    const { noteGroups } = await import("../../scripts/lib/note-groups.mjs");
    const notes = [{ slug: "intro", kind: "overview" }, { slug: "detail", kind: "topic" }];
    assert.deepEqual(noteGroups({ notes }, kinds).map(group => group.notes.map(note => note.slug)), [["intro"], ["detail"]]);
    const grouped = noteGroups({ notes, groups: [{ title: "同一主题", notes: ["detail", "intro"] }] }, kinds);
    assert.equal(grouped[0].title, "同一主题");
    assert.deepEqual(grouped[0].notes.map(note => note.slug), ["detail", "intro"]);
});

test("topic grouping rejects omissions, duplicates and references to other categories", async () => {
    const { noteGroups } = await import("../../scripts/lib/note-groups.mjs");
    const category = { id: "example", notes: [{ slug: "one" }, { slug: "two" }] };
    for (const slugs of [["one"], ["one", "one"], ["one", "elsewhere"]]) {
        assert.throws(() => noteGroups({ ...category, groups: [{ title: "主题", notes: slugs }] }, kinds));
    }
    assert.throws(() => noteGroups({ ...category, groups: [{ title: "空组", notes: [] }] }, kinds));
});

test("published bookmarks retain chapter anchors across the runtime split", async () => {
    const { content, workspace, notes } = await import("../../scripts/lib/site.mjs");
    const { parseHtml } = await import("../../scripts/lib/html.mjs");
    // These are the anchors published before the two GC articles were consolidated.
    const published = {
        "jvm-gc": ["interview-map", "scope", "tricolor", "stw", "barriers", "forwarding", "review"],
        "art-memory-gc": ["roots", "collectors", "generations", "spaces", "oom", "related"]
    };
    const sitemap = await readFile(path.join(workspace, "sitemap.xml"), "utf8");
    for (const relocation of content.noteRelocations) {
        const { slug } = relocation;
        const anchors = published[slug] || relocation.sections.map(section => section.anchor);
        assert.ok(!notes.some(note => note.slug === slug), "Compatibility pages must not be catalog entries");
        const source = await readFile(path.join(workspace, "notes", slug, "index.html"), "utf8");
        const legacy = parseHtml(source);
        const ids = new Set(legacy.nodes.map(node => node.attributes.id));
        for (const anchor of anchors) {
            assert.ok(ids.has(anchor) && ids.has(`${anchor}-title`), `Lost bookmark ${slug}#${anchor}`);
            const mapping = relocation.sections.find(section => section.anchor === anchor);
            const target = mapping?.target || relocation.target;
            const destination = parseHtml(await readFile(path.join(workspace, "notes", target, "index.html"), "utf8"));
            const targetIds = new Set(destination.nodes.map(node => node.attributes.id));
            assert.ok(mapping && targetIds.has(mapping.targetAnchor), `Missing target for ${slug}#${anchor}`);
            assert.ok(legacy.nodes.some(node => node.tag === "a" && node.attributes.href === `../${target}/index.html#${mapping.targetAnchor}`));
        }
        assert.match(source, /name="robots" content="noindex,follow"/);
        const targets = new Set(relocation.sections.map(section => section.target || relocation.target));
        if (targets.size === 1) {
            const [target] = targets;
            assert.ok(source.includes(`rel="canonical" href="${content.origin}/notes/${target}/index.html"`));
        } else {
            assert.ok(!source.includes('rel="canonical"'));
        }
        assert.ok(!sitemap.includes(`/notes/${slug}/index.html`));
    }
});
