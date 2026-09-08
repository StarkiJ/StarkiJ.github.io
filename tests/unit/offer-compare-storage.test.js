const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../tools/offer-compare/js/core.js");
const domain = require("../../tools/offer-compare/js/domain.js");
const storageModule = require("../../tools/offer-compare/js/storage.js");
const example = require("../../tools/offer-compare/data/examples.json");

function fixture() {
    const values = new Map();
    const tasks = new Map();
    let nextId = 0;
    const storage = storageModule.create({
        core,
        getStorage: () => ({
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
            removeItem: key => values.delete(key)
        }),
        schedule: callback => { tasks.set(++nextId, callback); return nextId; },
        cancel: id => tasks.delete(id)
    });
    return { storage, values, tasks };
}

test("only the latest scheduled save persists, and resetting cancels pending writes", () => {
    const { storage, tasks } = fixture();
    let saved = 0;
    const onSaved = () => { saved++; };
    storage.save(example, false, onSaved, assert.fail);
    const updated = domain.clone(example);
    updated.offers[0].company = "Updated";
    storage.save(updated, false, onSaved, assert.fail);
    assert.equal(tasks.size, 1);
    for (const callback of tasks.values()) { callback(); }
    tasks.clear();
    assert.equal(saved, 1);
    assert.equal(storage.load().state.offers[0].company, "Updated");
    storage.save(example, false, onSaved, assert.fail);
    assert.equal(storage.clear(), true);
    assert.equal(tasks.size, 0);
    assert.equal(storage.load().state, null);
});

test("unavailable storage reports failure while view preferences remain optional", () => {
    const storage = storageModule.create({ core, getStorage: () => { throw new Error("blocked"); } });
    assert.match(storage.load().warning, /浏览器保存不可用/);
    assert.equal(storage.loadView(["custom"]), null);
    assert.doesNotThrow(() => storage.saveView({ sortKey: "custom" }));
    let failed = false;
    storage.save(example, true, assert.fail, () => { failed = true; });
    assert.equal(failed, true);
    assert.equal(storage.clear(), false);
});

test("import validates size, schema and content without mutating stored data", async () => {
    const { storage } = fixture();
    await assert.rejects(storage.readImport({ size: 2097153, text: assert.fail }), /2 MB/);
    await assert.rejects(storage.readImport({ size: 4, text: async () => "null" }), /offers/);
    await assert.rejects(storage.readImport({ size: 1, text: async () => "{" }), SyntaxError);
    await assert.rejects(storage.readImport({ size: 20, text: async () => JSON.stringify({ ...example, version: 999 }) }), /版本/);
    const imported = await storage.readImport({ size: 100, text: async () => JSON.stringify(example) });
    assert.deepEqual(imported, core.parseState(example).state);
    assert.equal(storage.load().state, null);
});

test("shared domain cloning preserves policy limits and isolates nested schedules", () => {
    const source = { limit: Infinity, value: undefined, days: [{ start: "09:00" }] };
    const copied = domain.clone(source);
    assert.equal(copied.limit, Infinity);
    assert.ok(Object.hasOwn(copied, "value"));
    copied.days[0].start = "10:00";
    assert.equal(source.days[0].start, "09:00");
});
