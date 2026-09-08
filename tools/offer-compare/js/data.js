(function (root, factory) {
    "use strict";

    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.OfferCompareData = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    var PRIVATE_URL = "./data/private.json";
    var EXAMPLE_URL = "./data/examples.json";
    var REQUEST_TIMEOUT_MS = 8000;

    function isStateFile(value) {
        return value && typeof value === "object" && Array.isArray(value.offers);
    }

    function describeError(error) {
        return error && error.message ? error.message : String(error);
    }

    async function fetchState(fetcher, url, timeoutMs) {
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var options = { cache: "no-store" };
        var timer;
        if (controller) { options.signal = controller.signal; }

        // Bound both the request and response body; either can otherwise wait forever.
        var timeout = new Promise(function (_, reject) {
            timer = setTimeout(function () {
                reject(new Error("读取 " + url + " 超时，请检查网络连接。"));
                if (controller) { controller.abort(); }
            }, timeoutMs);
        });
        var request = (async function () {
            var response = await fetcher(url, options);
            var error;
            if (!response.ok) {
                error = new Error("读取 " + url + " 失败（HTTP " + response.status + "）");
                error.status = response.status;
                throw error;
            }
            var value = await response.json();
            if (!isStateFile(value)) {
                throw new Error(url + " 缺少 offers 数组");
            }
            return value;
        }());
        try {
            return await Promise.race([request, timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    function parseSeedState(core, rawState, url) {
        var parsed = core.parseState(rawState);
        if (parsed.validation.errors.length) {
            throw new Error(
                url + " 无法解析：" + parsed.validation.errors[0].message
            );
        }
        return parsed.state;
    }

    async function loadSeedState(core, options) {
        var settings = options || {};
        var timeoutMs = Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0
            ? settings.timeoutMs : REQUEST_TIMEOUT_MS;
        var fetcher = settings.fetch || (
            typeof fetch === "function" ? fetch.bind(globalThis) : null
        );
        var warnings = [];
        var privateState;
        var exampleState;

        if (!core || typeof core.createDefaultState !== "function") {
            throw new Error("Offer 计算核心不可用");
        }
        if (!fetcher) {
            return {
                state: core.createDefaultState(),
                source: { kind: "empty", label: "空白数据", file: "" },
                warnings: ["当前环境不支持读取 JSON 数据文件。"]
            };
        }

        try {
            privateState = await fetchState(fetcher, PRIVATE_URL, timeoutMs);
            return {
                state: parseSeedState(core, privateState, PRIVATE_URL),
                source: { kind: "private", label: "本机私有数据", file: PRIVATE_URL },
                warnings: warnings
            };
        } catch (error) {
            if (error.status !== 404) {
                warnings.push("私有数据未载入：" + describeError(error));
            }
        }

        try {
            exampleState = await fetchState(fetcher, EXAMPLE_URL, timeoutMs);
            return {
                state: parseSeedState(core, exampleState, EXAMPLE_URL),
                source: { kind: "example", label: "脱敏示例", file: EXAMPLE_URL },
                warnings: warnings
            };
        } catch (error) {
            warnings.push("脱敏示例未载入：" + describeError(error));
        }

        return {
            state: core.createDefaultState(),
            source: { kind: "empty", label: "空白数据", file: "" },
            warnings: warnings
        };
    }

    return {
        loadSeedState: loadSeedState
    };
}));
