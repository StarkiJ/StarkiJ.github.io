"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var model = require("../../tools/offer-compare/js/model.js");

assert.deepStrictEqual(
    Object.keys(model).sort(),
    [
        "createOffer",
        "duplicateOffer",
        "resizeScheduleCycle",
        "scheduleDayFor",
        "scheduleForTemplate",
        "toggleScheduleDay"
    ],
    "model 只应公开页面实际使用的操作"
);

var standardTemplate = model.scheduleForTemplate("standard-965");
var alternateTemplate = model.scheduleForTemplate("alternate-109");
assert.strictEqual(standardTemplate.days.length, 5, "standard template should contain weekdays");
assert.strictEqual(alternateTemplate.cycleWeeks, 2, "alternate template should use a two-week cycle");
assert.strictEqual(alternateTemplate.days.length, 11, "alternate template should include one Saturday");
assert.strictEqual(
    model.scheduleForTemplate("does-not-exist"),
    null,
    "unknown templates should be rejected explicitly"
);

standardTemplate.days[0].start = "00:00";
standardTemplate.days.push({
    week: 1,
    weekday: 7,
    start: "00:00",
    end: "01:00"
});
assert.deepStrictEqual(
    model.scheduleForTemplate("standard-965").days[0],
    {
        week: 1,
        weekday: 1,
        start: "09:00",
        end: "18:00"
    },
    "template results should not expose mutable module-level data"
);
assert.strictEqual(
    model.scheduleForTemplate("standard-965").days.length,
    5,
    "mutating one template result should not affect later callers"
);

var created = model.createOffer("caller-supplied-id");
assert.deepStrictEqual(created, {
    id: "caller-supplied-id",
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
    schedule: {
        cycleWeeks: 1,
        days: [
            { week: 1, weekday: 1, start: "09:00", end: "18:00" },
            { week: 1, weekday: 2, start: "09:00", end: "18:00" },
            { week: 1, weekday: 3, start: "09:00", end: "18:00" },
            { week: 1, weekday: 4, start: "09:00", end: "18:00" },
            { week: 1, weekday: 5, start: "09:00", end: "18:00" }
        ],
        lunchBreakHours: null,
        dinnerBreakHours: null
    },
    overtime: {
        shiftsPerYear: 0,
        start: "09:00",
        end: "18:00",
        paidHours: 8,
        payMultiplier: 0,
        payBaseMonthly: null
    }
}, "new offers should preserve the current UI defaults");

var anotherCreated = model.createOffer("second-id");
created.pay.monthlySalary = 1;
created.schedule.days[0].start = "00:00";
assert.strictEqual(
    anotherCreated.pay.monthlySalary,
    10000,
    "new offers should not share nested pay data"
);
assert.strictEqual(
    anotherCreated.schedule.days[0].start,
    "09:00",
    "new offers should not share schedule data"
);

var source = model.createOffer("source-id");
source.company = "示例公司";
source.department = "研发部";
source.schedule.days[0].end = "22:00";
var duplicated = model.duplicateOffer(source, "copy-id");

assert.strictEqual(duplicated.id, "copy-id", "the caller should control duplicate IDs");
assert.strictEqual(duplicated.department, "研发部（副本）", "duplicates should retain the UI suffix");
assert.strictEqual(source.department, "研发部", "duplicating should not mutate the source offer");
duplicated.schedule.days[0].end = "23:00";
assert.strictEqual(
    source.schedule.days[0].end,
    "22:00",
    "duplicates should not share nested schedule data"
);
assert.strictEqual(
    model.duplicateOffer(model.createOffer("empty-department"), "copy-2").department,
    "副本",
    "an empty department should receive the standalone duplicate label"
);
assert.strictEqual(model.duplicateOffer(null, "copy-3"), null, "missing sources should be rejected");

var cycleSource = model.createOffer("cycle-source");
cycleSource.schedule = {
    cycleWeeks: 2,
    lunchBreakHours: 1,
    dinnerBreakHours: 0.5,
    days: [
        { week: 1, weekday: 1, start: "09:00", end: "18:00", marker: "week-1" },
        { week: 2, weekday: 2, start: "10:00", end: "20:00", marker: "week-2" }
    ]
};
var expanded = model.resizeScheduleCycle(cycleSource, 5, 52);

