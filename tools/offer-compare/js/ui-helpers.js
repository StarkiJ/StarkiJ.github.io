(function (root, factory) {
    var api = factory(root);

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.OfferCompareUi = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
    "use strict";

    var weekdayNames = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    var moneyFormatter = new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        maximumFractionDigits: 0
    });
    var preciseMoneyFormatter = new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        maximumFractionDigits: 2
    });
    var numberFormatter = new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 2
    });

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createElement(tagName, className, textContent) {
        var element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }
        if (textContent !== undefined) {
            element.textContent = textContent;
        }
        return element;
    }

    function createId(prefix, suffix) {
        var source = String(prefix) + "-" + String(suffix);
        var readable = source.replace(/[^a-zA-Z0-9_-]+/g, "-");
        var hash = 2166136261;
        var index;

        for (index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return readable + "-" + (hash >>> 0).toString(36);
    }

    function createUniqueOfferId() {
        var randomPart;

        if (root.crypto && typeof root.crypto.randomUUID === "function") {
            randomPart = root.crypto.randomUUID();
        } else {
            randomPart = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        }
        return "offer-" + randomPart;
    }

    function parseNumericInput(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function formatMoney(value) {
        return moneyFormatter.format(Number.isFinite(value) ? value : 0);
    }

    function formatPreciseMoney(value) {
        return preciseMoneyFormatter.format(Number.isFinite(value) ? value : 0);
    }

    function formatRate(value) {
        return numberFormatter.format((Number.isFinite(value) ? value : 0) * 100) + "%";
    }

    function ratePercentValue(value) {
        return Number.isFinite(value)
            ? Number((value * 100).toFixed(3))
            : "";
    }

    function formatHours(value) {
        return numberFormatter.format(Number.isFinite(value) ? value : 0) + " 小时";
    }

    function formatHourly(value) {
        return formatMoney(Number.isFinite(value) ? value : 0) + "/小时";
    }

    function weeklyHoursSummaryLabel(value) {
        return value === "net" ? "周净" : "周在岗";
    }

    function setByPath(target, path, value) {
        var parts = path.split(".");
        var current = target;
        var index;

        for (index = 0; index < parts.length - 1; index += 1) {
            if (!current[parts[index]] || typeof current[parts[index]] !== "object") {
                current[parts[index]] = {};
            }
            current = current[parts[index]];
        }
        current[parts[parts.length - 1]] = value;
    }

    return Object.freeze({
        weekdayNames: Object.freeze(weekdayNames.slice()),
        numberFormatter: numberFormatter,
        clone: clone,
        createElement: createElement,
        createId: createId,
        createUniqueOfferId: createUniqueOfferId,
        parseNumericInput: parseNumericInput,
        formatMoney: formatMoney,
        formatPreciseMoney: formatPreciseMoney,
        formatRate: formatRate,
        ratePercentValue: ratePercentValue,
        formatHours: formatHours,
        formatHourly: formatHourly,
        weeklyHoursSummaryLabel: weeklyHoursSummaryLabel,
        setByPath: setByPath
    });
}));
