import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseHtml } from "./html.mjs";

// Includes are build-time comments. Links and data-source paths retain the
// published article as their base, regardless of the fragment's location.
export async function noteBody(directory) {
    const used = new Set();
    async function expand(name, ancestors = []) {
        if (ancestors.includes(name)) throw new Error(`Cyclic note include: ${[...ancestors, name].join(" -> ")}`);
        if (used.has(name)) throw new Error(`Repeated note include: ${name}`);
        used.add(name);
        const file = path.join(directory, name);
        const source = (await readFile(file, "utf8")).replaceAll("\r\n", "\n").trim();
        if (!source) throw new Error(`Empty note fragment: ${file}`);
        const { nodes, errors } = parseHtml(source);
        if (errors.length) throw new Error(`Invalid note fragment ${file}: ${errors.join("; ")}`);
        if (nodes.some(node => ["html", "head", "body"].includes(node.tag)) || /<!--\s*generated:/.test(source)) {
            throw new Error(`Expected body content without page wrappers or generated regions: ${file}`);
        }
        for (const node of nodes.filter(node => node.tag === "code" && Object.hasOwn(node.attributes, "data-source"))) {
            if (source.slice(node.contentStart, node.contentEnd).trim()) {
                throw new Error(`Keep data-source blocks empty; edit the referenced source instead: ${file}`);
            }
        }
        let result = "";
        let cursor = 0;
        for (const match of source.matchAll(/<!--\s*include\b[\s\S]*?-->/g)) {
            const include = match[0].match(/^<!-- include: ([a-z0-9-]+\.html) -->$/);
            const lineStart = source.lastIndexOf("\n", match.index - 1) + 1;
            const end = match.index + match[0].length;
            const lineEnd = source.indexOf("\n", end);
            const standalone = !source.slice(lineStart, match.index).trim() &&
                !source.slice(end, lineEnd === -1 ? source.length : lineEnd).trim();
            const inLiteral = nodes.some(node => ["pre", "code", "script", "style", "textarea", "title"].includes(node.tag) &&
                node.contentStart <= match.index && end <= node.contentEnd);
            if (!include || !standalone || inLiteral) throw new Error(`Invalid note include in ${file}: ${match[0]}`);
            result += source.slice(cursor, match.index) + await expand(include[1], [...ancestors, name]);
            cursor = end;
        }
        result += source.slice(cursor);
        if (/<!--\s*include\b/.test(result)) throw new Error(`Unclosed note include in ${file}`);
        return result;
    }
    const body = await expand("body.html");
    const unused = (await readdir(directory)).filter(name => name.endsWith(".html") && !used.has(name));
    if (unused.length) throw new Error(`Unused note fragments in ${directory}: ${unused.join(", ")}`);
    return body;
}
