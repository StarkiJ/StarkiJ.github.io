"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var core = require("../tools/js/offer_compare_core.js");
var taxPolicy = require("../tools/js/offer_compare_tax_policy.js");

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
    return normalizedState(stateWithSchedule(cycleWeeks, days))
        .offers[0].schedule;
}

function normalizedState(rawState) {
    return core.parseState(rawState).state;
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

var batchState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
batchState.offers = ["a", "b", "c"].map(function (id) {
    var offer = JSON.parse(JSON.stringify(batchState.offers[0]));
    offer.id = id;
    return offer;
});
var originalPolicyResolve = taxPolicy.resolve;
var policyResolveCount = 0;
var batchCalculation;
taxPolicy.resolve = function () {
    policyResolveCount += 1;
    return originalPolicyResolve.apply(taxPolicy, arguments);
};
try {
    batchCalculation = core.calculateAll(batchState);
} finally {
    taxPolicy.resolve = originalPolicyResolve;
}
assert.strictEqual(
    policyResolveCount,
    1,
    "一次批量计算应只解析一次税收政策"
);
[
    "id",
    "company",
    "department",
    "city",
    "name",
    "offer",
    "settings",
    "payBreakdown",
    "assumptions",
    "defaultAssumptionCount",
    "contributions",
    "annualPretaxCash",
    "annualTakeHomeCash",
    "averageWeeklyPresenceHours",
    "averageWeeklyNetHours",
    "pretaxHourly",
    "afterTaxHourly"
].forEach(function (field) {
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(
            batchCalculation.results[0],
            field
        ),
        false,
        "单 Offer 结果不应保留重复镜像字段：" + field
    );
});
["summary", "defaultAssumptionCount"].forEach(function (field) {
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(batchCalculation, field),
        false,
        "批量结果不应保留重复聚合字段：" + field
    );
});
[
    "annualBaseSalary",
    "annualBonus",
    "annualOvertimePay",
    "annualOtherCash",
    "employeeSocialInsurance",
    "employeeHousingFund",
    "employerHousingFund",
    "monthlyEquivalentTakeHome",
    "averageWeeklyPresenceHours",
    "averageWeeklyNetHours",
    "annualPresenceHours",
    "annualNetHours",
    "pretaxHourlyPresence",
    "afterTaxHourlyPresence",
    "pretaxHourlyNet",
    "afterTaxHourlyNet"
].forEach(function (field) {
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(
            batchCalculation.results[0].metrics,
            field
        ),
        false,
        "metrics 不应镜像 work 或保留无人消费的小时指标：" + field
    );
});
[
    "cycleWeeks",
    "regularDaysPerCycle",
    "averageRegularDaysPerWeek",
    "annualScheduledDays",
    "cyclePresenceHours",
    "cycleNetHours",
    "annualRegularPresenceHours",
    "annualRegularNetHours",
    "annualOvertimePresenceHours",
    "annualOvertimeNetHours",
    "annualPresenceHours",
    "annualNetHours",
    "overtimeShiftPresenceHours",
    "overtimeShiftNetHours",
    "lunchBreakHours",
    "dinnerBreakHours",
    "dinnerThreshold"
].forEach(function (field) {
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(
            batchCalculation.results[0].work,
            field
        ),
        false,
        "work 只应保留页面实际使用的周均工时：" + field
    );
});
assert.strictEqual(
    Object.prototype.hasOwnProperty.call(core, "calculateOffer"),
    false,
    "无消费者的单 Offer 重复预处理入口不应继续暴露"
);

function issueCodes(issues) {
    return issues.map(function (candidate) {
        return candidate.code;
    });
}

assert.strictEqual(core.MAX_OFFERS, 100, "应由核心模块导出统一的 Offer 数量上限");

