(function (root, factory) {
    "use strict";

    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.OfferCompareSelectors = api;
    }
}(typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : this), function () {
    "use strict";

    var DEFAULT_SORT_KEY = "afterTaxHourly";
    var SORT_FIELDS = {
        companyDepartment: null,
        monthlySalary: "monthlySalary",
        salaryMonths: "salaryMonths",
        weeklyHours: "weeklyHours",
        annualPretaxCash: "annualPretaxCash",
        annualTakeHomeCash: "annualTakeHomeCash",
        pretaxHourly: "pretaxHourly",
        afterTaxHourly: "afterTaxHourly",
        housingFundEquity: "housingFundEquity",
        cashAndHousingFundEquity: "cashAndHousingFundEquity",
        annualIncomeTax: "annualIncomeTax"
    };
    var BEST_DIRECTIONS = {
        monthlySalary: "max",
        salaryMonths: "max",
        weeklyHours: "min",
        annualPretaxCash: "max",
        annualTakeHomeCash: "max",
        pretaxHourly: "max",
        afterTaxHourly: "max",
        housingFundEquity: "max",
        cashAndHousingFundEquity: "max"
    };
    var SUMMARY_DIRECTIONS = {
        afterTaxHourly: "max",
        annualTakeHomeCash: "max",
        weeklyHours: "min"
    };
    var companyCollator = typeof Intl === "object" &&
            typeof Intl.Collator === "function"
        ? new Intl.Collator("zh-CN-u-co-pinyin", {
            usage: "sort",
            sensitivity: "base",
            numeric: true
        })
        : null;

    function finiteOrZero(value) {
        return Number.isFinite(value) ? value : 0;
    }

    function createComparisonView(result, offer, settings, sourceIndex) {
        var metrics;
        var work;
        var company;
        var department;

        if (!result || !offer) {
            return null;
        }

        metrics = result.metrics || {};
        work = result.work || {};
        company = offer.company || "";
        department = offer.department || "";

        return {
            result: result,
            offer: offer,
            id: offer.id,
            sourceIndex: sourceIndex,
            primaryHoursBasis: settings.primaryHoursBasis,
            name: department ? company + " · " + department : company,
            company: company,
            department: department,
            city: offer.city || "",
            monthlySalary: finiteOrZero(offer.pay.monthlySalary),
            salaryMonths: finiteOrZero(offer.pay.salaryMonths),
            weeklyHours: settings.primaryHoursBasis === "net"
                ? finiteOrZero(work.averageWeeklyNetHours)
                : finiteOrZero(work.averageWeeklyPresenceHours),
            annualPretaxCash: finiteOrZero(metrics.annualPretaxCash),
            annualTakeHomeCash: finiteOrZero(metrics.annualTakeHomeCash),
            pretaxHourly: finiteOrZero(metrics.pretaxHourly),
            afterTaxHourly: finiteOrZero(metrics.afterTaxHourly),
            housingFundEquity: finiteOrZero(metrics.housingFundEquity),
            cashAndHousingFundEquity: finiteOrZero(
                metrics.cashAndHousingFundEquity
            ),
            annualIncomeTax: finiteOrZero(metrics.annualIncomeTax)
        };
    }

    function createComparisonViews(calculation) {
        var state = calculation && calculation.state;
        var results = calculation && calculation.results;

        if (!state || !state.settings || !Array.isArray(state.offers) ||
                !Array.isArray(results)) {
            return [];
        }

        return results.map(function (result, index) {
            return createComparisonView(
                result,
                state.offers[index],
                state.settings,
                index
            );
        }).filter(Boolean);
    }

    function fieldValue(view, fieldKey) {
        var field = SORT_FIELDS[fieldKey];
        return field ? view[field] : undefined;
    }

    function compareText(left, right) {
        var leftText = left === undefined || left === null ? "" : String(left);
        var rightText = right === undefined || right === null ? "" : String(right);

        if (companyCollator) {
            return companyCollator.compare(leftText, rightText);
        }
        return leftText < rightText ? -1 : (leftText > rightText ? 1 : 0);
    }

    function compareCompanyDepartment(left, right) {
        return compareText(left.company, right.company) ||
            compareText(left.department, right.department);
    }

    function compareNumber(left, right) {
        if (!Number.isFinite(left) && !Number.isFinite(right)) {
            return 0;
        }
        if (!Number.isFinite(left)) {
            return 1;
        }
        if (!Number.isFinite(right)) {
            return -1;
        }
        return Math.abs(left - right) < 1e-9 ? 0 : left - right;
    }

    function sortViews(views, sortKey, direction) {
        var source = Array.isArray(views) ? views : [];
        var selectedKey = Object.prototype.hasOwnProperty.call(
            SORT_FIELDS,
            sortKey
        )
            ? sortKey
            : DEFAULT_SORT_KEY;
        var multiplier = direction === "asc" ? 1 : -1;

        return source.map(function (view, position) {
            return { view: view, position: position };
        }).sort(function (leftEntry, rightEntry) {
            var difference = selectedKey === "companyDepartment"
                ? compareCompanyDepartment(leftEntry.view, rightEntry.view)
                : compareNumber(
                    fieldValue(leftEntry.view, selectedKey),
                    fieldValue(rightEntry.view, selectedKey)
                );

            return difference
                ? difference * multiplier
                : leftEntry.position - rightEntry.position;
        }).map(function (entry) {
            return entry.view;
        });
    }

    function extremeValue(views, fieldKey, direction) {
        var best = null;

        views.forEach(function (view) {
            var value = fieldValue(view, fieldKey);

            if (!Number.isFinite(value)) {
                return;
            }
            if (best === null ||
                    (direction === "min" && value < best) ||
                    (direction !== "min" && value > best)) {
                best = value;
            }
        });
        return best;
    }

    function bestValues(views) {
        var source = Array.isArray(views) ? views : [];
        var best = {};

        Object.keys(BEST_DIRECTIONS).forEach(function (fieldKey) {
            best[fieldKey] = extremeValue(
                source,
                fieldKey,
                BEST_DIRECTIONS[fieldKey]
            );
        });
        return best;
    }

    function extremeView(views, fieldKey, direction) {
        var leader = null;
        var leaderValue = null;

        views.forEach(function (view) {
            var value = fieldValue(view, fieldKey);

            if (!Number.isFinite(value)) {
                return;
            }
            if (leader === null ||
                    (direction === "min" && value < leaderValue) ||
                    (direction !== "min" && value > leaderValue)) {
                leader = view;
                leaderValue = value;
            }
        });
        return leader;
    }

    function summaryLeaders(views) {
        var source = Array.isArray(views) ? views : [];
        var leaders = {};

        Object.keys(SUMMARY_DIRECTIONS).forEach(function (fieldKey) {
            leaders[fieldKey] = extremeView(
                source,
                fieldKey,
                SUMMARY_DIRECTIONS[fieldKey]
            );
        });
        return leaders;
    }

    function findResultByOfferId(calculation, offerId) {
        var state = calculation && calculation.state;
        var results = calculation && calculation.results;
        var index;

        if (!state || !Array.isArray(state.offers) ||
                !Array.isArray(results)) {
            return null;
        }
        index = state.offers.findIndex(function (offer) {
            return offer && offer.id === offerId;
        });
        return index >= 0 ? results[index] || null : null;
    }

    function isBest(value, best, epsilon) {
        var tolerance = Number.isFinite(epsilon) && epsilon >= 0
            ? epsilon
            : 0.0001;

        return Number.isFinite(value) &&
            Number.isFinite(best) &&
            Math.abs(value - best) <= tolerance;
    }

    return {
        createComparisonViews: createComparisonViews,
        sortViews: sortViews,
        bestValues: bestValues,
        summaryLeaders: summaryLeaders,
        findResultByOfferId: findResultByOfferId,
        isBest: isBest
    };
}));
