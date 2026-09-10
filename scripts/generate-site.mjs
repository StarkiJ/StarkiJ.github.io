import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { content, notes, workspace, walk, relative, isOwnedPage, escapeHtml as text, escapeAttribute as attr } from "./lib/site.mjs";

const check = process.argv.includes("--check");
const files = await walk();
const changes = [];
const noteBySlug = new Map(notes.map(note => [note.slug, note]));
const noteKinds = { overview: "基础综述", topic: "深入专题", practice: "实现练习" };
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

function catalogEntry(file, note) {
    const chapters = note.chapters?.map(chapter => `<li>${noteLink(file, { slug: note.slug, ...chapter })}</li>`).join("");
    const topics = chapters ? `<div class="note-entry-topics"><p>章节直达</p><ul>${chapters}</ul></div>` : "";
    return `<li class="note-entry">
        <h4>${noteLink(file, { slug: note.slug, label: note.cardTitle || note.title })}</h4>
        <p>${text(note.summary)}</p>${topics ? `\n        ${topics}` : ""}
    </li>`;
}

function catalog(file) {
    const categories = content.categories.map(category => `<a href="#${attr(category.id)}">${text(category.title)} <span>${category.notes.length}</span></a>`).join("");
    const paths = content.readingPaths.map(route => `<li><strong>${text(route.title)}</strong><ol>${route.steps.map(step => `<li>${noteLink(file, step)}</li>`).join("")}</ol></li>`).join("\n");
    const sections = content.categories.map(category => {
        const groups = Object.entries(noteKinds).flatMap(([kind, label]) => {
            const entries = category.notes.filter(note => note.kind === kind);
            if (!entries.length) return [];
            return [`<div class="note-group"><h3>${text(label)}</h3><ul class="note-entry-grid">\n${entries.map(note => catalogEntry(file, note)).join("\n")}\n</ul></div>`];
        });
        return `<section class="section-block note-category" id="${attr(category.id)}" aria-labelledby="${attr(category.id)}-title">
    <div class="section-heading"><h2 id="${attr(category.id)}-title">${text(category.title)}</h2><span>${category.notes.length} 篇</span></div>${category.description ? `\n    <p>${text(category.description)}</p>` : ""}
    ${groups.join("\n")}
</section>`;
    });
    return `<nav class="note-categories" aria-label="笔记分类">${categories}</nav>
<details class="note-paths"><summary>从哪里开始？查看 ${content.readingPaths.length} 条阅读路线</summary><ul>${paths}</ul></details>
<p class="note-catalog-hint">复习概念看「基础综述」，理解具体机制看「深入专题」，动手验证看「实现练习」。可直接跳到下方列出的章节。</p>
${sections.join("\n")}`;
}

function readingGuide(file, note) {
    const links = note.prerequisites.map(reference => noteLink(file, reference)).join("、");
    return `<aside class="note-reading-guide" aria-label="阅读建议"><p><strong>阅读建议</strong> ${text(note.reading)}</p>${links ? `<p>相关基础：${links}</p>` : ""}</aside>`;
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
    } else if (relative(file).startsWith("notes/")) {
        const slug = relative(file).split("/")[1];
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
for (const file of files.filter(file => file.endsWith(".html") && relative(file) !== "404.html")) {
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
    console.log(check ? "Generated navigation, note metadata, source blocks and sitemap are current" : `Updated ${changes.length} generated files`);
}