var maximumOfferState = {
    version: core.VERSION,
    offers: Array.from({ length: core.MAX_OFFERS }, function (_, index) {
        return {
            id: "limit-" + index,
            company: "上限示例 " + index,
            pay: {
                monthlySalary: 10000,
                salaryMonths: 12
            }
        };
    })
};
assert.strictEqual(
    issueCodes(core.parseState(maximumOfferState).validation.errors)
        .indexOf("too_many_offers"),
    -1,
    "恰好 100 个 Offer 应通过数量上限校验"
);

var oversizedOfferState = JSON.parse(JSON.stringify(maximumOfferState));
oversizedOfferState.offers.push({
    id: "limit-overflow",
    company: "超限示例",
    pay: {
        monthlySalary: 10000,
        salaryMonths: 12
    }
});
var oversizedOfferCalculation = core.calculateAll(oversizedOfferState);
assert.ok(
    issueCodes(oversizedOfferCalculation.validation.errors)
        .indexOf("too_many_offers") >= 0,
    "101 个 Offer 应由核心校验统一拒绝"
);
assert.strictEqual(
    oversizedOfferCalculation.state.offers.length,
    core.MAX_OFFERS,
    "即使调用方忽略校验，核心也不应规范化或计算超过上限的 Offer"
);
assert.strictEqual(
    oversizedOfferCalculation.results.length,
    core.MAX_OFFERS,
    "超限状态的计算工作量应受核心上限保护"
);
["stringifyState", "createDefaultState"].forEach(function (method) {
    assert.throws(
        function () {
            core[method](oversizedOfferState);
        },
        function (error) {
            return error && error.code === "too_many_offers";
        },
        method + " 不应静默截断超过统一上限的 Offer"
    );
});

var rawNumericConstraintState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
rawNumericConstraintState.settings = {
    year: 2026,
    socialInsuranceRate: 1.01,
    specialAdditionalDeduction: -100
};
rawNumericConstraintState.offers[0].pay.salaryMonths = 11.9;
rawNumericConstraintState.offers[0].housingFundRate = 1.01;
rawNumericConstraintState.offers[0].overtime = {
    shiftsPerYear: 1.5,
    start: "09:00",
    end: "18:00",
    paidHours: 8,
    payMultiplier: 0
};
var rawNumericConstraintCodes = issueCodes(
    core.calculateAll(rawNumericConstraintState).validation.errors
);
[
    "invalid_social_insurance_rate",
    "invalid_special_additional_deduction",
    "invalid_salary_months",
    "invalid_housing_fund_rate",
    "invalid_overtime_shifts"
].forEach(function (code) {
    assert.ok(
        rawNumericConstraintCodes.indexOf(code) >= 0,
        "核心应保留并拒绝会被 normalization 隐藏的原始数值错误：" + code
    );
});

var rawStepMismatchState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
rawStepMismatchState.settings = {
    year: 2026,
    socialInsuranceRate: 0.1055
};
rawStepMismatchState.offers[0].pay.salaryMonths = 12.05;
var rawStepMismatchCodes = issueCodes(
    core.calculateAll(rawStepMismatchState).validation.errors
);
assert.ok(
    rawStepMismatchCodes.indexOf("invalid_social_insurance_rate") >= 0,
    "核心应拒绝默认社保比例的 HTML stepMismatch"
);
assert.ok(
    rawStepMismatchCodes.indexOf("invalid_salary_months") >= 0,
    "核心应拒绝总薪数的 HTML stepMismatch"
);

