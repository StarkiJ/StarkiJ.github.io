(function (root, factory) {
    "use strict";
    var commonJs = typeof module === "object" && module.exports;
    var api = factory(
        commonJs ? require("./domain.js") : root.OfferCompareDomain,
        commonJs ? require("./state.js") : root.OfferCompareState
    );
    if (commonJs) { module.exports = api; }
    if (root) { root.OfferCompareSerialization = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function (domain, state) {
    "use strict";

    var isObject = domain.isObject;
    var parseState = state.parseState;
    var throwValidationIssue = state.throwValidationIssue;

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


    return {
        stringifyState: stringifyState
    };
}));
