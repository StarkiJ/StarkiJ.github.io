(function (root, factory) {
    "use strict";

    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.OfferCompareCore = api;
    }
}(typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : this), function () {
    "use strict";

    var VERSION = 2;
    var MAX_CYCLE_WEEKS = 52;
    var WEEKDAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    var BONUS_TAX_MODES = ["auto", "merged", "separate"];
    var PRIMARY_HOURS_BASES = ["presence", "net"];

    var ANNUAL_TAX_BRACKETS = [
        { limit: 36000, rate: 0.03, quickDeduction: 0 },
        { limit: 144000, rate: 0.10, quickDeduction: 2520 },
        { limit: 300000, rate: 0.20, quickDeduction: 16920 },
        { limit: 420000, rate: 0.25, quickDeduction: 31920 },
        { limit: 660000, rate: 0.30, quickDeduction: 52920 },
        { limit: 960000, rate: 0.35, quickDeduction: 85920 },
        { limit: Infinity, rate: 0.45, quickDeduction: 181920 }
    ];

    var BONUS_TAX_BRACKETS = [
        { limit: 3000, rate: 0.03, quickDeduction: 0 },
        { limit: 12000, rate: 0.10, quickDeduction: 210 },
        { limit: 25000, rate: 0.20, quickDeduction: 1410 },
        { limit: 35000, rate: 0.25, quickDeduction: 2660 },
        { limit: 55000, rate: 0.30, quickDeduction: 4410 },
        { limit: 80000, rate: 0.35, quickDeduction: 7160 },
        { limit: Infinity, rate: 0.45, quickDeduction: 15160 }
    ];

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
        annualBonusSeparateTaxThrough: 2027,
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

    function numberFrom(value, fallback) {
        var text;
        var multiplier = 1;
        var parsed;

        if (typeof value === "number") {
            return Number.isFinite(value) ? value : fallback;
        }

        if (typeof value !== "string") {
            return fallback;
        }

        text = value.trim().replace(/[,\s￥¥]/g, "");
        if (!text) {
            return fallback;
        }

        if (/万$/i.test(text)) {
            multiplier = 10000;
            text = text.slice(0, -1);
        } else if (/k$/i.test(text)) {
            multiplier = 1000;
            text = text.slice(0, -1);
        }

        parsed = Number(text);
        return Number.isFinite(parsed) ? parsed * multiplier : fallback;
    }

    function finite(value, fallback, minimum, maximum) {
        var result = numberFrom(value, fallback);

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
        var parsed;

        if (typeof value === "string" && /%/.test(value)) {
            parsed = numberFrom(value.replace("%", ""), fallback * 100) / 100;
        } else {
            parsed = numberFrom(value, fallback);
            if (parsed > 1 && parsed <= 100) {
                parsed /= 100;
            }
        }

        return finite(parsed, fallback, 0, 1);
    }

    function nullableFinite(value, minimum, maximum) {
        var parsed;

        if (value === undefined || value === null ||
                (typeof value === "string" && !value.trim())) {
            return null;
        }
        parsed = finite(value, NaN, minimum, maximum);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function nullableRate(value) {
        var parsed;

        if (value === undefined || value === null ||
                (typeof value === "string" && !value.trim())) {
            return null;
        }
        parsed = rate(value, NaN);
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
        if (endMinutes <= startMinutes) {
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
            annualBonusSeparateTaxThrough: integer(
                raw.annualBonusSeparateTaxThrough,
                DEFAULT_SETTINGS.annualBonusSeparateTaxThrough,
                1970,
                2027
            ),
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

    function normalize(rawState) {
        var raw = isObject(rawState) ? rawState : {};
        var settingsSource = isObject(raw.settings) ? clone(raw.settings) : {};
        var settings;
        var rawOffers = Array.isArray(raw.offers) ? raw.offers : [];

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
        return stringifyJsonValue(normalize(rawState), 0, []) + "\n";
    }

    function createDefaultState(seedState) {
        var seed = isObject(seedState) ? clone(seedState) : {};

        if (!Array.isArray(seed.offers)) {
            seed.offers = [];
        }
        if (!isObject(seed.settings)) {
            seed.settings = clone(DEFAULT_SETTINGS);
        }
        if (seed.version === undefined || seed.version === null) {
            seed.version = VERSION;
        }
        return normalize(seed);
    }

    function bracketFor(value, brackets) {
        var amount = Math.max(0, finite(value, 0, 0, Number.MAX_SAFE_INTEGER));
        var index;

        for (index = 0; index < brackets.length; index += 1) {
            if (amount <= brackets[index].limit) {
                return brackets[index];
            }
        }
        return brackets[brackets.length - 1];
    }

    function annualComprehensiveTax(taxableIncome) {
        var taxable = Math.max(0, finite(taxableIncome, 0, 0, Number.MAX_SAFE_INTEGER));
        var bracket = bracketFor(taxable, ANNUAL_TAX_BRACKETS);

        return {
            taxableIncome: taxable,
            rate: bracket.rate,
            quickDeduction: bracket.quickDeduction,
            tax: cleanNumber(Math.max(0, taxable * bracket.rate - bracket.quickDeduction))
        };
    }

    function separateBonusTax(bonus) {
        var taxableBonus = Math.max(0, finite(bonus, 0, 0, Number.MAX_SAFE_INTEGER));
        var monthlyEquivalent = taxableBonus / 12;
        var bracket = bracketFor(monthlyEquivalent, BONUS_TAX_BRACKETS);

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
        var regularDaysPerCycle = schedule.days.length;
        var workSettings = clone(settings);
        var overtimeDay = {
            start: overtime.start,
            end: overtime.end
        };
        var overtimeHours;
        var annualRegularPresence;
        var annualRegularNet;
        var annualOvertimePresence;
        var annualOvertimeNet;
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

        annualRegularPresence = safeDivide(cyclePresence, schedule.cycleWeeks) * settings.weeksPerYear;
        annualRegularNet = safeDivide(cycleNet, schedule.cycleWeeks) * settings.weeksPerYear;
        annualOvertimePresence = overtimeHours.presence * overtime.shiftsPerYear;
        annualOvertimeNet = overtimeHours.net * overtime.shiftsPerYear;
        annualPresence = annualRegularPresence + annualOvertimePresence;
        annualNet = annualRegularNet + annualOvertimeNet;

        return {
            cycleWeeks: schedule.cycleWeeks,
            regularDaysPerCycle: regularDaysPerCycle,
            averageRegularDaysPerWeek: safeDivide(regularDaysPerCycle, schedule.cycleWeeks),
            annualScheduledDays: safeDivide(regularDaysPerCycle, schedule.cycleWeeks)
                * settings.weeksPerYear + overtime.shiftsPerYear,
            cyclePresenceHours: cleanNumber(cyclePresence),
            cycleNetHours: cleanNumber(cycleNet),
            annualRegularPresenceHours: cleanNumber(annualRegularPresence),
            annualRegularNetHours: cleanNumber(annualRegularNet),
            annualOvertimePresenceHours: cleanNumber(annualOvertimePresence),
            annualOvertimeNetHours: cleanNumber(annualOvertimeNet),
            annualPresenceHours: cleanNumber(annualPresence),
            annualNetHours: cleanNumber(annualNet),
            averageWeeklyPresenceHours: safeDivide(annualPresence, settings.weeksPerYear),
            averageWeeklyNetHours: safeDivide(annualNet, settings.weeksPerYear),
            overtimeShiftPresenceHours: overtimeHours.presence,
            overtimeShiftNetHours: overtimeHours.net,
            lunchBreakHours: workSettings.lunchBreakHours,
            dinnerBreakHours: workSettings.dinnerBreakHours,
            dinnerThreshold: workSettings.dinnerThreshold
        };
    }

    function calculateOvertimePay(offer, settings) {
        var overtime = offer.overtime;
        var monthlyBase = overtime.payBaseMonthly === null
            ? offer.pay.monthlySalary
            : overtime.payBaseMonthly;
        var dailyBase = safeDivide(monthlyBase, settings.standardWorkDaysPerMonth);
        var paidDayFraction = safeDivide(overtime.paidHours, settings.standardPaidHoursPerDay);
        var perShift = dailyBase * paidDayFraction * overtime.payMultiplier;

        return {
            monthlyBase: monthlyBase,
            dailyBase: dailyBase,
            paidHoursPerShift: overtime.paidHours,
            multiplier: overtime.payMultiplier,
            shiftsPerYear: overtime.shiftsPerYear,
            payPerShift: cleanNumber(perShift),
            annualPay: cleanNumber(perShift * overtime.shiftsPerYear)
        };
    }

    function taxScenario(mode, regularIncome, bonus, deductions, separateAvailable) {
        var comprehensive;
        var bonusResult;

        if (mode === "separate" && !separateAvailable) {
            return {
                mode: "separate",
                available: false,
                taxableComprehensiveIncome: null,
                comprehensiveRate: null,
                comprehensiveQuickDeduction: null,
                comprehensiveTax: null,
                bonusMonthlyEquivalent: null,
                bonusRate: null,
                bonusQuickDeduction: null,
                bonusTax: null,
                totalTax: null,
                unavailableReason: "计算年份已超过全年一次性奖金单独计税政策有效期"
            };
        }

        if (mode === "separate") {
            comprehensive = annualComprehensiveTax(regularIncome - deductions);
            bonusResult = separateBonusTax(bonus);
            return {
                mode: "separate",
                available: true,
                taxableComprehensiveIncome: comprehensive.taxableIncome,
                comprehensiveRate: comprehensive.rate,
                comprehensiveQuickDeduction: comprehensive.quickDeduction,
                comprehensiveTax: comprehensive.tax,
                bonusMonthlyEquivalent: bonusResult.monthlyEquivalent,
                bonusRate: bonusResult.rate,
                bonusQuickDeduction: bonusResult.quickDeduction,
                bonusTax: bonusResult.tax,
                totalTax: cleanNumber(comprehensive.tax + bonusResult.tax),
                unavailableReason: ""
            };
        }

        comprehensive = annualComprehensiveTax(regularIncome + bonus - deductions);
        return {
            mode: "merged",
            available: true,
            taxableComprehensiveIncome: comprehensive.taxableIncome,
            comprehensiveRate: comprehensive.rate,
            comprehensiveQuickDeduction: comprehensive.quickDeduction,
            comprehensiveTax: comprehensive.tax,
            bonusMonthlyEquivalent: 0,
            bonusRate: 0,
            bonusQuickDeduction: 0,
            bonusTax: 0,
            totalTax: comprehensive.tax,
            unavailableReason: ""
        };
    }

    function buildDefaultAssumptions(settings) {
        var bonusTaxDefault;

        if (settings.bonusTaxMode === "merged") {
            bonusTaxDefault = "Offer 未指定时并入综合所得计税";
        } else if (settings.bonusTaxMode === "separate" &&
                settings.year <= settings.annualBonusSeparateTaxThrough) {
            bonusTaxDefault = "Offer 未指定时按全年一次性奖金单独计税";
        } else if (settings.bonusTaxMode === "separate") {
            bonusTaxDefault = "默认指定单独计税，但当前年份已超过政策有效期，改为并入综合所得";
        } else if (settings.year <= settings.annualBonusSeparateTaxThrough) {
            bonusTaxDefault = "Offer 未指定时，同时计算并入综合所得与全年一次性奖金单独计税，采用税额较低者";
        } else {
            bonusTaxDefault = "Offer 未指定时并入综合所得；当前年份已超过全年一次性奖金单独计税政策有效期";
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
                value: bonusTaxDefault + "；单独计税政策默认有效至 " +
                    settings.annualBonusSeparateTaxThrough + " 年"
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

    function calculateOffer(rawOffer, rawSettings) {
        var settingsSource = isObject(rawSettings) && isObject(rawSettings.settings)
            ? rawSettings.settings
            : rawSettings;
        var settings = normalizeSettings(settingsSource);
        var offer = normalizeOffer(rawOffer, 0, settings);
        var work = calculateWork(offer.schedule, offer.overtime, settings);
        var socialInsuranceRate = offer.socialInsuranceRate === null
            ? settings.socialInsuranceRate
            : offer.socialInsuranceRate;
        var overtimePay = calculateOvertimePay(offer, settings);
        var annualBaseSalary = offer.pay.monthlySalary * 12;
        var annualBonus = offer.pay.monthlySalary * Math.max(0, offer.pay.salaryMonths - 12);
        var annualPretaxCash = annualBaseSalary + annualBonus +
            offer.pay.otherAnnualCash + overtimePay.annualPay;
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
            overtimePay.annualPay + settings.otherComprehensiveIncome;
        var separateAvailable = settings.year <= settings.annualBonusSeparateTaxThrough;
        var baseline = taxScenario(
            "merged",
            settings.otherComprehensiveIncome,
            0,
            baselineDeductions,
            true
        );
        var merged = taxScenario("merged", regularIncome, annualBonus, taxDeductions, true);
        var separate = taxScenario("separate", regularIncome, annualBonus, taxDeductions, separateAvailable);
        var requestedMode = offer.pay.bonusTaxMode === "auto" && settings.bonusTaxMode !== "auto"
            ? settings.bonusTaxMode
            : offer.pay.bonusTaxMode;
        var selected;
        var annualTakeHomeCash;
        var housingFundEquity;
        var cashAndHousingFundEquity;
        var offerIncomeTax;
        var primaryAnnualHours;
        var metrics;
        var assumptions;

        if (!separateAvailable || requestedMode === "merged") {
            selected = merged;
        } else if (requestedMode === "separate") {
            selected = separate;
        } else {
            selected = separate.totalTax < merged.totalTax ? separate : merged;
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
            annualBaseSalary: cleanNumber(annualBaseSalary),
            annualBonus: cleanNumber(annualBonus),
            annualOvertimePay: overtimePay.annualPay,
            annualOtherCash: offer.pay.otherAnnualCash,
            annualPretaxCash: cleanNumber(annualPretaxCash),
            employeeSocialInsurance: cleanNumber(employeeSocialInsurance),
            employeeHousingFund: cleanNumber(employeeHousingFund),
            employerHousingFund: cleanNumber(employerHousingFund),
            housingFundEquity: cleanNumber(housingFundEquity),
            annualIncomeTax: offerIncomeTax,
            annualTakeHomeCash: cleanNumber(annualTakeHomeCash),
            cashAndHousingFundEquity: cleanNumber(cashAndHousingFundEquity),
            monthlyEquivalentTakeHome: safeDivide(annualTakeHomeCash, 12),
            averageWeeklyPresenceHours: work.averageWeeklyPresenceHours,
            averageWeeklyNetHours: work.averageWeeklyNetHours,
            annualPresenceHours: work.annualPresenceHours,
            annualNetHours: work.annualNetHours,
            pretaxHourlyPresence: safeDivide(annualPretaxCash, work.annualPresenceHours),
            afterTaxHourlyPresence: safeDivide(annualTakeHomeCash, work.annualPresenceHours),
            pretaxHourlyNet: safeDivide(annualPretaxCash, work.annualNetHours),
            afterTaxHourlyNet: safeDivide(annualTakeHomeCash, work.annualNetHours),
            pretaxHourly: safeDivide(annualPretaxCash, primaryAnnualHours),
            afterTaxHourly: safeDivide(annualTakeHomeCash, primaryAnnualHours)
        };

        assumptions = buildDefaultAssumptions(settings);

        return {
            id: offer.id,
            company: offer.company,
            department: offer.department,
            city: offer.city,
            name: offer.department ? offer.company + " · " + offer.department : offer.company,
            offer: offer,
            settings: settings,
            payBreakdown: {
                monthlySalary: offer.pay.monthlySalary,
                fixedSalaryMonths: 12,
                bonusMonths: Math.max(0, offer.pay.salaryMonths - 12),
                salaryMonths: offer.pay.salaryMonths,
                annualBaseSalary: metrics.annualBaseSalary,
                annualBonus: metrics.annualBonus,
                otherAnnualCash: metrics.annualOtherCash,
                overtimePay: overtimePay
            },
            contributions: {
                socialInsuranceRate: socialInsuranceRate,
                socialInsuranceMonths: settings.socialInsuranceMonths,
                employeeSocialInsurance: metrics.employeeSocialInsurance,
                employeeHousingFund: metrics.employeeHousingFund,
                employerHousingFund: metrics.employerHousingFund,
                housingFundEquity: metrics.housingFundEquity
            },
            tax: {
                policyYear: settings.year,
                separateAvailable: separateAvailable,
                requestedMode: requestedMode,
                selectedMode: selected.mode,
                selectedTax: offerIncomeTax,
                selectedTotalTax: selected.totalTax,
                baseline: baseline,
                merged: merged,
                separate: separate,
                difference: separateAvailable
                    ? cleanNumber(merged.totalTax - separate.totalTax)
                    : 0,
                savingsFromSelected: separateAvailable
                    ? cleanNumber(Math.max(merged.totalTax, separate.totalTax) - selected.totalTax)
                    : 0
            },
            work: work,
            metrics: metrics,
            assumptions: assumptions,
            defaultAssumptionCount: assumptions.length,

            // Frequently displayed metrics are mirrored here to keep UI bindings simple.
            annualPretaxCash: metrics.annualPretaxCash,
            annualTakeHomeCash: metrics.annualTakeHomeCash,
            averageWeeklyPresenceHours: metrics.averageWeeklyPresenceHours,
            averageWeeklyNetHours: metrics.averageWeeklyNetHours,
            pretaxHourly: metrics.pretaxHourly,
            afterTaxHourly: metrics.afterTaxHourly
        };
    }

    function issue(path, code, message) {
        return { path: path, code: code, message: message };
    }

    function validateState(rawState) {
        var raw = isObject(rawState) ? rawState : {};
        var state = normalize(rawState);
        var errors = [];
        var warnings = [];
        var ids = {};
        var rawOffers = Array.isArray(raw.offers) ? raw.offers : [];

        if (!state.offers.length) {
            errors.push(issue("offers", "empty_offers", "请至少添加一个 Offer。"));
        }

        if (state.settings.year > state.settings.annualBonusSeparateTaxThrough) {
            warnings.push(issue(
                "settings.year",
                "separate_bonus_expired",
                "当前计算年份已超过奖金单独计税政策有效期，将全部并入综合所得。"
            ));
        }

        state.offers.forEach(function (offer, index) {
            var path = "offers[" + index + "]";
            var rawOffer = isObject(rawOffers[index]) ? rawOffers[index] : null;
            var seenDays = {};

            if (offer.pay.monthlySalary <= 0) {
                errors.push(issue(path + ".pay.monthlySalary", "missing_salary", "月薪必须大于 0。"));
            }
            if (ids[offer.id]) {
                errors.push(issue(path + ".id", "duplicate_id", "Offer id 不能重复。"));
            }
            ids[offer.id] = true;

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
            if (rawOffer && Object.prototype.hasOwnProperty.call(rawOffer, "project")) {
                warnings.push(issue(
                    path + ".project",
                    "deprecated_project",
                    "project 字段已弃用，请将其内容合并到 department。"
                ));
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
                var hours = durationHours(day.start, day.end);

                if (seenDays[dayKey]) {
                    warnings.push(issue(
                        path + ".schedule.days[" + dayIndex + "]",
                        "duplicate_schedule_day",
                        "同一周期周和星期存在重复班次，工时会累加。"
                    ));
                }
                seenDays[dayKey] = true;

                if (hours <= 0 || hours > 24) {
                    errors.push(issue(
                        path + ".schedule.days[" + dayIndex + "]",
                        "invalid_shift",
                        WEEKDAY_NAMES[day.weekday] + " 的上下班时间无效。"
                    ));
                }
            });

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

    function bestId(results, field, direction) {
        var best = null;

        results.forEach(function (result) {
            var value = result.metrics[field];
            if (!best ||
                    (direction === "min" && value < best.value) ||
                    (direction !== "min" && value > best.value)) {
                best = { id: result.id, value: value };
            }
        });

        return best ? best.id : null;
    }

    function calculateAll(rawState) {
        var state = normalize(rawState);
        var results = state.offers.map(function (offer) {
            return calculateOffer(offer, state.settings);
        });
        var assumptions = buildDefaultAssumptions(state.settings);
        var validation = validateState(state);

        return {
            state: state,
            results: results,
            summary: {
                offerCount: results.length,
                highestPretaxIncomeId: bestId(results, "annualPretaxCash", "max"),
                highestTakeHomeIncomeId: bestId(results, "annualTakeHomeCash", "max"),
                lowestWeeklyPresenceHoursId: bestId(results, "averageWeeklyPresenceHours", "min"),
                highestPretaxHourlyId: bestId(results, "pretaxHourly", "max"),
                highestAfterTaxHourlyId: bestId(results, "afterTaxHourly", "max"),
                primaryHoursBasis: state.settings.primaryHoursBasis,
                assumptionCount: assumptions.length
            },
            validation: validation,
            assumptions: assumptions,
            defaultAssumptionCount: assumptions.length
        };
    }

    return {
        VERSION: VERSION,
        MAX_CYCLE_WEEKS: MAX_CYCLE_WEEKS,
        DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
        normalize: normalize,
        stringifyState: stringifyState,
        calculateOffer: calculateOffer,
        calculateAll: calculateAll,
        createDefaultState: createDefaultState,
        validateState: validateState
    };
}));
