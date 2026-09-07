import assert from 'node:assert/strict';
import { evaluate, delay } from './helpers/harness.mjs';

export async function checkTaxDialog({ client }) {
    const read = expression => evaluate(client, expression);
    const click = selector => read(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const set = (selector, value) => read(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        input.value = ${JSON.stringify(value)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const stored = () => read(`localStorage.getItem('starki.offerCompare.v2')`);
    const trigger = id => `.tax-cell[data-offer-id="${id}"] .tax-cell__trigger`;
    const escape = async () => {
        for (const type of ['keyDown', 'keyUp']) {
            await client.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        }
    };
    const expected = id => read(`(() => {
        const calculation = window.OfferCompareCore.calculateAll(JSON.parse(localStorage.getItem('starki.offerCompare.v2')));
        const index = calculation.state.offers.findIndex(offer => offer.id === ${JSON.stringify(id)});
        return { amount: window.OfferCompareUi.formatPreciseMoney(calculation.results[index].metrics.annualIncomeTax),
            company: calculation.state.offers[index].company,
            mode: calculation.results[index].tax.selectedMode };
    })()`);

    assert.equal(await read(`document.querySelector('#taxExplanations, #taxExplanationList')`), null);
    assert.equal(await read(`document.querySelector('#taxDetailBody').childElementCount`), 0);
    await set('#socialSecurityRate', '11');
    await delay(220);
    const baseline = await stored();
    const sortBefore = await read(`localStorage.getItem('starki.offerCompare.v2.view')`);
    for (const [id, close] of [['demo-a', 'closeTaxDetail'], ['demo-b', 'escape'], ['demo-c', 'dismissTaxDetail']]) {
        const calculation = await expected(id);
        await read(`(() => {
            const target = document.querySelector(${JSON.stringify(trigger(id))});
            target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            target.focus({ preventScroll: true });
        })()`);
        const position = await read(`[window.scrollY, document.querySelector('.comparison-table-wrap').scrollLeft]`);
        await click(trigger(id));
        const dialog = await read(`(() => {
            const modal = document.querySelector('#taxDetailDialog');
            const titleFocused = document.activeElement.id === 'taxDetailTitle';
            document.querySelector('#addOfferButton').focus();
            return { open: modal.matches(':modal'), id: modal.dataset.offerId,
                titleFocused, focusTrapped: modal.contains(document.activeElement),
                identity: document.querySelector('#taxDetailIdentity').textContent,
                amount: document.querySelector('.tax-detail-amount').textContent,
                body: document.querySelector('#taxDetailBody').textContent,
                readonly: modal.querySelectorAll('input, select, textarea, form').length === 0,
                bodies: modal.querySelectorAll('.tax-explanation__body').length };
        })()`);
        assert.equal(dialog.open, true);
        assert.equal(dialog.id, id);
        assert.equal(dialog.titleFocused && dialog.focusTrapped && dialog.readonly, true);
        assert.equal(dialog.bodies, 1);
        assert.ok(dialog.identity.includes(calculation.company));
        assert.equal(dialog.amount, calculation.amount);
        for (const text of ['收入来源', '固定工资', '扣除来源', '基本减除费用', '应纳税所得额', '基线税额', 'Offer 增量税方案']) {
            assert.ok(dialog.body.includes(text), `Missing tax detail: ${text}`);
        }
        assert.equal(await stored(), baseline);
        if (close === 'escape') { await escape(); } else { await click('#' + close); }
        assert.equal(await read(`document.querySelector('#taxDetailDialog').open`), false);
        assert.equal(await read(`document.querySelector('#taxDetailBody').childElementCount`), 0);
        assert.equal(await read(`document.documentElement.classList.contains('tax-detail-open')`), false);
        assert.equal(await read(`document.activeElement.dataset.offerId`), id);
        assert.deepStrictEqual(await read(`[window.scrollY, document.querySelector('.comparison-table-wrap').scrollLeft]`), position);
    }
    assert.equal(await read(`localStorage.getItem('starki.offerCompare.v2.view')`), sortBefore);

    // Open after a year or Offer edit: show the current calculation, not a cached explanation.
    await set('#taxYear', '2028');
    await delay(220);
    const laterYear = await expected('demo-a');
    await click(trigger('demo-a'));
    assert.equal(await read(`document.querySelector('.tax-detail-amount').textContent`), laterYear.amount);
    assert.match(await read(`document.querySelector('.tax-detail-method').textContent`), /2028.*奖金并入综合所得/);
    assert.match(await read(`document.querySelector('.tax-explanation__comparison').textContent`), /不使用全年一次性奖金单独计税/);
    await click('#dismissTaxDetail');
    await set('#taxYear', '2026');
    await click('.comparison-offer-link[data-offer-id="demo-a"]');
    await set('#offerEditFields [data-path="company"]', '用于验证详情窗口的长公司名称'.repeat(5));
    await set('#offerEditFields [data-path="pay.monthlySalary"]', '1000');
    await click('#saveOfferEdit');
    assert.equal(await read(`document.querySelector('#offerEditDialog').open`), false,
        await read(`document.querySelector('#offerEditStatus').textContent`));
    const zero = await expected('demo-a');
    for (const width of [1440, 760, 390, 375, 320]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 800 });
        await click(trigger('demo-a'));
        const layout = await read(`(() => {
            const modal = document.querySelector('#taxDetailDialog');
            const body = document.querySelector('#taxDetailBody');
            const rect = modal.getBoundingClientRect();
            body.scrollTop = body.scrollHeight;
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                overflow: modal.scrollWidth - modal.clientWidth,
                bodyOverflow: body.scrollWidth - body.clientWidth,
                scroll: body.scrollTop, closeBottom: document.querySelector('#dismissTaxDetail').getBoundingClientRect().bottom,
                amount: document.querySelector('.tax-detail-amount').textContent };
        })()`);
        assert.equal(layout.amount, zero.amount);
        assert.ok(layout.left >= -1 && layout.right <= width + 1 && layout.top >= -1 && layout.bottom <= 845, `Tax window out of bounds at ${width}px`);
        assert.ok(layout.overflow <= 1 && layout.bodyOverflow <= 1, `Tax window overflows at ${width}px`);
        assert.ok(layout.scroll > 0 && layout.closeBottom <= 844, 'Long details must scroll with Close accessible');
        await click('#dismissTaxDetail');
    }
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await read(`(() => { const confirm = window.confirm; window.confirm = () => true;
        try { document.querySelector('#resetOffersButton').click(); } finally { window.confirm = confirm; } })()`);
}