var nonCanonicalRateState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
nonCanonicalRateState.settings = {
    year: 2026,
    socialInsuranceRate: "12%"
};
nonCanonicalRateState.offers[0].socialInsuranceRate = "0.2";
nonCanonicalRateState.offers[0].housingFundRate = 12;
var nonCanonicalRateCalculation = core.calculateAll(nonCanonicalRateState);
[
    "invalid_social_insurance_rate",
    "invalid_offer_social_insurance_rate",
    "invalid_housing_fund_rate"
].forEach(function (code) {
    assert.ok(
        issueCodes(nonCanonicalRateCalculation.validation.errors)
            .indexOf(code) >= 0,
        "比例字段应只接受 0～1 的数值：" + code
    );
});
assert.strictEqual(
    nonCanonicalRateCalculation.state.offers[0].socialInsuranceRate,
    null,
    "比例字符串不应再被自动转换"
);
assert.strictEqual(
    nonCanonicalRateCalculation.state.offers[0].housingFundRate,
    1,
    "大于 1 的数值只做安全钳制，不应再被除以 100"
);

var badRawTimeState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "bad-time", end: "17:00" }
]);
var badRawTimeCalculation = core.calculateAll(badRawTimeState);
assert.strictEqual(
    badRawTimeCalculation.state.offers[0].schedule.days[0].start,
    "09:00",
    "normalization should retain its documented fallback for invalid times"
);
assert.ok(
    issueCodes(badRawTimeCalculation.validation.errors).indexOf("invalid_shift") >= 0,
    "calculateAll should validate the raw time before its normalized fallback hides the error"
);

var sameTimeCalculation = core.calculateAll(stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "09:00" }
]));
assert.ok(
    issueCodes(sameTimeCalculation.validation.errors).indexOf("invalid_shift") >= 0,
    "equal shift start and end times should be invalid instead of meaning 24 hours"
);
assert.strictEqual(
    sameTimeCalculation.results[0].work.averageWeeklyPresenceHours,
    0,
    "equal shift times should never add 24 hours to the calculation"
);

var overnightCalculation = core.calculateAll(stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "22:00", end: "06:00" }
]));
assert.strictEqual(
    issueCodes(overnightCalculation.validation.errors).indexOf("invalid_shift"),
    -1,
    "an end time earlier than the start time should remain a valid overnight shift"
);
assert.strictEqual(
    overnightCalculation.results[0].work.averageWeeklyPresenceHours,
    8,
    "overnight shift duration should cross midnight"
);

var badOvertimeState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
badOvertimeState.offers[0].overtime = {
    shiftsPerYear: 1,
    start: "not-a-time",
    end: "06:00",
    paidHours: 8,
    payMultiplier: 1
};
assert.ok(
    issueCodes(core.calculateAll(badOvertimeState).validation.errors)
        .indexOf("invalid_overtime_shift") >= 0,
    "active extra shifts should validate their raw start and end times"
);

badOvertimeState.offers[0].overtime.start = "22:00";
badOvertimeState.offers[0].overtime.end = "22:00";
assert.ok(
    issueCodes(core.calculateAll(badOvertimeState).validation.errors)
        .indexOf("invalid_overtime_shift") >= 0,
    "equal extra-shift start and end times should be invalid"
);

badOvertimeState.offers[0].overtime.end = "06:00";
assert.strictEqual(
    issueCodes(core.calculateAll(badOvertimeState).validation.errors)
        .indexOf("invalid_overtime_shift"),
    -1,
    "overnight extra shifts should remain valid"
);

var rawWarningState = {
    version: core.VERSION,
    offers: [
        {
            id: "raw-warning",
            company: "Raw warning",
            department: "Platform",
            pay: {
                monthlySalary: 10000,
                salaryMonths: 12
            }
        }
    ]
};
var parsedWarningState = core.parseState(rawWarningState);
var rawWarningCodes = issueCodes(parsedWarningState.validation.warnings);
assert.ok(rawWarningCodes.indexOf("default_schedule") >= 0, "parseState should retain raw default warnings");
assert.ok(rawWarningCodes.indexOf("default_housing_fund") >= 0, "parseState should retain missing-field warnings");
assert.deepStrictEqual(
    core.calculateAll(rawWarningState).validation,
    parsedWarningState.validation,
    "calculateAll should use the same raw-aware parse and validation result"
);

