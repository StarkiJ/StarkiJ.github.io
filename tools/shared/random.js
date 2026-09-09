(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    if (root) { root.ToolRandom = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function create({ crypto, allowInsecure = false, random = Math.random } = {}) {
        const values32 = new Uint32Array(1);
        const values53 = new Uint32Array(2);

        function integer(range) {
            if (!Number.isSafeInteger(range) || range <= 0) {
                throw new RangeError("随机范围必须是正的安全整数");
            }
            if (!crypto || typeof crypto.getRandomValues !== "function") {
                if (allowInsecure) { return Math.floor(random() * range); }
                throw new Error("安全随机数不可用");
            }
            const use32 = range <= 0x100000000;
            const capacity = use32 ? 0x100000000 : 0x20000000000000;
            const limit = capacity - (capacity % range);
            const values = use32 ? values32 : values53;
            let value;
            // Reject the uneven tail instead of biasing results with modulo alone.
            do {
                crypto.getRandomValues(values);
                value = use32 ? values[0]
                    : (values[0] & 0x001fffff) * 0x100000000 + values[1];
            } while (value >= limit);
            return value % range;
        }

        function shuffle(items) {
            const result = [...items];
            for (let index = result.length - 1; index > 0; index--) {
                const other = integer(index + 1);
                [result[index], result[other]] = [result[other], result[index]];
            }
            return result;
        }

        return { integer, shuffle };
    }

    return { create };
}));
