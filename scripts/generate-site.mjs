import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { content, notes, workspace, walk, relative, isOwnedPage, isNoteSource, escapeHtml as text, escapeAttribute as attr } from "./lib/site.mjs";
import { noteGroups } from "./lib/note-groups.mjs";
import { noteToc, noteOutline } from "./lib/note-toc.mjs";
import { noteBody } from "./lib/note-body.mjs";

const check = process.argv.includes("--check");
const files = await walk();
const changes = [];
const noteBySlug = new Map(notes.map(note => [note.slug, note]));
const noteKinds = { overview: "综述", topic: "专题", practice: "实践" };
const relocations = content.noteRelocations || [];
const relocationBySlug = new Map(relocations.map(item => [item.slug, item]));
if (relocationBySlug.size !== relocations.length) throw new Error("Duplicate relocated note slug");
for (const item of relocations) {
    if (!/^[a-z0-9-]+$/.test(item.slug) || noteBySlug.has(item.slug) ||
        (item.target && !noteBySlug.has(item.target)) || !item.title || !item.sections?.length) {
        throw new Error(`Invalid note relocation: ${item.slug}`);
    }
    if (!files.includes(path.join(workspace, "notes", item.slug, "index.html"))) throw new Error(`Missing relocation page: ${item.slug}`);
    const anchors = new Set();
    for (const section of item.sections) {
        if (!section.label || !/^[a-z0-9-]+$/.test(section.anchor) ||
            !/^[a-z0-9-]+$/.test(section.targetAnchor) ||
            !noteBySlug.has(section.target || item.target) || anchors.has(section.anchor)) {
            throw new Error(`Invalid relocation section in ${item.slug}`);
        }
        anchors.add(section.anchor);
    }
}
if (noteBySlug.size !== notes.length) throw new Error("Duplicate note slug in site-content.json");
for (const slug of content.featured) {
    if (!noteBySlug.has(slug)) throw new Error(`Unknown featured note: ${slug}`);
}
for (const note of notes) {
    if (!/^[a-z0-9-]+$/.test(note.slug) || !note.title || !note.summary || !Object.hasOwn(noteKinds, note.kind) || !note.reading) {
        throw new Error(`Incomplete note metadata: ${note.slug}`);
    }
    if (!files.includes(path.join(workspace, "notes", note.slug, "index.html"))) {
        throw new Error(`Missing note page: ${note.slug}`);
    }
    for (const field of ["published", "updated", "reviewed"]) {
        const value = note[field];
        if (field === "reviewed" && !value) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || new Date(value).toISOString().slice(0, 10) !== value) {
            throw new Error(`Invalid ${field} date: ${note.slug}`);
        }
    }
    if (note.updated < note.published || (note.reviewed && note.reviewed < note.published)) {
        throw new Error(`Note dates precede publication: ${note.slug}`);
    }
}
const bodies = new Map();
const outlines = new Map();
for (const note of notes) {
    const body = await noteBody(path.join(workspace, "content", "notes", note.slug));
    bodies.set(note.slug, body);
    outlines.set(note.slug, noteOutline(`<div class="note-body">${body}</div>`));
}

function noteLink(file, reference) {
    if (!noteBySlug.has(reference.slug) || !reference.label) throw new Error(`Invalid reading link: ${reference.slug}`);
    const target = `notes/${reference.slug}/index.html${reference.anchor ? `#${reference.anchor}` : ""}`;
    return `<a href="${attr(linkFrom(file, target))}">${text(reference.label)}</a>`;
}

function linkFrom(file, target) {
    if (/^https?:/.test(target) || target.startsWith("#")) return target;
    const [pathname, hash] = target.split("#");
    if (relative(file) === pathname && hash) return `#${hash}`;
    let link = path.relative(path.dirname(file), path.join(workspace, pathname)).split(path.sep).join("/");
    if (!link.startsWith(".")) link = "./" + link;
    return link + (hash ? `#${hash}` : "");
}

function navigation(file, indent) {
    const page = relative(file);
    const section = page.split("/")[0];
    const links = content.navigation.map(item => {
        const target = page === "index.html" && item.homeHref ? item.homeHref : item.href;
        const href = linkFrom(file, target);
        const active = section === item.id;
        const current = page === item.href ? "page" : "location";
        const attributes = /^https?:/.test(href) ? ' target="_blank" rel="me noreferrer"' : "";
        return `    <a${active ? ' class="is-active"' : ""} href="${attr(href)}"${active ? ` aria-current="${current}"` : ""}${attributes}>${text(item.label)}</a>`;
    });
    return [`<nav class="site-nav" aria-label="站点导航">`, ...links, "</nav>"].join("\n" + indent);
}

