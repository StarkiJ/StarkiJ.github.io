import { decodeHtml, parseHtml } from "./html.mjs";

const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const hasClass = (node, name) => (node.attributes?.class || "").split(/\s+/).includes(name);
const isHeading = node => /^h[2-4]$/.test(node.tag);

export function noteOutline(source) {
    const { nodes, errors } = parseHtml(source);
    if (errors.length) throw new Error(`Cannot generate note directory: ${errors.join("; ")}`);
    const body = nodes.find(node => hasClass(node, "note-body"));
    if (!body) throw new Error("Missing note body for directory");
    const visibleInBody = node => {
        for (let ancestor = node; ancestor; ancestor = ancestor.parent) {
            // Example filenames and headings inside collapsed explanations are not article sections.
            if (ancestor.tag === "details" || Object.hasOwn(ancestor.attributes || {}, "hidden")) return false;
            if (ancestor === body) return true;
        }
        return false;
    };
    const headings = nodes.filter(node => isHeading(node) && visibleInBody(node));
    if (!headings.length) throw new Error("Missing note headings for directory");
    const entries = [];
    const stack = [];
    const anchors = new Set();
    for (const [index, heading] of headings.entries()) {
        const parent = heading.parent;
        // Keep published section/lesson bookmarks rather than linking to presentation-only heading IDs.
        const ownsHeading = (parent.tag === "section" || hasClass(parent, "note-lesson")) &&
            parent.children.find(isHeading) === heading;
        const anchor = (ownsHeading && parent.attributes.id) || heading.attributes.id;
        const label = decodeHtml(source.slice(heading.contentStart, heading.contentEnd)
            .replace(/<!--[\s\S]*?-->|<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
        if (!anchor || /\s/.test(anchor) || !label || anchors.has(anchor)) {
            throw new Error(`Missing or repeated note heading anchor: ${label}`);
        }
        anchors.add(anchor);
        const nextHeading = headings[index + 1];
        const paragraph = nodes.find(node => node.tag === "p" && visibleInBody(node) && !hasClass(node, "note-source") && node.start > heading.start &&
            node.start < (nextHeading?.start ?? body.contentEnd));
        const description = paragraph ? decodeHtml(source.slice(paragraph.contentStart, paragraph.contentEnd)
            .replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim().slice(0, 140) : "";
        const entry = { anchor, label, description, part: hasClass(parent, "note-part"), level: Number(heading.tag[1]), children: [] };
        while (stack.length && stack.at(-1).level >= entry.level) stack.pop();
        (stack.at(-1)?.children || entries).push(entry);
        stack.push(entry);
    }
    return entries;
}

export function noteToc(source) {
    const entries = noteOutline(source);
    function list(items, depth = 0) {
        const indent = "    ".repeat(depth);
        return `${indent}<ol>\n${items.map(item => {
            const link = `<a href="#${escape(item.anchor)}">${escape(item.label)}</a>`;
            const body = item.children.length
                ? `<details class="note-toc-branch"${item.level === 2 ? " open" : ""}><summary aria-label="展开或收起：${escape(item.label)}">${link}</summary>\n${list(item.children, depth + 2)}\n${indent}    </details>`
                : link;
            return `${indent}    <li>${body}</li>`;
        }).join("\n")}\n${indent}</ol>`;
    }
    return `<nav class="note-toc" aria-label="文章目录"><details class="note-toc-panel" open><summary>文章目录</summary>
<div class="note-toc-controls" hidden><button type="button" data-toc-expand>展开全部</button><button type="button" data-toc-collapse>收起小节</button></div>
${list(entries)}\n</details></nav>`;
}
