"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var policy = require("../tools/js/offer_compare_tax_policy.js");

assert.deepStrictEqual(
    Object.keys(policy).sort(),
    ["bracketFor", "resolve"],
    "政策模块只应公开解析与税率档位查询入口"
);

var verifiedFirst = policy.resolve(2020);
var verifiedLast = policy.resolve(2027);
assert.strictEqual(verifiedFirst.version, 1, "resolved policy should expose its rule version");
assert.deepStrictEqual(
    verifiedFirst.verificationRange,
    { from: 2020, through: 2027 },
    "verified tax years should be explicit"
);

assert.strictEqual(verifiedFirst.verified, true, "2020 should be verified");
assert.strictEqual(verifiedFirst.appliedYear, 2020, "verified years should use themselves");
assert.strictEqual(verifiedLast.verified, true, "2027 should be verified");
assert.strictEqual(verifiedLast.appliedYear, 2027, "verified years should use themselves");
assert.deepStrictEqual(verifiedFirst.warnings, [], "verified years should not warn");
assert.strictEqual(
    verifiedLast.annualBonusSeparate.available,
    true,
    "separate annual-bonus taxation should remain available through 2027"
);

var beforeVerified = policy.resolve(2019);
assert.strictEqual(beforeVerified.verified, false, "years before 2020 should be estimates");
assert.strictEqual(beforeVerified.estimated, true, "unverified years should be marked estimated");
assert.strictEqual(beforeVerified.appliedYear, 2020, "older years should use the nearest verified rules");
assert.strictEqual(
    beforeVerified.warnings[0].code,
    "tax_policy_year_unverified",
    "older years should carry a stable warning code"
);

var beforeSeparatePolicy = policy.resolve(2018);
assert.strictEqual(
    beforeSeparatePolicy.annualBonusSeparate.available,
    false,
    "separate annual-bonus taxation should not be available before its effective range"
);
assert.strictEqual(
    beforeSeparatePolicy.annualBonusSeparate.effectiveForRequestedYear,
    false,
    "pre-policy years should be marked outside the policy effective range"
);

var afterVerified = policy.resolve(2028);
assert.strictEqual(afterVerified.verified, false, "years after 2027 should be estimates");
assert.strictEqual(afterVerified.appliedYear, 2027, "future years should use the latest verified rules");
assert.match(
    afterVerified.warnings[0].message,
    /2028 年超出已核验税务年份.*最近的 2027 年税率规则估算/,
    "future-year warnings should identify both requested and applied years"
);
assert.strictEqual(
    afterVerified.annualBonusSeparate.available,
    false,
    "separate annual-bonus taxation should not be available after 2027"
);
assert.strictEqual(
    afterVerified.annualBonusSeparate.effectiveRange.through,
    2027,
    "the legal policy end year should be represented independently from verification"
);

[undefined, null, "", "not-a-year", NaN, Infinity].forEach(function (invalidYear) {
    var invalid = policy.resolve(invalidYear);

    assert.strictEqual(invalid.verified, false, "invalid years should never be verified");
    assert.strictEqual(invalid.requestedYear, null, "invalid years should remain explicit");
    assert.strictEqual(
        invalid.warnings[0].code,
        "tax_policy_year_invalid",
        "invalid years should carry a stable warning code"
    );
    assert.strictEqual(
        invalid.annualBonusSeparate.available,
        false,
        "invalid years should not enable separate annual-bonus taxation"
    );
});

function assertBracketBoundaries(rule, label) {
    rule.brackets.slice(0, -1).forEach(function (bracket, index) {
        var atBoundary = policy.bracketFor(bracket.limit, rule.brackets);
        var aboveBoundary = policy.bracketFor(bracket.limit + 0.01, rule.brackets);

        assert.strictEqual(
            atBoundary.rate,
            bracket.rate,
            label + " should include the upper boundary in its current bracket"
        );
        assert.strictEqual(
            atBoundary.quickDeduction,
            bracket.quickDeduction,
            label + " should use the current quick deduction at the boundary"
        );
        assert.strictEqual(
            aboveBoundary.rate,
            rule.brackets[index + 1].rate,
            label + " should move to the next bracket immediately above the boundary"
        );
        assert.strictEqual(
            aboveBoundary.quickDeduction,
            rule.brackets[index + 1].quickDeduction,
            label + " should move to the next quick deduction above the boundary"
        );
    });
}

assertBracketBoundaries(
    verifiedFirst.comprehensive,
    "annual comprehensive income"
);
assertBracketBoundaries(
    verifiedFirst.annualBonusSeparate,
    "annual bonus monthly equivalent"
);

var mutated = policy.resolve(2026);
mutated.comprehensive.brackets[0].rate = 1;
assert.strictEqual(
    policy.resolve(2026).comprehensive.brackets[0].rate,
    0.03,
    "resolved policy data should not mutate module-level rules"
);

var browserSource = fs.readFileSync(
    path.join(__dirname, "..", "tools", "js", "offer_compare_tax_policy.js"),
    "utf8"
);
var browserContext = {
    window: {}
};
vm.runInNewContext(browserSource, browserContext, {
    filename: "offer_compare_tax_policy.js"
});
assert.strictEqual(
    typeof browserContext.window.OfferCompareTaxPolicy.resolve,
    "function",
    "the policy module should expose the same API in a browser"
);
assert.strictEqual(
    browserContext.window.OfferCompareTaxPolicy.resolve(2027).verified,
    true,
    "the browser policy API should resolve verified years"
);

console.log("offer_compare_tax_policy tests passed");