function offerWithId(id) {
    return {
        id: id,
        company: id,
        city: "Test",
        department: "Test",
        pay: {
            monthlySalary: 10000,
            salaryMonths: 12
        },
        housingFundRate: 0,
        schedule: {
            cycleWeeks: 1,
            days: [
                { week: 1, weekday: 1, start: "09:00", end: "17:00" }
            ]
        }
    };
}

var specialIdState = {
    version: core.VERSION,
    offers: [
        offerWithId("__proto__"),
        offerWithId("constructor"),
        offerWithId("toString")
    ]
};
assert.strictEqual(
    issueCodes(core.validateState(specialIdState).errors).indexOf("duplicate_id"),
    -1,
    "object-prototype property names should be valid unique offer ids"
);
specialIdState.offers.push(offerWithId("__proto__"));
assert.ok(
    issueCodes(core.validateState(specialIdState).errors).indexOf("duplicate_id") >= 0,
    "duplicate special ids should still be detected"
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
var externalIncomeCalculation = core.calculateAll(externalIncomeState);
var externalIncomeResult = externalIncomeCalculation.results[0];
assert.strictEqual(
    externalIncomeResult.metrics.annualIncomeTax,
    externalIncomeResult.tax.selectedScenario.totalTax -
        externalIncomeCalculation.taxBaseline.totalTax,
    "Offer 个税应只扣除相对其他收入基线新增的税额"
);
assert.ok(
    externalIncomeResult.metrics.annualTakeHomeCash > 0,
    "其他综合所得不应让正常 Offer 的到手现金错误变成负数"
);

function taxModeState(mode, year, monthlySalary, salaryMonths) {
    var candidate = stateWithSchedule(1, [
        { week: 1, weekday: 1, start: "09:00", end: "17:00" }
    ]);

    candidate.settings = {
        year: year,
        basicDeduction: 0,
        specialAdditionalDeduction: 0,
        otherDeductions: 0,
        otherComprehensiveIncome: 0,
        socialInsuranceRate: 0,
        bonusTaxMode: "auto"
    };
    candidate.offers[0].city = "Test";
    candidate.offers[0].department = "Tax";
    candidate.offers[0].socialInsuranceRate = 0;
    candidate.offers[0].housingFundRate = 0;
    candidate.offers[0].pay.monthlySalary = monthlySalary;
    candidate.offers[0].pay.salaryMonths = salaryMonths;
    candidate.offers[0].pay.bonusTaxMode = mode;
    return candidate;
}

var comprehensiveBoundary = core.calculateAll(
    taxModeState("merged", 2026, 3000, 12)
).results[0];
var comprehensiveAboveBoundary = core.calculateAll(
    taxModeState("merged", 2026, 3000.001, 12)
).results[0];
assert.strictEqual(
    comprehensiveBoundary.tax.selectedScenario.taxableComprehensiveIncome,
    36000,
    "the comprehensive tax boundary fixture should be exact"
);
assert.strictEqual(
    comprehensiveBoundary.tax.selectedScenario.comprehensiveRate,
    0.03,
    "36000 yuan of annual taxable income should remain in the first bracket"
);
assert.strictEqual(
    comprehensiveAboveBoundary.tax.selectedScenario.comprehensiveRate,
    0.1,
    "taxable income immediately above 36000 yuan should use the second bracket"
);

var bonusBoundary = core.calculateAll(
    taxModeState("separate", 2026, 3000, 24)
).results[0];
var bonusAboveBoundary = core.calculateAll(
    taxModeState("separate", 2026, 3000.001, 24)
).results[0];
assert.strictEqual(
    bonusBoundary.tax.selectedScenario.bonusMonthlyEquivalent,
    3000,
    "the annual-bonus boundary fixture should be exact after dividing by 12"
);
assert.strictEqual(
    bonusBoundary.tax.selectedScenario.bonusRate,
    0.03,
    "a 3000 yuan monthly-equivalent bonus should remain in the first bracket"
);
assert.strictEqual(
    bonusAboveBoundary.tax.selectedScenario.bonusRate,
    0.1,
    "a monthly-equivalent bonus immediately above 3000 yuan should use the second bracket"
);

var automaticBonusCalculation = core.calculateAll(
    taxModeState("auto", 2026, 10000, 13)
);
var automaticBonusResult = automaticBonusCalculation.results[0];
var mergedBonusResult = core.calculateAll(
    taxModeState("merged", 2026, 10000, 13)
).results[0];
var separateBonusResult = core.calculateAll(
    taxModeState("separate", 2026, 10000, 13)
).results[0];
assert.strictEqual(
    automaticBonusResult.tax.selectedMode,
    "separate",
    "automatic bonus taxation should choose the lower available scenario"
);
assert.strictEqual(
    mergedBonusResult.tax.selectedMode,
    "merged",
    "an explicit merged mode should be retained"
);
assert.strictEqual(
    separateBonusResult.tax.selectedMode,
    "separate",
    "an explicit separate mode should be retained while the policy is available"
);
assert.strictEqual(
    automaticBonusResult.tax.selectedScenario.totalTax,
    9780,
    "所选场景应保留自动模式采用的较低税额"
);
assert.strictEqual(
    automaticBonusCalculation.taxPolicy.verified,
    true,
    "计算结果应包含已验证的政策元数据"
);
assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
        automaticBonusCalculation.taxPolicy.comprehensive,
        "brackets"
    ),
    false,
    "per-offer policy metadata should not duplicate tax bracket tables"
);
assert.strictEqual(
    Object.prototype.hasOwnProperty.call(automaticBonusResult.tax, "policy"),
    false,
    "全局税务政策不应复制到每个 Offer"
);
assert.strictEqual(
    automaticBonusResult.tax.inputs.regularIncome,
    120000,
    "tax inputs should expose the regular-income operand used by the scenarios"
);
[
    "baseline",
    "merged",
    "separate",
    "trace",
    "policyYear",
    "selectedTax",
    "selectedTotalTax",
    "difference",
    "savingsFromSelected"
].forEach(function (field) {
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(automaticBonusResult.tax, field),
        false,
        "税务结果不应保留无消费者或可推导字段：" + field
    );
});
assert.strictEqual(
    automaticBonusResult.tax.selectedScenario.totalTax -
        automaticBonusCalculation.taxBaseline.totalTax,
    automaticBonusResult.metrics.annualIncomeTax,
    "现有税务字段应能直接核对 Offer 增量税"
);
assert.strictEqual(
    automaticBonusResult.tax.comparison.mergedIncrementalTax,
    10480,
    "comparison data should expose the merged Offer tax"
);
assert.strictEqual(
    automaticBonusResult.tax.comparison.separateIncrementalTax,
    9780,
    "comparison data should expose the separate Offer tax"
);
assert.strictEqual(
    automaticBonusResult.tax.comparison.absoluteDifference,
    700,
    "comparison data should expose the absolute scenario difference"
);

