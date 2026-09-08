import { readFile } from "node:fs/promises";
import path from "node:path";
import { walk, relative, isOwnedPage, notes, workspace } from "./lib/site.mjs";
import { parseHtml } from "./lib/html.mjs";

const files = await walk();
const failures = [];
const embeddedSources = new Set();
let pageCount = 0;
let tableCount = 0;
for (const file of files.filter(isOwnedPage)) {
    const fail = message => failures.push(`${relative(file)}: ${message}`);
    const { nodes, errors, codeText } = parseHtml(await readFile(file, "utf8"));
    errors.forEach(fail);
    pageCount++;
    const ids = new Set();
    for (const node of nodes) {
        const id = node.attributes.id;
        if (id && ids.has(id)) fail(`Duplicate id: ${id}`);
        if (id) ids.add(id);
    }
    if (nodes.filter(node => node.tag === "h1").length !== 1) fail("Expected exactly one h1");
    for (const node of nodes) {
        for (const attribute of ["aria-labelledby", "aria-describedby", "aria-controls", "for"]) {
            // Only <label for> is an ID reference; other elements may use 'for' differently.
            if (attribute === "for" && node.tag !== "label") continue;
            for (const id of (node.attributes[attribute] || "").split(/\s+/).filter(Boolean)) {
                if (!ids.has(id)) fail(`${attribute} references missing id: ${id}`);
            }
        }
        if (node.tag === "table" && relative(file).startsWith("notes/")) {
            tableCount++;
            const rows = node.children.flatMap(child => child.tag === "tr" ? [child] : child.children.filter(item => item.tag === "tr"));
            // Account for both colspan and rowspan when checking the rectangular grid.
            const grid = [];
            rows.forEach((row, rowIndex) => {
                grid[rowIndex] ||= [];
                let column = 0;
                for (const cell of row.children.filter(child => ["td", "th"].includes(child.tag))) {
                    while (grid[rowIndex][column]) column++;
                    const width = Number(cell.attributes.colspan || 1);
                    const height = cell.attributes.rowspan === "0" ? rows.length - rowIndex : Number(cell.attributes.rowspan || 1);
                    if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 1000)) {
                        fail("Invalid table span"); continue;
                    }
                    for (let r = rowIndex; r < rowIndex + height; r++) {
                        grid[r] ||= [];
                        for (let c = column; c < column + width; c++) {
                            if (grid[r][c]) fail("Overlapping table cells");
                            grid[r][c] = true;
                        }
                    }
                    column += width;
                }
            });
            const columns = grid[0]?.length;
            if (grid.length !== rows.length || grid.some(row => row.length !== columns || Array.from(row).some(cell => !cell))) {
                fail("Inconsistent table columns or row spans");
            }
        }
        if (node.tag === "code" && node.attributes["data-source"]) {
            const sourceFile = path.resolve(path.dirname(file), node.attributes["data-source"]);
            if (!relative(sourceFile).startsWith("notes/") || !/\.(cpp|hpp)$/.test(sourceFile)) {
                fail(`Invalid code source: ${node.attributes["data-source"]}`); continue;
            }
            embeddedSources.add(sourceFile);
            const source = await readFile(sourceFile, "utf8");
            if (source.trim().replaceAll("\r\n", "\n") !== codeText(node).trim().replaceAll("\r\n", "\n")) {
                fail(`Displayed code differs from ${relative(sourceFile)}`);
            }
        }
    }
}
for (const file of files.filter(file => relative(file).startsWith("notes/") && /\.(cpp|hpp)$/.test(file))) {
    if (!embeddedSources.has(file)) failures.push(`${relative(file)}: no data-source block displays this downloadable source`);
}
for (const note of notes) {
    if (!files.includes(path.join(workspace, "notes", note.slug, "index.html"))) failures.push(`Missing note: ${note.slug}`);
}
if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
} else {
    console.log(`Page checks passed: ${pageCount} owned pages, ${tableCount} note tables, ${embeddedSources.size} downloadable sources`);
}
