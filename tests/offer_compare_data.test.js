"use strict";

var assert = require("assert");
var dataLoader = require("../tools/js/offer_compare_data.js");

var coreStub = {
    createDefaultState: function (state) {
        return state || { version: 2, settings: {}, offers: [] };
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
        [dataLoader.PRIVATE_URL],
        "私有文件成功时不应请求其他种子文件"
    );
    assert.strictEqual(privateResult.source.kind, "private");

    var fallbackRequests = [];
    var fallbackResult = await dataLoader.loadSeedState(coreStub, {
        fetch: async function (url) {
            fallbackRequests.push(url);
            if (url === dataLoader.PRIVATE_URL) {
                return response(404, null);
            }
            return response(200, { version: 2, offers: [] });
        }
    });

    assert.deepStrictEqual(
        fallbackRequests,
        [dataLoader.PRIVATE_URL, dataLoader.EXAMPLE_URL],
        "应只按稳定私有文件、脱敏示例的顺序请求"
    );
    assert.strictEqual(fallbackResult.source.kind, "example");
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(dataLoader, "exportUrlFor"),
        false,
        "数据加载器不应再暴露年度导出 URL"
    );
}

run().then(function () {
    console.log("offer_compare_data tests passed");
}).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
