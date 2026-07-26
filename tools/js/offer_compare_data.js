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

    var PRIVATE_URL = "./data/offer_compare_private.json";
    var EXAMPLE_URL = "./data/offer_compare_examples.json";

    function isStateFile(value) {
        return value && typeof value === "object" && Array.isArray(value.offers);
    }

    function describeError(error) {
        return error && error.message ? error.message : String(error);
    }

    async function fetchState(fetcher, url) {
        var response = await fetcher(url, { cache: "no-store" });
        var error;
        var value;

        if (!response.ok) {
            error = new Error("读取 " + url + " 失败（HTTP " + response.status + "）");
            error.status = response.status;
            throw error;
        }
        value = await response.json();
        if (!isStateFile(value)) {
            throw new Error(url + " 缺少 offers 数组");
        }
        return value;
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
            privateState = await fetchState(fetcher, PRIVATE_URL);
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
            exampleState = await fetchState(fetcher, EXAMPLE_URL);
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
