(function (root, factory) {
    "use strict";

    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.OfferCompareTaxPolicy = api;
    }
}(typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : this), function () {
    "use strict";

    var VERSION = 1;
    var VERIFIED_RANGE = {
        from: 2020,
        through: 2027
    };
    var COMPREHENSIVE_POLICY = {
        id: "cn-resident-annual-comprehensive-income-2019",
        label: "中国大陆居民个人综合所得年度税率",
        effectiveRange: {
            from: 2019,
            through: null
        },
        brackets: [
            { limit: 36000, rate: 0.03, quickDeduction: 0 },
            { limit: 144000, rate: 0.10, quickDeduction: 2520 },
            { limit: 300000, rate: 0.20, quickDeduction: 16920 },
            { limit: 420000, rate: 0.25, quickDeduction: 31920 },
            { limit: 660000, rate: 0.30, quickDeduction: 52920 },
            { limit: 960000, rate: 0.35, quickDeduction: 85920 },
            { limit: Infinity, rate: 0.45, quickDeduction: 181920 }
        ]
    };
    var ANNUAL_BONUS_SEPARATE_POLICY = {
        id: "cn-annual-bonus-separate-tax-2019-2027",
        label: "全年一次性奖金单独计税",
        effectiveRange: {
            from: 2019,
            through: 2027
        },
        brackets: [
            { limit: 3000, rate: 0.03, quickDeduction: 0 },
            { limit: 12000, rate: 0.10, quickDeduction: 210 },
            { limit: 25000, rate: 0.20, quickDeduction: 1410 },
            { limit: 35000, rate: 0.25, quickDeduction: 2660 },
            { limit: 55000, rate: 0.30, quickDeduction: 4410 },
            { limit: 80000, rate: 0.35, quickDeduction: 7160 },
            { limit: Infinity, rate: 0.45, quickDeduction: 15160 }
        ]
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

    function normalizeYear(value) {
        var parsed = Number(value);

        if (value === null || value === undefined ||
                (typeof value === "string" && !value.trim()) ||
                !Number.isFinite(parsed)) {
            return null;
        }
        return Math.round(parsed);
    }

    function bracketFor(value, brackets) {
        var amount = Number(value);
        var candidates = Array.isArray(brackets) && brackets.length
            ? brackets
            : COMPREHENSIVE_POLICY.brackets;
        var index;

        if (!Number.isFinite(amount) || amount < 0) {
            amount = 0;
        }

        for (index = 0; index < candidates.length; index += 1) {
            if (amount <= candidates[index].limit) {
                return clone(candidates[index]);
            }
        }
        return clone(candidates[candidates.length - 1]);
    }

    function resolve(year) {
        var requestedYear = normalizeYear(year);
        var validYear = requestedYear !== null;
        var comparisonYear = validYear ? requestedYear : VERIFIED_RANGE.through;
        var verified = validYear &&
            requestedYear >= VERIFIED_RANGE.from &&
            requestedYear <= VERIFIED_RANGE.through;
        var appliedYear = Math.min(
            VERIFIED_RANGE.through,
            Math.max(VERIFIED_RANGE.from, comparisonYear)
        );
        var warnings = [];
        var bonusPolicy = clone(ANNUAL_BONUS_SEPARATE_POLICY);

        if (!validYear) {
            warnings.push({
                code: "tax_policy_year_invalid",
                requestedYear: requestedYear,
                appliedYear: appliedYear,
                message: "税务年份无效，当前按 " + appliedYear +
                    " 年税率规则估算；请提供有效的四位年份。"
            });
        } else if (!verified) {
            warnings.push({
                code: "tax_policy_year_unverified",
                requestedYear: requestedYear,
                appliedYear: appliedYear,
                message: requestedYear + " 年超出已核验税务年份（" +
                    VERIFIED_RANGE.from + "–" + VERIFIED_RANGE.through +
                    "），当前按最近的 " + appliedYear +
                    " 年税率规则估算；请核对计算年份的最新政策。"
            });
        }

        bonusPolicy.effectiveForRequestedYear =
            validYear &&
            requestedYear >= ANNUAL_BONUS_SEPARATE_POLICY.effectiveRange.from &&
            requestedYear <= ANNUAL_BONUS_SEPARATE_POLICY.effectiveRange.through;
        bonusPolicy.available = bonusPolicy.effectiveForRequestedYear;

        return {
            id: "cn-mainland-resident-individual-income-tax",
            version: VERSION,
            requestedYear: requestedYear,
            appliedYear: appliedYear,
            verified: verified,
            estimated: !verified,
            verificationRange: clone(VERIFIED_RANGE),
            comprehensive: clone(COMPREHENSIVE_POLICY),
            annualBonusSeparate: bonusPolicy,
            warnings: warnings
        };
    }

    return {
        bracketFor: bracketFor,
        resolve: resolve
    };
}));