assert.strictEqual(expanded.schedule.cycleWeeks, 5, "cycle expansion should update its length");
assert.deepStrictEqual(
    expanded.schedule.days.map(function (day) {
        return [day.week, day.weekday, day.marker];
    }),
    [
        [1, 1, "week-1"],
        [2, 2, "week-2"],
        [3, 1, "week-1"],
        [4, 2, "week-2"],
        [5, 1, "week-1"]
    ],
    "new weeks should repeat the original cycle in order"
);
assert.strictEqual(
    cycleSource.schedule.cycleWeeks,
    2,
    "cycle expansion should not mutate the source offer"
);
expanded.schedule.days[2].start = "00:00";
assert.strictEqual(
    cycleSource.schedule.days[0].start,
    "09:00",
    "expanded weeks should not share day objects with the source offer"
);

var reduced = model.resizeScheduleCycle(cycleSource, 1, 52);
assert.strictEqual(reduced.schedule.cycleWeeks, 1, "cycle reduction should update its length");
assert.deepStrictEqual(
    reduced.schedule.days.map(function (day) {
        return day.week;
    }),
    [1],
    "cycle reduction should remove days outside the requested cycle"
);
assert.strictEqual(
    model.resizeScheduleCycle(cycleSource, 100, 3).schedule.cycleWeeks,
    3,
    "cycle changes should respect the caller's upper bound"
);
assert.strictEqual(
    model.resizeScheduleCycle(cycleSource, "invalid", 52).schedule.cycleWeeks,
    2,
    "invalid cycle input should retain the current cycle"
);

var toggleSource = model.createOffer("toggle-source");
toggleSource.schedule.cycleWeeks = 2;
toggleSource.schedule.days.push({
    week: 2,
    weekday: 1,
    start: "10:00",
    end: "20:00"
});
var enabled = model.toggleScheduleDay(toggleSource, 2, 6, true);
assert.deepStrictEqual(
    model.scheduleDayFor(enabled, 2, 6),
    {
        week: 2,
        weekday: 6,
        start: "10:00",
        end: "20:00"
    },
    "enabled days should copy times from the same week"
);
assert.strictEqual(
    model.scheduleDayFor(toggleSource, 2, 6),
    undefined,
    "enabling a day should not mutate the source offer"
);

var enabledAgain = model.toggleScheduleDay(enabled, 2, 6, true);
assert.strictEqual(
    enabledAgain.schedule.days.filter(function (day) {
        return day.week === 2 && day.weekday === 6;
    }).length,
    1,
    "enabling an existing day should be idempotent"
);

var disabled = model.toggleScheduleDay(enabled, 2, 6, false);
assert.strictEqual(
    model.scheduleDayFor(disabled, 2, 6),
    undefined,
    "disabled days should be removed"
);
assert.notStrictEqual(disabled, enabled, "schedule actions should return a new offer object");

var emptyScheduleOffer = model.createOffer("empty");
emptyScheduleOffer.schedule.days = [];
var fallbackEnabled = model.toggleScheduleDay(emptyScheduleOffer, 1, 7, true);
assert.deepStrictEqual(
    model.scheduleDayFor(fallbackEnabled, 1, 7),
    {
        week: 1,
        weekday: 7,
        start: "09:00",
        end: "18:00"
    },
    "enabled days should use stable fallback times when no reference day exists"
);

var selectedDay = model.scheduleDayFor(enabled, 2, 6);
selectedDay.start = "00:00";
assert.strictEqual(
    model.scheduleDayFor(enabled, 2, 6).start,
    "10:00",
    "day selection should not expose mutable offer state"
);

var browserSource = fs.readFileSync(
    path.join(
        __dirname,
        "..",
        "..",
        "tools",
        "offer-compare",
        "js",
        "model.js"
    ),
    "utf8"
);
var browserContext = {
    window: {}
};
vm.runInNewContext(browserSource, browserContext, {
    filename: "model.js"
});
assert.strictEqual(
    typeof browserContext.window.OfferCompareModel.createOffer,
    "function",
    "the model module should expose its API in a browser"
);
assert.strictEqual(
    browserContext.window.OfferCompareModel.createOffer("browser-id").id,
    "browser-id",
    "the browser API should use caller-supplied IDs"
);

console.log("offer-compare model tests passed");
