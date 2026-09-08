(function (root, factory) {
    "use strict";
    var commonJs = typeof module === "object" && module.exports;
    var api = factory();
    if (commonJs) { module.exports = api; }
    if (root) { root.OfferCompareDomain = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    var MAX_CYCLE_WEEKS = 52;
    var WEEKDAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function clone(value) {
        // Offer data is plain objects and arrays; retain undefined and Infinity.
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


    function createDefaultSchedule() {
        return createWeekdaySchedule("09:00", "18:00", "18:00", [], 1, []);
    }

    return {
        createDefaultSchedule: createDefaultSchedule,
        MAX_CYCLE_WEEKS: MAX_CYCLE_WEEKS,
        WEEKDAY_NAMES: WEEKDAY_NAMES,
        isObject: isObject,
        clone: clone,
        finite: finite,
        integer: integer,
        rate: rate,
        nullableFinite: nullableFinite,
        nullableRate: nullableRate,
        ratePercentText: ratePercentText,
        text: text,
        cleanNumber: cleanNumber,
        safeDivide: safeDivide,
        parseTime: parseTime,
        formatTime: formatTime,
        normalizedTime: normalizedTime,
        durationHours: durationHours,
        createWeekdaySchedule: createWeekdaySchedule
    };
}));
