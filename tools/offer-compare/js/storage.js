(function (root, factory) {
    var api = factory(root);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    if (root) { root.OfferCompareStorage = api; }
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
    "use strict";

    const STORAGE_KEY = "starki.offerCompare.v2";
    const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

    function create(options) {
        const core = options.core;
        const getStorage = options.getStorage || (() => root.localStorage);
        const schedule = options.schedule || root.setTimeout.bind(root);
        const cancel = options.cancel || root.clearTimeout.bind(root);
        let timer;

        function load() {
            try {
                const stored = getStorage().getItem(STORAGE_KEY);
                if (!stored) { return { state: null, warning: "" }; }
                const raw = JSON.parse(stored);
                if (!raw || !Array.isArray(raw.offers)) {
                    throw new Error("浏览器保存缺少 offers 数组");
                }
                const parsed = core.parseState(raw);
                if (parsed.validation.errors.length) {
                    throw new Error(parsed.validation.errors[0].message);
                }
                return { state: parsed.state, warning: "" };
            } catch {
                return { state: null, warning: "浏览器保存不可用或版本不兼容，已回退到可用来源。" };
            }
        }

        function loadView(sortKeys) {
            try {
                const view = JSON.parse(getStorage().getItem(STORAGE_KEY + ".view") || "null");
                return view && sortKeys.includes(view.sortKey)
                    ? { sortKey: view.sortKey, sortDirection: view.sortDirection === "asc" ? "asc" : "desc" }
                    : null;
            } catch { return null; }
        }

        function saveView(view) {
            try {
                getStorage().setItem(STORAGE_KEY + ".view", JSON.stringify(view));
            } catch { /* Sorting remains available without browser storage. */ }
        }

        function cancelPending() {
            cancel(timer);
            timer = undefined;
        }

        function save(state, immediate, onSuccess, onError) {
            cancelPending();
            function persist() {
                timer = undefined;
                try { getStorage().setItem(STORAGE_KEY, JSON.stringify(state)); }
                catch (error) { onError(error); return; }
                onSuccess();
            }
            if (immediate) { persist(); }
            else { timer = schedule(persist, 180); }
        }

        function clear() {
            cancelPending();
            try { getStorage().removeItem(STORAGE_KEY); return true; }
            catch { return false; }
        }

        async function readImport(file) {
            if (file.size > MAX_IMPORT_BYTES) {
                throw new Error("JSON 文件不能超过 2 MB。");
            }
            const raw = JSON.parse(await file.text());
            if (!raw || !Array.isArray(raw.offers)) {
                throw new Error("JSON 必须包含 offers 数组。");
            }
            const parsed = core.parseState(raw);
            if (!parsed.state.offers.length || parsed.validation.errors.length) {
                throw new Error(parsed.validation.errors.length
                    ? parsed.validation.errors[0].message : "JSON 中没有可用的 Offer。");
            }
            return parsed.state;
        }

        function download(state) {
            const blob = new Blob([core.stringifyState(state)], { type: "application/json;charset=utf-8" });
            const url = root.URL.createObjectURL(blob);
            const link = root.document.createElement("a");
            try {
                link.href = url;
                link.download = "private.json";
                root.document.body.appendChild(link);
                link.click();
            } finally {
                link.remove();
                root.URL.revokeObjectURL(url);
            }
        }

        return { load, loadView, saveView, cancelPending, save, clear, readImport, download };
    }

    return { create };
}));