var expiredBonusCalculation = core.calculateAll(
    taxModeState("separate", 2028, 10000, 13)
);
var expiredBonusResult = expiredBonusCalculation.results[0];
var expiredWarningCodes = issueCodes(expiredBonusCalculation.validation.warnings);
assert.strictEqual(
    expiredBonusCalculation.taxPolicy.appliedYear,
    2027,
    "an unverified future year should use the nearest verified policy metadata"
);
assert.strictEqual(
    expiredBonusCalculation.taxPolicy.estimated,
    true,
    "an unverified future year should be marked as an estimate"
);
assert.strictEqual(
    expiredBonusResult.tax.separateAvailable,
    false,
    "the separate bonus scenario should be unavailable after 2027"
);
assert.strictEqual(
    expiredBonusResult.tax.selectedMode,
    "merged",
    "an expired separate-mode request should fall back to merged taxation"
);
assert.strictEqual(
    expiredBonusResult.tax.requestedMode,
    "separate",
    "结果应保留无法执行的原始手动请求"
);
assert.strictEqual(
    expiredBonusResult.tax.selectedMode,
    "merged",
    "不可用的手动请求应回退到实际可用方案"
);
assert.strictEqual(
    expiredBonusResult.tax.comparison.lowerMode,
    null,
    "a single available scenario should not claim to be the lower of two modes"
);
assert.ok(
    expiredWarningCodes.indexOf("tax_policy_year_unverified") >= 0,
    "calculation validation should warn when the tax year is outside the verified range"
);
assert.ok(
    expiredWarningCodes.indexOf("separate_bonus_expired") >= 0,
    "calculation validation should separately warn that bonus taxation has expired"
);
assert.strictEqual(
    issueCodes(core.calculateAll(
        taxModeState("auto", 2027, 10000, 13)
    ).validation.warnings).indexOf("tax_policy_year_unverified"),
    -1,
    "the last verified year should not produce an unverified-policy warning"
);

