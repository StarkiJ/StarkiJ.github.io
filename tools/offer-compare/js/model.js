(function (root, factory) {
    "use strict";

    var domain = typeof module === "object" && module.exports
        ? require("./domain.js") : root.OfferCompareDomain;
    var api = factory(domain);

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.OfferCompareModel = api;
    }
}(typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : this), function (domain) {
    "use strict";

    var DEFAULT_MAX_CYCLE_WEEKS = domain.MAX_CYCLE_WEEKS;

    var isObject = domain.isObject;
    var clone = domain.clone;

    function finiteNumber(value, fallback) {
        var parsed = Number(value);
        return isFinite(parsed) ? parsed : fallback;
    }

    function scheduleFromPattern(
        start,
        normalEnd,
        earlyEnd,
        earlyWeekdays,
        cycleWeeks,
        addSaturday
    ) {
        return domain.createWeekdaySchedule(start, normalEnd, earlyEnd, earlyWeekdays, cycleWeeks,
            addSaturday ? [{ week: cycleWeeks, weekday: 6, start: start, end: earlyEnd }] : []);
    }

    var SCHEDULE_TEMPLATES = {
        "standard-965": domain.createDefaultSchedule(),
        "995-early": scheduleFromPattern(
            "09:00",
            "21:00",
            "18:00",
            [3, 5],
            1,
            false
        ),
        "1095-early": scheduleFromPattern(
            "10:00",
            "21:00",
            "18:00",
            [3],
            1,
            false
        ),
        "10105-early": scheduleFromPattern(
            "10:00",
            "22:00",
            "18:00",
            [3, 5],
            1,
            false
        ),
        "1085-early": scheduleFromPattern(
            "10:00",
            "20:00",
            "18:00",
            [3, 5],
            1,
            false
        ),
        "alternate-109": scheduleFromPattern(
            "10:00",
            "21:00",
            "18:00",
            [3],
            2,
            true
        )
    };

    function scheduleForTemplate(templateName) {
        return Object.prototype.hasOwnProperty.call(SCHEDULE_TEMPLATES, templateName)
            ? clone(SCHEDULE_TEMPLATES[templateName])
            : null;
    }

    function createOffer(id) {
        var schedule = domain.createDefaultSchedule();

        schedule.lunchBreakHours = null;
        schedule.dinnerBreakHours = null;

        return {
            id: id,
            company: "新公司",
            department: "",
            city: "通用",
            pay: {
                monthlySalary: 10000,
                salaryMonths: 12,
                otherAnnualCash: 0,
                bonusTaxMode: "auto"
            },
            socialInsuranceRate: null,
            housingFundRate: 0.05,
            schedule: schedule,
            overtime: {
                shiftsPerYear: 0,
                start: "09:00",
                end: "18:00",
                paidHours: 8,
                payMultiplier: 0,
                payBaseMonthly: null
            }
        };
    }

    function duplicateOffer(source, id) {
        var copy;

        if (!isObject(source)) {
            return null;
        }

        copy = clone(source);
        copy.id = id;
        copy.department = copy.department
            ? copy.department + "（副本）"
            : "副本";
        return copy;
    }

    function resizeScheduleCycle(offer, newCycle, maxCycle) {
        var copy = clone(offer);
        var maximum = Math.max(
            1,
            Math.round(finiteNumber(maxCycle, DEFAULT_MAX_CYCLE_WEEKS))
        );
        var schedule = isObject(copy && copy.schedule) ? copy.schedule : {
            cycleWeeks: 1,
            days: []
        };
        var oldCycle = Math.max(
            1,
            Math.round(finiteNumber(schedule.cycleWeeks, 1))
        );
        var targetCycle = Math.max(
            1,
            Math.min(
                maximum,
                Math.round(finiteNumber(newCycle, oldCycle))
            )
        );
        var days = Array.isArray(schedule.days) ? schedule.days : [];
        var addedWeek;

        if (!isObject(copy)) {
            return copy;
        }

        copy.schedule = schedule;
        schedule.days = days;

        if (targetCycle > oldCycle) {
            for (addedWeek = oldCycle + 1;
                    addedWeek <= targetCycle;
                    addedWeek += 1) {
                var sourceWeek = ((addedWeek - 1) % oldCycle) + 1;
                days.filter(function (day) {
                    return day.week === sourceWeek;
                }).forEach(function (day) {
                    var copiedDay = clone(day);
                    copiedDay.week = addedWeek;
                    days.push(copiedDay);
                });
            }
        } else {
            schedule.days = days.filter(function (day) {
                return day.week <= targetCycle;
            });
        }

        schedule.cycleWeeks = targetCycle;
        return copy;
    }

    function scheduleDayFor(offer, week, weekday) {
        var schedule = isObject(offer) && isObject(offer.schedule)
            ? offer.schedule
            : null;
        var days = schedule && Array.isArray(schedule.days)
            ? schedule.days
            : [];
        var index;

        for (index = 0; index < days.length; index += 1) {
            if (days[index].week === week && days[index].weekday === weekday) {
                return clone(days[index]);
            }
        }

        return undefined;
    }

    function toggleScheduleDay(offer, week, weekday, enabled) {
        var copy = clone(offer);
        var schedule;
        var days;
        var normalizedWeek = Number(week);
        var normalizedWeekday = Number(weekday);
        var existing;
        var referenceDay;
        var index;

        if (!isObject(copy)) {
            return copy;
        }

        schedule = isObject(copy.schedule) ? copy.schedule : {
            cycleWeeks: 1,
            days: []
        };
        days = Array.isArray(schedule.days) ? schedule.days : [];
        copy.schedule = schedule;
        schedule.days = days;

        if (!isFinite(normalizedWeek) || !isFinite(normalizedWeekday)) {
            return copy;
        }

        if (!enabled) {
            schedule.days = days.filter(function (day) {
                return !(day.week === normalizedWeek &&
                    day.weekday === normalizedWeekday);
            });
            return copy;
        }

        existing = scheduleDayFor(copy, normalizedWeek, normalizedWeekday);
        if (existing) {
            return copy;
        }

        for (index = 0; index < days.length; index += 1) {
            if (days[index].week === normalizedWeek) {
                referenceDay = days[index];
                break;
            }
        }
        referenceDay = referenceDay || days[0];

        days.push({
            week: normalizedWeek,
            weekday: normalizedWeekday,
            start: referenceDay ? referenceDay.start : "09:00",
            end: referenceDay ? referenceDay.end : "18:00"
        });
        return copy;
    }

    return {
        scheduleForTemplate: scheduleForTemplate,
        createOffer: createOffer,
        duplicateOffer: duplicateOffer,
        resizeScheduleCycle: resizeScheduleCycle,
        toggleScheduleDay: toggleScheduleDay,
        scheduleDayFor: scheduleDayFor
    };
}));
