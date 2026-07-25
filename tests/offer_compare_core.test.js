"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var core = require("../tools/js/offer_compare_core.js");

function stateWithSchedule(cycleWeeks, days) {
    return {
        version: core.VERSION,
        offers: [
            {
                id: "example",
                company: "示例公司",
                pay: {
                    monthlySalary: 10000,
                    salaryMonths: 12
                },
                schedule: {
                    cycleWeeks: cycleWeeks,
                    days: days
                }
            }
        ]
    };
}

function normalizedSchedule(cycleWeeks, days) {
    return core.normalize(stateWithSchedule(cycleWeeks, days)).offers[0].schedule;
}

assert.strictEqual(core.MAX_CYCLE_WEEKS, 52, "应导出 52 周的周期上限");

var declaredLonger = normalizedSchedule(3, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
assert.strictEqual(declaredLonger.cycleWeeks, 3, "应保留较大的声明周期");

var inferredLonger = normalizedSchedule(1, [
    { week: 9, weekday: 1, start: "09:00", end: "17:00" }
]);
assert.strictEqual(inferredLonger.cycleWeeks, 9, "应从班次推断较大的周期");
assert.strictEqual(inferredLonger.days[0].week, 9, "不应把合法的高周次压回声明周期");

var maximum = normalizedSchedule(52, [
    { week: 52, weekday: 1, start: "09:00", end: "17:00" }
]);
assert.strictEqual(maximum.cycleWeeks, 52, "应支持 52 周周期");
assert.strictEqual(maximum.days[0].week, 52, "应保留第 52 周班次");

var capped = normalizedSchedule(99, [
    { week: 99, weekday: 1, start: "09:00", end: "17:00" }
]);
assert.strictEqual(capped.cycleWeeks, 52, "超长声明周期应限制为 52 周");
assert.strictEqual(capped.days[0].week, 52, "超长班次周次应限制为第 52 周");

var calculated = core.calculateAll(stateWithSchedule(3, [
    { week: 3, weekday: 1, start: "09:00", end: "17:00" }
]));
assert.strictEqual(
    calculated.results[0].work.averageWeeklyPresenceHours,
    8 / 3,
    "周期总工时应除以声明的周期周数"
);

var emptySchedule = normalizedSchedule(3, []);
assert.strictEqual(emptySchedule.cycleWeeks, 3, "空排班也应保留声明周期");
assert.deepStrictEqual(emptySchedule.days, [], "显式清空全部工作日后不应恢复标准排班");
assert.strictEqual(
    core.calculateAll(stateWithSchedule(3, [])).results[0].work.averageWeeklyPresenceHours,
    0,
    "空排班的平均周在岗时长应为 0"
);

var externalIncomeState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
externalIncomeState.settings = { otherComprehensiveIncome: 1000000 };
var externalIncomeResult = core.calculateAll(externalIncomeState).results[0];
assert.strictEqual(
    externalIncomeResult.metrics.annualIncomeTax,
    externalIncomeResult.tax.selectedTotalTax - externalIncomeResult.tax.baseline.totalTax,
    "Offer 个税应只扣除相对其他收入基线新增的税额"
);
assert.ok(
    externalIncomeResult.metrics.annualTakeHomeCash > 0,
    "其他综合所得不应让正常 Offer 的到手现金错误变成负数"
);

var migratedV1 = core.normalize({
    version: 1,
    settings: { lunchBreakHours: 1 },
    offers: []
});
assert.strictEqual(migratedV1.version, 2, "v1 状态应迁移为 v2");
assert.strictEqual(migratedV1.settings.lunchBreakHours, 2, "v1 默认午休应迁移为 2 小时");

var preservedV2 = core.normalize({
    version: 2,
    settings: {
        lunchBreakHours: 1,
        weeksPerYear: 53,
        primaryHoursBasis: "net"
    },
    offers: []
});
assert.strictEqual(preservedV2.settings.lunchBreakHours, 2, "默认午休应固定为 2 小时");
assert.strictEqual(preservedV2.settings.weeksPerYear, 52, "年度折算应固定为 52 周");
assert.strictEqual(preservedV2.settings.primaryHoursBasis, "net", "合法的工时口径应保留");
assert.strictEqual(core.createDefaultState().settings.lunchBreakHours, 2, "新状态应默认午休 2 小时");

var perOfferState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "20:00" }
]);
perOfferState.settings = {
    socialInsuranceRate: 0.1,
    primaryHoursBasis: "net"
};
perOfferState.offers[0].socialInsuranceRate = 0.2;
perOfferState.offers[0].schedule.lunchBreakHours = 1;
perOfferState.offers[0].schedule.dinnerBreakHours = 0.5;
var perOfferResult = core.calculateAll(perOfferState).results[0];
assert.strictEqual(
    perOfferResult.contributions.socialInsuranceRate,
    0.2,
    "Offer 社保比例应覆盖全局默认"
);
assert.strictEqual(
    perOfferResult.metrics.employeeSocialInsurance,
    24000,
    "个人社保应使用 Offer 覆盖比例"
);
assert.strictEqual(
    perOfferResult.work.averageWeeklyPresenceHours,
    11,
    "休息覆盖不应改变在岗时长"
);
assert.strictEqual(
    perOfferResult.work.averageWeeklyNetHours,
    9.5,
    "净工时应使用 Offer 的午休和晚休覆盖"
);

