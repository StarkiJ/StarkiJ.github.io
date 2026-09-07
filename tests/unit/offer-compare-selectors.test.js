"use strict";

var assert = require("assert");
var selectors = require("../../tools/offer-compare/js/selectors.js");

function offer(id, overrides) {
    return Object.assign({
        id: id,
        company: "公司 " + id,
        department: "平台",
        city: "上海",
        pay: {
            monthlySalary: 20000,
            salaryMonths: 14
        }
    }, overrides || {});
}

function result(overrides) {
    var values = Object.assign({
        averageWeeklyPresenceHours: 50,
        averageWeeklyNetHours: 40,
        annualPretaxCash: 500000,
        annualTakeHomeCash: 400000,
        pretaxHourly: 200,
        afterTaxHourly: 160,
        housingFundEquity: 48000,
        cashAndHousingFundEquity: 448000,
        annualIncomeTax: 60000
    }, overrides || {});

    return {
        work: {
            averageWeeklyPresenceHours: values.averageWeeklyPresenceHours,
            averageWeeklyNetHours: values.averageWeeklyNetHours
        },
        metrics: {
            annualPretaxCash: values.annualPretaxCash,
            annualTakeHomeCash: values.annualTakeHomeCash,
            pretaxHourly: values.pretaxHourly,
            afterTaxHourly: values.afterTaxHourly,
            housingFundEquity: values.housingFundEquity,
            cashAndHousingFundEquity: values.cashAndHousingFundEquity,
            annualIncomeTax: values.annualIncomeTax
        }
    };
}

function calculation(primaryHoursBasis) {
    return {
        state: {
            settings: {
                primaryHoursBasis: primaryHoursBasis || "presence"
            },
            offers: [
                offer("first"),
                offer("second", {
                    company: "另一公司",
                    department: "",
                    city: "北京",
                    pay: {
                        monthlySalary: 18000,
                        salaryMonths: 12
                    }
                })
            ]
        },
        results: [
            result(),
            result({
                averageWeeklyPresenceHours: 45,
                averageWeeklyNetHours: 35,
                annualPretaxCash: 450000,
                annualTakeHomeCash: 380000,
                pretaxHourly: 190,
                afterTaxHourly: 170,
                housingFundEquity: 36000,
                cashAndHousingFundEquity: 416000,
                annualIncomeTax: 50000
            })
        ]
    };
}

assert.deepStrictEqual(
    Object.keys(selectors).sort(),
    [
        "bestValues",
        "createComparisonViews",
        "findResultByOfferId",
        "isBest",
        "sortViews",
        "summaryLeaders"
    ],
    "selectors 只应公开页面实际使用的单一入口"
);

var canonicalCalculation = calculation("presence");
var views = selectors.createComparisonViews(canonicalCalculation);
assert.strictEqual(views.length, 2);
assert.strictEqual(views[0].id, "first");
assert.strictEqual(views[0].name, "公司 first · 平台");
assert.strictEqual(views[1].name, "另一公司");
assert.strictEqual(views[0].monthlySalary, 20000);
assert.strictEqual(views[1].salaryMonths, 12);
assert.strictEqual(views[0].weeklyHours, 50);
assert.strictEqual(views[0].pretaxHourly, 200);
assert.strictEqual(views[0].result, canonicalCalculation.results[0]);
assert.strictEqual(views[0].offer, canonicalCalculation.state.offers[0]);
assert.strictEqual(views[1].sourceIndex, 1);

var netCalculation = calculation("net");
var netViews = selectors.createComparisonViews(netCalculation);
assert.strictEqual(netViews[0].weeklyHours, 40);
assert.strictEqual(
    netViews[0].pretaxHourly,
    netCalculation.results[0].metrics.pretaxHourly,
    "小时收入应直接采用核心已按主口径计算的指标"
);

assert.deepStrictEqual(selectors.createComparisonViews(null), []);
assert.deepStrictEqual(
    selectors.createComparisonViews({
        state: { settings: {}, offers: [] },
        results: [result()]
    }),
    [],
    "没有对应 canonical Offer 的孤立结果不应生成 view"
);

