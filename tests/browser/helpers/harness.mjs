import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const helpersDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(helpersDirectory, "../../..");
const browserCandidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
];
const CDP_OPEN_TIMEOUT_MS = 10000;
const CDP_COMMAND_TIMEOUT_MS = 10000;

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function existingBrowser() {
    for (const candidate of browserCandidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // Try the next installed browser path.
        }
    }
    throw new Error("Microsoft Edge was not found");
}

function contentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return {
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml"
    }[extension] || "application/octet-stream";
}

async function startPublicExampleServer() {
    let seedFilesUnavailable = false;
    let seedResponseDelayMilliseconds = 0;
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url, "http://127.0.0.1");
            const pathname = decodeURIComponent(requestUrl.pathname);

            if (seedResponseDelayMilliseconds > 0 &&
                    pathname === "/tools/offer-compare/data/examples.json") {
                await delay(seedResponseDelayMilliseconds);
            }

            if (pathname === "/tools/offer-compare/data/private.json") {
                response.writeHead(seedFilesUnavailable ? 503 : 404);
                response.end();
                return;
            }

            if (seedFilesUnavailable &&
                    pathname === "/tools/offer-compare/data/examples.json") {
                response.writeHead(503);
                response.end();
                return;
            }

            let relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
            if (relativePath.endsWith("/")) {
                relativePath += "index.html";
            }
            const filePath = path.resolve(workspace, relativePath);
            const workspacePrefix = workspace.endsWith(path.sep)
                ? workspace
                : workspace + path.sep;

            if (filePath !== workspace && !filePath.startsWith(workspacePrefix)) {
                response.writeHead(403);
                response.end();
                return;
            }

            const body = await readFile(filePath);
            response.writeHead(200, {
                "Cache-Control": "no-store",
                "Content-Type": contentType(filePath)
            });
            response.end(body);
        } catch {
            response.writeHead(404);
            response.end();
        }
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    server.setSeedFilesUnavailable = (value) => {
        seedFilesUnavailable = Boolean(value);
    };
    server.setSeedResponseDelay = (milliseconds) => {
        seedResponseDelayMilliseconds = Math.max(0, Number(milliseconds) || 0);
    };
    return server;
}

async function waitForDevTools(profileDirectory, browserProcess) {
    const activePortFile = path.join(profileDirectory, "DevToolsActivePort");

    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (browserProcess.exitCode !== null) {
            throw new Error("Browser exited before DevTools became available");
        }
        try {
            const [port] = (await readFile(activePortFile, "utf8")).trim().split(/\r?\n/);
            if (port) {
                return Number(port);
            }
        } catch {
            // Edge creates the file after its browser process is ready.
        }
        await delay(100);
    }
    throw new Error("Timed out waiting for the DevTools port");
}

class CdpClient {
    constructor(webSocketUrl) {
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        this.socket = new WebSocket(webSocketUrl);
        this.closed = false;
    }

    async open() {
        await new Promise((resolve, reject) => {
            let timeout;
            const cleanup = () => {
                clearTimeout(timeout);
                this.socket.removeEventListener("open", handleOpen);
                this.socket.removeEventListener("error", handleError);
                this.socket.removeEventListener("close", handleClose);
            };
            const handleOpen = () => {
                cleanup();
                resolve();
            };
            const handleError = () => {
                cleanup();
                reject(new Error("CDP WebSocket failed to open"));
            };
            const handleClose = () => {
                cleanup();
                reject(new Error("CDP WebSocket closed before opening"));
            };

            this.socket.addEventListener("open", handleOpen, { once: true });
            this.socket.addEventListener("error", handleError, { once: true });
            this.socket.addEventListener("close", handleClose, { once: true });
            timeout = setTimeout(() => {
                cleanup();
                reject(new Error(
                    `CDP WebSocket did not open within ${CDP_OPEN_TIMEOUT_MS} ms`
                ));
            }, CDP_OPEN_TIMEOUT_MS);
        });
        this.socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);

            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject, timeout } = this.pending.get(message.id);
                this.pending.delete(message.id);
                clearTimeout(timeout);
                if (message.error) {
                    reject(new Error(message.error.message));
                } else {
                    resolve(message.result);
                }
                return;
            }

            const callbacks = this.listeners.get(message.method) || [];
            callbacks.forEach((callback) => callback(message.params));
        });
        this.socket.addEventListener("error", () => {
            this.rejectPending(new Error("CDP WebSocket error"));
        });
        this.socket.addEventListener("close", () => {
            this.closed = true;
            this.rejectPending(new Error("CDP WebSocket closed"));
        });
    }

    on(method, callback) {
        const callbacks = this.listeners.get(method) || [];
        callbacks.push(callback);
        this.listeners.set(method, callbacks);
    }

    send(method, params = {}) {
        if (this.closed || this.socket.readyState !== 1) {
            return Promise.reject(new Error(
                `Cannot send ${method}: CDP WebSocket is not open`
            ));
        }
        const id = this.nextId;
        this.nextId += 1;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(
                    `CDP command timed out after ${CDP_COMMAND_TIMEOUT_MS} ms: ${method}`
                ));
            }, CDP_COMMAND_TIMEOUT_MS);

            this.pending.set(id, { resolve, reject, timeout });
            try {
                this.socket.send(JSON.stringify({ id, method, params }));
            } catch (error) {
                clearTimeout(timeout);
                this.pending.delete(id);
                reject(error);
            }
        });
    }

    rejectPending(error) {
        this.pending.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(error);
        });
        this.pending.clear();
    }

    close() {
        this.closed = true;
        this.rejectPending(new Error("CDP client closed"));
        if (this.socket.readyState === 0 || this.socket.readyState === 1) {
            this.socket.close();
        }
    }
}

