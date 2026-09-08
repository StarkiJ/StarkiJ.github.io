import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { workspace, content, walk, relative } from "./lib/site.mjs";
import { parseHtml } from "./lib/html.mjs";

const siteOrigin = content.origin;
const failures = [];
const documents = new Map();
let fragmentCount = 0;

async function documentFor(file) {
    if (!documents.has(file)) documents.set(file, parseHtml(await readFile(file, "utf8")));
    return documents.get(file);
}

function localTarget(sourceFile, reference) {
    const withoutFragment = reference.split("#", 1)[0].split("?", 1)[0];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(withoutFragment)) {
        return null;
    }
    if (!withoutFragment) return sourceFile;

    let decoded;
    try {
        decoded = decodeURIComponent(withoutFragment);
    } catch {
        failures.push(`${path.relative(workspace, sourceFile)}: invalid URL encoding: ${reference}`);
        return null;
    }

    const target = decoded.startsWith("/")
        ? path.resolve(workspace, "." + decoded)
        : path.resolve(path.dirname(sourceFile), decoded);
    const workspacePrefix = workspace.endsWith(path.sep)
        ? workspace
        : workspace + path.sep;

    if (target !== workspace && !target.startsWith(workspacePrefix)) {
        failures.push(`${path.relative(workspace, sourceFile)}: path escapes workspace: ${reference}`);
        return null;
    }
    return target;
}

async function resolvedTarget(target) {
    try {
        const targetStats = await stat(target);
        if (targetStats.isDirectory()) {
            target = path.join(target, "index.html");
            await stat(target);
        }
        return target;
    } catch {
        return null;
    }
}

async function checkReferences(files) {
    for (const file of files) {
        const extension = path.extname(file).toLowerCase();
        if (![".html", ".css", ".svg"].includes(extension)) {
            continue;
        }
        const source = await readFile(file, "utf8");
        const references = extension === ".css"
            ? [...source.matchAll(/url\(\s*["']?([^"'()]+?)["']?\s*\)/gi)].map(match => ["url", match[1]])
            : (await documentFor(file)).nodes.flatMap(node => Object.entries(node.attributes).filter(([key]) => ["href", "src", "xlink:href"].includes(key)));
        for (const [attribute, value] of references) {
            const reference = value.trim();
            if (!reference) continue;
            const target = localTarget(file, reference);
            const isHtmlDirectoryLink = extension === ".html" &&
                attribute === "href" &&
                /\/(?:[?#].*)?$/.test(reference);

            if (target && isHtmlDirectoryLink) {
                failures.push(
                    `${path.relative(workspace, file)}: use an explicit index.html link instead of ${reference}`
                );
            }
            if (!target) continue;
            const resolved = await resolvedTarget(target);
            if (!resolved) {
                failures.push(
                    `${path.relative(workspace, file)}: missing ${reference}`
                );
                continue;
            }
            if (!reference.includes("#") || !/\.(html|svg)$/i.test(resolved)) continue;
            let fragment;
            try { fragment = decodeURIComponent(reference.slice(reference.indexOf("#") + 1).split(":~:")[0]); }
            catch { failures.push(`${relative(file)}: invalid fragment encoding: ${reference}`); continue; }
            if (!fragment) continue;
            fragmentCount++;
            const { nodes } = await documentFor(resolved);
            if (!nodes.some(node => node.attributes.id === fragment || (node.tag === "a" && node.attributes.name === fragment))) {
                failures.push(`${relative(file)}: missing anchor ${reference}`);
            }
        }
    }
}

function publicUrlFor(file) {
    const relative = path.relative(workspace, file).split(path.sep).join("/");
    return siteOrigin + "/" + relative;
}

async function checkSitemap(files) {
    const sitemap = await readFile(path.join(workspace, "sitemap.xml"), "utf8");
    const sitemapUrls = new Set(
        [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    );
    const publicPages = [];

    for (const file of files.filter((item) => path.extname(item) === ".html")) {
        const source = await readFile(file, "utf8");
        const relative = path.relative(workspace, file).split(path.sep).join("/");
        if (relative === "404.html" ||
                /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(source)) {
            continue;
        }
        const publicUrl = publicUrlFor(file);
        const canonical = source.match(
            /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
        );
        publicPages.push(publicUrl);

        if (!canonical) {
            failures.push(`${relative}: missing canonical URL`);
        } else if (canonical[1] !== publicUrl) {
            failures.push(
                `${relative}: canonical URL should be ${publicUrl}, found ${canonical[1]}`
            );
        }
    }

    for (const url of publicPages) {
        if (!sitemapUrls.has(url)) {
            failures.push(`sitemap.xml: missing ${url}`);
        }
    }
    for (const url of sitemapUrls) {
        if (!publicPages.includes(url)) {
            failures.push(`sitemap.xml: stale or non-public URL ${url}`);
        }
    }
}

const files = await walk(workspace);
await checkReferences(files);
await checkSitemap(files);

if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
} else {
    console.log(`Link and sitemap checks passed (${files.length} files, ${fragmentCount} local fragments checked)`);
}