function replaceOne(source, expression, replacement, label) {
    const matches = [...source.matchAll(new RegExp(expression.source, "g" + (expression.dotAll ? "s" : "")))];
    if (matches.length !== 1) throw new Error(`Expected one ${label}, found ${matches.length}`);
    return source.replace(expression, () => replacement);
}

function replaceRegion(source, name, body) {
    const start = `<!-- generated:${name}:start -->`;
    const end = `<!-- generated:${name}:end -->`;
    return replaceOne(source, new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${body}\n${end}`, name);
}

function card(file, note, index) {
    return `    <a class="link-card" href="${attr(linkFrom(file, `notes/${note.slug}/index.html`))}">
        <span class="card-label">${String(index + 1).padStart(2, "0")}</span>
        <div><h3>${text(note.cardTitle || note.title)}</h3><p>${text(note.summary)}</p></div>
    </a>`;
}

function catalogEntry(file, note, showKind = false) {
    const chapters = note.chapters?.map(chapter => `<li>${noteLink(file, { slug: note.slug, ...chapter })}</li>`).join("");
    const topics = chapters ? `<div class="note-entry-topics"><p>章节直达</p><ul>${chapters}</ul></div>` : "";
    return `<li class="note-entry">
        <h4>${noteLink(file, { slug: note.slug, label: note.cardTitle || note.title })}</h4>${showKind ? `\n        <span class="note-entry-kind">${text(noteKinds[note.kind])}</span>` : ""}
        <p>${text(note.summary)}</p>${topics ? `\n        ${topics}` : ""}
    </li>`;
}

function catalog(file) {
    const categories = content.categories.map(category => `<a href="#${attr(category.id)}">${text(category.title)} <span>${category.notes.length}</span></a>`).join("");
    const sections = content.categories.map(category => {
        const groups = noteGroups(category, noteKinds).map(group => {
            return `<div class="note-group"><h3>${text(group.title)}</h3><ul class="note-entry-grid">\n${group.notes.map(note => catalogEntry(file, note, Boolean(category.groups))).join("\n")}\n</ul></div>`;
        });
        return `<section class="section-block note-category" id="${attr(category.id)}" aria-labelledby="${attr(category.id)}-title">
    <div class="section-heading"><h2 id="${attr(category.id)}-title">${text(category.title)}</h2><span>${category.notes.length} 篇</span></div>${category.description ? `\n    <p>${text(category.description)}</p>` : ""}
    ${groups.join("\n")}
</section>`;
    });
    return `<nav class="note-categories" aria-label="笔记分类">${categories}</nav>
${searchCatalog(file)}
<p class="note-catalog-hint">按主题选择笔记，或通过章节直达查找具体机制。综述、专题、实践表示文章侧重，不代表难度。</p>
${sections.join("\n")}`;
}

function searchCatalog(file) {
    const index = [];
    for (const note of notes) {
        const url = linkFrom(file, `notes/${note.slug}/index.html`);
        index.push({ title: note.title, label: "全文", trail: "", description: note.summary, url });
        function visit(entries, trail = []) {
            for (const entry of entries) {
                index.push({ title: note.title, label: entry.label, trail: trail.join(" → "),
                    description: entry.description || note.summary, url: `${url}#${entry.anchor}` });
                visit(entry.children, [...trail, entry.label]);
            }
        }
        visit(outlines.get(note.slug));
    }
    const data = JSON.stringify(index).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
    return `<section class="note-search" aria-label="知识点检索" hidden>
<label for="note-search-input">查找知识点</label>
<div class="note-search-field"><input id="note-search-input" type="search" placeholder="例如：OopMap、反优化、悬垂引用" aria-describedby="note-search-help" aria-controls="note-search-results" autocomplete="off"><button type="button" id="note-search-clear">清空</button></div>
<p id="note-search-help">搜索文章、章节与摘要，支持常见中英文术语。</p>
<p id="note-search-status" role="status" aria-live="polite"></p>
<ol id="note-search-results" hidden></ol></section>
<script type="application/json" id="note-search-data">${data}</script>`;
}

function noteDates(note) {
    const date = (label, value) => `<span>${label} <time datetime="${attr(value)}">${text(value.replaceAll("-", "."))}</time></span>`;
    return `<span class="note-dates">${date("发布", note.published)}${date("更新", note.updated)}${note.reviewed ? date("技术复核", note.reviewed) : ""}</span>`;
}

