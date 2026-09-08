import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspace = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const content = JSON.parse(await readFile(new URL("../../site-content.json", import.meta.url), "utf8"));
export const notes = content.categories.flatMap(category => category.notes);
const excludedGames = ["games/missile-game/", "games/t-rex-runner/", "games/cyber-woodenfish/"];

export function relative(file) { return path.relative(workspace, file).split(path.sep).join("/"); }
export function isOwnedPage(file) {
    const name = relative(file);
    return name.endsWith(".html") && name !== "404.html" && !excludedGames.some(prefix => name.startsWith(prefix));
}
export function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
export function escapeAttribute(value) { return escapeHtml(value).replaceAll('"', "&quot;"); }

export async function walk(directory = workspace) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if ([".git", "node_modules"].includes(entry.name)) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await walk(file));
        else if (entry.isFile()) files.push(file);
    }
    return files.sort();
}
