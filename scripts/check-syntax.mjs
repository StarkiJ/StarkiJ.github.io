import { execFileSync } from "node:child_process";
import { walk, relative } from "./lib/site.mjs";

const scripts = (await walk()).filter(file => /\.(mjs|js)$/.test(file));
for (const file of scripts) {
    try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); }
    catch (error) {
        console.error(`${relative(file)}:\n${error.stderr?.toString() || error.message}`);
        process.exitCode = 1;
    }
}
if (!process.exitCode) console.log(`JavaScript syntax checks passed (${scripts.length} files)`);