perOfferState.offers[0].socialInsuranceRate = 0;
perOfferState.offers[0].schedule.lunchBreakHours = 0;
perOfferState.offers[0].schedule.dinnerBreakHours = 0;
var explicitZeroResult = core.calculateAll(perOfferState).results[0];
assert.strictEqual(
    explicitZeroResult.metrics.employeeSocialInsurance,
    0,
    "显式 0% 社保不应被当作继承默认"
);
assert.strictEqual(
    explicitZeroResult.work.averageWeeklyNetHours,
    11,
    "显式 0 小时休息不应被当作继承默认"
);

perOfferState.offers[0].socialInsuranceRate = null;
perOfferState.offers[0].schedule.lunchBreakHours = null;
perOfferState.offers[0].schedule.dinnerBreakHours = null;
var inheritedResult = core.calculateAll(perOfferState).results[0];
assert.strictEqual(
    inheritedResult.contributions.socialInsuranceRate,
    0.1,
    "空社保比例应继承全局默认"
);
assert.strictEqual(
    inheritedResult.work.averageWeeklyNetHours,
    8,
    "空休息字段应继承 2 小时午休和 1 小时晚休"
);

var legacyPerShiftBreakState = stateWithSchedule(1, [
    {
        week: 1,
        weekday: 1,
        start: "09:00",
        end: "20:00",
        lunchBreakHours: 8,
        dinnerBreakHours: 8
    }
]);
legacyPerShiftBreakState.settings = { primaryHoursBasis: "net" };
legacyPerShiftBreakState.offers[0].schedule.lunchBreakHours = 1;
legacyPerShiftBreakState.offers[0].schedule.dinnerBreakHours = 0.5;
var normalizedLegacyPerShiftBreak = core.normalize(
    legacyPerShiftBreakState
).offers[0];
assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
        normalizedLegacyPerShiftBreak.schedule.days[0],
        "lunchBreakHours"
    ),
    false,
    "旧 JSON 中逐班午休字段应在规范化时丢弃"
);
assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
        normalizedLegacyPerShiftBreak.schedule.days[0],
        "dinnerBreakHours"
    ),
    false,
    "旧 JSON 中逐班晚休字段应在规范化时丢弃"
);
assert.strictEqual(
    core.calculateAll(legacyPerShiftBreakState)
        .results[0].work.averageWeeklyNetHours,
    9.5,
    "旧 JSON 中逐班休息字段不应覆盖 Offer 级休息设置"
);

var nullableInputState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "20:00" }
]);
nullableInputState.offers[0].socialInsuranceRate = " ";
nullableInputState.offers[0].schedule.lunchBreakHours = " ";
nullableInputState.offers[0].schedule.dinnerBreakHours = "not-a-number";
var normalizedNullableInput = core.normalize(nullableInputState).offers[0];
assert.strictEqual(
    normalizedNullableInput.socialInsuranceRate,
    null,
    "空白社保比例应规范化为继承默认"
);
assert.strictEqual(
    normalizedNullableInput.schedule.lunchBreakHours,
    null,
    "空白午休时长应规范化为继承默认"
);
assert.strictEqual(
    normalizedNullableInput.schedule.dinnerBreakHours,
    null,
    "非法晚休时长不应静默变成显式 0"
);
nullableInputState.offers[0].socialInsuranceRate = "0";
nullableInputState.offers[0].schedule.lunchBreakHours = "0";
nullableInputState.offers[0].schedule.dinnerBreakHours = "0";
normalizedNullableInput = core.normalize(nullableInputState).offers[0];
assert.strictEqual(normalizedNullableInput.socialInsuranceRate, 0, "字符串 0% 应保留为显式 0");
assert.strictEqual(normalizedNullableInput.schedule.lunchBreakHours, 0, "字符串 0 午休应保留");
assert.strictEqual(normalizedNullableInput.schedule.dinnerBreakHours, 0, "字符串 0 晚休应保留");