var unavailableAutoResult = core.calculateAll(
    taxModeState("auto", 2028, 10000, 13)
).results[0];
var unavailableMergedResult = core.calculateAll(
    taxModeState("merged", 2028, 10000, 13)
).results[0];
assert.strictEqual(
    unavailableAutoResult.tax.requestedMode,
    "auto",
    "自动模式直接由顶层 requestedMode 表达"
);
assert.strictEqual(
    unavailableMergedResult.tax.selectedMode,
    unavailableMergedResult.tax.requestedMode,
    "显式且可用的方案应直接反映在 requestedMode 与 selectedMode 中"
);

var beforePolicyCalculation = core.calculateAll(
    taxModeState("separate", 2018, 10000, 13)
);
assert.strictEqual(
    beforePolicyCalculation.results[0].tax.selectedMode,
    "merged",
    "a year before the policy range should fall back to merged taxation"
);
assert.ok(
    issueCodes(beforePolicyCalculation.validation.warnings).indexOf(
        "separate_bonus_not_effective"
    ) >= 0,
    "a year before the policy range should carry a specific warning"
);
assert.strictEqual(
    core.calculateAll(taxModeState("separate", 2019, 10000, 13))
        .results[0].tax.selectedMode,
    "separate",
    "the first effective policy year should permit separate taxation"
);

["bad-year", 2026.5, 1969, 2101].forEach(function (invalidYear) {
    var invalidYearState = taxModeState("auto", invalidYear, 10000, 13);
    var invalidYearErrors = issueCodes(
        core.calculateAll(invalidYearState).validation.errors
    );

    assert.ok(
        invalidYearErrors.indexOf("invalid_tax_year") >= 0,
        "invalid raw tax years should not be hidden by normalization"
    );
});

var currentVersionState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "17:00" }
]);
assert.strictEqual(
    issueCodes(core.parseState(currentVersionState).validation.errors)
        .filter(function (code) {
            return code.indexOf("schema_version") >= 0 ||
                code === "unsupported_future_version";
        }).length,
    0,
    "当前 schema 版本应通过严格版本校验"
);

var missingVersionState = JSON.parse(JSON.stringify(currentVersionState));
delete missingVersionState.version;
assert.strictEqual(
    issueCodes(core.parseState(missingVersionState).validation.errors)[0],
    "missing_schema_version",
    "未标版本不应再被推断为旧 schema"
);

var legacyVersionState = JSON.parse(JSON.stringify(currentVersionState));
legacyVersionState.version = core.VERSION - 1;
assert.strictEqual(
    issueCodes(core.parseState(legacyVersionState).validation.errors)[0],
    "unsupported_schema_version",
    "旧 schema 应明确拒绝，而不是自动迁移"
);

