import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skippedDirectories = new Set([".git", "node_modules"]);
const siteOrigin = "https://starkij.github.io";
const failures = [];

async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.isDirectory() && skippedDirectories.has(entry.name)) {
            continue;
        }
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walk(fullPath));
        } else if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}

function localTarget(sourceFile, reference) {
    const withoutFragment = reference.split("#", 1)[0].split("?", 1)[0];
    if (!withoutFragment ||
            /^(?:[a-z]+:|\/\/)/i.test(withoutFragment)) {
        return null;
    }

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

async function targetExists(target, reference) {
    try {
        const targetStats = await stat(target);
        if (targetStats.isDirectory() || reference.endsWith("/")) {
            await stat(path.join(target, "index.html"));
        }
        return true;
    } catch {
        return false;
    }
}

async function checkReferences(files) {
    for (const file of files) {
        const extension = path.extname(file).toLowerCase();
        if (extension !== ".html" && extension !== ".css") {
            continue;
        }
        const source = await readFile(file, "utf8");
        const expression = extension === ".html"
            ? /(?:href|src)\s*=\s*["']([^"'#]+)["']/gi
            : /url\(\s*["']?([^"'()]+)["']?\s*\)/gi;
        let match;

        while ((match = expression.exec(source))) {
            const reference = match[1].trim();
            const target = localTarget(file, reference);
            const isHtmlDirectoryLink = extension === ".html" &&
                /^href/i.test(match[0]) &&
                /\/(?:[?#].*)?$/.test(reference);

            if (target && isHtmlDirectoryLink) {
                failures.push(
                    `${path.relative(workspace, file)}: use an explicit index.html link instead of ${reference}`
                );
            }
            if (target && !await targetExists(target, reference)) {
                failures.push(
                    `${path.relative(workspace, file)}: missing ${reference}`
                );
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
    console.log(`Link and sitemap checks passed (${files.length} files scanned)`);
}