var expectedDefaultAssumptionKeys = [
    "resident-full-year",
    "basic-deduction",
    "global-tax-inputs",
    "bonus-tax-default",
    "salary-defaults",
    "unlisted-benefits",
    "overtime-defaults",
    "social-insurance-default",
    "housing-fund-default",
    "schedule-and-year-defaults",
    "break-defaults"
];
var emptyOfferAssumptions = core.calculateAll({
    version: core.VERSION,
    offers: []
});
assert.deepStrictEqual(
    emptyOfferAssumptions.assumptions.map(function (assumption) {
        return assumption.key;
    }),
    expectedDefaultAssumptionKeys,
    "全局默认假设应按固定类别顺序返回 11 项"
);
assert.strictEqual(
    emptyOfferAssumptions.defaultAssumptionCount,
    expectedDefaultAssumptionKeys.length,
    "没有 Offer 时仍应返回完整的全局默认假设数量"
);
assert.strictEqual(
    emptyOfferAssumptions.summary.assumptionCount,
    expectedDefaultAssumptionKeys.length,
    "摘要中的默认假设数量应与全局列表一致"
);

var assumptionInvariantState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "20:00" }
]);
var assumptionVariantA = assumptionInvariantState.offers[0];
var assumptionVariantB = JSON.parse(JSON.stringify(assumptionVariantA));
assumptionVariantA.id = "assumption-a";
assumptionVariantA.city = "A市";
assumptionVariantA.socialInsuranceRate = 0.2;
assumptionVariantA.pay.bonusTaxMode = "merged";
assumptionVariantA.schedule.lunchBreakHours = 1;
assumptionVariantA.schedule.dinnerBreakHours = 0.5;
assumptionVariantA.overtime = {
    shiftsPerYear: 0,
    start: "09:00",
    end: "18:00",
    paidHours: 8,
    payMultiplier: 0,
    payBaseMonthly: null
};
assumptionVariantB.id = "assumption-b";
assumptionVariantB.city = "B市";
assumptionVariantB.socialInsuranceRate = 0;
assumptionVariantB.pay.bonusTaxMode = "separate";
assumptionVariantB.schedule.lunchBreakHours = 0;
assumptionVariantB.schedule.dinnerBreakHours = 0;
assumptionVariantB.overtime = {
    shiftsPerYear: 12,
    start: "09:00",
    end: "21:00",
    paidHours: 8,
    payMultiplier: 2,
    payBaseMonthly: 8000
};
assumptionInvariantState.offers = [assumptionVariantA, assumptionVariantB];
var forwardAssumptions = core.calculateAll(assumptionInvariantState);
var reversedAssumptionState = JSON.parse(JSON.stringify(assumptionInvariantState));
reversedAssumptionState.offers.reverse();
var reversedAssumptions = core.calculateAll(reversedAssumptionState);
assert.deepStrictEqual(
    forwardAssumptions.assumptions,
    emptyOfferAssumptions.assumptions,
    "Offer 的城市、社保、休息、奖金和加班差异不应进入全局默认假设"
);
assert.deepStrictEqual(
    reversedAssumptions.assumptions,
    emptyOfferAssumptions.assumptions,
    "调整 Offer 顺序不应改变全局默认假设"
);
assert.strictEqual(
    forwardAssumptions.defaultAssumptionCount,
    expectedDefaultAssumptionKeys.length,
    "不同 Offer 不应改变全局默认假设数量"
);
assert.strictEqual(
    reversedAssumptions.defaultAssumptionCount,
    expectedDefaultAssumptionKeys.length,
    "调整 Offer 顺序不应改变全局默认假设数量"
);

