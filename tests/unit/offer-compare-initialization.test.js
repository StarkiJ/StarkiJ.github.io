const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createDocument } = require("../helpers/dom.js");

const source = fs.readFileSync(path.join(__dirname, "../../tools/offer-compare/js/app.js"), "utf8");
const dependencies = [
    "Core", "Model", "Selectors", "Ui", "Editor", "Order", "TaxView", "Storage", "ComparisonView"
];

for (const missing of dependencies) {
    test(`missing ${missing} module displays a recoverable initialization message`, () => {
        const document = createDocument();
        const window = Object.fromEntries(dependencies
            .filter(name => name !== missing)
            .map(name => ["OfferCompare" + name, {}]));
        const application = document.getElementById("offerComparator");
        application.setAttribute("aria-busy", "true");
        application.setAttribute("inert", "");
        assert.doesNotThrow(() => vm.runInNewContext(source, { window, document }));
        assert.equal(application.getAttribute("aria-busy"), "false");
        assert.equal(application.getAttribute("inert"), null);
        assert.match(document.getElementById("resultStatus").textContent, /模块加载失败/);
    });
}
