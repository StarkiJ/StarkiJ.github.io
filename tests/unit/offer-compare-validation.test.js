const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Element, createDocument } = require("../helpers/dom.js");

function setup() {
    const context = vm.createContext({ document: createDocument() });
    context.OfferCompareDomain = require("../../tools/offer-compare/js/domain.js");
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../tools/offer-compare/js/ui-helpers.js"), "utf8"), context);
    return context.OfferCompareUi.createFieldValidation;
}

test("field validation preserves help text, avoids duplicate messages, and clears only its own form", () => {
    const createValidation = setup();
    const settings = new Element();
    const editor = new Element();
    const rate = Object.assign(new Element(), { id: "rate" });
    const salary = Object.assign(new Element(), { id: "salary" });
    settings.append(rate);
    editor.append(salary);
    rate.setAttribute("aria-describedby", "rate-help rate-unit");
    const settingsValidation = createValidation(settings);
    const editorValidation = createValidation(editor);
    settingsValidation.mark(rate, "Invalid rate");
    editorValidation.mark(salary, "Invalid salary");
    settingsValidation.mark(rate, "Another error");
    const message = settings.children[1];
    assert.equal(settings.children.length, 2);
    assert.equal(message.textContent, "Invalid rate");
    assert.equal(rate.getAttribute("aria-invalid"), "true");
    assert.equal(rate.getAttribute("aria-describedby"), `rate-help rate-unit ${message.id}`);
    assert.notEqual(message.id, editor.children[1].id);
    settingsValidation.clear();
    settingsValidation.clear();
    assert.equal(settings.children.length, 1);
    assert.equal(rate.getAttribute("aria-describedby"), "rate-help rate-unit");
    assert.equal(rate.getAttribute("aria-invalid"), null);
    assert.deepEqual(rate.dataset, {});
    assert.equal(editor.children.length, 2);
    editorValidation.clear();
    assert.equal(salary.getAttribute("aria-describedby"), null);
    settingsValidation.mark(rate, "New error");
    assert.equal(settings.children[1].textContent, "New error");
});

test("schedule controls without IDs receive distinct accessible error descriptions", () => {
    const form = new Element();
    const validation = setup()(form);
    const controls = [1, 2].map(weekday => {
        const control = new Element();
        control.dataset = { offerId: "offer-1", dayField: "start", week: "odd", weekday: String(weekday) };
        form.append(control);
        validation.mark(control, "Invalid time");
        return control;
    });
    assert.notEqual(controls[0].getAttribute("aria-describedby"), controls[1].getAttribute("aria-describedby"));
    validation.mark(null, "Ignored missing control");
    validation.clear();
    assert.equal(form.children.length, 2);
    assert.equal(controls[0].dataset.weekday, "1");
});
