import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { workspace, walk, relative } from "./lib/site.mjs";
import { parseHtml } from "./lib/html.mjs";

const execute = promisify(execFile);
const compiler = process.env.CXX || "g++";
const env = { ...process.env };
const pathKey = Object.keys(env).find(key => key.toUpperCase() === "PATH") || "PATH";
if (path.isAbsolute(compiler)) env[pathKey] = path.dirname(compiler) + path.delimiter + (env[pathKey] || "");
const flags = ["-std=c++17", "-Wall", "-Wextra", "-pedantic", "-pthread"];
const configuration = JSON.parse(await readFile(new URL("../tests/cpp/examples.json", import.meta.url), "utf8"));
const files = await walk();
const noteRoot = path.join(workspace, "notes");
const targets = [];
const labels = new Set();

for (const file of files.filter(file => relative(file).startsWith("notes/") && file.endsWith(".html"))) {
    const { nodes, errors, codeText } = parseHtml(await readFile(file, "utf8"));
    if (errors.length) throw new Error(`${relative(file)}: ${errors.join("; ")}`);
    for (const node of nodes.filter(node => node.tag === "code" && node.attributes["data-example"])) {
        const label = relative(file).split("/")[1] + "-" + node.attributes["data-example"];
        if (!/^[a-z0-9-]+$/.test(label) || labels.has(label)) throw new Error(`Invalid or duplicate example: ${label}`);
        labels.add(label);
        let figure = node.parent;
        while (figure && figure.tag !== "figure") figure = figure.parent;
        if (!figure) throw new Error(`Example ${label} needs a figure grouping its program and output`);
        const output = nodes.find(candidate => candidate.tag === "code" &&
            (candidate.parent.attributes?.class || "").split(/\s+/).includes("note-output") &&
            candidate.start > figure.start && candidate.end < figure.end);
        targets.push({ name: label, code: codeText(node), expected: output ? codeText(output).trim() : "" });
    }
}
const inlineCount = targets.length;
if (!inlineCount) throw new Error("No data-example programs found");
const covered = new Set();
for (const target of configuration.targets) {
    if (!/^[a-z0-9-]+$/.test(target.name) || labels.has(target.name)) throw new Error(`Invalid or duplicate target: ${target.name}`);
    labels.add(target.name);
    const sources = target.sources.map(source => {
        const file = path.resolve(noteRoot, source);
        if (!file.startsWith(noteRoot + path.sep) || !files.includes(file) || !file.endsWith(".cpp")) throw new Error(`Invalid C++ source: ${source}`);
        covered.add(source);
        return file;
    });
    targets.push({ ...target, sources });
}
for (const [source, reason] of Object.entries(configuration.excluded)) {
    if (!reason || covered.has(source) || !files.includes(path.resolve(noteRoot, source))) throw new Error(`Invalid exclusion: ${source}`);
}
for (const file of files.filter(file => relative(file).startsWith("notes/") && file.endsWith(".cpp"))) {
    const source = path.relative(noteRoot, file).split(path.sep).join("/");
    if (!covered.has(source) && !configuration.excluded[source]) throw new Error(`C++ source has no test target or documented exclusion: ${source}`);
}

await execute(compiler, ["--version"], { env, timeout: 10000 }).catch(() => {
    throw new Error("C++ compiler unavailable. Put g++ on PATH or set CXX to the compiler executable path.");
});
const temporary = await mkdtemp(path.join(os.tmpdir(), "starki-cpp-check-"));
const failures = [];
let nextTarget = 0;
let completed = 0;

async function run(command, args, timeout = 60000) {
    try {
        const result = await execute(command, args, { env, timeout, maxBuffer: 2 * 1024 * 1024 });
        if (result.stderr) console.warn(result.stderr.trim());
        return result.stdout.replaceAll("\r\n", "\n").trim();
    } catch (error) {
        throw new Error(`${error.message}\n${error.stdout || ""}\n${error.stderr || ""}`);
    }
}

async function verify(target) {
    const executable = path.join(temporary, target.name + (process.platform === "win32" ? ".exe" : ""));
    let sources = target.sources;
    if (target.code !== undefined) {
        const source = path.join(temporary, target.name + ".cpp");
        await writeFile(source, target.code, "utf8");
        sources = [source];
    }
    const compileFlags = [...flags, ...(target.flags || [])];
    if (target.separateCompilation) {
        const objects = [];
        for (const [index, source] of sources.entries()) {
            const object = path.join(temporary, `${target.name}-${index}.o`);
            await run(compiler, [...compileFlags, "-c", source, "-o", object]);
            objects.push(object);
        }
        sources = objects;
    }
    await run(compiler, [...compileFlags, ...sources, "-o", executable]);
    const actual = await run(executable, target.args || [], 15000);
    if (target.expected !== undefined && actual !== target.expected.replaceAll("\r\n", "\n")) {
        throw new Error(`Output mismatch\nExpected: ${target.expected}\nActual: ${actual}`);
    }
}

try {
    await Promise.all(Array.from({ length: 4 }, async () => {
        while (nextTarget < targets.length) {
            const target = targets[nextTarget++];
            try { await verify(target); completed++; }
            catch (error) { failures.push(`${target.name}: ${error.message}`); }
        }
    }));
} finally {
    // Only remove this invocation's newly created temporary directory.
    if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("starki-cpp-check-")) {
        throw new Error(`Unexpected temporary directory: ${temporary}`);
    }
    await rm(temporary, { recursive: true, force: true });
}
if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
} else {
    console.log(`C++17 checks passed: ${completed} programs (${inlineCount} inline examples with output checks, ${configuration.targets.length} downloadable targets)`);
    console.log(`Intentional diagnostic examples excluded: ${Object.keys(configuration.excluded).join(", ")}`);
}
