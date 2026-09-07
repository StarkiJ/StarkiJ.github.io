import assert from "node:assert/strict";
import { evaluate, waitFor, delay } from "./helpers/harness.mjs";

export async function checkOfferActions({ client }) {
    const read = expression => evaluate(client, expression);
    const click = selector => read(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const change = (selector, value, event = 'change') => read(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        input.value = ${JSON.stringify(value)};
        input.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
    })()`);
    const stored = () => read(`localStorage.getItem('starki.offerCompare.v2')`);
    const order = () => read(`[...document.querySelectorAll('#comparisonTableBody tr[data-offer-id]')].map(row => row.dataset.offerId)`);
    const mode = () => read(`document.querySelector('#resultPanel').dataset.offerMode`);
    const key = async (key, keyCode) => {
        for (const type of ['keyDown', 'keyUp']) {
            await client.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: keyCode,
                ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
        }
    };
    const viewport = async (width, height = 1000) => {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 640 });
        await delay(35);
    };
    const mouseClick = async selector => {
        const point = await read(`(() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            const rect = element.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`);
        for (const type of ['mousePressed', 'mouseReleased']) {
            await client.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        }
    };
    const dragFirstToLast = async (surface, touch = false) => {
        const point = await read(`(() => {
            const container = document.querySelector(${JSON.stringify(surface)});
            container.scrollIntoView({ block: 'center', behavior: 'instant' });
            const a = container.firstElementChild.querySelector('.offer-drag-handle').getBoundingClientRect();
            const b = container.lastElementChild.getBoundingClientRect();
            return { x: a.left + a.width / 2, y: a.top + a.height / 2, end: b.bottom - 8 };
        })()`);
        const input = async (phase, y) => {
            if (touch) {
                await client.send('Input.dispatchTouchEvent', { type: phase === 'start' ? 'touchStart' : phase === 'end' ? 'touchEnd' : 'touchMove',
                    touchPoints: phase === 'end' ? [] : [{ x: point.x, y, id: 0 }] });
            } else {
                await client.send('Input.dispatchMouseEvent', { type: phase === 'start' ? 'mousePressed' : phase === 'end' ? 'mouseReleased' : 'mouseMoved',
                    x: point.x, y, button: 'left', buttons: phase === 'end' ? 0 : 1, clickCount: phase === 'move' ? 0 : 1 });
            }
        };
        if (touch) { await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }); }
        await input('start', point.y);
        for (let i = 1; i <= 8; i++) { await input('move', point.y + (point.end - point.y) * i / 8); }
        await input('end', point.end);
        if (touch) { await client.send('Emulation.setTouchEmulationEnabled', { enabled: false }); }
        await delay(320);
    };

    await viewport(1440);
    assert.equal(await read(`document.querySelector('#offerEditorPanel, .comparison-edit-label')`), null);
    assert.equal(await read(`document.querySelector('#hoursColumnHeading').textContent`), '周工时');
    assert.match(await read(`document.querySelector('#comparisonTableBody tr td:nth-child(9)').firstChild.textContent`), /^\d+(\.\d+)? h$/);
    assert.deepStrictEqual(await read(`[...document.querySelectorAll('#comparisonTable thead th')].map(cell => cell.textContent)`),
        ['公司 / 部门', '税前月薪', '总薪数', '税前年收入', '个人所得税', '税后年收入', '公积金', '综合年收入', '周工时', '税前时薪', '税后时薪']);
    assert.equal(await read(`document.querySelector('#comparisonTableBody tr td:nth-child(5) .tax-cell__trigger') !== null`), true);
    await change('#socialSecurityRate', '11', 'input');
    await delay(220);
    const initial = await stored();
    // The list shares the collapsible panel behavior and keeps saved data intact.
    const panelToggle = '#toggleOfferList';
    const panelOpen = () => read(`document.querySelector('#toggleOfferList').getAttribute('aria-expanded') === 'true'`);
    assert.equal(await panelOpen(), true);
    assert.equal(await read(`document.querySelector('#addOfferButton').closest('.comparison-header') !== null`), true);
    await click(panelToggle);
    assert.equal(await panelOpen(), false);
    assert.equal(await read(`document.querySelector('#addOfferButton').checkVisibility()`), true);
    assert.equal(await read(`document.querySelector('.comparison-table-wrap').checkVisibility()`), false);
    assert.equal(await stored(), initial);
    await click('#addOfferButton');
    assert.equal(await read(`document.querySelector('#offerEditDialog').open`), true);
    assert.equal(await panelOpen(), false);
    await click('#cancelOfferEdit');
    await click('#dataMenu > summary');
    assert.equal(await read(`document.querySelector('#dataMenu').open`), true);
    assert.equal(await panelOpen(), false);
    await key('Escape', 27);
    await read(`document.querySelector('#toggleOfferList').focus()`);
    await key('Enter', 13);
    assert.equal(await panelOpen(), true);
    const beforeCollapseOrder = await order();
    for (const action of ['#copyOfferButton', '#deleteOfferButton', '#reorderOffersButton']) {
        await click(panelToggle);
        await click(action);
        assert.equal(await panelOpen(), true);
        if (action === '#reorderOffersButton') {
            await click('#comparisonTableBody tr:first-child [data-order-action="down"]');
            assert.notDeepStrictEqual(await order(), beforeCollapseOrder);
        }
        await click(panelToggle);
        await waitFor(client, `document.querySelector('#resultPanel').dataset.offerMode === ''`, 'Collapsing did not cancel the temporary action');
        assert.equal(await stored(), initial);
        await click(panelToggle);
        assert.deepStrictEqual(await order(), beforeCollapseOrder);
    }
    await change('#sortMetric', 'monthlySalary');
    await change('#sortDirection', 'desc');
    const visual = await order();
    // Modes cancel without writes. A salary cell selects the copy source.
    await click('#copyOfferButton');
    assert.equal(await mode(), 'copy');
    assert.equal(await read(`document.querySelector('#reorderOffersButton').disabled && document.querySelector('#sortMetric').disabled`), true);
    await key('Escape', 27);
    assert.equal(await mode(), '');
    assert.equal(await read(`document.activeElement.id`), 'copyOfferButton');
    assert.equal(await stored(), initial);
    await click('#copyOfferButton');
    await mouseClick('#comparisonTableBody tr:first-child td:nth-child(2)');
    assert.equal(await mode(), '');
    assert.equal(await read(`document.querySelector('#offerEditDialog').open`), true);
    assert.equal(await read(`document.querySelector('#offerEditFields [data-path="pay.monthlySalary"]').value`),
        String(JSON.parse(initial).offers.find(o => o.id === visual[0]).pay.monthlySalary));
    await click('#cancelOfferEdit');
    assert.equal(await stored(), initial);
    // A tax cell selects a deletion target, with identifying details in the confirmation.
    await read(`window.__confirm = window.confirm; window.confirm = message => { window.__deleteMessage = message; return false; }`);
    await click('#deleteOfferButton');
    await mouseClick('#comparisonTableBody tr:first-child .tax-cell');
    assert.match(await read(`window.__deleteMessage`), /×.*薪/);
    assert.equal(await mode(), '');
    assert.equal(await stored(), initial);
    await read(`window.confirm = window.__confirm; delete window.__confirm; delete window.__deleteMessage`);

    // Real drag starts in displayed order. Cancel restores the ordering rule and data.
    await read(`document.querySelector('.comparison-table-wrap').scrollLeft = 0`);
    await click('#reorderOffersButton');
    assert.deepStrictEqual(await order(), visual);
    await dragFirstToLast('#comparisonTableBody');
    assert.deepStrictEqual(await order(), visual.slice(1).concat(visual[0]));
    assert.equal(await stored(), initial);
    await click('#cancelOfferMode');
    assert.deepStrictEqual(await order(), visual);
    assert.equal(await read(`document.querySelector('#sortMetric').value`), 'monthlySalary');
    assert.equal(await stored(), initial);

    // Keyboard movement and Done persist only the order, never the Offer contents.
    await click('#reorderOffersButton');
    await read(`document.querySelector('#comparisonTableBody tr:first-child .offer-drag-handle').focus()`);
    await key('ArrowDown', 40);
    const manual = await order();
    assert.deepStrictEqual(manual, [visual[1], visual[0], ...visual.slice(2)]);
    assert.equal(await read(`document.activeElement.dataset.offerId`), visual[0]);
    assert.equal(await read(`document.querySelector('#comparisonTableBody tr:first-child [data-order-action="up"]').disabled`), true);
    assert.equal(await read(`document.querySelector('#comparisonTableBody tr:last-child [data-order-action="down"]').disabled`), true);
    await click('#finishOfferOrder');
    const saved = await stored();
    assert.deepStrictEqual(JSON.parse(saved).offers.map(o => o.id), manual);
    const byId = (a, b) => a.id.localeCompare(b.id);
    assert.deepStrictEqual(JSON.parse(saved).offers.sort(byId), JSON.parse(initial).offers.sort(byId));
    await change('#sortMetric', 'companyDepartment');
    assert.equal(await stored(), saved);
    await change('#sortMetric', 'custom');
    await client.send('Page.reload');
    await waitFor(client, `document.querySelector('#offerComparator').getAttribute('aria-busy') === 'false'`, 'Reload after ordering failed');
    assert.deepStrictEqual(await order(), manual);
    assert.equal(await read(`document.querySelector('#sortMetric').value`), 'custom');

    // Mobile compact rows share the same draft and support real touch dragging.
    await viewport(390, 1200);
    await click('#reorderOffersButton');
    assert.equal(await read(`document.querySelector('.comparison-table-wrap').getClientRects().length`), 0);
    await dragFirstToLast('#offerOrderList', true);
    const mobile = manual.slice(1).concat(manual[0]);
    assert.deepStrictEqual(await order(), mobile);
    assert.deepStrictEqual(await read(`[...document.querySelector('#offerOrderList').children].map(row => row.dataset.offerId)`), mobile);
    assert.equal(await stored(), saved);
    await click('#finishOfferOrder');
    assert.deepStrictEqual(JSON.parse(await stored()).offers.map(o => o.id), mobile);
    for (const width of [320, 375, 390, 640, 760, 1440]) {
        await viewport(width);
        await click('#dataMenu > summary');
        const box = await read(`(() => {
            const rect = document.querySelector('.comparison-data-options').getBoundingClientRect();
            return { left: rect.left, right: rect.right, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        })()`);
        assert.ok(box.left >= 0 && box.right <= width, `Data menu escapes ${width}px: ${JSON.stringify(box)}`);
        assert.ok(box.overflow <= 1);
        await key('Escape', 27);
        assert.equal(await read(`document.querySelector('#dataMenu').open`), false);
    }
    await viewport(1440);
    // Delete the last row: Add remains usable and actions with no target are disabled.
    await read(`window.__confirm = window.confirm; window.confirm = () => true`);
    while ((await order()).length) {
        await click('#deleteOfferButton');
        await click('#comparisonTableBody .comparison-offer-link');
    }
    assert.equal(await read(`document.querySelector('#addOfferButton').disabled`), false);
    assert.equal(await read(`document.querySelector('#copyOfferButton').disabled && document.querySelector('#reorderOffersButton').disabled`), true);
    assert.equal(await read(`document.activeElement.id`), 'addOfferButton');
    await click('#resetOffersButton');
    await read(`window.confirm = window.__confirm; delete window.__confirm`);
    await change('#sortMetric', 'companyDepartment');
    await change('#sortDirection', 'asc');
}