var sourceOrder = views.slice();
var ascendingIncome = selectors.sortViews(
    views,
    "annualTakeHomeCash",
    "asc"
);
assert.deepStrictEqual(
    ascendingIncome.map(function (view) {
        return view.id;
    }),
    ["second", "first"]
);
assert.deepStrictEqual(
    views,
    sourceOrder,
    "排序不应修改调用方数组"
);

var companyViews = [
    { id: "department-b", company: "A", department: "B" },
    { id: "company-b", company: "B", department: "A" },
    { id: "department-a", company: "A", department: "A" }
];
assert.deepStrictEqual(
    selectors.sortViews(
        companyViews,
        "companyDepartment",
        "asc"
    ).map(function (view) {
        return view.id;
    }),
    ["department-a", "department-b", "company-b"],
    "公司相同时应继续按部门排序"
);

var tiedViews = [
    { id: "first", afterTaxHourly: 100 },
    { id: "second", afterTaxHourly: 100 },
    { id: "third", afterTaxHourly: 100 }
];
assert.deepStrictEqual(
    selectors.sortViews(
        tiedViews,
        "afterTaxHourly",
        "desc"
    ).map(function (view) {
        return view.id;
    }),
    ["first", "second", "third"],
    "相同指标应保持原始顺序"
);
assert.deepStrictEqual(
    selectors.sortViews(
        views,
        "unknown",
        "desc"
    ).map(function (view) {
        return view.id;
    }),
    ["second", "first"],
    "未知排序字段应回退到税后时薪降序"
);

var best = selectors.bestValues(views);
var leaders = selectors.summaryLeaders(views);
assert.strictEqual(best.monthlySalary, 20000);
assert.strictEqual(best.weeklyHours, 45);
assert.strictEqual(best.annualTakeHomeCash, 400000);
assert.strictEqual(best.afterTaxHourly, 170);
assert.strictEqual(leaders.afterTaxHourly.id, "second");
assert.strictEqual(leaders.annualTakeHomeCash.id, "first");
assert.strictEqual(leaders.weeklyHours.id, "second");
assert.strictEqual(selectors.isBest(170, best.afterTaxHourly), true);
assert.strictEqual(selectors.isBest(169.99, best.afterTaxHourly), false);
assert.strictEqual(selectors.isBest(1, 1.00005), true);
assert.strictEqual(selectors.isBest(1, 1, 0), true);
assert.strictEqual(selectors.isBest(0, null), false);

assert.deepStrictEqual(selectors.sortViews([], "afterTaxHourly", "desc"), []);
assert.deepStrictEqual(selectors.bestValues([]), {
    monthlySalary: null,
    salaryMonths: null,
    weeklyHours: null,
    annualPretaxCash: null,
    annualTakeHomeCash: null,
    pretaxHourly: null,
    afterTaxHourly: null,
    housingFundEquity: null,
    cashAndHousingFundEquity: null
});
assert.deepStrictEqual(selectors.summaryLeaders([]), {
    afterTaxHourly: null,
    annualTakeHomeCash: null,
    weeklyHours: null
});

assert.strictEqual(
    selectors.findResultByOfferId(canonicalCalculation, "second"),
    canonicalCalculation.results[1]
);
assert.strictEqual(
    selectors.findResultByOfferId(canonicalCalculation.results, "first"),
    null,
    "不应再兼容脱离 state 的 results 数组"
);
assert.strictEqual(
    selectors.findResultByOfferId(canonicalCalculation, "missing"),
    null
);
assert.strictEqual(selectors.findResultByOfferId(null, "missing"), null);

// Custom order follows the saved Offer sequence, even after a metric sort.
var reversedViews = views.slice().reverse();
assert.deepStrictEqual(selectors.sortViews(reversedViews, "custom", "desc"), views);
assert.deepStrictEqual(selectors.sortViews(reversedViews, "custom", "asc"), views);
assert.deepStrictEqual(reversedViews, views.slice().reverse());

console.log("offer-compare selectors tests passed");
