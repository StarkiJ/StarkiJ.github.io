(function (root, factory) {
    "use strict";

    var taxPolicy = typeof module === "object" && module.exports
        ? require("./offer_compare_tax_policy.js")
        : root && root.OfferCompareTaxPolicy;
    var api = factory(taxPolicy);

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.OfferCompareCore = api;
    }
}(typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : this), function (taxPolicy) {
    "use strict";

    if (!taxPolicy || typeof taxPolicy.resolve !== "function" ||
            typeof taxPolicy.bracketFor !== "function") {
        throw new Error("OfferCompareTaxPolicy must be loaded before OfferCompareCore.");
    }

    var VERSION = 2;
    var MAX_OFFERS = 100;
    var MAX_CYCLE_WEEKS = 52;
    var WEEKDAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    var BONUS_TAX_MODES = ["auto", "merged", "separate"];
    var PRIMARY_HOURS_BASES = ["presence", "net"];

    var DEFAULT_SETTINGS = {
        year: 2026,
        weeksPerYear: 52,
        basicDeduction: 60000,
        specialAdditionalDeduction: 0,
        otherDeductions: 0,
        otherComprehensiveIncome: 0,
        socialInsuranceRate: 0.105,
        socialInsuranceMonths: 12,
        housingFundMonths: 12,
        lunchBreakHours: 2,
        dinnerBreakHours: 1,
        dinnerThreshold: "19:00",
        standardWorkDaysPerMonth: 21.75,
        standardPaidHoursPerDay: 8,
        bonusTaxMode: "auto",
        primaryHoursBasis: "presence"
    };

    function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function clone(value) {
        if (Array.isArray(value)) {
            return value.map(clone);
        }

        if (isObject(value)) {
            return Object.keys(value).reduce(function (copy, key) {
                copy[key] = clone(value[key]);
                return copy;
            }, {});
        }

        return value;
    }

    function finite(value, fallback, minimum, maximum) {
        var result = typeof value === "number" && Number.isFinite(value)
            ? value
            : fallback;

        if (!Number.isFinite(result)) {
            result = fallback;
        }
        if (Number.isFinite(minimum)) {
            result = Math.max(minimum, result);
        }
        if (Number.isFinite(maximum)) {
            result = Math.min(maximum, result);
        }
        return result;
    }

    function integer(value, fallback, minimum, maximum) {
        return Math.round(finite(value, fallback, minimum, maximum));
    }

    function rate(value, fallback) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            return fallback;
        }
        return finite(value, fallback, 0, 1);
    }

    function nullableFinite(value, minimum, maximum) {
        var parsed;

        if (value === undefined || value === null) {
            return null;
        }
        parsed = finite(value, NaN, minimum, maximum);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function nullableRate(value) {
        var parsed;

        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value !== "number" || !Number.isFinite(value)) {
            return null;
        }
        parsed = finite(value, NaN, 0, 1);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function ratePercentText(value) {
        return String(Number((value * 100).toFixed(3)));
    }

    function text(value, fallback) {
        if (typeof value !== "string") {
            return fallback;
        }
        value = value.trim();
        return value || fallback;
    }

    function cleanNumber(value) {
        if (!Number.isFinite(value) || Math.abs(value) < 1e-10) {
            return 0;
        }
        return value;
    }

    function safeDivide(numerator, denominator) {
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
            return 0;
        }
        return cleanNumber(numerator / denominator);
    }

    function parseTime(value) {
        var match;
        var hour;
        var minute;

        if (typeof value === "number" && Number.isFinite(value)) {
            hour = Math.floor(value);
            minute = Math.round((value - hour) * 60);
        } else if (typeof value === "string") {
            match = value.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
            if (!match) {
                return null;
            }
            hour = Number(match[1]);
            minute = match[2] === undefined ? 0 : Number(match[2]);
        } else {
            return null;
        }

        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return null;
        }
        return hour * 60 + minute;
    }

    function formatTime(minutes) {
        var normalized = ((minutes % 1440) + 1440) % 1440;
        var hour = Math.floor(normalized / 60);
        var minute = normalized % 60;
        return (hour < 10 ? "0" : "") + hour + ":" + (minute < 10 ? "0" : "") + minute;
    }

    function normalizedTime(value, fallback) {
        var parsed = parseTime(value);
        return parsed === null ? fallback : formatTime(parsed);
    }

    function durationHours(start, end) {
        var startMinutes = parseTime(start);
        var endMinutes = parseTime(end);

        if (startMinutes === null || endMinutes === null) {
            return 0;
        }
        if (endMinutes < startMinutes) {
            endMinutes += 1440;
        }
        return cleanNumber((endMinutes - startMinutes) / 60);
    }

    function createWeekdaySchedule(start, normalEnd, earlyEnd, earlyWeekdays, cycleWeeks, extraDays) {
        var days = [];
        var week;
        var weekday;
        var earlyMap = {};

        (earlyWeekdays || []).forEach(function (day) {
            earlyMap[day] = true;
        });

        for (week = 1; week <= cycleWeeks; week += 1) {
            for (weekday = 1; weekday <= 5; weekday += 1) {
                days.push({
                    week: week,
                    weekday: weekday,
                    start: start,
                    end: earlyMap[weekday] ? earlyEnd : normalEnd
                });
            }
        }

        (extraDays || []).forEach(function (day) {
            days.push(clone(day));
        });

        return {
            cycleWeeks: cycleWeeks,
            days: days
        };
    }

    var STANDARD_SCHEDULE = createWeekdaySchedule("09:00", "18:00", "18:00", [], 1, []);

    function normalizeBonusTaxMode(value, fallback) {
        return BONUS_TAX_MODES.indexOf(value) >= 0 ? value : fallback;
    }

    function normalizeSettings(rawSettings) {
        var raw = isObject(rawSettings) ? rawSettings : {};
        var threshold = normalizedTime(raw.dinnerThreshold, DEFAULT_SETTINGS.dinnerThreshold);

        return {
            year: integer(raw.year, DEFAULT_SETTINGS.year, 1970, 2100),
            weeksPerYear: DEFAULT_SETTINGS.weeksPerYear,
            basicDeduction: finite(raw.basicDeduction, DEFAULT_SETTINGS.basicDeduction, 0, 10000000),
            specialAdditionalDeduction: finite(
                raw.specialAdditionalDeduction,
                DEFAULT_SETTINGS.specialAdditionalDeduction,
                0,
                10000000
            ),
            otherDeductions: finite(raw.otherDeductions, DEFAULT_SETTINGS.otherDeductions, 0, 10000000),
            otherComprehensiveIncome: finite(
                raw.otherComprehensiveIncome,
                DEFAULT_SETTINGS.otherComprehensiveIncome,
                0,
                1000000000
            ),
            socialInsuranceRate: rate(raw.socialInsuranceRate, DEFAULT_SETTINGS.socialInsuranceRate),
            socialInsuranceMonths: finite(
                raw.socialInsuranceMonths,
                DEFAULT_SETTINGS.socialInsuranceMonths,
                0,
                12
            ),
            housingFundMonths: finite(raw.housingFundMonths, DEFAULT_SETTINGS.housingFundMonths, 0, 12),
            lunchBreakHours: DEFAULT_SETTINGS.lunchBreakHours,
            dinnerBreakHours: finite(raw.dinnerBreakHours, DEFAULT_SETTINGS.dinnerBreakHours, 0, 8),
            dinnerThreshold: threshold,
            standardWorkDaysPerMonth: finite(
                raw.standardWorkDaysPerMonth,
                DEFAULT_SETTINGS.standardWorkDaysPerMonth,
                1,
                31
            ),
            standardPaidHoursPerDay: finite(
                raw.standardPaidHoursPerDay,
                DEFAULT_SETTINGS.standardPaidHoursPerDay,
                1,
                24
            ),
            bonusTaxMode: normalizeBonusTaxMode(raw.bonusTaxMode, DEFAULT_SETTINGS.bonusTaxMode),
            primaryHoursBasis: PRIMARY_HOURS_BASES.indexOf(raw.primaryHoursBasis) >= 0
                ? raw.primaryHoursBasis
                : DEFAULT_SETTINGS.primaryHoursBasis
        };
    }

    function normalizeDay(rawDay, cycleWeeks) {
        var raw = isObject(rawDay) ? rawDay : {};

        return {
            week: integer(raw.week, 1, 1, cycleWeeks),
            weekday: integer(raw.weekday, 1, 1, 7),
            start: normalizedTime(raw.start, "09:00"),
            end: normalizedTime(raw.end, "18:00")
        };
    }

    function normalizeSchedule(rawSchedule) {
        var raw = isObject(rawSchedule) ? rawSchedule : {};
        var hasExplicitDays = Array.isArray(raw.days);
        var rawDays = hasExplicitDays ? raw.days : STANDARD_SCHEDULE.days;
        var inferredCycleWeeks = rawDays.reduce(function (maximum, day) {
            return Math.max(
                maximum,
                integer(isObject(day) ? day.week : 1, 1, 1, MAX_CYCLE_WEEKS)
            );
        }, 1);
        var declaredCycleWeeks = integer(
            raw.cycleWeeks,
            inferredCycleWeeks,
            1,
            MAX_CYCLE_WEEKS
        );
        var cycleWeeks = Math.min(
            MAX_CYCLE_WEEKS,
            Math.max(declaredCycleWeeks, inferredCycleWeeks)
        );

        return {
            cycleWeeks: cycleWeeks,
            lunchBreakHours: nullableFinite(raw.lunchBreakHours, 0, 8),
            dinnerBreakHours: nullableFinite(raw.dinnerBreakHours, 0, 8),
            days: rawDays.map(function (day) {
                return normalizeDay(day, cycleWeeks);
            })
        };
    }

    function normalizeOvertime(rawOvertime) {
        var raw = isObject(rawOvertime) ? rawOvertime : {};
        var payBase = raw.payBaseMonthly;

        return {
            shiftsPerYear: finite(raw.shiftsPerYear, 0, 0, 366),
            start: normalizedTime(raw.start, "09:00"),
            end: normalizedTime(raw.end, "18:00"),
            paidHours: finite(raw.paidHours, 8, 0, 24),
            payMultiplier: finite(raw.payMultiplier, 0, 0, 10),
            payBaseMonthly: payBase === undefined || payBase === null || payBase === ""
                ? null
                : finite(payBase, 0, 0, 1000000000)
        };
    }

    function normalizeOffer(rawOffer, index, settings) {
        var raw = isObject(rawOffer) ? rawOffer : {};
        var rawPay = isObject(raw.pay) ? raw.pay : {};
        var fallbackId = "offer-" + (index + 1);
        var requestedMode = normalizeBonusTaxMode(rawPay.bonusTaxMode, settings.bonusTaxMode);

        return {
            id: text(raw.id, fallbackId),
            company: text(raw.company, "未命名公司"),
            department: text(raw.department, ""),
            city: text(raw.city, "通用"),
            pay: {
                monthlySalary: finite(rawPay.monthlySalary, 0, 0, 1000000000),
                salaryMonths: finite(rawPay.salaryMonths, 12, 12, 60),
                otherAnnualCash: finite(rawPay.otherAnnualCash, 0, 0, 1000000000),
                bonusTaxMode: requestedMode
            },
            socialInsuranceRate: nullableRate(raw.socialInsuranceRate),
            housingFundRate: rate(raw.housingFundRate, 0),
            schedule: normalizeSchedule(raw.schedule),
            overtime: normalizeOvertime(raw.overtime)
        };
    }

    function schemaVersionError(rawState) {
        if (!isObject(rawState) ||
                !Object.prototype.hasOwnProperty.call(rawState, "version") ||
                rawState.version === undefined ||
                rawState.version === null) {
            return issue(
                "version",
                "missing_schema_version",
                "状态必须明确声明版本 v" + VERSION + "。"
            );
        }
        if (typeof rawState.version !== "number" ||
                !Number.isFinite(rawState.version) ||
                Math.floor(rawState.version) !== rawState.version) {
            return issue(
                "version",
                "invalid_schema_version",
                "状态版本必须是整数。"
            );
        }
        if (rawState.version > VERSION) {
            return issue(
                "version",
                "unsupported_future_version",
                "状态版本 v" + rawState.version +
                    " 高于当前支持的 v" + VERSION + "，无法安全解析。"
            );
        }
        if (rawState.version < VERSION) {
            return issue(
                "version",
                "unsupported_schema_version",
                "状态版本 v" + rawState.version +
                    " 不是当前支持的 v" + VERSION + "。"
            );
        }
        return null;
    }

    function throwValidationIssue(validationIssue) {
        var error = new Error(validationIssue.message);
        error.code = validationIssue.code;
        throw error;
    }

    function normalize(rawState) {
        var raw = isObject(rawState) ? rawState : {};
        var settingsSource = isObject(raw.settings) ? clone(raw.settings) : {};
        var settings;
        var rawOffers = Array.isArray(raw.offers)
            ? raw.offers.slice(0, MAX_OFFERS)
            : [];

        settings = normalizeSettings(settingsSource);

        return {
            version: VERSION,
            settings: settings,
            offers: rawOffers.map(function (offer, index) {
                return normalizeOffer(offer, index, settings);
            })
        };
    }

    function isCompactScheduleDayPath(path) {
        return path.length === 5 &&
            path[0] === "offers" &&
            typeof path[1] === "number" &&
            path[2] === "schedule" &&
            path[3] === "days" &&
            typeof path[4] === "number";
    }

    function stringifyJsonValue(value, depth, path) {
        var indent = new Array(depth + 1).join("  ");
        var childIndent = indent + "  ";
        var keys;

        if (Array.isArray(value)) {
            if (!value.length) {
                return "[]";
            }
            return "[\n" + value.map(function (item, index) {
                return childIndent + stringifyJsonValue(
                    item,
                    depth + 1,
                    path.concat(index)
                );
            }).join(",\n") + "\n" + indent + "]";
        }

        if (isObject(value)) {
            if (isCompactScheduleDayPath(path)) {
                return "{" + Object.keys(value).map(function (key) {
                    return JSON.stringify(key) + ": " + JSON.stringify(value[key]);
                }).join(", ") + "}";
            }
            keys = Object.keys(value);
            if (!keys.length) {
                return "{}";
            }
            return "{\n" + keys.map(function (key) {
                return childIndent + JSON.stringify(key) + ": " +
                    stringifyJsonValue(value[key], depth + 1, path.concat(key));
            }).join(",\n") + "\n" + indent + "}";
        }

        return JSON.stringify(value);
    }

    function stringifyState(rawState) {
        var parsed = parseState(rawState);

        if (parsed.validation.errors.length) {
            throwValidationIssue(parsed.validation.errors[0]);
        }
        return stringifyJsonValue(parsed.state, 0, []) + "\n";
    }

    function createDefaultState(seedState) {
        var hasSeed = isObject(seedState);
        var seed = hasSeed ? clone(seedState) : { version: VERSION };
        var stateError;

        if (!Array.isArray(seed.offers)) {
            seed.offers = [];
        }
        if (!isObject(seed.settings)) {
            seed.settings = clone(DEFAULT_SETTINGS);
        }
        stateError = schemaVersionError(seed);
        if (stateError) {
            throwValidationIssue(stateError);
        }
        if (seed.offers.length > MAX_OFFERS) {
            var offerLimitError = new Error(
                "最多支持 " + MAX_OFFERS + " 个 Offer。"
            );
            offerLimitError.code = "too_many_offers";
            throw offerLimitError;
        }
        return normalize(seed);
    }

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

    function issue(path, code, message) {
        return { path: path, code: code, message: message };
    }

    function matchesNumberStep(value, step, base) {
        var steps;

        if (!Number.isFinite(step) || step <= 0) {
            return true;
        }
        steps = (value - (Number.isFinite(base) ? base : 0)) / step;
        return Math.abs(steps - Math.round(steps)) < 1e-8;
    }

    function validateRawNumber(errors, container, key, path, constraints) {
        var rawValue;
        var value;
        var invalid;

        if (!isObject(container) ||
                !Object.prototype.hasOwnProperty.call(container, key)) {
            return;
        }

        rawValue = container[key];
        if (constraints.nullable && (
                rawValue === null ||
                rawValue === undefined
        )) {
            return;
        }

        value = typeof rawValue === "number" ? rawValue : NaN;
        invalid = !Number.isFinite(value) ||
            (Number.isFinite(constraints.minimum) &&
                value < constraints.minimum) ||
            (Number.isFinite(constraints.maximum) &&
                value > constraints.maximum) ||
            (constraints.integer && Math.floor(value) !== value) ||
            !matchesNumberStep(value, constraints.step, constraints.stepBase);

        if (invalid) {
            errors.push(issue(path, constraints.code, constraints.message));
        }
    }

    function timeValueForValidation(rawContainer, key, normalizedValue) {
        if (isObject(rawContainer) &&
                Object.prototype.hasOwnProperty.call(rawContainer, key)) {
            return rawContainer[key];
        }
        return normalizedValue;
    }

    function validateParsedState(rawState, state, resolvedTaxPolicy) {
        var raw = isObject(rawState) ? rawState : {};
        var rawSettings = isObject(raw.settings) ? raw.settings : {};
        var errors = [];
        var warnings = [];
        var ids = new Set();
        var rawOffers = Array.isArray(raw.offers) ? raw.offers : [];

        if (!state.offers.length) {
            errors.push(issue("offers", "empty_offers", "请至少添加一个 Offer。"));
        }
        if (rawOffers.length > MAX_OFFERS) {
            errors.push(issue(
                "offers",
                "too_many_offers",
                "最多支持 " + MAX_OFFERS + " 个 Offer。"
            ));
        }

        if (Object.prototype.hasOwnProperty.call(rawSettings, "year")) {
            var rawYear = typeof rawSettings.year === "number"
                ? rawSettings.year
                : NaN;

            if (!Number.isFinite(rawYear) ||
                    Math.floor(rawYear) !== rawYear ||
                    rawYear < 1970 ||
                    rawYear > 2100) {
                errors.push(issue(
                    "settings.year",
                    "invalid_tax_year",
                    "税务年份必须是 1970–2100 之间的整数。"
                ));
            }
        }
        validateRawNumber(
            errors,
            rawSettings,
            "socialInsuranceRate",
            "settings.socialInsuranceRate",
            {
                minimum: 0,
                maximum: 1,
                step: 0.001,
                code: "invalid_social_insurance_rate",
                message: "默认个人社保比例必须是 0%–100%，且以 0.1% 为步长。"
            }
        );
        validateRawNumber(
            errors,
            rawSettings,
            "specialAdditionalDeduction",
            "settings.specialAdditionalDeduction",
            {
                minimum: 0,
                maximum: 10000000,
                step: 100,
                code: "invalid_special_additional_deduction",
                message: "年度专项附加扣除必须是非负数，且以 100 元为步长。"
            }
        );

        resolvedTaxPolicy.warnings.forEach(function (policyWarning) {
            warnings.push(issue(
                "settings.year",
                policyWarning.code,
                policyWarning.message
            ));
        });

        if (!resolvedTaxPolicy.annualBonusSeparate.available) {
            var effectiveRange =
                resolvedTaxPolicy.annualBonusSeparate.effectiveRange;
            var beforeEffectiveRange = state.settings.year < effectiveRange.from;

            warnings.push(issue(
                "settings.year",
                beforeEffectiveRange
                    ? "separate_bonus_not_effective"
                    : "separate_bonus_expired",
                beforeEffectiveRange
                    ? "当前计算年份早于奖金单独计税政策有效期，将全部并入综合所得。"
                    : "当前计算年份已超过奖金单独计税政策有效期，将全部并入综合所得。"
            ));
        }

        state.offers.forEach(function (offer, index) {
            var path = "offers[" + index + "]";
            var rawOffer = isObject(rawOffers[index]) ? rawOffers[index] : null;
            var rawPay = rawOffer && isObject(rawOffer.pay)
                ? rawOffer.pay
                : null;
            var rawSchedule = rawOffer && isObject(rawOffer.schedule)
                ? rawOffer.schedule
                : null;
            var rawScheduleDays = rawSchedule && Array.isArray(rawSchedule.days)
                ? rawSchedule.days
                : null;
            var rawOvertime = rawOffer && isObject(rawOffer.overtime)
                ? rawOffer.overtime
                : null;
            var seenDays = new Set();

            validateRawNumber(
                errors,
                rawPay,
                "monthlySalary",
                path + ".pay.monthlySalary",
                {
                    maximum: 1000000000,
                    step: 100,
                    code: "invalid_monthly_salary",
                    message: "月薪必须是有效金额，且以 100 元为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawPay,
                "salaryMonths",
                path + ".pay.salaryMonths",
                {
                    minimum: 12,
                    maximum: 60,
                    step: 0.1,
                    stepBase: 12,
                    code: "invalid_salary_months",
                    message: "总薪数必须是 12–60，且以 0.1 为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawPay,
                "otherAnnualCash",
                path + ".pay.otherAnnualCash",
                {
                    minimum: 0,
                    maximum: 1000000000,
                    step: 100,
                    code: "invalid_other_annual_cash",
                    message: "其他年现金必须是非负金额，且以 100 元为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawOffer,
                "socialInsuranceRate",
                path + ".socialInsuranceRate",
                {
                    nullable: true,
                    minimum: 0,
                    maximum: 1,
                    step: 0.001,
                    code: "invalid_offer_social_insurance_rate",
                    message: "个人社保比例必须留空或填写 0%–100%，且以 0.1% 为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawOffer,
                "housingFundRate",
                path + ".housingFundRate",
                {
                    minimum: 0,
                    maximum: 1,
                    step: 0.001,
                    code: "invalid_housing_fund_rate",
                    message: "公积金比例必须是 0%–100%，且以 0.1% 为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawSchedule,
                "cycleWeeks",
                path + ".schedule.cycleWeeks",
                {
                    minimum: 1,
                    maximum: MAX_CYCLE_WEEKS,
                    integer: true,
                    code: "invalid_cycle_weeks",
                    message: "循环周数必须是 1–" + MAX_CYCLE_WEEKS + " 之间的整数。"
                }
            );
            validateRawNumber(
                errors,
                rawSchedule,
                "lunchBreakHours",
                path + ".schedule.lunchBreakHours",
                {
                    nullable: true,
                    minimum: 0,
                    maximum: 8,
                    step: 0.25,
                    code: "invalid_lunch_break_hours",
                    message: "午休时长必须留空或填写 0–8 小时，且以 0.25 小时为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawSchedule,
                "dinnerBreakHours",
                path + ".schedule.dinnerBreakHours",
                {
                    nullable: true,
                    minimum: 0,
                    maximum: 8,
                    step: 0.25,
                    code: "invalid_dinner_break_hours",
                    message: "晚休时长必须留空或填写 0–8 小时，且以 0.25 小时为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawOvertime,
                "shiftsPerYear",
                path + ".overtime.shiftsPerYear",
                {
                    minimum: 0,
                    maximum: 366,
                    integer: true,
                    code: "invalid_overtime_shifts",
                    message: "额外班次必须是 0–366 之间的整数。"
                }
            );
            validateRawNumber(
                errors,
                rawOvertime,
                "payMultiplier",
                path + ".overtime.payMultiplier",
                {
                    minimum: 0,
                    maximum: 10,
                    step: 0.5,
                    code: "invalid_overtime_multiplier",
                    message: "加班费倍率必须是 0–10，且以 0.5 为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawOvertime,
                "paidHours",
                path + ".overtime.paidHours",
                {
                    minimum: 0,
                    maximum: 24,
                    step: 0.5,
                    code: "invalid_overtime_paid_hours",
                    message: "每次计薪小时必须是 0–24，且以 0.5 小时为步长。"
                }
            );
            validateRawNumber(
                errors,
                rawOvertime,
                "payBaseMonthly",
                path + ".overtime.payBaseMonthly",
                {
                    nullable: true,
                    minimum: 0,
                    maximum: 1000000000,
                    step: 100,
                    code: "invalid_overtime_pay_base",
                    message: "加班月薪基数必须留空或填写非负金额，且以 100 元为步长。"
                }
            );

            if (offer.pay.monthlySalary <= 0) {
                errors.push(issue(path + ".pay.monthlySalary", "missing_salary", "月薪必须大于 0。"));
            }
            if (ids.has(offer.id)) {
                errors.push(issue(path + ".id", "duplicate_id", "Offer id 不能重复。"));
            }
            ids.add(offer.id);

            if (offer.city === "通用") {
                warnings.push(issue(
                    path + ".city",
                    "generic_city",
                    "未指定缴纳城市，未套用城市缴费基数上下限。"
                ));
            }
            if (!offer.department) {
                warnings.push(issue(path + ".department", "missing_department", "未提供部门，仅显示公司名。"));
            }
            if (rawOffer && !isObject(rawOffer.schedule)) {
                warnings.push(issue(
                    path + ".schedule",
                    "default_schedule",
                    "未提供排班，已按周一至周五 09:00–18:00 估算。"
                ));
            }
            if (rawOffer && rawOffer.housingFundRate === undefined) {
                warnings.push(issue(
                    path + ".housingFundRate",
                    "default_housing_fund",
                    "未提供公积金比例，已按 0% 估算。"
                ));
            }

            offer.schedule.days.forEach(function (day, dayIndex) {
                var dayKey = day.week + "-" + day.weekday;
                var rawDay = rawScheduleDays ? rawScheduleDays[dayIndex] : null;
                var startValue = timeValueForValidation(rawDay, "start", day.start);
                var endValue = timeValueForValidation(rawDay, "end", day.end);
                var startMinutes = parseTime(startValue);
                var endMinutes = parseTime(endValue);

                validateRawNumber(
                    errors,
                    rawDay,
                    "week",
                    path + ".schedule.days[" + dayIndex + "].week",
                    {
                        minimum: 1,
                        maximum: offer.schedule.cycleWeeks,
                        integer: true,
                        code: "invalid_schedule_week",
                        message: "排班周次必须是循环周期内的整数。"
                    }
                );
                validateRawNumber(
                    errors,
                    rawDay,
                    "weekday",
                    path + ".schedule.days[" + dayIndex + "].weekday",
                    {
                        minimum: 1,
                        maximum: 7,
                        integer: true,
                        code: "invalid_schedule_weekday",
                        message: "排班星期必须是 1–7 之间的整数。"
                    }
                );

                if (seenDays.has(dayKey)) {
                    warnings.push(issue(
                        path + ".schedule.days[" + dayIndex + "]",
                        "duplicate_schedule_day",
                        "同一周期周和星期存在重复班次，工时会累加。"
                    ));
                }
                seenDays.add(dayKey);

                if (startMinutes === null ||
                        endMinutes === null ||
                        startMinutes === endMinutes) {
                    errors.push(issue(
                        path + ".schedule.days[" + dayIndex + "]",
                        "invalid_shift",
                        WEEKDAY_NAMES[day.weekday] + " 的上下班时间无效。"
                    ));
                }
            });

            if (offer.overtime.shiftsPerYear > 0) {
                var overtimeStart = parseTime(timeValueForValidation(
                    rawOvertime,
                    "start",
                    offer.overtime.start
                ));
                var overtimeEnd = parseTime(timeValueForValidation(
                    rawOvertime,
                    "end",
                    offer.overtime.end
                ));

                if (overtimeStart === null ||
                        overtimeEnd === null ||
                        overtimeStart === overtimeEnd) {
                    errors.push(issue(
                        path + ".overtime",
                        "invalid_overtime_shift",
                        "额外班次的上下班时间无效。"
                    ));
                }
            }

            if (offer.overtime.shiftsPerYear > 0 && offer.overtime.payMultiplier <= 0) {
                warnings.push(issue(
                    path + ".overtime.payMultiplier",
                    "unpaid_extra_shift",
                    "已设置额外班次，但加班倍率为 0，仅计工时、不计收入。"
                ));
            }
        });

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    function parseStateContext(rawState) {
        var raw = isObject(rawState) ? rawState : {};
        var versionError = schemaVersionError(raw);
        var state = normalize(raw);
        var resolvedTaxPolicy = taxPolicy.resolve(state.settings.year);
        var validation = validateParsedState(
            raw,
            state,
            resolvedTaxPolicy
        );
        var schemaErrors = versionError ? [versionError] : [];

        return {
            state: state,
            resolvedTaxPolicy: resolvedTaxPolicy,
            versionError: versionError,
            validation: {
                valid: schemaErrors.length === 0 && validation.valid,
                errors: schemaErrors.concat(validation.errors),
                warnings: validation.warnings
            }
        };
    }

    function parseState(rawState) {
        var context = parseStateContext(rawState);
        return {
            state: context.state,
            validation: context.validation
        };
    }

    function validateState(rawState) {
        return parseState(rawState).validation;
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
        VERSION: VERSION,
        MAX_OFFERS: MAX_OFFERS,
        MAX_CYCLE_WEEKS: MAX_CYCLE_WEEKS,
        parseState: parseState,
        stringifyState: stringifyState,
        calculateAll: calculateAll,
        createDefaultState: createDefaultState,
        validateState: validateState
    };
}));