var customizedAssumptions = core.calculateAll({
    version: core.VERSION,
    settings: {
        year: 2030,
        basicDeduction: 72000,
        specialAdditionalDeduction: 18000,
        otherDeductions: 2400,
        otherComprehensiveIncome: 3600,
        socialInsuranceRate: 0.123,
        socialInsuranceMonths: 11,
        housingFundMonths: 10,
        dinnerBreakHours: 0.75,
        dinnerThreshold: "18:30",
        standardWorkDaysPerMonth: 20.83,
        standardPaidHoursPerDay: 7.5,
        bonusTaxMode: "merged"
    },
    offers: []
});
function defaultAssumptionValue(calculation, key) {
    var assumption = calculation.assumptions.find(function (candidate) {
        return candidate.key === key;
    });

    assert.ok(assumption, "应存在全局默认假设 " + key);
    return assumption.value;
}
assert.match(
    defaultAssumptionValue(customizedAssumptions, "basic-deduction"),
    /2030 年税务口径；基本减除费用每年 72000 元/,
    "税务年份和基本减除变化应反映到默认假设"
);
assert.match(
    defaultAssumptionValue(customizedAssumptions, "global-tax-inputs"),
    /专项附加扣除 18000 元；其他依法扣除 2400 元；其他综合所得 3600 元/,
    "全局收入与扣除变化应反映到默认假设"
);
assert.match(
    defaultAssumptionValue(customizedAssumptions, "bonus-tax-default"),
    /Offer 未指定时并入综合所得计税/,
    "全局奖金计税方式应反映到默认假设"
);
assert.match(
    defaultAssumptionValue(customizedAssumptions, "overtime-defaults"),
    /每月 20\.83 个计薪日、每天 7\.5 个计薪小时/,
    "全局加班折算参数应反映到默认假设"
);
assert.match(
    defaultAssumptionValue(customizedAssumptions, "social-insurance-default"),
    /12\.3% 缴纳 11 个月/,
    "全局社保比例和缴纳月数应反映到默认假设"
);
assert.match(
    defaultAssumptionValue(customizedAssumptions, "housing-fund-default"),
    /缴纳 10 个月/,
    "全局公积金缴纳月数应反映到默认假设"
);
assert.match(
    defaultAssumptionValue(customizedAssumptions, "break-defaults"),
    /午休 2 小时；晚于 18:30 下班再扣除晚休 0\.75 小时/,
    "全局休息规则变化应反映到默认假设"
);
assert.deepStrictEqual(
    customizedAssumptions.assumptions.map(function (assumption) {
        return assumption.key;
    }),
    expectedDefaultAssumptionKeys,
    "修改全局设置不应改变默认假设的固定顺序"
);

function assertStateFile(fileName, requireCanonicalSource) {
    var filePath = path.join(__dirname, "..", "tools", "data", fileName);
    var raw;
    var normalized;

    if (!fs.existsSync(filePath)) {
        return;
    }
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    normalized = core.normalize(raw);
    if (requireCanonicalSource) {
        assert.deepStrictEqual(raw, normalized, fileName + " 应采用完整规范化结构");
    }
    assert.ok(
        JSON.stringify(normalized) === JSON.stringify(core.normalize(normalized)),
        fileName + " 规范化后应保持幂等"
    );
}

function assertCompactExampleScheduleDays() {
    var fileName = "offer_compare_examples.json";
    var filePath = path.join(__dirname, "..", "tools", "data", fileName);
    var source = fs.readFileSync(filePath, "utf8");
    var parsed = JSON.parse(source);
    var expectedDayKeys = ["end", "start", "week", "weekday"];
    var expectedDayCount = 0;
    var compactDayLineCount = 0;
    var insideDays = false;

    assert.strictEqual(
        source,
        core.stringifyState(parsed),
        fileName + " 应与页面导出的规范化 JSON 排版完全一致"
    );

    parsed.offers.forEach(function (offer, offerIndex) {
        offer.schedule.days.forEach(function (day, dayIndex) {
            expectedDayCount += 1;
            assert.deepStrictEqual(
                Object.keys(day).sort(),
                expectedDayKeys,
                fileName + " 的 offers[" + offerIndex + "].schedule.days[" +
                    dayIndex + "] 只能包含 week、weekday、start、end"
            );
        });
    });

    source.split(/\r?\n/).forEach(function (line, lineIndex) {
        if (!insideDays && /"days"\s*:\s*\[\s*$/.test(line)) {
            insideDays = true;
            return;
        }
        if (!insideDays) {
            return;
        }
        if (/^\s*\]\s*,?\s*$/.test(line)) {
            insideDays = false;
            return;
        }
        if (!line.trim()) {
            return;
        }
        assert.ok(
            /^\s*\{.*\}\s*,?\s*$/.test(line),
            fileName + " 第 " + (lineIndex + 1) +
                " 行附近的 schedule.days 条目应完整放在单行"
        );
        compactDayLineCount += 1;
    });

    assert.strictEqual(insideDays, false, fileName + " 的 schedule.days 数组应正确闭合");
    assert.strictEqual(
        compactDayLineCount,
        expectedDayCount,
        fileName + " 的每个 schedule.days 条目都应采用单行排版"
    );
}

assertStateFile("offer_compare_examples.json", true);
assertStateFile("offer_compare_private.json", false);
assertCompactExampleScheduleDays();

console.log("offer_compare_core tests passed");
