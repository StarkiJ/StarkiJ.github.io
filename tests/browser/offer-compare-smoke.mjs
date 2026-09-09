import assert from "node:assert/strict";
import {
    delay,
    evaluate,
    startSiteBrowser,
    waitFor
} from "./helpers/harness.mjs";
import { checkEditorFlow, checkComparisonAndLayout } from "./offer-editor-flow.mjs";
import { checkOfferActions } from "./offer-actions-flow.mjs";
import { checkTaxDialog } from "./tax-dialog-flow.mjs";
import { checkCachedAssetUpgrade } from "./offer-cache-flow.mjs";

async function run() {
    const browser = await startSiteBrowser();
    const {
        client,
        server,
        pageUrl,
        runtimeErrors
    } = browser;

    try {
        await checkCachedAssetUpgrade(browser);
        server.setSeedResponseDelay(1500);
        await client.send("Page.navigate", { url: pageUrl });
        await waitFor(
            client,
            `document.readyState === 'complete' &&
                document.querySelector('#offerComparator')?.getAttribute('aria-busy') === 'true'`,
            "The Offer comparator did not expose its initializing state"
        );
        const initializing = await evaluate(client, `(() => {
            const application = document.querySelector('#offerComparator');
            const addButton = document.querySelector('#addOfferButton');
            const taxYear = document.querySelector('#taxYear');
            const inputEvent = new Event('input', {
                bubbles: true,
                cancelable: true
            });
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true
            });

            addButton.focus();
            const focusBlocked = document.activeElement !== addButton;
            taxYear.value = '2099';
            taxYear.dispatchEvent(inputEvent);
            addButton.dispatchEvent(clickEvent);

            return {
                ariaBusy: application.getAttribute('aria-busy'),
                hasInertAttribute: application.hasAttribute('inert'),
                inertProperty: application.inert,
                focusBlocked,
                inputPrevented: inputEvent.defaultPrevented,
                clickPrevented: clickEvent.defaultPrevented,
                offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length
            };
        })()`);
        assert.equal(initializing.ariaBusy, "true");
        assert.equal(initializing.hasInertAttribute, true);
        assert.equal(initializing.inertProperty, true);
        assert.equal(initializing.focusBlocked, true);
        assert.equal(initializing.inputPrevented, true);
        assert.equal(initializing.clickPrevented, true);
        assert.equal(initializing.offerCount, 0);

        server.setSeedResponseDelay(0);
        try {
            await waitFor(
                client,
                `document.readyState === 'complete' &&
                    document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length === 4 &&
                    document.querySelector('#offerComparator').getAttribute('aria-busy') === 'false'`,
                "The public example Offers did not render"
            );
        } catch (error) {
            const initializationState = await evaluate(client, `({
                ariaBusy: document.querySelector('#offerComparator')
                    ?.getAttribute('aria-busy'),
                offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length,
                saveStatus: document.querySelector('#saveStatus')?.textContent.trim(),
                dataSource: document.querySelector('#dataSourceLabel')?.textContent.trim()
            })`);
            error.message += "\nInitialization state: " +
                JSON.stringify(initializationState);
            throw error;
        }
        const initialized = await evaluate(client, `({
            ariaBusy: document.querySelector('#offerComparator')
                .getAttribute('aria-busy'),
            hasInertAttribute: document.querySelector('#offerComparator')
                .hasAttribute('inert'),
            inertProperty: document.querySelector('#offerComparator').inert,
            taxYear: document.querySelector('#taxYear').value,
            offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length
        })`);
        assert.equal(initialized.ariaBusy, "false");
        assert.equal(initialized.hasInertAttribute, false);
        assert.equal(initialized.inertProperty, false);
        assert.equal(initialized.taxYear, "2026");
        assert.equal(initialized.offerCount, 4);
        assert.deepStrictEqual(await evaluate(client, `[
            document.querySelector('#sortMetric').value,
            document.querySelector('#sortDirection').value
        ]`), ['companyDepartment', 'asc']);

        await checkEditorFlow(browser);
        await checkOfferActions(browser);
        await checkComparisonAndLayout(browser);
        await checkTaxDialog(browser);

        const exportedJson = await evaluate(client, `(async () => {
            const originalCreateObjectUrl = URL.createObjectURL;
            const originalRevokeObjectUrl = URL.revokeObjectURL;
            const originalAnchorClick = HTMLAnchorElement.prototype.click;
            let capturedBlob = null;
            let downloadName = "";

            URL.createObjectURL = (blob) => {
                capturedBlob = blob;
                return "blob:captured-offer-json";
            };
            URL.revokeObjectURL = () => {};
            HTMLAnchorElement.prototype.click = function () {
                downloadName = this.download;
            };

            try {
                document.querySelector('#exportOffersButton').click();
                const text = await capturedBlob.text();
                const parsed = JSON.parse(text);
                const days = parsed.offers.flatMap((offer) => offer.schedule.days);
                const rates = [
                    parsed.settings.socialInsuranceRate,
                    ...parsed.offers.flatMap((offer) => [
                        offer.socialInsuranceRate,
                        offer.housingFundRate
                    ]).filter((value) => value !== null)
                ];
                const dayLines = text.split(/\\r?\\n/).filter((line) =>
                    line.includes('"week":')
                );
                return {
                    downloadName,
                    contentType: capturedBlob.type,
                    offerCount: parsed.offers.length,
                    dayCount: days.length,
                    dayLineCount: dayLines.length,
                    compactDayLines: dayLines.every((line) =>
                        /^\\s*\\{"week": \\d+, "weekday": \\d+, "start": "[^"]+", "end": "[^"]+"\\},?\\s*$/
                            .test(line)
                    ),
                    legacyBreakFieldsAbsent: days.every((day) =>
                        !Object.prototype.hasOwnProperty.call(day, 'lunchBreakHours') &&
                        !Object.prototype.hasOwnProperty.call(day, 'dinnerBreakHours')
                    ),
                    canonicalRates: rates.every((value) =>
                        typeof value === 'number' && value >= 0 && value <= 1
                    ),
                    matchesCoreFormat:
                        text === window.OfferCompareCore.stringifyState(parsed)
                };
            } finally {
                URL.createObjectURL = originalCreateObjectUrl;
                URL.revokeObjectURL = originalRevokeObjectUrl;
                HTMLAnchorElement.prototype.click = originalAnchorClick;
            }
        })()`);
        assert.equal(exportedJson.downloadName, "private.json");
        assert.match(exportedJson.contentType, /^application\/json/);
        assert.equal(exportedJson.offerCount, 4);
        assert.ok(exportedJson.dayCount > 0);
        assert.equal(exportedJson.dayLineCount, exportedJson.dayCount);
        assert.equal(exportedJson.compactDayLines, true);
        assert.equal(exportedJson.legacyBreakFieldsAbsent, true);
        assert.equal(exportedJson.canonicalRates, true);
        assert.equal(exportedJson.matchesCoreFormat, true);

        const invalidImport = await evaluate(client, `(async () => {
            const input = document.querySelector('#importOffersInput');
            const originalConfirm = window.confirm;
            const beforeIds = [...document.querySelectorAll('#comparisonTableBody tr[data-offer-id]')]
                .map((card) => card.dataset.offerId);
            const transfer = new DataTransfer();
            const invalidState = {
                version: 2,
                offers: [{
                    id: 'invalid-time',
                    company: '非法时间示例',
                    department: '测试',
                    city: '上海',
                    pay: {
                        monthlySalary: 10000,
                        salaryMonths: 12
                    },
                    housingFundRate: 0,
                    schedule: {
                        cycleWeeks: 1,
                        days: [{
                            week: 1,
                            weekday: 1,
                            start: 'bad-time',
                            end: '18:00'
                        }]
                    }
                }]
            };

            window.confirm = () => true;
            try {
                transfer.items.add(new File(
                    [JSON.stringify(invalidState)],
                    'invalid-offer.json',
                    { type: 'application/json' }
                ));
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 100));
                return {
                    status: document.querySelector('#saveStatus').textContent.trim(),
                    beforeIds,
                    afterIds: [...document.querySelectorAll('#comparisonTableBody tr[data-offer-id]')]
                        .map((card) => card.dataset.offerId)
                };
            } finally {
                window.confirm = originalConfirm;
            }
        })()`);
        assert.match(invalidImport.status, /^导入失败：/);
        assert.match(invalidImport.status, /上下班时间无效/);
        assert.deepStrictEqual(invalidImport.afterIds, invalidImport.beforeIds);

        await evaluate(client, `(() => {
            localStorage.setItem('starki.offerCompare.v2', '{"broken":true}');
        })()`);
        await client.send("Page.reload");
        await waitFor(
            client,
            `document.querySelector('#dataSourceLabel').textContent.trim() === '脱敏示例' &&
                document.querySelector('#saveStatus').textContent.includes('保存不可用或版本不兼容')`,
            "A corrupt browser save did not report the real recovery warning"
        );
        const recovered = await evaluate(client, `({
            source: document.querySelector('#dataSourceLabel').textContent.trim(),
            status: document.querySelector('#saveStatus').textContent.trim(),
            offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length,
            hoursBasisValues: [...document.querySelectorAll(
                '[data-hours-basis-control]'
            )].map((control) => control.value),
            cardsDefaultCollapsed: [...document.querySelectorAll('#comparisonTableBody tr[data-offer-id]')].every(
                (card) => !card.querySelector('input, select')
            )
        })`);
        assert.equal(recovered.source, "脱敏示例");
        assert.match(recovered.status, /保存不可用或版本不兼容/);
        assert.equal(recovered.offerCount, 4);
        assert.deepStrictEqual(recovered.hoursBasisValues, ["presence", "presence"]);
        assert.equal(recovered.cardsDefaultCollapsed, true);

        const scaleLimit = await evaluate(client, `(async () => {
            const offers = Array.from({ length: 100 }, (_, index) => {
                let offer = window.OfferCompareModel.createOffer(
                    'scale-' + String(index + 1)
                );
                offer.company = '规模公司 ' + String(index + 1);
                offer = window.OfferCompareModel.resizeScheduleCycle(
                    offer,
                    52,
                    52
                );
                return offer;
            });
            const state = {
                version: 2,
                settings: { year: 2026 },
                offers
            };
            const file = new File(
                [JSON.stringify(state)],
                'scale-limit.json',
                { type: 'application/json' }
            );
            const transfer = new DataTransfer();
            const input = document.querySelector('#importOffersInput');
            const originalConfirm = window.confirm;

            transfer.items.add(file);
            window.confirm = () => true;
            try {
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 700));
            } finally {
                window.confirm = originalConfirm;
            }

            const initial = {
                offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length,
                mountedOfferControls: document.querySelectorAll(
                    '#offerEditFields input, #offerEditFields select'
                ).length,
                scheduleMatrices: document.querySelectorAll(
                    '#offerEditFields .schedule-matrix'
                ).length,
                taxDialogCount: document.querySelectorAll(
                    '#taxDetailDialog'
                ).length,
                taxBodyCount: document.querySelectorAll(
                    '#taxDetailBody .tax-explanation__body'
                ).length,
                totalDomNodes: document.querySelectorAll('*').length
            };
            const firstCard = document.querySelector('#comparisonTableBody tr[data-offer-id]');
            const toggle = firstCard.querySelector(
                '[data-action="jump-to-offer"]'
            );
            toggle.click();
            const expanded = {
                scheduleWeeks: document.querySelector(
                    '#offerEditFields .schedule-matrix'
                ).tBodies.length,
                mountedOfferControls: document.querySelectorAll(
                    '#offerEditFields input, #offerEditFields select'
                ).length
            };
            document.querySelector('#cancelOfferEdit').click();
            const collapsedAgain = {
                mountedOfferControls: document.querySelectorAll(
                    '#offerEditFields input, #offerEditFields select'
                ).length,
                scheduleMatrices: document.querySelectorAll(
                    '#offerEditFields .schedule-matrix'
                ).length
            };
            document.querySelector('#addOfferButton').click();
            const addAtLimit = {
                offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length,
                status: document.querySelector('#saveStatus').textContent.trim()
            };
            document.querySelector("#copyOfferButton").click();
            const duplicateAtLimit = {
                offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length,
                status: document.querySelector('#saveStatus').textContent.trim()
            };
            const oversizedTransfer = new DataTransfer();
            oversizedTransfer.items.add(new File(
                [JSON.stringify({
                    ...state,
                    offers: offers.concat(
                        window.OfferCompareModel.createOffer('scale-overflow')
                    )
                })],
                'scale-overflow.json',
                { type: 'application/json' }
            ));
            input.files = oversizedTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 300));
            const oversizedImport = {
                offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length,
                status: document.querySelector('#saveStatus').textContent.trim()
            };

            const resetButton = document.querySelector('#resetOffersButton');
            window.confirm = () => true;
            try {
                resetButton.click();
            } finally {
                window.confirm = originalConfirm;
            }
            return {
                initial,
                expanded,
                collapsedAgain,
                addAtLimit,
                duplicateAtLimit,
                oversizedImport
            };
        })()`);
        assert.equal(scaleLimit.initial.offerCount, 100);
        assert.equal(scaleLimit.initial.mountedOfferControls, 0);
        assert.equal(scaleLimit.initial.scheduleMatrices, 0);
        assert.equal(scaleLimit.initial.taxDialogCount, 1);
        assert.equal(scaleLimit.initial.taxBodyCount, 0);
        assert.ok(scaleLimit.initial.totalDomNodes < 6500);
        assert.equal(scaleLimit.expanded.scheduleWeeks, 52);
        assert.ok(scaleLimit.expanded.mountedOfferControls > 1000);
        assert.equal(scaleLimit.collapsedAgain.mountedOfferControls, 0);
        assert.equal(scaleLimit.collapsedAgain.scheduleMatrices, 0);
        assert.equal(scaleLimit.addAtLimit.offerCount, 100);
        assert.match(scaleLimit.addAtLimit.status, /最多支持 100 个 Offer.*无法继续添加/);
        assert.equal(scaleLimit.duplicateAtLimit.offerCount, 100);
        assert.match(
            scaleLimit.duplicateAtLimit.status,
            /最多支持 100 个 Offer.*无法继续复制/
        );
        assert.equal(scaleLimit.oversizedImport.offerCount, 100);
        assert.match(
            scaleLimit.oversizedImport.status,
            /^导入失败：最多支持 100 个 Offer/
        );
        await waitFor(
            client,
            "document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length === 4",
            "The scale-limit fixture did not reset to the example state"
        );

        await evaluate(client, "document.querySelector('#addOfferButton').click(); document.querySelector('#saveOfferEdit').click()");
        await delay(300);
        server.setSeedFilesUnavailable(true);
        await client.send("Page.reload");
        await waitFor(
            client,
            `document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length === 5 &&
                document.querySelector('#resetOffersButton').textContent.trim() === '清空数据'`,
            "The empty-source reset state did not render"
        );
        const emptySourceReset = await evaluate(client, `(() => {
            const resetButton = document.querySelector('#resetOffersButton');
            const originalConfirm = window.confirm;
            let confirmMessage = "";

            window.confirm = (message) => {
                confirmMessage = message;
                return true;
            };
            try {
                resetButton.click();
            } finally {
                window.confirm = originalConfirm;
            }

            return {
                confirmMessage,
                offerCount: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length,
                source: document.querySelector('#dataSourceLabel').textContent.trim(),
                resetText: resetButton.textContent.trim(),
                saveStatus: document.querySelector('#saveStatus').textContent.trim(),
                defaultRate: document.querySelector('#socialSecurityRate').value,
                currentStorage: localStorage.getItem('starki.offerCompare.v2')
            };
        })()`);
        assert.equal(
            emptySourceReset.confirmMessage,
            "这会删除当前浏览器保存的全部 Offer 和计算设置。当前没有可恢复的 JSON 来源；操作后 Offer 列表为空，计算设置恢复默认值。确定清空吗？"
        );
        assert.equal(emptySourceReset.offerCount, 0);
        assert.equal(emptySourceReset.source, "空白数据");
        assert.equal(emptySourceReset.resetText, "清空数据");
        assert.equal(
            emptySourceReset.saveStatus,
            "当前页面已清空 Offer，计算设置已恢复默认值；后续更改仍只会保存在当前浏览器。"
        );
        assert.equal(emptySourceReset.defaultRate, "10.5");
        assert.equal(emptySourceReset.currentStorage, null);
        server.setSeedFilesUnavailable(false);

        const forcedFailureScript = await client.send(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                source: `(() => {
                    let dataLoader;
                    Object.defineProperty(window, 'OfferCompareData', {
                        configurable: true,
                        get() {
                            return dataLoader;
                        },
                        set(value) {
                            dataLoader = value;
                            if (value && typeof value.loadSeedState === 'function') {
                                value.loadSeedState = async () => {
                                    throw new Error('Forced initialization failure');
                                };
                            }
                        }
                    });
                })();`
            }
        );
        await client.send("Page.reload");
        await waitFor(
            client,
            `document.querySelector('#offerComparator')
                    ?.getAttribute('aria-busy') === 'false' &&
                document.querySelector('#saveStatus')
                    ?.textContent.includes('Forced initialization failure')`,
            "The Offer comparator did not recover from an initialization failure"
        );
        const failedInitialization = await evaluate(client, `(() => {
            const application = document.querySelector('#offerComparator');
            const offerCountBefore = document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length;
            const initializationStatus = document.querySelector('#saveStatus').textContent.trim();
            document.querySelector('#addOfferButton').click();
            document.querySelector('#saveOfferEdit').click();
            return {
                ariaBusy: application.getAttribute('aria-busy'),
                hasInertAttribute: application.hasAttribute('inert'),
                inertProperty: application.inert,
                status: initializationStatus,
                offerCountBefore,
                offerCountAfter: document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length
            };
        })()`);
        assert.equal(failedInitialization.ariaBusy, "false");
        assert.equal(failedInitialization.hasInertAttribute, false);
        assert.equal(failedInitialization.inertProperty, false);
        assert.match(
            failedInitialization.status,
            /初始化失败：Forced initialization failure/
        );
        assert.equal(failedInitialization.offerCountBefore, 0);
        assert.equal(failedInitialization.offerCountAfter, 1);
        await client.send(
            "Page.removeScriptToEvaluateOnNewDocument",
            { identifier: forcedFailureScript.identifier }
        );
        assert.deepStrictEqual(runtimeErrors, []);

        console.log("offer-compare browser smoke tests passed");
    } catch (error) {
        const diagnostics = browser.browserDiagnostics();
        if (runtimeErrors.length) {
            error.message += "\nBrowser runtime errors:\n" +
                runtimeErrors.join("\n");
        }
        if (diagnostics) {
            error.message += `\nEdge diagnostics:\n${diagnostics}`;
        }
        throw error;
    } finally {
        await browser.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