async function evaluate(client, expression) {
    const response = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
    });

    if (response.exceptionDetails) {
        const exception = response.exceptionDetails.exception;
        throw new Error(
            exception?.description ||
            response.result?.description ||
            response.exceptionDetails.text ||
            "Browser evaluation failed"
        );
    }
    return response.result.value;
}

async function waitFor(client, expression, message) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(client, expression)) {
            return;
        }
        await delay(100);
    }
    throw new Error(message);
}

async function closeServer(server) {
    if (!server || !server.listening) {
        return;
    }
    await new Promise((resolve) => {
        server.close(resolve);
        if (typeof server.closeAllConnections === "function") {
            server.closeAllConnections();
        }
    });
}

function waitForProcessExit(browserProcess, timeoutMilliseconds) {
    if (browserProcess.exitCode !== null) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        let timeout;
        const finish = (exited) => {
            clearTimeout(timeout);
            browserProcess.removeListener("exit", handleExit);
            resolve(exited);
        };
        const handleExit = () => finish(true);

        browserProcess.once("exit", handleExit);
        timeout = setTimeout(
            () => finish(browserProcess.exitCode !== null),
            timeoutMilliseconds
        );
    });
}

async function stopBrowser(browserProcess) {
    if (!browserProcess || browserProcess.exitCode !== null) {
        return;
    }

    browserProcess.kill();
    if (await waitForProcessExit(browserProcess, 2000)) {
        return;
    }

    browserProcess.kill("SIGKILL");
    if (!await waitForProcessExit(browserProcess, 2000)) {
        throw new Error("Browser process did not exit during cleanup");
    }
}

async function startOfferCompareBrowser() {
    const runtimeErrors = [];
    let browserErrors = "";
    let browserProcess;
    let client;
    let closed = false;
    let pageUrl;
    let profileDirectory = "";
    let server;

    async function close() {
        if (closed) {
            return;
        }
        closed = true;
        if (client) {
            client.close();
        }
        await stopBrowser(browserProcess);
        await closeServer(server);
        if (profileDirectory) {
            try {
                await rm(profileDirectory, {
                    recursive: true,
                    force: true,
                    maxRetries: 10,
                    retryDelay: 200
                });
            } catch (error) {
                browserErrors += "\nProfile cleanup failed: " + error.message;
            }
        }
    }

    try {
        const browserPath = await existingBrowser();
        profileDirectory = await mkdtemp(
            path.join(os.tmpdir(), "codex-offer-edge-qa-")
        );
        server = await startPublicExampleServer();
        const serverAddress = server.address();
        pageUrl =
            `http://127.0.0.1:${serverAddress.port}/tools/offer-compare/`;
        browserProcess = spawn(browserPath, [
            // Keep the test browser attached when Edge's compatibility launcher is active.
            "--edge-skip-compat-layer-relaunch",
            "--headless=new",
            // The harness only serves repository files from a loopback-only server.
            "--no-sandbox",
            "--disable-gpu",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-extensions",
            "--disable-sync",
            "--no-first-run",
            "--remote-debugging-port=0",
            `--user-data-dir=${profileDirectory}`,
            "--window-size=1440,1000",
            "about:blank"
        ], {
            stdio: ["ignore", "ignore", "pipe"],
            windowsHide: true
        });
        browserProcess.stderr.setEncoding("utf8");
        browserProcess.stderr.on("data", (chunk) => {
            browserErrors = (browserErrors + chunk).slice(-4000);
        });

        const debuggingPort = await waitForDevTools(
            profileDirectory,
            browserProcess
        );
        const target = await fetch(
            `http://127.0.0.1:${debuggingPort}/json/new?about:blank`,
            { method: "PUT" }
        ).then((response) => response.json());

        client = new CdpClient(target.webSocketDebuggerUrl);
        await client.open();
        client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
            runtimeErrors.push(
                exceptionDetails.text || "Unhandled browser exception"
            );
        });
        client.on("Log.entryAdded", ({ entry }) => {
            const expectedSeedFileMiss = entry.url && (
                entry.url.endsWith("/tools/offer-compare/data/private.json") ||
                entry.url.endsWith("/tools/offer-compare/data/examples.json")
            );
            if (entry.level === "error" && !expectedSeedFileMiss) {
                runtimeErrors.push(entry.text);
            }
        });

        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Log.enable");
        await client.send("Emulation.setDeviceMetricsOverride", {
            width: 1440,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false
        });

        return {
            client,
            server,
            pageUrl,
            runtimeErrors,
            browserDiagnostics: () => browserErrors,
            close
        };
    } catch (error) {
        await close();
        const diagnostics = browserErrors.trim();
        if (diagnostics) {
            error.message += `\nEdge diagnostics:\n${diagnostics}`;
        }
        throw error;
    }
}

export {
    delay,
    evaluate,
    startOfferCompareBrowser,
    waitFor
};
