(function (root, factory) {
    "use strict";
    var commonJs = typeof module === "object" && module.exports;
    var api = factory(
        commonJs ? require("./domain.js") : root.OfferCompareDomain,
        commonJs ? require("./tax-policy.js") : root.OfferCompareTaxPolicy,
        commonJs ? require("./state.js") : root.OfferCompareState,
        commonJs ? require("./serialization.js") : root.OfferCompareSerialization
    );
    if (commonJs) { module.exports = api; }
    if (root) { root.OfferCompareCore = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function (domain, taxPolicy, state, serialization) {
    "use strict";

    var {
        clone, finite, ratePercentText, cleanNumber, safeDivide, parseTime, durationHours
    } = domain;
    var parseStateContext = state.parseStateContext;
    var throwValidationIssue = state.throwValidationIssue;

    function annualComprehensiveTax(taxableIncome, policy) {
        var taxable = Math.max(0, finite(taxableIncome, 0, 0, Number.MAX_SAFE_INTEGER));
        var bracket = taxPolicy.bracketFor(taxable, policy.comprehensive.brackets);

        return {
            taxableIncome: taxable,
            rate: bracket.rate,
            quickDeduction: bracket.quickDeduction,
            tax: cleanNumber(Math.max(0, taxable * bracket.rate - bracket.quickDeduction))
        };
    }

    function separateBonusTax(bonus, policy) {
        var taxableBonus = Math.max(0, finite(bonus, 0, 0, Number.MAX_SAFE_INTEGER));
        var monthlyEquivalent = taxableBonus / 12;
        var bracket = taxPolicy.bracketFor(
            monthlyEquivalent,
            policy.annualBonusSeparate.brackets
        );

        return {
            bonus: taxableBonus,
            monthlyEquivalent: monthlyEquivalent,
            rate: bracket.rate,
            quickDeduction: bracket.quickDeduction,
            tax: cleanNumber(Math.max(0, taxableBonus * bracket.rate - bracket.quickDeduction))
        };
    }

    function dayWorkHours(day, settings) {
        var presence = durationHours(day.start, day.end);
        var end = parseTime(day.end);
        var threshold = parseTime(settings.dinnerThreshold);
        var lunch = settings.lunchBreakHours;
        var dinner = end !== null && threshold !== null && end > threshold
            ? settings.dinnerBreakHours
            : 0;

        return {
            presence: presence,
            lunch: Math.min(presence, lunch),
            dinner: Math.min(Math.max(0, presence - lunch), dinner),
            net: cleanNumber(Math.max(0, presence - lunch - dinner))
        };
    }

    function calculateWork(schedule, overtime, settings) {
        var cyclePresence = 0;
        var cycleNet = 0;
        var workSettings = clone(settings);
        var overtimeDay = {
            start: overtime.start,
            end: overtime.end
        };
        var overtimeHours;
        var annualPresence;
        var annualNet;

        if (schedule.lunchBreakHours !== null) {
            workSettings.lunchBreakHours = schedule.lunchBreakHours;
        }
        if (schedule.dinnerBreakHours !== null) {
            workSettings.dinnerBreakHours = schedule.dinnerBreakHours;
        }
        overtimeHours = dayWorkHours(overtimeDay, workSettings);

        schedule.days.forEach(function (day) {
            var hours = dayWorkHours(day, workSettings);
            cyclePresence += hours.presence;
            cycleNet += hours.net;
        });

        annualPresence = safeDivide(cyclePresence, schedule.cycleWeeks) *
            settings.weeksPerYear +
            overtimeHours.presence * overtime.shiftsPerYear;
        annualNet = safeDivide(cycleNet, schedule.cycleWeeks) *
            settings.weeksPerYear +
            overtimeHours.net * overtime.shiftsPerYear;

        return {
            annualPresenceHours: cleanNumber(annualPresence),
            annualNetHours: cleanNumber(annualNet),
            averageWeeklyPresenceHours: safeDivide(annualPresence, settings.weeksPerYear),
            averageWeeklyNetHours: safeDivide(annualNet, settings.weeksPerYear)
        };
    }

    function calculateAnnualOvertimePay(offer, settings) {
        var overtime = offer.overtime;
        var monthlyBase = overtime.payBaseMonthly === null
            ? offer.pay.monthlySalary
            : overtime.payBaseMonthly;
        var dailyBase = safeDivide(monthlyBase, settings.standardWorkDaysPerMonth);
        var paidDayFraction = safeDivide(overtime.paidHours, settings.standardPaidHoursPerDay);
        var perShift = dailyBase * paidDayFraction * overtime.payMultiplier;

        return cleanNumber(perShift * overtime.shiftsPerYear);
    }

    function taxPolicyMetadata(policy) {
        return {
            id: policy.id,
            version: policy.version,
            requestedYear: policy.requestedYear,
            appliedYear: policy.appliedYear,
            verified: policy.verified,
            estimated: policy.estimated,
            verificationRange: clone(policy.verificationRange),
            comprehensive: {
                id: policy.comprehensive.id,
                label: policy.comprehensive.label,
                effectiveRange: clone(policy.comprehensive.effectiveRange)
            },
            annualBonusSeparate: {
                id: policy.annualBonusSeparate.id,
                label: policy.annualBonusSeparate.label,
                effectiveRange: clone(policy.annualBonusSeparate.effectiveRange),
                available: policy.annualBonusSeparate.available,
                effectiveForRequestedYear:
                    policy.annualBonusSeparate.effectiveForRequestedYear
            },
            warnings: clone(policy.warnings)
        };
    }

    function taxScenario(mode, regularIncome, bonus, deductions, policy) {
        var comprehensive;
        var bonusResult;
        var totalTax;

        if (mode === "separate") {
            comprehensive = annualComprehensiveTax(regularIncome - deductions, policy);
            bonusResult = separateBonusTax(bonus, policy);
            totalTax = cleanNumber(comprehensive.tax + bonusResult.tax);
            return {
                taxableComprehensiveIncome: comprehensive.taxableIncome,
                comprehensiveRate: comprehensive.rate,
                comprehensiveQuickDeduction: comprehensive.quickDeduction,
                comprehensiveTax: comprehensive.tax,
                bonusMonthlyEquivalent: bonusResult.monthlyEquivalent,
                bonusRate: bonusResult.rate,
                bonusQuickDeduction: bonusResult.quickDeduction,
                bonusTax: bonusResult.tax,
                totalTax: totalTax
            };
        }

        comprehensive = annualComprehensiveTax(
            regularIncome + bonus - deductions,
            policy
        );
        return {
            taxableComprehensiveIncome: comprehensive.taxableIncome,
            comprehensiveRate: comprehensive.rate,
            comprehensiveQuickDeduction: comprehensive.quickDeduction,
            totalTax: comprehensive.tax
        };
    }

    function buildDefaultAssumptions(settings, policy) {
        var bonusTaxDefault;
        var separatePolicy = policy.annualBonusSeparate;

        if (settings.bonusTaxMode === "merged") {
            bonusTaxDefault = "Offer 未指定时并入综合所得计税";
        } else if (settings.bonusTaxMode === "separate" &&
                separatePolicy.available) {
            bonusTaxDefault = "Offer 未指定时按全年一次性奖金单独计税";
        } else if (settings.bonusTaxMode === "separate") {
            bonusTaxDefault = "默认指定单独计税，但当前年份不在政策有效期内，改为并入综合所得";
        } else if (separatePolicy.available) {
            bonusTaxDefault = "Offer 未指定时，同时计算并入综合所得与全年一次性奖金单独计税，采用税额较低者";
        } else {
            bonusTaxDefault = "Offer 未指定时并入综合所得；当前年份不在全年一次性奖金单独计税政策有效期内";
        }

        var assumptions = [
            {
                key: "resident-full-year",
                category: "税务",
                label: "身份与期间",
                value: "按中国大陆居民个人、完整工作一个自然年估算"
            },
            {
                key: "basic-deduction",
                category: "税务",
                label: "年份与基本减除",
                value: settings.year + " 年税务口径；基本减除费用每年 " +
                    settings.basicDeduction + " 元"
            },
            {
                key: "global-tax-inputs",
                category: "税务",
                label: "全局收入与扣除",
                value: "专项附加扣除 " + settings.specialAdditionalDeduction +
                    " 元；其他依法扣除 " + settings.otherDeductions +
                    " 元；其他综合所得 " + settings.otherComprehensiveIncome + " 元"
            },
            {
                key: "bonus-tax-default",
                category: "税务",
                label: "奖金计税缺省",
                value: bonusTaxDefault + "；单独计税政策有效期为 " +
                    separatePolicy.effectiveRange.from + "–" +
                    separatePolicy.effectiveRange.through + " 年"
            },
            {
                key: "salary-defaults",
                category: "薪酬",
                label: "薪资与目标奖金",
                value: "总薪数未提供时按 12 薪；超过 12 薪的部分按目标奖金 100% 兑现；其他年现金未提供时按 0 元"
            },
            {
                key: "unlisted-benefits",
                category: "薪酬",
                label: "未列收入与福利",
                value: "未提供的股票、签字费、餐补、打车等按 0 元"
            },
            {
                key: "overtime-defaults",
                category: "薪酬",
                label: "加班缺省与折算",
                value: "未提供的额外班次和加班费按 0；付费加班的工资基数留空时使用 Offer 月薪，按每月 " +
                    settings.standardWorkDaysPerMonth + " 个计薪日、每天 " +
                    settings.standardPaidHoursPerDay + " 个计薪小时折算"
            },
            {
                key: "social-insurance-default",
                category: "三险一金",
                label: "个人社保缺省",
                value: "Offer 留空时，按月薪全额的 " +
                    ratePercentText(settings.socialInsuranceRate) +
                    "% 缴纳 " + settings.socialInsuranceMonths +
                    " 个月，不套用城市缴费基数上下限"
            },
            {
                key: "housing-fund-default",
                category: "三险一金",
                label: "住房公积金规则",
                value: "比例未知时按 0%；已知时个人与单位使用相同比例，均按月薪全额缴纳 " +
                    settings.housingFundMonths + " 个月，不套用城市缴存上限"
            },
            {
                key: "schedule-and-year-defaults",
                category: "工时",
                label: "排班与年度折算",
                value: "排班未提供时按周一至周五 09:00–18:00；年度固定按 " +
                    settings.weeksPerYear + " 周折算，不扣法定节假日、调休和年假"
            },
            {
                key: "break-defaults",
                category: "工时",
                label: "休息缺省",
                value: "Offer 留空时，每个工作日扣除午休 " +
                    settings.lunchBreakHours + " 小时；晚于 " +
                    settings.dinnerThreshold + " 下班再扣除晚休 " +
                    settings.dinnerBreakHours + " 小时"
            }
        ];

        return assumptions;
    }

    function calculateNormalizedOffer(
        offer,
        settings,
        resolvedTaxPolicy,
        baseline
    ) {
        var work = calculateWork(offer.schedule, offer.overtime, settings);
        var socialInsuranceRate = offer.socialInsuranceRate === null
            ? settings.socialInsuranceRate
            : offer.socialInsuranceRate;
        var annualOvertimePay = calculateAnnualOvertimePay(offer, settings);
        var annualBaseSalary = offer.pay.monthlySalary * 12;
        var annualBonus = offer.pay.monthlySalary * Math.max(0, offer.pay.salaryMonths - 12);
        var annualPretaxCash = annualBaseSalary + annualBonus +
            offer.pay.otherAnnualCash + annualOvertimePay;
        var employeeSocialInsurance = offer.pay.monthlySalary *
            socialInsuranceRate * settings.socialInsuranceMonths;
        var employeeHousingFund = offer.pay.monthlySalary *
            offer.housingFundRate * settings.housingFundMonths;
        var employerHousingFund = employeeHousingFund;
        var baselineDeductions = settings.basicDeduction +
            settings.specialAdditionalDeduction +
            settings.otherDeductions;
        var taxDeductions = settings.basicDeduction + settings.specialAdditionalDeduction +
            settings.otherDeductions + employeeSocialInsurance + employeeHousingFund;
        var regularIncome = annualBaseSalary + offer.pay.otherAnnualCash +
            annualOvertimePay + settings.otherComprehensiveIncome;
        var otherRegularIncome = annualOvertimePay + offer.pay.otherAnnualCash +
            settings.otherComprehensiveIncome;
        var separateAvailable = resolvedTaxPolicy.annualBonusSeparate.available;
        var merged = taxScenario(
            "merged",
            regularIncome,
            annualBonus,
            taxDeductions,
            resolvedTaxPolicy
        );
        var separate = separateAvailable
            ? taxScenario(
                "separate",
                regularIncome,
                annualBonus,
                taxDeductions,
                resolvedTaxPolicy
            )
            : null;
        var requestedMode = offer.pay.bonusTaxMode === "auto" && settings.bonusTaxMode !== "auto"
            ? settings.bonusTaxMode
            : offer.pay.bonusTaxMode;
        var selected;
        var selectedMode;
        var annualTakeHomeCash;
        var housingFundEquity;
        var cashAndHousingFundEquity;
        var offerIncomeTax;
        var primaryAnnualHours;
        var metrics;
        var taxInputs;
        var taxComparison;
        var mergedIncrementalTax;
        var separateIncrementalTax;
        var lowerMode;

        if (!separateAvailable || requestedMode === "merged") {
            selected = merged;
            selectedMode = "merged";
        } else if (requestedMode === "separate") {
            selected = separate;
            selectedMode = "separate";
        } else {
            selected = separate.totalTax < merged.totalTax ? separate : merged;
            selectedMode = selected === separate ? "separate" : "merged";
        }

        offerIncomeTax = cleanNumber(selected.totalTax - baseline.totalTax);
        annualTakeHomeCash = annualPretaxCash - employeeSocialInsurance -
            employeeHousingFund - offerIncomeTax;
        housingFundEquity = employeeHousingFund + employerHousingFund;
        cashAndHousingFundEquity = annualTakeHomeCash + housingFundEquity;
        primaryAnnualHours = settings.primaryHoursBasis === "net"
            ? work.annualNetHours
            : work.annualPresenceHours;

        metrics = {
            annualPretaxCash: cleanNumber(annualPretaxCash),
            housingFundEquity: cleanNumber(housingFundEquity),
            annualIncomeTax: offerIncomeTax,
            annualTakeHomeCash: cleanNumber(annualTakeHomeCash),
            cashAndHousingFundEquity: cleanNumber(cashAndHousingFundEquity),
            pretaxHourly: safeDivide(annualPretaxCash, primaryAnnualHours),
            afterTaxHourly: safeDivide(annualTakeHomeCash, primaryAnnualHours)
        };

        taxInputs = {
            monthlySalary: offer.pay.monthlySalary,
            fixedSalaryMonths: 12,
            bonusMonths: Math.max(0, offer.pay.salaryMonths - 12),
            annualBaseSalary: annualBaseSalary,
            annualOvertimePay: annualOvertimePay,
            annualOtherCash: offer.pay.otherAnnualCash,
            otherComprehensiveIncome: settings.otherComprehensiveIncome,
            otherRegularIncome: otherRegularIncome,
            regularIncome: regularIncome,
            bonus: annualBonus,
            basicDeduction: settings.basicDeduction,
            specialAdditionalDeduction: settings.specialAdditionalDeduction,
            otherDeductions: settings.otherDeductions,
            employeeSocialInsurance: employeeSocialInsurance,
            socialInsuranceRate: socialInsuranceRate,
            socialInsuranceMonths: settings.socialInsuranceMonths,
            employeeHousingFund: employeeHousingFund,
            housingFundRate: offer.housingFundRate,
            housingFundMonths: settings.housingFundMonths,
            baselineDeductions: baselineDeductions,
            deductions: taxDeductions
        };

        mergedIncrementalTax = cleanNumber(merged.totalTax - baseline.totalTax);
        separateIncrementalTax = separateAvailable
            ? cleanNumber(separate.totalTax - baseline.totalTax)
            : null;
        lowerMode = separateAvailable
            ? (mergedIncrementalTax <= separateIncrementalTax ? "merged" : "separate")
            : null;
        taxComparison = {
            lowerMode: lowerMode,
            absoluteDifference: separateAvailable
                ? cleanNumber(Math.abs(mergedIncrementalTax - separateIncrementalTax))
                : null,
            mergedIncrementalTax: mergedIncrementalTax,
            separateIncrementalTax: separateIncrementalTax
        };

        return {
            tax: {
                requestedMode: requestedMode,
                selectedMode: selectedMode,
                selectedScenario: selected,
                separateAvailable: separateAvailable,
                inputs: taxInputs,
                comparison: taxComparison
            },
            work: {
                averageWeeklyPresenceHours:
                    work.averageWeeklyPresenceHours,
                averageWeeklyNetHours: work.averageWeeklyNetHours
            },
            metrics: metrics
        };
    }

    function calculateAll(rawState) {
        var parsed = parseStateContext(rawState);
        if (parsed.versionError) {
            throwValidationIssue(parsed.versionError);
        }
        var state = parsed.state;
        var assumptions = buildDefaultAssumptions(
            state.settings,
            parsed.resolvedTaxPolicy
        );
        var policy = taxPolicyMetadata(parsed.resolvedTaxPolicy);
        var taxBaseline = taxScenario(
            "merged",
            state.settings.otherComprehensiveIncome,
            0,
            state.settings.basicDeduction +
                state.settings.specialAdditionalDeduction +
            state.settings.otherDeductions,
            parsed.resolvedTaxPolicy
        );
        var results = state.offers.map(function (offer) {
            return calculateNormalizedOffer(
                offer,
                state.settings,
                parsed.resolvedTaxPolicy,
                taxBaseline
            );
        });

        return {
            state: state,
            results: results,
            validation: parsed.validation,
            assumptions: assumptions,
            taxPolicy: policy,
            taxBaseline: taxBaseline
        };
    }


    return {
        VERSION: state.VERSION,
        MAX_OFFERS: state.MAX_OFFERS,
        MAX_CYCLE_WEEKS: state.MAX_CYCLE_WEEKS,
        parseState: state.parseState,
        createDefaultState: state.createDefaultState,
        validateState: state.validateState,
        stringifyState: serialization.stringifyState,
        calculateAll: calculateAll
    };
}));