function readingGuide(file, note) {
    const links = note.prerequisites.map(reference => noteLink(file, reference)).join("、");
    const parts = outlines.get(note.slug).filter(entry => entry.part)
        .map(entry => noteLink(file, { slug: note.slug, anchor: entry.anchor, label: entry.label }));
    return `<aside class="note-reading-guide" aria-label="复习提示"><p><strong>复习提示</strong> ${text(note.reading)}</p>${links ? `<p>相关基础：${links}</p>` : ""}${parts.length > 1 ? `<nav class="note-parts" aria-label="分部直达">${parts.join("")}</nav>` : ""}</aside>`;
}

function relocationPage(file, item) {
    const destinations = new Set(item.sections.map(section => section.target || item.target));
    const singleTarget = destinations.size === 1 ? [...destinations][0] : null;
    const destination = singleTarget && noteBySlug.get(singleTarget);
    const canonical = singleTarget ? `<link rel="canonical" href="${attr(`${content.origin}/notes/${singleTarget}/index.html`)}">` : "";
    const title = `${item.title} · 内容已迁移`;
    const sections = item.sections.map(section => `<section id="${attr(section.anchor)}" aria-labelledby="${attr(section.anchor)}-title">
<h2 id="${attr(section.anchor)}-title">${text(section.label)}</h2>
<p>${noteLink(file, { slug: section.target || item.target, anchor: section.targetAnchor, label: `阅读：${section.label}` })}</p>
</section>`).join("\n");
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,follow"><meta name="description" content="${attr(item.title)}已迁移，可按原章节继续阅读。">
<meta name="theme-color" content="#f7faf8"><title>${text(title)}</title>
${canonical}<link rel="icon" href="../../images/head.jpg">
<link rel="stylesheet" href="../../styles.css"><link rel="stylesheet" href="../notes.css"></head>
<body class="note-page"><a class="note-skip" href="#note-content">跳到正文</a>
<header class="site-header site-header--sticky"><div class="site-header-inner">
<a class="brand" href="../../index.html" aria-label="Starki 主页"><img src="../../images/head.jpg" alt="Starki 的头像" width="42" height="42"><span>Starki</span></a>
${navigation(file, "")}</div></header>
<main class="note-shell" id="note-content" tabindex="-1">
<nav class="note-breadcrumb" aria-label="面包屑导航"><a href="../../index.html">主页</a><span aria-hidden="true">/</span><a href="../index.html">笔记</a><span aria-hidden="true">/</span><span aria-current="page">内容已整合</span></nav>
<header class="note-header"><p class="eyebrow">章节迁移</p><h1 id="note-title">${text(item.title)}</h1>
<p class="note-deck">${destination ? `本篇已迁移至${noteLink(file, { slug: singleTarget, label: destination.title })}。` : "本篇内容已按主题迁移至新笔记。"}可按原章节继续阅读。</p></header>
<div class="note-body">${sections}</div>
<p class="note-end"><a class="back-link" href="../index.html">← 返回笔记</a></p></main>
<footer class="site-footer"><p>Made by Starki.</p></footer></body></html>
`;
}

async function save(file, source, result) {
    if (source.replaceAll("\r\n", "\n") === result.replaceAll("\r\n", "\n")) return;
    changes.push(relative(file));
    if (!check) await writeFile(file, result, "utf8");
}

for (const file of files.filter(isOwnedPage)) {
    const source = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
    const indent = source.match(/(?:^|\n)([ \t]*)<nav class="site-nav"/)?.[1] || "";
    let result = replaceOne(source, /<nav class="site-nav"[^>]*>[\s\S]*?<\/nav>/, navigation(file, indent), `navigation in ${relative(file)}`);
    if (relative(file) === "index.html") {
        const cards = content.featured.map((slug, index) => card(file, noteBySlug.get(slug), index)).join("\n");
        result = replaceRegion(result, "featured-notes", `<div class="link-grid">\n${cards}\n</div>\n<p><a class="back-link" href="./notes/index.html">查看全部 ${notes.length} 篇笔记 →</a></p>`);
    } else if (relative(file) === "notes/index.html") {
        result = replaceRegion(result, "note-catalog", catalog(file));
        if (!result.includes('src="./note-search.mjs"')) result = result.replace("</head>", '<script type="module" src="./note-search.mjs"></script></head>');
    } else if (relative(file).startsWith("notes/")) {
        const slug = relative(file).split("/")[1];
        if (relocationBySlug.has(slug)) {
            await save(file, source, relocationPage(file, relocationBySlug.get(slug)));
            continue;
        }
        const note = noteBySlug.get(slug);
        if (!note) throw new Error(`Note missing from site-content.json: ${slug}`);
        const title = note.title + " · Starki 笔记";
        const description = note.description || note.summary;
        const url = content.origin + "/" + relative(file);
        const category = content.categories.find(category => category.notes.some(item => item.slug === slug));
        const replacements = [
            [/<title>[^<]*<\/title>/, `<title>${text(title)}</title>`],
            [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(description)}">`],
            [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${attr(title)}">`],
            [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${attr(description)}">`],
            [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${attr(url)}">`],
            [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${attr(url)}">`],
            [/<h1 id="note-title">[^<]*<\/h1>/, `<h1 id="note-title">${text(note.title)}</h1>`],
            [/<p class="eyebrow">[^<]*<\/p>/, `<p class="eyebrow">${text(category.title)} / ${text(noteKinds[note.kind])}</p>`],
            [/<p class="note-deck">[^<]*<\/p>/, `<p class="note-deck">${text(note.summary)}</p>`]
        ];
        for (const [expression, value] of replacements) result = replaceOne(result, expression, value, `${slug} metadata`);
        result = replaceOne(result, /<nav class="note-breadcrumb"[\s\S]*?<\/nav>/, `<nav class="note-breadcrumb" aria-label="面包屑导航"><a href="${attr(linkFrom(file, "index.html"))}">主页</a><span aria-hidden="true">/</span><a href="../index.html">笔记</a><span aria-hidden="true">/</span><a href="../index.html#${attr(category.id)}">${text(category.title)}</a><span aria-hidden="true">/</span><span aria-current="page">${text(note.title)}</span></nav>`, `${slug} breadcrumb`);
        if (!result.includes("<!-- generated:reading-guide:start -->")) {
            result = replaceOne(result, /<div class="note-layout">/, "<!-- generated:reading-guide:start -->\n<!-- generated:reading-guide:end -->\n<div class=\"note-layout\">", `${slug} reading guide location`);
        }
        result = replaceRegion(result, "reading-guide", readingGuide(file, note));
        result = replaceRegion(result, "note-body", bodies.get(slug));
        if (!result.includes("<!-- generated:note-dates:start -->")) {
            result = replaceOne(result, /<time\b[^>]*>[\s\S]*?<\/time>/,
                "<!-- generated:note-dates:start --><!-- generated:note-dates:end -->", `${slug} date location`);
        }
        result = replaceRegion(result, "note-dates", noteDates(note));
        if (!result.includes('src="../note-navigation.js"')) result = result.replace("</head>", '<script defer src="../note-navigation.js"></script>\n</head>');
        if (!result.includes("<!-- generated:note-toc:start -->")) {
            result = replaceOne(result, /<nav class="note-toc"[^>]*>[\s\S]*?<\/nav>/,
                "<!-- generated:note-toc:start -->\n<!-- generated:note-toc:end -->", `${slug} directory location`);
        }
        result = replaceRegion(result, "note-toc", noteToc(result));
        for (const match of [...result.matchAll(/<code\b([^>]*\bdata-source="([^"]+)"[^>]*)>[\s\S]*?<\/code>/g)]) {
            const sourceFile = path.resolve(path.dirname(file), match[2]);
            if (!relative(sourceFile).startsWith("notes/") || !/\.(cpp|hpp)$/.test(sourceFile)) {
                throw new Error(`Invalid code source: ${match[2]}`);
            }
            const code = (await readFile(sourceFile, "utf8")).replaceAll("\r\n", "\n").trimEnd();
            result = result.replace(match[0], () => `<code${match[1]}>${attr(code).replaceAll("'", "&#x27;")}</code>`);
        }
    }
    await save(file, source, result);
}

const urls = [];
for (const file of files.filter(file => file.endsWith(".html") && relative(file) !== "404.html" && !isNoteSource(file))) {
    if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(await readFile(file, "utf8"))) continue;
    urls.push(content.origin + "/" + relative(file));
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.sort().map(url => `    <url><loc>${text(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
const sitemapFile = path.join(workspace, "sitemap.xml");
await save(sitemapFile, await readFile(sitemapFile, "utf8"), sitemap);

if (check && changes.length) {
    console.error(`Generated content is stale; run npm run generate:\n${changes.join("\n")}`);
    process.exitCode = 1;
} else {
    console.log(check ? "Generated navigation, note bodies, directories, metadata, source blocks and sitemap are current" : `Updated ${changes.length} generated files`);
}
