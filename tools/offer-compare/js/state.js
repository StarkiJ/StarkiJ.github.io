(function (root, factory) {
    "use strict";
    var commonJs = typeof module === "object" && module.exports;
    var api = factory(
        commonJs ? require("./domain.js") : root.OfferCompareDomain,
        commonJs ? require("./tax-policy.js") : root.OfferCompareTaxPolicy
    );
    if (commonJs) { module.exports = api; }
    if (root) { root.OfferCompareState = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function (domain, taxPolicy) {
    "use strict";

    var {
        isObject, clone, finite, integer, rate, nullableFinite, nullableRate,
        text, parseTime, normalizedTime, MAX_CYCLE_WEEKS, WEEKDAY_NAMES
    } = domain;

    var VERSION = 2;
    var MAX_OFFERS = 100;
    var BONUS_TAX_MODES = ["auto", "merged", "separate"];
    var PRIMARY_HOURS_BASES = ["presence", "net"];
    var CURRENT_YEAR = new Date().getFullYear();

    var DEFAULT_SETTINGS = {
        year: CURRENT_YEAR,
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

    var STANDARD_SCHEDULE = domain.createDefaultSchedule();

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


    return {
        VERSION: VERSION,
        MAX_OFFERS: MAX_OFFERS,
        MAX_CYCLE_WEEKS: MAX_CYCLE_WEEKS,
        parseStateContext: parseStateContext,
        parseState: parseState,
        validateState: validateState,
        createDefaultState: createDefaultState,
        throwValidationIssue: throwValidationIssue
    };
}));
