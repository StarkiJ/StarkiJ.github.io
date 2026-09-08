import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(workspace, "tools/offer-compare/index.html");
const html = await readFile(entry, "utf8");
let updated = html;
const stale = [];

// Normalize line endings so Windows checkouts and Linux CI use the same URLs.
for (const match of html.matchAll(/(?:src|href)="((?:\.\/|\.\.\/)[^"?#]+\.(?:js|css))(?:\?[^"#]*)?"/g)) {
    const asset = await readFile(path.resolve(path.dirname(entry), match[1]), "utf8");
    const version = createHash("sha256").update(asset.replace(/\r\n/g, "\n")).digest("hex").slice(0, 12);
    const reference = match[0].slice(0, match[0].indexOf('"') + 1) + match[1] + "?v=" + version + '"';
    if (reference !== match[0]) {
        stale.push(match[1]);
        updated = updated.replace(match[0], reference);
    }
}

if (process.argv.includes("--check")) {
    if (stale.length) {
        console.error("Offer resource versions are stale: " + stale.join(", ") +
            ". Run npm run version:offer-assets and commit the updated HTML.");
        process.exitCode = 1;
    } else {
        console.log("Offer resource versions match their contents");
    }
} else {
    if (updated !== html) { await writeFile(entry, updated); }
    console.log("Updated " + stale.length + " Offer resource versions");
}
