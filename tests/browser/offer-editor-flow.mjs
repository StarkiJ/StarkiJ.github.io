import assert from "node:assert/strict";
import { evaluate, waitFor, delay } from "./helpers/harness.mjs";

export async function checkEditorFlow({ client }) {
    const read = (expression) => evaluate(client, expression);
    const click = (selector) => read(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const set = (selector, value, event = "input") => read(`(() => {
        const control = document.querySelector(${JSON.stringify(selector)});
        control.value = ${JSON.stringify(value)};
        control.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
    })()`);
    const field = (path) => `#offerEditFields [data-path="${path}"]`;
    const stored = () => read(`localStorage.getItem('starki.offerCompare.v2')`);
    const order = () => read(`[...document.querySelectorAll('#comparisonTableBody tr[data-offer-id]')].map(e => e.dataset.offerId)`);
    const save = async () => {
        await click("#saveOfferEdit");
        assert.equal(await read(`document.querySelector('#offerEditDialog').open`), false);
    };
    const reset = async () => read(`(() => {
        const original = window.confirm;
        window.confirm = () => true;
        try { document.querySelector('#resetOffersButton').click(); }
        finally { window.confirm = original; }
    })()`);

    // The editor is a single reusable dialog; no hidden forms are mounted per Offer.
    assert.equal(await read(`document.querySelectorAll('#offerList, #offerEditorPanel, .comparison-edit-label').length`), 0);
    assert.equal(await read(`document.querySelector('#addOfferButton').closest('#resultPanel') !== null`), true);
    await set("#socialSecurityRate", "11");
    await delay(220);
    const initialStorage = await stored();
    const initialRows = await read(`document.querySelector('#comparisonTableBody').textContent`);
    await click('.comparison-offer-link[data-offer-id="demo-a"]');
    const accessibility = await read(`(() => {
        const dialog = document.querySelector('#offerEditDialog');
        const focusedCompany = document.activeElement.dataset.path === 'company';
        document.querySelector('#addOfferButton').focus();
        return {
            modal: dialog.matches(':modal'), focusedCompany,
            focusStayedInside: dialog.contains(document.activeElement),
            labelsResolve: [...dialog.querySelectorAll('label')].every(label => Boolean(document.getElementById(label.htmlFor))),
            placeholder: dialog.querySelector('[data-path="socialInsuranceRate"]').placeholder,
            scheduleAlwaysVisible: dialog.querySelector('.schedule-matrix').closest('details') === null,
            overtimeCollapsed: !dialog.querySelector('.overtime-details').open,
            controls: dialog.querySelectorAll('input, select').length
        };
    })()`);
    assert.equal(accessibility.modal, true);
    assert.equal(accessibility.focusedCompany, true);
    assert.equal(accessibility.focusStayedInside, true);
    assert.equal(accessibility.labelsResolve, true);
    assert.equal(accessibility.placeholder, "默认 11%");
    assert.equal(accessibility.scheduleAlwaysVisible, true);
    assert.equal(accessibility.overtimeCollapsed, true);
    assert.ok(accessibility.controls > 30);
    const beforePreview = await read(`document.querySelector('#offerEditPreview').textContent`);
    await set(field("pay.monthlySalary"), "38000");
    await set(field("company"), "临时修改");
    assert.notEqual(await read(`document.querySelector('#offerEditPreview').textContent`), beforePreview);
    await delay(220);
    assert.equal(await stored(), initialStorage, "Editing must not reach localStorage before Save");
    assert.equal(await read(`document.querySelector('#comparisonTableBody').textContent`), initialRows);
    await click("#cancelOfferEdit");
    assert.equal(await stored(), initialStorage);
    assert.equal(await read(`document.querySelectorAll('#offerEditFields input, #offerEditFields select').length`), 0);
    assert.equal(await read(`document.activeElement.dataset.offerId`), "demo-a");

    // Native Escape and the close button cancel, release scroll lock, and restore focus.
    for (const closeMethod of ["escape", "button"]) {
        await click('.comparison-offer-link[data-offer-id="demo-a"]');
        await set(field("company"), "仍然不保存");
        if (closeMethod === "escape") {
            await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
            await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        } else { await click("#closeOfferEdit"); }
        assert.equal(await read(`document.querySelector('#offerEditDialog').open`), false);
        assert.equal(await read(`document.documentElement.classList.contains('offer-editor-open')`), false);
        assert.equal(await stored(), initialStorage);
    }

    // Raw invalid values remain editable and cannot overwrite a valid saved Offer.
    await click('.comparison-offer-link[data-offer-id="demo-a"]');
    for (const [path, invalid, valid] of [
        ["company", "  ", "A公司"], ["pay.monthlySalary", "", "28000"],
        ["housingFundRate", "101", "12"], ["pay.otherAnnualCash", "-100", "0"]
    ]) {
        await set(field(path), invalid);
        await click("#saveOfferEdit");
        assert.equal(await read(`document.querySelector('#offerEditDialog').open`), true);
        assert.equal(await read(`document.querySelector(${JSON.stringify(field(path))}).getAttribute('aria-invalid')`), "true");
        assert.equal(await stored(), initialStorage);
        await set(field(path), valid);
    }
    await set('#offerEditFields [data-action="cycle-weeks"]', "1.5", "change");
    await click("#saveOfferEdit");
    assert.equal(await read(`document.querySelector('#offerEditDialog').open`), true);
    await set('#offerEditFields [data-action="cycle-weeks"]', "1", "change");
    await set(field("pay.monthlySalary"), "");
    await set(field("overtime.shiftsPerYear"), "");
    await set('#offerEditFields [data-action="apply-template"]', "standard-965", "change");
    assert.equal(await read(`document.querySelector(${JSON.stringify(field("pay.monthlySalary"))}).value`), "");
    assert.equal(await read(`document.querySelector(${JSON.stringify(field("overtime.shiftsPerYear"))}).value`), "");
    await click("#saveOfferEdit");
    assert.equal(await read(`document.querySelector('#offerEditDialog').open`), true);
    await set(field("pay.monthlySalary"), "28000");
    await set(field("overtime.shiftsPerYear"), "0");
    const invalidDays = await read(`(() => {
        const starts = [...document.querySelectorAll('#offerEditFields [data-day-field="start"]:not(:disabled)')];
        const ends = [...document.querySelectorAll('#offerEditFields [data-day-field="end"]:not(:disabled)')];
        const original = ends.slice(0, 2).map(e => e.value);
        ends.slice(0, 2).forEach((end, i) => {
            end.value = starts[i].value;
            end.dispatchEvent(new Event('input', { bubbles: true }));
        });
        document.querySelector('#saveOfferEdit').click();
        const errors = [...document.querySelectorAll('#offerEditFields [data-field-validation-error]')];
        const descriptions = [...document.querySelectorAll('#offerEditFields [aria-invalid="true"]')]
            .flatMap(e => (e.getAttribute('aria-describedby') || '').split(/\\s+/));
        return {
            original, errorCount: errors.length, uniqueIds: new Set(errors.map(e => e.id)).size,
            descriptionsResolve: descriptions.every(id => Boolean(document.getElementById(id))),
            scheduleAlwaysVisible: starts.every(control => control.closest('details') === null),
            focusedError: document.activeElement.getAttribute('aria-invalid') === 'true',
            stillOpen: document.querySelector('#offerEditDialog').open
        };
    })()`);
    assert.ok(invalidDays.errorCount >= 4);
    assert.equal(invalidDays.errorCount, invalidDays.uniqueIds);
    assert.equal(invalidDays.descriptionsResolve, true);
    assert.equal(invalidDays.scheduleAlwaysVisible, true);
    assert.equal(invalidDays.focusedError, true);
    assert.equal(invalidDays.stillOpen, true);
    await click("#cancelOfferEdit");
    assert.equal(await stored(), initialStorage);

    // Save updates only this Offer; schedule templates and overrides belong to the draft.
    await click('.comparison-offer-link[data-offer-id="demo-a"]');
    await set(field("company"), "更新公司");
    await set(field("pay.monthlySalary"), "30000");
    await set(field("socialInsuranceRate"), "20");
    await set(field("schedule.lunchBreakHours"), "1");
    await set(field("schedule.dinnerBreakHours"), "0.5");
    await set('#offerEditFields [data-action="apply-template"]', "995-early", "change");
    for (const [path, value] of [["socialInsuranceRate", "20"], ["schedule.lunchBreakHours", "1"], ["schedule.dinnerBreakHours", "0.5"]]) {
        assert.equal(await read(`document.querySelector(${JSON.stringify(field(path))}).value`), value);
    }
    await set('#offerEditFields [data-action="cycle-weeks"]', "3", "change");
    assert.equal(await read(`document.querySelector('#offerEditFields .schedule-matrix').tBodies.length`), 3);
    assert.equal(await read(`document.activeElement.dataset.action`), "cycle-weeks");
    await click('#offerEditFields [data-action="toggle-day"][data-week="3"][data-weekday="6"]');
    assert.equal(await read(`document.activeElement.dataset.weekday`), "6");
    await set('#offerEditFields [data-day-field="start"][data-week="3"][data-weekday="6"]', "10:00");
    await set('#offerEditFields [data-day-field="end"][data-week="3"][data-weekday="6"]', "19:00");
    await click('#offerEditFields .overtime-details > summary');
    await set(field("overtime.shiftsPerYear"), "10");
    await save();
    const edited = JSON.parse(await stored());
    assert.deepStrictEqual(edited.offers.slice(1), JSON.parse(initialStorage).offers.slice(1));
    const offer = edited.offers[0];
    assert.equal(offer.company, "更新公司");
    assert.equal(offer.pay.monthlySalary, 30000);
    assert.equal(offer.socialInsuranceRate, 0.2);
    assert.equal(offer.schedule.lunchBreakHours, 1);
    assert.equal(offer.schedule.dinnerBreakHours, 0.5);
    assert.equal(offer.schedule.cycleWeeks, 3);
    assert.deepStrictEqual(offer.schedule.days.find(d => d.week === 3 && d.weekday === 6),
        { week: 3, weekday: 6, start: "10:00", end: "19:00" });
    assert.equal(offer.overtime.shiftsPerYear, 10);
    assert.equal(await read(`document.activeElement.dataset.offerId`), "demo-a");

    // New and copied Offers are inserted only when explicitly saved.
    await click("#addOfferButton");
    await set(field("company"), "取消新增");
    await click("#cancelOfferEdit");
    assert.equal((await order()).length, 4);
    await click("#addOfferButton");
    await set(field("company"), "新增公司");
    await save();
    const withNew = JSON.parse(await stored());
    assert.equal(withNew.offers.at(-1).company, "新增公司");
    const newId = withNew.offers.at(-1).id;
    await click("#copyOfferButton");
    await click('.comparison-offer-link[data-offer-id="demo-a"]');
    await click("#cancelOfferEdit");
    assert.equal((await order()).length, 5);
    await click("#copyOfferButton");
    await click('.comparison-offer-link[data-offer-id="demo-a"]');
    await set(field("pay.monthlySalary"), "31000");
    await save();
    const duplicated = JSON.parse(await stored());
    assert.equal(duplicated.offers.length, 6);
    assert.equal(duplicated.offers[1].department, "A部门（副本）");
    assert.equal(duplicated.offers[0].pay.monthlySalary, 30000);
    assert.equal(duplicated.offers[1].pay.monthlySalary, 31000);
    assert.deepStrictEqual(duplicated.offers[1].schedule, duplicated.offers[0].schedule);

    // Public delete selection supports confirmation and cancellation.
    await read(`window.__originalConfirm = window.confirm; window.confirm = () => false`);
    await click('#deleteOfferButton');
    await click(`.comparison-offer-link[data-offer-id="${newId}"]`);
    assert.equal((await order()).length, 6);
    assert.equal(await read(`document.querySelector('#resultPanel').dataset.offerMode`), '');
    await read(`window.confirm = () => true`);
    await click('#deleteOfferButton');
    await click(`.comparison-offer-link[data-offer-id="${newId}"]`);
    assert.equal((await order()).length, 5);
    await read(`window.confirm = window.__originalConfirm; delete window.__originalConfirm`);
    await reset();
    await set("#sortMetric", "companyDepartment", "change");
    assert.deepStrictEqual(await order(), ["demo-a", "demo-b", "demo-c", "demo-d"]);
}

export async function checkComparisonAndLayout({ client }) {
    const read = (expression) => evaluate(client, expression);
    const click = (selector) => read(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const change = (selector, value) => read(`(() => {
        const control = document.querySelector(${JSON.stringify(selector)});
        control.value = ${JSON.stringify(value)};
        control.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const tableBefore = await read(`document.querySelector('#comparisonTableBody').textContent`);
    await change('#primaryHoursBasis', 'net');
    assert.equal(await read(`document.querySelector('#settingsPrimaryHoursBasis').value`), 'net');
    assert.notEqual(await read(`document.querySelector('#comparisonTableBody').textContent`), tableBefore);
    await click('.comparison-offer-link[data-offer-id="demo-a"]');
    assert.match(await read(`document.querySelector('#offerEditPreview').textContent`), /周净工时/);
    await click('#cancelOfferEdit');
    await change('#settingsPrimaryHoursBasis', 'presence');
    assert.equal(await read(`document.querySelector('#primaryHoursBasis').value`), 'presence');

    // Tax explanations still mount on demand and preserve the return link and sort state.
    await click('.tax-cell[data-offer-id="demo-a"] .tax-cell__trigger');
    await waitFor(client, `document.querySelector('.tax-explanation[data-offer-id="demo-a"]')?.open`, 'Tax explanation did not open');
    const tax = await read(`(() => {
        const details = document.querySelector('.tax-explanation[data-offer-id="demo-a"]');
        return { body: details.querySelector('.tax-explanation__body').textContent,
            summaryFocused: document.activeElement === details.querySelector('summary'),
            linkCount: details.querySelectorAll('.tax-explanation__summary-offer-link').length };
    })()`);
    assert.match(tax.body, /固定工资/);
    assert.match(tax.body, /基本减除费用/);
    assert.equal(tax.summaryFocused, true);
    assert.equal(tax.linkCount, 1);
    await change('#sortMetric', 'annualIncomeTax');
    assert.equal(await read(`document.querySelector('.tax-explanation[data-offer-id="demo-a"]').open`), true);
    await click('.tax-explanation[data-offer-id="demo-a"] .tax-explanation__summary-offer-link');
    await waitFor(client, `document.activeElement.matches('.tax-cell__trigger')`, 'Return from tax explanation lost focus');
    await read(`document.querySelector('.tax-explanation[data-offer-id="demo-a"]').open = false`);
    await delay(30);
    assert.equal(await read(`document.querySelector('.tax-explanation[data-offer-id="demo-a"] .tax-explanation__body') === null`), true);

    for (const width of [1440, 760, 390, 375, 320]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 800 });
        await read(`window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
        const page = await read(`(() => {
            const root = document.documentElement;
            const wrap = document.querySelector('.comparison-table-wrap');
            wrap.scrollLeft = 0;
            const firstLeft = document.querySelector('.comparison-table tbody th').getBoundingClientRect().left;
            wrap.scrollLeft = wrap.scrollWidth;
            return { overflow: root.scrollWidth - root.clientWidth,
                canScroll: wrap.scrollLeft > 0,
                fixedColumn: Math.abs(document.querySelector('.comparison-table tbody th').getBoundingClientRect().left - firstLeft) < 1,
                labelsPresent: document.querySelectorAll('.metric-best .visually-hidden').length > 0 };
        })()`);
        assert.ok(page.overflow <= 1, `Page overflow at ${width}px: ${page.overflow}`);
        if (width < 800) { assert.equal(page.canScroll, true); }
        assert.equal(page.fixedColumn, true);
        assert.equal(page.labelsPresent, true);
        await click('.comparison-offer-link[data-offer-id="demo-a"]');
        const modal = await read(`(() => {
            const dialog = document.querySelector('#offerEditDialog');
            const body = document.querySelector('#offerEditFields');
            const footer = document.querySelector('.offer-edit-footer');
            const rect = dialog.getBoundingClientRect();
            const wrap = dialog.querySelector('.schedule-matrix-wrap');
            wrap.scrollLeft = wrap.scrollWidth;
            const descriptions = [...dialog.querySelectorAll('[aria-describedby]')].flatMap(e => e.getAttribute('aria-describedby').split(/\\s+/));
            return { overflow: dialog.scrollWidth - dialog.clientWidth,
                bodyOverflow: body.scrollWidth - body.clientWidth,
                top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom,
                footerBottom: footer.getBoundingClientRect().bottom,
                internalScroll: body.scrollHeight > body.clientHeight,
                matrixScroll: wrap.scrollLeft,
                descriptionsResolve: descriptions.every(id => Boolean(document.getElementById(id))) };
        })()`);
        assert.ok(modal.overflow <= 1, `Dialog overflow at ${width}px`);
        assert.ok(modal.bodyOverflow <= 1, `Editor body overflow at ${width}px`);
        assert.ok(modal.top >= -1 && modal.left >= -1 && modal.right <= width + 1 && modal.bottom <= 845);
        assert.ok(modal.footerBottom <= 845);
        assert.equal(modal.internalScroll, true);
        if (width < 800) { assert.ok(modal.matrixScroll > 0); }
        assert.equal(modal.descriptionsResolve, true);
        await click('#cancelOfferEdit');
        await click('#reorderOffersButton');
        assert.ok(await read(`document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1`));
        assert.equal(await read(`document.querySelector('#offerOrderList').getClientRects().length > 0`), width <= 640);
        await click('#cancelOfferMode');
    }
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await change('#sortMetric', 'afterTaxHourly');
}
