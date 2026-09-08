import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const directory = new URL("../tests/unit/", import.meta.url);
const files = (await readdir(directory)).filter(name => name.endsWith(".test.js")).sort();
if (!files.length) throw new Error("No unit tests found");
// Pass explicit paths so discovery does not depend on shell glob expansion.
const result = spawnSync(process.execPath, ["--test", ...files.map(name => fileURLToPath(new URL(name, directory)))], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