var invalidVersionState = JSON.parse(JSON.stringify(currentVersionState));
invalidVersionState.version = "2";
assert.strictEqual(
    issueCodes(core.parseState(invalidVersionState).validation.errors)[0],
    "invalid_schema_version",
    "非整数 schema 版本应明确拒绝"
);

var futureState = JSON.parse(JSON.stringify(currentVersionState));
futureState.version = core.VERSION + 1;
assert.deepStrictEqual(
    issueCodes(core.validateState(futureState).errors).slice(0, 1),
    ["unsupported_future_version"],
    "未来 schema 应稳定拒绝"
);

[
    {
        state: missingVersionState,
        code: "missing_schema_version"
    },
    {
        state: legacyVersionState,
        code: "unsupported_schema_version"
    },
    {
        state: invalidVersionState,
        code: "invalid_schema_version"
    },
    {
        state: futureState,
        code: "unsupported_future_version"
    }
].forEach(function (candidate) {
    ["stringifyState", "createDefaultState", "calculateAll"].forEach(function (method) {
        assert.throws(
            function () {
                core[method](candidate.state);
            },
            function (error) {
                return error && error.code === candidate.code;
            },
            method + " 应与 parseState 使用相同的严格版本语义"
        );
    });
});

var preservedV2 = normalizedState({
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
    perOfferResult.tax.inputs.socialInsuranceRate,
    0.2,
    "Offer 社保比例应覆盖全局默认"
);
assert.strictEqual(
    perOfferResult.tax.inputs.employeeSocialInsurance,
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
    explicitZeroResult.tax.inputs.employeeSocialInsurance,
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
    inheritedResult.tax.inputs.socialInsuranceRate,
    0.1,
    "空社保比例应继承全局默认"
);
assert.strictEqual(
    inheritedResult.work.averageWeeklyNetHours,
    8,
    "空休息字段应继承 2 小时午休和 1 小时晚休"
);

var nullableInputState = stateWithSchedule(1, [
    { week: 1, weekday: 1, start: "09:00", end: "20:00" }
]);
nullableInputState.offers[0].socialInsuranceRate = " ";
nullableInputState.offers[0].schedule.lunchBreakHours = " ";
nullableInputState.offers[0].schedule.dinnerBreakHours = "not-a-number";
var normalizedNullableInput = normalizedState(nullableInputState).offers[0];
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
normalizedNullableInput = normalizedState(nullableInputState).offers[0];
assert.strictEqual(normalizedNullableInput.socialInsuranceRate, null, "比例字符串不应再兼容为数值");
assert.strictEqual(normalizedNullableInput.schedule.lunchBreakHours, null, "字符串 0 午休不应再兼容为数值");
assert.strictEqual(normalizedNullableInput.schedule.dinnerBreakHours, null, "字符串 0 晚休不应再兼容为数值");
[
    "invalid_offer_social_insurance_rate",
    "invalid_lunch_break_hours",
    "invalid_dinner_break_hours"
].forEach(function (code) {
    assert.ok(
        issueCodes(core.calculateAll(nullableInputState).validation.errors)
            .indexOf(code) >= 0,
        "v2 数值字段应拒绝字符串格式：" + code
    );
});

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
    emptyOfferAssumptions.assumptions.length,
    expectedDefaultAssumptionKeys.length,
    "没有 Offer 时仍应返回完整的全局默认假设数量"
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
    forwardAssumptions.assumptions.length,
    expectedDefaultAssumptionKeys.length,
    "不同 Offer 不应改变全局默认假设数量"
);
assert.strictEqual(
    reversedAssumptions.assumptions.length,
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
    normalized = normalizedState(raw);
    if (requireCanonicalSource) {
        assert.deepStrictEqual(raw, normalized, fileName + " 应采用完整规范化结构");
    }
    assert.ok(
        JSON.stringify(normalized) === JSON.stringify(normalizedState(normalized)),
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
