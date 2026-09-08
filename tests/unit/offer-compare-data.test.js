"use strict";

var assert = require("assert");
var dataLoader = require("../../tools/offer-compare/js/data.js");
var PRIVATE_URL = "./data/private.json";
var EXAMPLE_URL = "./data/examples.json";

assert.deepStrictEqual(
    Object.keys(dataLoader),
    ["loadSeedState"],
    "数据模块只应公开加载入口"
);

var coreStub = {
    createDefaultState: function (state) {
        return state || { version: 2, settings: {}, offers: [] };
    },
    parseState: function (state) {
        return {
            state: state,
            validation: {
                errors: !state || state.version !== 2
                    ? [{ message: "仅支持明确标注的版本 v2" }]
                    : []
            }
        };
    }
};

function response(status, value) {
    return {
        ok: status >= 200 && status < 300,
        status: status,
        json: async function () {
            return value;
        }
    };
}

async function run() {
    var privateRequests = [];
    var privateResult = await dataLoader.loadSeedState(coreStub, {
        fetch: async function (url) {
            privateRequests.push(url);
            return response(200, { version: 2, offers: [] });
        }
    });

    assert.deepStrictEqual(
        privateRequests,
        [PRIVATE_URL],
        "私有文件成功时不应请求其他种子文件"
    );
    assert.strictEqual(privateResult.source.kind, "private");

    var fallbackRequests = [];
    var fallbackResult = await dataLoader.loadSeedState(coreStub, {
        fetch: async function (url) {
            fallbackRequests.push(url);
            if (url === PRIVATE_URL) {
                return response(404, null);
            }
            return response(200, { version: 2, offers: [] });
        }
    });

    assert.deepStrictEqual(
        fallbackRequests,
        [PRIVATE_URL, EXAMPLE_URL],
        "应只按稳定私有文件、脱敏示例的顺序请求"
    );
    assert.strictEqual(fallbackResult.source.kind, "example");

    var privateSignal;
    var timedOutPrivate = await dataLoader.loadSeedState(coreStub, {
        timeoutMs: 10,
        fetch: function (url, options) {
            if (url === PRIVATE_URL) {
                privateSignal = options.signal;
                return new Promise(function () {});
            }
            return response(200, { version: 2, offers: [] });
        }
    });
    assert.strictEqual(timedOutPrivate.source.kind, "example");
    assert.strictEqual(privateSignal.aborted, true);
    assert.match(timedOutPrivate.warnings[0], /私有数据未载入：.*超时/);

    var bodySignals = [];
    var timedOutBodies = await dataLoader.loadSeedState(coreStub, {
        timeoutMs: 10,
        fetch: function (_, options) {
            bodySignals.push(options.signal);
            return { ok: true, json: function () { return new Promise(function () {}); } };
        }
    });
    assert.strictEqual(timedOutBodies.source.kind, "empty");
    assert.strictEqual(timedOutBodies.warnings.length, 2);
    assert.ok(timedOutBodies.warnings.every(function (warning) { return /超时/.test(warning); }));
    assert.ok(bodySignals.every(function (signal) { return signal.aborted; }));

    var invalidPrivateRequests = [];
    var invalidPrivateResult = await dataLoader.loadSeedState(coreStub, {
        fetch: async function (url) {
            invalidPrivateRequests.push(url);
            return url === PRIVATE_URL
                ? response(200, { version: 1, offers: [] })
                : response(200, { version: 2, offers: [] });
        }
    });

    assert.deepStrictEqual(
        invalidPrivateRequests,
        [PRIVATE_URL, EXAMPLE_URL],
        "版本不兼容的私有数据应回退到脱敏示例"
    );
    assert.strictEqual(invalidPrivateResult.source.kind, "example");
    assert.match(
        invalidPrivateResult.warnings[0],
        /私有数据未载入：.*仅支持明确标注的版本 v2/,
        "回退信息应保留版本不兼容原因"
    );
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(dataLoader, "exportUrlFor"),
        false,
        "数据加载器不应再暴露年度导出 URL"
    );
}

run().then(function () {
    console.log("offer-compare data tests passed");
}).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
