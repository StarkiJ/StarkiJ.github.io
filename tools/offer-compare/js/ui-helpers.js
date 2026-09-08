(function (root, factory) {
    var domain = typeof module === "object" && module.exports
        ? require("./domain.js") : root.OfferCompareDomain;
    var api = factory(root, domain);

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.OfferCompareUi = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (root, domain) {
    "use strict";

    var weekdayNames = domain.WEEKDAY_NAMES;
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

    var clone = domain.clone;

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

    function createFieldValidation(container) {
        function clear() {
            container.querySelectorAll(
                "[data-field-validation-error]"
            ).forEach(function (message) {
                message.remove();
            });
            container.querySelectorAll(
                "[data-validation-marked]"
            ).forEach(function (control) {
                var originalDescription =
                    control.dataset.validationOriginalDescription;

                control.removeAttribute("aria-invalid");
                control.removeAttribute("data-validation-marked");
                delete control.dataset.validationOriginalDescription;
                if (originalDescription) {
                    control.setAttribute("aria-describedby", originalDescription);
                } else {
                    control.removeAttribute("aria-describedby");
                }
            });
        }

        function mark(control, message) {
            var errorId;
            var error;
            var describedBy;

            if (!control || control.dataset.validationMarked === "true") {
                return;
            }
            errorId = createId("validation-error", control.id || (
                control.dataset.offerId + "-" +
                (control.dataset.path || control.dataset.dayField || "field") + "-" +
                (control.dataset.week || "global") + "-" +
                (control.dataset.weekday || "global")
            ));
            describedBy = control.getAttribute("aria-describedby") || "";
            error = createElement("span", "field-error", message);
            error.id = errorId;
            error.dataset.fieldValidationError = "true";

            control.dataset.validationMarked = "true";
            control.dataset.validationOriginalDescription = describedBy;
            control.setAttribute("aria-invalid", "true");
            control.setAttribute(
                "aria-describedby",
                (describedBy ? describedBy + " " : "") + errorId
            );
            control.insertAdjacentElement("afterend", error);
        }

        return Object.freeze({ clear: clear, mark: mark });
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

    function formatHours(value, unit) {
        return numberFormatter.format(Number.isFinite(value) ? value : 0) + " " + (unit || "小时");
    }

    function formatHourly(value, unit) {
        return formatMoney(Number.isFinite(value) ? value : 0) + "/" + (unit || "小时");
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
        createFieldValidation: createFieldValidation,
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
