import assert from "node:assert/strict";
import {
    delay,
    evaluate,
    startOfferCompareBrowser,
    waitFor
} from "./helpers/offer_compare_browser_harness.mjs";
import {
    measureCollapsedPrimaryPanels,
    readOfferCardPresentation,
    readTypography
} from "./helpers/offer_compare_browser_probes.mjs";

const collapsedPrimaryPanelsProbe =
    `(${measureCollapsedPrimaryPanels.toString()})()`;
const offerCardPresentationProbe =
    readOfferCardPresentation.toString();
const typographyProbe = readTypography.toString();

async function run() {
    const browser = await startOfferCompareBrowser();
    const {
        client,
        server,
        pageUrl,
        runtimeErrors
    } = browser;

    try {
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
                offerCount: document.querySelectorAll('.offer-card').length
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
        await waitFor(
            client,
            `document.readyState === 'complete' &&
                document.querySelectorAll('.offer-card').length === 4 &&
                document.querySelector('#offerComparator').getAttribute('aria-busy') === 'false'`,
            "The public example Offers did not render"
        );
        const initialized = await evaluate(client, `({
            ariaBusy: document.querySelector('#offerComparator')
                .getAttribute('aria-busy'),
            hasInertAttribute: document.querySelector('#offerComparator')
                .hasAttribute('inert'),
            inertProperty: document.querySelector('#offerComparator').inert,
            taxYear: document.querySelector('#taxYear').value,
            offerCount: document.querySelectorAll('.offer-card').length
        })`);
        assert.equal(initialized.ariaBusy, "false");
        assert.equal(initialized.hasInertAttribute, false);
        assert.equal(initialized.inertProperty, false);
        assert.equal(initialized.taxYear, "2026");
        assert.equal(initialized.offerCount, 4);

        const desktop = await evaluate(client, `(() => {
            const settings = document.querySelector('#settingsPanel');
            const collapsedPrimaryPanels = ${collapsedPrimaryPanelsProbe};
            settings.open = true;
            document.querySelector('#offerEditorPanel').open = true;
            const fields = [...settings.querySelectorAll('#settingsForm .field')];
            const inputs = fields.map((field) => field.querySelector('input, select'));
            const rects = fields.map((field) => field.getBoundingClientRect());
            const firstSummary = document.querySelector('#resultSummary article');
            const ownerRect = firstSummary.querySelector('.summary-owner').getBoundingClientRect();
            const metricRect = firstSummary.querySelector('.summary-metric').getBoundingClientRect();
            const firstHelp = settings.querySelector('.field-help');
            const offerCards = [...document.querySelectorAll('.offer-card')];
            const firstOfferId = offerCards[0].dataset.offerId;
            const typography = ${typographyProbe};
            const cardPresentation = ${offerCardPresentationProbe};
            const assumptionItems = [
                ...document.querySelectorAll(
                    '#assumptionPanel .assumption-content li'
                )
            ];
            const settingsHoursBasisSelect = document.querySelector(
                '#settingsPrimaryHoursBasis'
            );
            const settingsHoursBasisStyle = getComputedStyle(
                settingsHoursBasisSelect
            );
            const hoursBasisControls = [
                ...document.querySelectorAll('[data-hours-basis-control]')
            ];
            const resultControls = [...document.querySelectorAll('.sort-controls .sort-field')];
            const resultControlRects = resultControls.map((field) => field.getBoundingClientRect());
            const collapsedSubtitles = offerCards.map((card) => {
                const subtitle = card.querySelector('[data-card-subtitle]');
                const subtitleStyle = getComputedStyle(subtitle);
                return {
                    text: subtitle.textContent.trim(),
                    height: subtitle.getBoundingClientRect().height,
                    visible: subtitleStyle.display !== 'none' &&
                        subtitleStyle.visibility !== 'hidden' &&
                        Number.parseFloat(subtitleStyle.opacity) > 0
                };
            });
            const taxExplanations = [
                ...document.querySelectorAll('#taxExplanationList .tax-explanation')
            ];
            const controlledContentIds = offerCards.map((card) =>
                card.querySelector('[data-action="toggle-offer-card"]')
                    .getAttribute('aria-controls')
            );
            const offerEditorsInitiallyUnmounted = offerCards.every((card) =>
                !card.querySelector('.offer-card__content input, ' +
                    '.offer-card__content select')
            );
            const firstCardToggle = offerCards[0].querySelector(
                '[data-action="toggle-offer-card"]'
            );
            const firstCardTitle = offerCards[0].querySelector(
                '.offer-card__title-link'
            );
            const firstCardSubtitle = offerCards[0].querySelector(
                '[data-card-subtitle]'
            );
            const collapsedTitleTypography = typography(firstCardTitle);
            const collapsedSubtitleTypography = typography(firstCardSubtitle);
            const collapsedCardPresentation = cardPresentation(offerCards[0]);
            firstCardToggle.click();
            const offerEditorMountedOnExpand = Boolean(
                offerCards[0].querySelector('.offer-card__content input')
            );
            const offerOverrideFields = {
                social: offerCards[0].querySelector(
                    '[data-path="socialInsuranceRate"]'
                ),
                lunch: offerCards[0].querySelector(
                    '[data-path="schedule.lunchBreakHours"]'
                ),
                dinner: offerCards[0].querySelector(
                    '[data-path="schedule.dinnerBreakHours"]'
                )
            };
            const expandedTitleTypography = typography(firstCardTitle);
            const expandedSubtitleTypography = typography(firstCardSubtitle);
            const expandedCardPresentation = cardPresentation(offerCards[0]);
            const typographyNodesStable =
                firstCardTitle === offerCards[0].querySelector(
                    '.offer-card__title-link'
                ) &&
                firstCardSubtitle === offerCards[0].querySelector(
                    '[data-card-subtitle]'
                );
            const firstScheduleDetails = offerCards[0].querySelector('.schedule-details');
            firstScheduleDetails.open = true;
            const schedulePrimaryControls = firstScheduleDetails.querySelector(
                '.schedule-primary-controls'
            );
            const schedulePrimaryControlRects = [
                ...schedulePrimaryControls.children
            ].map((field) => field.getBoundingClientRect());
            const schedulePrimaryControlsRect =
                schedulePrimaryControls.getBoundingClientRect();
            const initialScheduleSummary = firstScheduleDetails.querySelector(
                ':scope > summary'
            ).textContent.trim();
            firstScheduleDetails.open = false;
            firstCardToggle.click();
            const offerEditorUnmountedOnCollapse = !offerCards[0].querySelector(
                '.offer-card__content input, .offer-card__content select'
            );
            firstHelp.focus();
            return {
                source: document.querySelector('#dataSourceLabel').textContent.trim(),
                saveStatus: document.querySelector('#saveStatus').textContent.trim(),
                assumptionSummary:
                    document.querySelector('#assumptionSummary').textContent.trim(),
                assumptionItems: assumptionItems.map((item) =>
                    item.textContent.trim()
                ),
                assumptionCategories: assumptionItems.map((item) =>
                    item.querySelector('strong').textContent
                        .split(' · ')[0]
                        .trim()
                ),
                assumptionText: assumptionItems.map((item) =>
                    item.textContent.trim()
                ).join('\\n'),
                fieldCount: fields.length,
                helpCount: settings.querySelectorAll('.field-help').length,
                helpFocused: document.activeElement === firstHelp,
                hoursBasisControlCount: hoursBasisControls.length,
                hoursBasisControlIds: hoursBasisControls.map((control) => control.id),
                hoursBasisLabels: hoursBasisControls.map((control) =>
                    [...control.options].map((option) => option.textContent.trim())
                ),
                settingsHoursBasisLayout: {
                    height: settingsHoursBasisSelect.getBoundingClientRect().height,
                    paddingTop: settingsHoursBasisStyle.paddingTop,
                    paddingBottom: settingsHoursBasisStyle.paddingBottom,
                    lineHeight: settingsHoursBasisStyle.lineHeight,
                    textFits:
                        settingsHoursBasisSelect.scrollHeight <=
                            settingsHoursBasisSelect.clientHeight + 1
                },
                resultControlCount: resultControls.length,
                resultControlRows: [...new Set(
                    resultControlRects.map((rect) => Math.round(rect.top))
                )].length,
                resultControlWidths: resultControlRects.map((rect) => rect.width),
                resultControlHeights: resultControls.map((field) =>
                    field.querySelector('select').getBoundingClientRect().height
                ),
                collapseControlsValid:
                    new Set(controlledContentIds).size === offerCards.length &&
                    offerCards.every((card, index) => {
                        const toggle = card.querySelector(
                            '[data-action="toggle-offer-card"]'
                        );
                        const content = document.getElementById(controlledContentIds[index]);
                        return toggle.getAttribute('aria-expanded') === 'false' &&
                            toggle.textContent.trim() === '展开' &&
                            content &&
                            content.hidden;
                    }),
                collapsedSubtitles,
                collapsedTitleTypography,
                expandedTitleTypography,
                collapsedSubtitleTypography,
                expandedSubtitleTypography,
                collapsedCardPresentation,
                expandedCardPresentation,
                typographyNodesStable,
                offerCardOrder: offerCards.map((card) => card.dataset.offerId),
                offerActionOrder: [
                    ...offerCards[0].querySelectorAll(
                        '.offer-card__actions [data-action]'
                    )
                ].map((button) => button.dataset.action),
                orderHint: document.querySelector('#offerListHelp').textContent.trim(),
                calculationDetailsAbsent:
                    !document.querySelector('#calculationDetails') &&
                    !document.querySelector('.calculation-breakdown'),
                taxExplanationCount: taxExplanations.length,
                taxExplanationsVisible:
                    !document.querySelector('#taxExplanations').hidden,
                taxExplanationsDefaultClosed:
                    taxExplanations.every((details) => !details.open),
                taxSummaryOfferLinksValid:
                    taxExplanations.every((details) => {
                        const summary = details.querySelector('summary');
                        const links = summary.querySelectorAll(
                            '.tax-explanation__summary-offer-link'
                        );
                        return links.length === 1 &&
                            links[0].dataset.action === 'jump-to-tax-cell' &&
                            links[0].dataset.offerId === details.dataset.offerId &&
                            links[0].textContent.trim().length > 0;
                    }),
                taxSummaryOfferLinkHeights:
                    taxExplanations.map((details) =>
                        details.querySelector(
                            '.tax-explanation__summary-offer-link'
                        ).getBoundingClientRect().height
                    ),
                taxBodiesInitiallyUnmounted:
                    taxExplanations.every((details) =>
                        !details.querySelector('.tax-explanation__body')
                    ),
                legacyTaxPopoverAbsent:
                    !document.querySelector('#taxBreakdownPopover'),
                resultPanelMetaAbsent: !document.querySelector('#resultPanelMeta'),
                inputHeights: inputs.map((input) => input.getBoundingClientRect().height),
                fieldWidths: rects.map((rect) => rect.width),
                rowTops: [...new Set(rects.map((rect) => Math.round(rect.top)))],
                fixedInputsAbsent: !document.querySelector('#lunchBreakHours') &&
                    !document.querySelector('#weeksPerYear'),
                summaryValueOnSameRow: Math.abs(ownerRect.top - metricRect.top) < 4,
                summaryOwnerIsStronger: Number.parseFloat(
                    getComputedStyle(firstSummary.querySelector('.summary-owner')).fontSize
                ) > Number.parseFloat(
                    getComputedStyle(firstSummary.querySelector('.summary-metric')).fontSize
                ),
                taxLabel: document.querySelector('.comparison-offer-meta').textContent,
                captionHidden: document.querySelector('.comparison-table caption')
                    .classList.contains('visually-hidden'),
                summaryCount: document.querySelectorAll('#resultSummary article').length,
                hoursHeading: document.querySelector('#hoursColumnHeading').textContent.trim(),
                fundHeading: document.querySelector(
                    '#comparisonTable thead th:nth-child(9)'
                ).textContent.trim(),
                weeklySortLabel: document.querySelector(
                    '#sortMetric option[value="weeklyHours"]'
                ).textContent.trim(),
                fundSortLabel: document.querySelector(
                    '#sortMetric option[value="housingFundEquity"]'
                ).textContent.trim(),
                companyDepartmentSortLabel: document.querySelector(
                    '#sortMetric option[value="companyDepartment"]'
                ).textContent.trim(),
                sortDirectionLabels: [...document.querySelectorAll(
                    '#sortDirection option'
                )].map((option) => option.textContent.trim()),
                offerEditorsInitiallyUnmounted,
                offerEditorMountedOnExpand,
                offerEditorUnmountedOnCollapse,
                offerOverrideFieldsValid: Boolean(
                    offerOverrideFields.social &&
                    offerOverrideFields.social.value === '' &&
                    offerOverrideFields.social.dataset.nullable === 'true' &&
                    offerOverrideFields.social.placeholder === '默认 10.5%' &&
                    offerOverrideFields.social.getAttribute('aria-description').includes('留空继承') &&
                    offerOverrideFields.lunch &&
                    offerOverrideFields.lunch.value === '' &&
                    offerOverrideFields.lunch.dataset.nullable === 'true' &&
                    offerOverrideFields.lunch.placeholder === '默认 2' &&
                    offerOverrideFields.lunch.getAttribute('aria-description').includes('留空继承') &&
                    offerOverrideFields.lunch.closest('.schedule-primary-controls') &&
                    offerOverrideFields.dinner &&
                    offerOverrideFields.dinner.value === '' &&
                    offerOverrideFields.dinner.dataset.nullable === 'true' &&
                    offerOverrideFields.dinner.placeholder === '默认 1' &&
                    offerOverrideFields.dinner.getAttribute('aria-description').includes('留空继承') &&
                    offerOverrideFields.dinner.closest('.schedule-primary-controls')
                ),
                schedulePrimaryControlCount: schedulePrimaryControlRects.length,
                schedulePrimaryControlRows: new Set(
                    schedulePrimaryControlRects.map((rect) => Math.round(rect.top))
                ).size,
                schedulePrimaryControlsFit: schedulePrimaryControlRects.every((rect) => {
                    return rect.left >= schedulePrimaryControlsRect.left - 1 &&
                        rect.right <= schedulePrimaryControlsRect.right + 1;
                }),
                perShiftBreakControlsAbsent: offerCards.every((card) =>
                    !card.querySelector(
                        '[data-day-field="lunchBreakHours"], ' +
                        '[data-day-field="dinnerBreakHours"]'
                    )
                ),
                presenceWeeklyText: document.querySelector(
                    \`tr[data-offer-id="\${firstOfferId}"] td:nth-child(4)\`
                ).textContent.trim(),
                scheduleSummary: initialScheduleSummary,
                resetButtonText:
                    document.querySelector('#resetOffersButton').textContent.trim(),
                resetButtonTitle:
                    document.querySelector('#resetOffersButton').title,
                collapsedPrimaryPanels,
                documentOverflow: document.documentElement.scrollWidth - window.innerWidth
            };
        })()`);

        assert.deepStrictEqual(
            desktop.collapsedPrimaryPanels.map((panel) => panel.name),
            ["我的计算设置", "Offer 信息", "对比结果", "计算方法"]
        );
        const desktopPrimaryPanelMetrics = desktop.collapsedPrimaryPanels.map(
            ({ name, ...metrics }) => metrics
        );
        desktopPrimaryPanelMetrics.slice(1).forEach((metrics) => {
            assert.deepStrictEqual(metrics, desktopPrimaryPanelMetrics[0]);
        });
        assert.equal(desktop.source, "脱敏示例");
        assert.doesNotMatch(desktop.saveStatus, /Failed to fetch|私有数据未载入/);
        assert.equal(desktop.assumptionSummary, "查看 11 项全局默认假设");
        assert.equal(desktop.assumptionItems.length, 11);
        assert.deepStrictEqual(
            desktop.assumptionCategories,
            [
                "税务", "税务", "税务", "税务",
                "薪酬", "薪酬", "薪酬",
                "三险一金", "三险一金",
                "工时", "工时"
            ]
        );
        assert.doesNotMatch(
            desktop.assumptionText,
            /缴纳城市|岗位设置|最终奖金结果/
        );
        assert.equal(desktop.fieldCount, 4);
        assert.equal(desktop.helpCount, 4);
        assert.equal(desktop.helpFocused, true);
        assert.equal(desktop.hoursBasisControlCount, 2);
        assert.equal(new Set(desktop.hoursBasisControlIds).size, 2);
        assert.ok(desktop.hoursBasisLabels.every((labels) =>
            JSON.stringify(labels) === JSON.stringify(["在岗时长", "净时长"])
        ));
        assert.equal(desktop.settingsHoursBasisLayout.height, 40);
        assert.equal(desktop.settingsHoursBasisLayout.paddingTop, "0px");
        assert.equal(desktop.settingsHoursBasisLayout.paddingBottom, "0px");
        assert.equal(desktop.settingsHoursBasisLayout.lineHeight, "normal");
        assert.equal(desktop.settingsHoursBasisLayout.textFits, true);
        assert.equal(desktop.resultControlCount, 3);
        assert.equal(desktop.resultControlRows, 1);
        assert.ok(
            Math.max(...desktop.resultControlWidths) -
                Math.min(...desktop.resultControlWidths) < 1
        );
        assert.ok(
            Math.max(...desktop.resultControlHeights) -
                Math.min(...desktop.resultControlHeights) < 1
        );
        assert.equal(desktop.collapseControlsValid, true);
        assert.ok(desktop.collapsedSubtitles.every((subtitle) =>
            subtitle.visible &&
            subtitle.height > 0 &&
            /¥[\d,.]+\s*×\s*[\d,.]+\s*薪/.test(subtitle.text)
        ));
        assert.deepStrictEqual(
            desktop.collapsedTitleTypography,
            desktop.expandedTitleTypography
        );
        assert.deepStrictEqual(
            desktop.collapsedSubtitleTypography,
            desktop.expandedSubtitleTypography
        );
        assert.deepStrictEqual(
            desktop.collapsedCardPresentation,
            desktop.expandedCardPresentation
        );
        assert.equal(desktop.typographyNodesStable, true);
        assert.deepStrictEqual(
            desktop.offerCardOrder,
            ["demo-a", "demo-b", "demo-c", "demo-d"]
        );
        assert.deepStrictEqual(
            desktop.offerActionOrder,
            ["delete-offer", "duplicate-offer", "toggle-offer-card"]
        );
        assert.match(desktop.orderHint, /来源或录入顺序/);
        assert.equal(desktop.calculationDetailsAbsent, true);
        assert.equal(desktop.taxExplanationCount, desktop.offerCardOrder.length);
        assert.equal(desktop.taxExplanationsVisible, true);
        assert.equal(desktop.taxExplanationsDefaultClosed, true);
        assert.equal(desktop.taxSummaryOfferLinksValid, true);
        assert.ok(
            desktop.taxSummaryOfferLinkHeights.every((height) => height >= 24)
        );
        assert.equal(desktop.taxBodiesInitiallyUnmounted, true);
        assert.equal(desktop.legacyTaxPopoverAbsent, true);
        assert.equal(desktop.resultPanelMetaAbsent, true);
        assert.equal(desktop.rowTops.length, 1);
        assert.ok(desktop.inputHeights.every((height) => height === 40));
        assert.ok(Math.max(...desktop.fieldWidths) - Math.min(...desktop.fieldWidths) < 1);
        assert.equal(desktop.fixedInputsAbsent, true);
        assert.equal(desktop.summaryValueOnSameRow, true);
        assert.equal(desktop.summaryOwnerIsStronger, true);
        assert.doesNotMatch(desktop.taxLabel, /自动择优/);
        assert.equal(desktop.captionHidden, true);
        assert.equal(desktop.summaryCount, 3);
        assert.equal(desktop.hoursHeading, "周工作时长");
        assert.equal(desktop.fundHeading, "公积金");
        assert.equal(desktop.weeklySortLabel, "周工作时长");
        assert.equal(desktop.fundSortLabel, "公积金");
        assert.equal(desktop.companyDepartmentSortLabel, "公司 / 部门");
        assert.deepStrictEqual(desktop.sortDirectionLabels, ["降序", "升序"]);
        assert.equal(desktop.resetButtonText, "重置为示例数据");
        assert.equal(
            desktop.resetButtonTitle,
            "删除当前浏览器保存的全部 Offer 和计算设置，恢复为本次打开页面时载入的“脱敏示例”快照（4 个 Offer）；不会重新读取或修改 JSON 文件。"
        );
        assert.equal(desktop.offerEditorsInitiallyUnmounted, true);
        assert.equal(desktop.offerEditorMountedOnExpand, true);
        assert.equal(desktop.offerEditorUnmountedOnCollapse, true);
        assert.equal(desktop.offerOverrideFieldsValid, true);
        assert.equal(desktop.schedulePrimaryControlCount, 4);
        assert.equal(desktop.schedulePrimaryControlRows, 1);
        assert.equal(desktop.schedulePrimaryControlsFit, true);
        assert.equal(desktop.perShiftBreakControlsAbsent, true);
        assert.match(desktop.scheduleSummary, /^工作时长 · 周在岗 \d/);
        assert.ok(desktop.documentOverflow <= 1);

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
        assert.equal(exportedJson.downloadName, "offer_compare_private.json");
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
            const beforeIds = [...document.querySelectorAll('.offer-card')]
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
                    afterIds: [...document.querySelectorAll('.offer-card')]
                        .map((card) => card.dataset.offerId)
                };
            } finally {
                window.confirm = originalConfirm;
            }
        })()`);
        assert.match(invalidImport.status, /^导入失败：/);
        assert.match(invalidImport.status, /上下班时间无效/);
        assert.deepStrictEqual(invalidImport.afterIds, invalidImport.beforeIds);

        const resetToExample = await evaluate(client, `(() => {
            const resetButton = document.querySelector('#resetOffersButton');
            const originalConfirm = window.confirm;
            let confirmMessage = "";

            document.querySelector('#addOfferButton').click();
            const editedCompany = document.querySelector(
                '.offer-card [data-path="company"]'
            );
            editedCompany.value = '浏览器编辑公司';
            editedCompany.dispatchEvent(new Event('input', { bubbles: true }));
            const editedDefaultRate = document.querySelector(
                '#socialSecurityRate'
            );
            editedDefaultRate.value = '12';
            editedDefaultRate.dispatchEvent(new Event('input', { bubbles: true }));
            const beforeReset = {
                offerCount: document.querySelectorAll('.offer-card').length,
                firstCompany: editedCompany.value,
                defaultRate: editedDefaultRate.value,
                source: document.querySelector('#dataSourceLabel').textContent.trim(),
                resetText: resetButton.textContent.trim(),
                resetTitle: resetButton.title
            };

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
                beforeReset,
                confirmMessage,
                afterReset: {
                    offerCount: document.querySelectorAll('.offer-card').length,
                    offerIds: [...document.querySelectorAll('.offer-card')]
                        .map((card) => card.dataset.offerId),
                    firstCompany: document.querySelector(
                        '.offer-card .offer-card__title-link'
                    ).textContent.trim(),
                    defaultRate: document.querySelector(
                        '#socialSecurityRate'
                    ).value,
                    source: document.querySelector(
                        '#dataSourceLabel'
                    ).textContent.trim(),
                    sourceKind: document.querySelector(
                        '#dataSourceLabel'
                    ).dataset.source,
                    resetText: resetButton.textContent.trim(),
                    resetTitle: resetButton.title,
                    saveStatus: document.querySelector(
                        '#saveStatus'
                    ).textContent.trim(),
                    assumptionSummary: document.querySelector(
                        '#assumptionSummary'
                    ).textContent.trim(),
                    cardsCollapsed: [...document.querySelectorAll('.offer-card')]
                        .every((card) =>
                            card.classList.contains('is-collapsed') &&
                            card.querySelector('.offer-card__content').hidden
                        ),
                    browserSaveCleared:
                        localStorage.getItem('starki.offerCompare.v2') === null
                }
            };
        })()`);
        assert.equal(resetToExample.beforeReset.offerCount, 5);
        assert.equal(resetToExample.beforeReset.firstCompany, "浏览器编辑公司");
        assert.equal(resetToExample.beforeReset.defaultRate, "12");
        assert.equal(resetToExample.beforeReset.source, "浏览器数据");
        assert.equal(resetToExample.beforeReset.resetText, "重置为示例数据");
        assert.equal(
            resetToExample.beforeReset.resetTitle,
            desktop.resetButtonTitle
        );
        assert.equal(
            resetToExample.confirmMessage,
            "这会删除当前浏览器保存的全部 Offer 和计算设置，并恢复为本次打开页面时载入的“脱敏示例”快照（4 个 Offer）。不会重新读取或修改 JSON 文件。确定重置吗？"
        );
        assert.equal(resetToExample.afterReset.offerCount, 4);
        assert.deepStrictEqual(
            resetToExample.afterReset.offerIds,
            ["demo-a", "demo-b", "demo-c", "demo-d"]
        );
        assert.equal(resetToExample.afterReset.firstCompany, "A公司 · A部门");
        assert.equal(resetToExample.afterReset.defaultRate, "10.5");
        assert.equal(resetToExample.afterReset.source, "脱敏示例");
        assert.equal(resetToExample.afterReset.sourceKind, "example");
        assert.equal(resetToExample.afterReset.resetText, "重置为示例数据");
        assert.equal(
            resetToExample.afterReset.resetTitle,
            desktop.resetButtonTitle
        );
        assert.equal(
            resetToExample.afterReset.saveStatus,
            "当前页面已重置为本次打开页面时载入的“脱敏示例”快照（4 个 Offer）；后续更改仍只会保存在当前浏览器。"
        );
        assert.equal(
            resetToExample.afterReset.assumptionSummary,
            "查看 11 项全局默认假设"
        );
        assert.equal(resetToExample.afterReset.cardsCollapsed, true);
        assert.equal(resetToExample.afterReset.browserSaveCleared, true);

        const dynamicSocialPlaceholder = await evaluate(client, `(async () => {
            const defaultRate = document.querySelector('#socialSecurityRate');
            const firstToggle = document.querySelector(
                '.offer-card [data-action="toggle-offer-card"]'
            );
            firstToggle.click();
            const offerRate = document.querySelector(
                '.offer-card [data-path="socialInsuranceRate"]'
            );

            defaultRate.value = '11';
            defaultRate.dispatchEvent(new Event('input', { bubbles: true }));
            const updated = offerRate.placeholder;
            defaultRate.value = '10.5';
            defaultRate.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 220));
            const result = {
                updated,
                restored: offerRate.placeholder,
                storedRate: JSON.parse(
                    localStorage.getItem('starki.offerCompare.v2')
                ).settings.socialInsuranceRate
            };
            firstToggle.click();
            return result;
        })()`);
        assert.equal(dynamicSocialPlaceholder.updated, "默认 11%");
        assert.equal(dynamicSocialPlaceholder.restored, "默认 10.5%");
        assert.equal(dynamicSocialPlaceholder.storedRate, 0.105);

        const invalidDraftSave = await evaluate(client, `(async () => {
            const firstCard = document.querySelector('.offer-card');
            const firstToggle = firstCard.querySelector(
                '[data-action="toggle-offer-card"]'
            );
            firstToggle.click();
            const start = firstCard.querySelector(
                '[data-day-field="start"]:not(:disabled)'
            );
            const end = firstCard.querySelector(
                '[data-day-field="end"]:not(:disabled)'
            );
            const originalEnd = end.value;

            await new Promise((resolve) => setTimeout(resolve, 220));
            const storageBefore = localStorage.getItem('starki.offerCompare.v2');
            end.value = start.value;
            end.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 220));
            const invalidSnapshot = {
                startValue: start.value,
                inputValue: end.value,
                resultStatus: document.querySelector('#resultStatus').textContent.trim(),
                saveStatus: document.querySelector('#saveStatus').textContent.trim(),
                ariaInvalid: end.getAttribute('aria-invalid'),
                fieldError: end.nextElementSibling?.matches(
                    '[data-field-validation-error]'
                )
                    ? end.nextElementSibling.textContent.trim()
                    : '',
                storageUnchanged:
                    localStorage.getItem('starki.offerCompare.v2') === storageBefore
            };

            end.value = originalEnd;
            end.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 220));
            const result = {
                invalidSnapshot,
                restoredStatus: document.querySelector('#resultStatus').textContent.trim(),
                restoredAriaInvalid: end.getAttribute('aria-invalid')
            };
            firstToggle.click();
            return result;
        })()`);
        assert.equal(
            invalidDraftSave.invalidSnapshot.inputValue,
            invalidDraftSave.invalidSnapshot.startValue
        );
        assert.match(
            invalidDraftSave.invalidSnapshot.resultStatus,
            /上下班时间无效/
        );
        assert.match(
            invalidDraftSave.invalidSnapshot.saveStatus,
            /无效更改暂未自动保存/
        );
        assert.equal(invalidDraftSave.invalidSnapshot.ariaInvalid, "true");
        assert.match(invalidDraftSave.invalidSnapshot.fieldError, /上下班时间无效/);
        assert.equal(invalidDraftSave.invalidSnapshot.storageUnchanged, true);
        assert.doesNotMatch(invalidDraftSave.restoredStatus, /上下班时间无效/);
        assert.equal(invalidDraftSave.restoredAriaInvalid, null);

        const rawNumericDraftSave = await evaluate(client, `(async () => {
            const firstCard = document.querySelector('.offer-card');
            const firstToggle = firstCard.querySelector(
                '[data-action="toggle-offer-card"]'
            );
            const taxYear = document.querySelector('#taxYear');

            firstToggle.click();
            const housingFund = firstCard.querySelector(
                '[data-path="housingFundRate"]'
            );
            const originalValue = housingFund.value;
            await new Promise((resolve) => setTimeout(resolve, 220));
            const storageBefore = localStorage.getItem('starki.offerCompare.v2');

            housingFund.value = '101';
            housingFund.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 220));
            const invalidSnapshot = {
                inputValue: housingFund.value,
                resultStatus: document.querySelector('#resultStatus').textContent.trim(),
                saveStatus: document.querySelector('#saveStatus').textContent.trim(),
                ariaInvalid: housingFund.getAttribute('aria-invalid'),
                storageUnchanged:
                    localStorage.getItem('starki.offerCompare.v2') === storageBefore
            };

            firstToggle.click();
            taxYear.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 220));
            const collapsedSnapshot = {
                mountedControls: firstCard.querySelectorAll(
                    '.offer-card__content input, .offer-card__content select'
                ).length,
                resultStatus: document.querySelector('#resultStatus').textContent.trim(),
                storageUnchanged:
                    localStorage.getItem('starki.offerCompare.v2') === storageBefore
            };

            firstToggle.click();
            const restoredHousingFund = firstCard.querySelector(
                '[data-path="housingFundRate"]'
            );
            const invalidValueSurvivedUnmount = restoredHousingFund.value;
            restoredHousingFund.value = originalValue;
            restoredHousingFund.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 220));
            const storedState = JSON.parse(
                localStorage.getItem('starki.offerCompare.v2')
            );
            const correctedSnapshot = {
                resultStatus: document.querySelector('#resultStatus').textContent.trim(),
                ariaInvalid: restoredHousingFund.getAttribute('aria-invalid'),
                storedRate: storedState.offers.find(
                    (offer) => offer.id === firstCard.dataset.offerId
                ).housingFundRate
            };
            firstToggle.click();

            return {
                invalidSnapshot,
                collapsedSnapshot,
                invalidValueSurvivedUnmount,
                correctedSnapshot
            };
        })()`);
        assert.equal(rawNumericDraftSave.invalidSnapshot.inputValue, "101");
        assert.match(
            rawNumericDraftSave.invalidSnapshot.resultStatus,
            /公积金比例必须是 0%–100%/
        );
        assert.match(
            rawNumericDraftSave.invalidSnapshot.saveStatus,
            /无效更改暂未自动保存/
        );
        assert.equal(rawNumericDraftSave.invalidSnapshot.ariaInvalid, "true");
        assert.equal(rawNumericDraftSave.invalidSnapshot.storageUnchanged, true);
        assert.equal(rawNumericDraftSave.collapsedSnapshot.mountedControls, 0);
        assert.match(
            rawNumericDraftSave.collapsedSnapshot.resultStatus,
            /公积金比例必须是 0%–100%/
        );
        assert.equal(rawNumericDraftSave.collapsedSnapshot.storageUnchanged, true);
        assert.equal(rawNumericDraftSave.invalidValueSurvivedUnmount, "101");
        assert.doesNotMatch(
            rawNumericDraftSave.correctedSnapshot.resultStatus,
            /公积金比例必须是 0%–100%/
        );
        assert.equal(rawNumericDraftSave.correctedSnapshot.ariaInvalid, null);
        assert.equal(rawNumericDraftSave.correctedSnapshot.storedRate, 0.12);

        const scheduleValidationIds = await evaluate(client, `(() => {
            const firstCard = document.querySelector('.offer-card');
            const firstToggle = firstCard.querySelector(
                '[data-action="toggle-offer-card"]'
            );
            firstToggle.click();
            const starts = [...firstCard.querySelectorAll(
                '[data-day-field="start"]:not(:disabled)'
            )];
            const ends = [...firstCard.querySelectorAll(
                '[data-day-field="end"]:not(:disabled)'
            )];
            const originals = ends.slice(0, 2).map((input) => input.value);

            ends[0].value = starts[0].value;
            ends[0].dispatchEvent(new Event('input', { bubbles: true }));
            ends[1].value = starts[1].value;
            ends[1].dispatchEvent(new Event('input', { bubbles: true }));

            const errorIds = [...firstCard.querySelectorAll(
                '[data-field-validation-error]'
            )].map((error) => error.id);
            const describedIds = [...firstCard.querySelectorAll(
                '[aria-invalid="true"]'
            )].flatMap((control) =>
                (control.getAttribute('aria-describedby') || '')
                    .split(/\\s+/)
                    .filter(Boolean)
            );
            const allDescriptionsResolve = describedIds.every((id) =>
                Boolean(document.getElementById(id))
            );

            ends[0].value = originals[0];
            ends[0].dispatchEvent(new Event('input', { bubbles: true }));
            ends[1].value = originals[1];
            ends[1].dispatchEvent(new Event('input', { bubbles: true }));
            firstToggle.click();
            return {
                count: errorIds.length,
                uniqueCount: new Set(errorIds).size,
                allDescriptionsResolve
            };
        })()`);
        assert.ok(scheduleValidationIds.count >= 4);
        assert.equal(
            scheduleValidationIds.uniqueCount,
            scheduleValidationIds.count,
            "multiple invalid schedule days should receive unique error ids"
        );
        assert.equal(scheduleValidationIds.allDescriptionsResolve, true);

        const sortIsolation = await evaluate(client, `(() => {
            const cardOrderBefore = [...document.querySelectorAll('.offer-card')]
                .map((card) => card.dataset.offerId);
            const metric = document.querySelector('#sortMetric');
            const direction = document.querySelector('#sortDirection');
            const originalCalculateAll = window.OfferCompareCore.calculateAll;
            let calculationCount = 0;
            const resultOrder = () => [...document.querySelectorAll(
                '#comparisonTableBody tr[data-offer-id]'
            )].map((row) => row.dataset.offerId);
            const explanationOrder = () => [...document.querySelectorAll(
                '#taxExplanationList .tax-explanation[data-offer-id]'
            )].map((details) => details.dataset.offerId);

            window.OfferCompareCore.calculateAll = function () {
                calculationCount += 1;
                return originalCalculateAll.apply(this, arguments);
            };
            metric.value = 'companyDepartment';
            direction.value = 'asc';
            metric.dispatchEvent(new Event('change', { bubbles: true }));
            const ascendingResultOrder = resultOrder();
            const ascendingExplanationOrder = explanationOrder();
            direction.value = 'desc';
            direction.dispatchEvent(new Event('change', { bubbles: true }));
            const descendingResultOrder = resultOrder();
            const descendingExplanationOrder = explanationOrder();
            const cardOrderAfterCompanySort = [...document.querySelectorAll('.offer-card')]
                .map((card) => card.dataset.offerId);
            metric.value = 'afterTaxHourly';
            direction.value = 'desc';
            metric.dispatchEvent(new Event('change', { bubbles: true }));
            window.OfferCompareCore.calculateAll = originalCalculateAll;
            return {
                cardOrderBefore,
                cardOrderAfterCompanySort,
                ascendingResultOrder,
                ascendingExplanationOrder,
                descendingResultOrder,
                descendingExplanationOrder,
                calculationCount
            };
        })()`);
        assert.equal(
            sortIsolation.calculationCount,
            0,
            "sorting should reuse the latest calculation snapshot"
        );
        assert.deepStrictEqual(
            sortIsolation.cardOrderAfterCompanySort,
            sortIsolation.cardOrderBefore
        );
        assert.deepStrictEqual(
            sortIsolation.ascendingResultOrder,
            ["demo-a", "demo-b", "demo-c", "demo-d"]
        );
        assert.deepStrictEqual(
            sortIsolation.ascendingExplanationOrder,
            sortIsolation.ascendingResultOrder
        );
        assert.deepStrictEqual(
            sortIsolation.descendingResultOrder,
            ["demo-d", "demo-c", "demo-b", "demo-a"]
        );
        assert.deepStrictEqual(
            sortIsolation.descendingExplanationOrder,
            sortIsolation.descendingResultOrder
        );

        const hoursBasis = await evaluate(client, `(() => {
            const select = document.querySelector('#primaryHoursBasis');
            const firstCard = document.querySelector('.offer-card');
            const firstOfferId = firstCard.dataset.offerId;
            const firstToggle = firstCard.querySelector(
                '[data-action="toggle-offer-card"]'
            );
            firstToggle.click();
            select.value = 'net';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            const result = {
                value: select.value,
                settingsValue: document.querySelector(
                    '#settingsPrimaryHoursBasis'
                ).value,
                meta: document.querySelector('#settingsSummaryMeta').textContent.trim(),
                heading: document.querySelector('#hoursColumnHeading').textContent.trim(),
                summaryTitles: [...document.querySelectorAll('#resultSummary h3')]
                    .map((heading) => heading.textContent.trim()),
                weeklyText: document.querySelector(
                    \`tr[data-offer-id="\${firstOfferId}"] td:nth-child(4)\`
                ).textContent.trim(),
                scheduleSummary: document.querySelector(
                    \`.offer-card[data-offer-id="\${firstOfferId}"] .schedule-details > summary\`
                ).textContent.trim()
            };
            firstToggle.click();
            return result;
        })()`);
        assert.equal(hoursBasis.value, "net");
        assert.equal(hoursBasis.settingsValue, "net");
        assert.doesNotMatch(hoursBasis.meta, /工时口径/);
        assert.equal(hoursBasis.heading, "周工作时长");
        assert.ok(hoursBasis.summaryTitles.includes("周工作时长最低"));
        assert.notEqual(hoursBasis.weeklyText, desktop.presenceWeeklyText);
        assert.match(hoursBasis.scheduleSummary, /^工作时长 · 周净 \d/);

        const settingsHoursBasis = await evaluate(client, `(() => {
            const settingsSelect = document.querySelector('#settingsPrimaryHoursBasis');
            const firstCard = document.querySelector('.offer-card');
            const firstToggle = firstCard.querySelector(
                '[data-action="toggle-offer-card"]'
            );
            firstToggle.click();
            settingsSelect.value = 'presence';
            settingsSelect.dispatchEvent(new Event('change', { bubbles: true }));
            const resultSelect = document.querySelector('#primaryHoursBasis');
            const firstOfferId = document.querySelector('.offer-card').dataset.offerId;
            const presenceState = {
                settingsValue: settingsSelect.value,
                resultValue: resultSelect.value,
                weeklyText: document.querySelector(
                    \`tr[data-offer-id="\${firstOfferId}"] td:nth-child(4)\`
                ).textContent.trim(),
                scheduleSummary: document.querySelector(
                    \`.offer-card[data-offer-id="\${firstOfferId}"] .schedule-details > summary\`
                ).textContent.trim()
            };
            settingsSelect.value = 'net';
            settingsSelect.dispatchEvent(new Event('change', { bubbles: true }));
            const result = {
                presenceState,
                finalSettingsValue: settingsSelect.value,
                finalResultValue: resultSelect.value
            };
            firstToggle.click();
            return result;
        })()`);
        assert.equal(settingsHoursBasis.presenceState.settingsValue, "presence");
        assert.equal(settingsHoursBasis.presenceState.resultValue, "presence");
        assert.equal(
            settingsHoursBasis.presenceState.weeklyText,
            desktop.presenceWeeklyText
        );
        assert.match(
            settingsHoursBasis.presenceState.scheduleSummary,
            /^工作时长 · 周在岗 \d/
        );
        assert.equal(settingsHoursBasis.finalSettingsValue, "net");
        assert.equal(settingsHoursBasis.finalResultValue, "net");

        const perOfferOverrides = await evaluate(client, `(() => {
            const sourceCard = document.querySelector('.offer-card');
            const sourceId = sourceCard.dataset.offerId;
            const parseValue = (text) => Number(
                text.replace(/,/g, '').replace(/[^\\d.-]/g, '')
            );
            const readGlobalAssumptions = () => ({
                summary: document.querySelector(
                    '#assumptionSummary'
                ).textContent.trim(),
                items: [...document.querySelectorAll(
                    '#assumptionPanel .assumption-content li'
                )].map((item) => item.textContent.trim())
            });
            const readRow = (offerId) => {
                const row = document.querySelector(
                    \`#comparisonTableBody tr[data-offer-id="\${offerId}"]\`
                );
                return {
                    weeklyHours: parseValue(row.cells[3].textContent),
                    afterTaxIncome: parseValue(row.cells[5].textContent)
                };
            };
            const readSocialInsurance = (offerId) => {
                const details = document.querySelector(
                    \`#taxExplanationList .tax-explanation[data-offer-id="\${offerId}"]\`
                );
                details.open = true;
                details.dispatchEvent(new Event('toggle'));
                const line = [...details.querySelectorAll('.tax-explanation__line')]
                    .find((candidate) => candidate.querySelector(
                        '.tax-explanation__label'
                    ).textContent.trim().startsWith('个人社保'));
                const label = line.querySelector(
                    '.tax-explanation__label'
                ).textContent.trim();
                const expression = line.querySelector(
                    '.tax-explanation__expression'
                ).textContent.trim();
                const amounts = expression.match(/¥[\\d,.]+/g) || [];
                return {
                    label,
                    expression,
                    amount: parseValue(amounts.at(-1) || '0')
                };
            };
            const readOffer = (offerId) => {
                const card = document.querySelector(
                    \`.offer-card[data-offer-id="\${offerId}"]\`
                );
                return {
                    card,
                    social: card.querySelector('[data-path="socialInsuranceRate"]'),
                    lunch: card.querySelector(
                        '[data-path="schedule.lunchBreakHours"]'
                    ),
                    dinner: card.querySelector(
                        '[data-path="schedule.dinnerBreakHours"]'
                    ),
                    summary: card.querySelector(
                        '.schedule-details > summary'
                    ).textContent.trim(),
                    row: readRow(offerId),
                    socialInsurance: readSocialInsurance(offerId)
                };
            };
            const setInput = (input, value) => {
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            };

            sourceCard.querySelector('[data-action="duplicate-offer"]').click();
            const testCard = [...document.querySelectorAll('.offer-card')]
                .find((card) => {
                    const company = card.querySelector('[data-path="company"]');
                    return card.dataset.offerId !== sourceId &&
                        company &&
                        company.value === 'A公司';
                });
            const testOfferId = testCard.dataset.offerId;
            const assumptionsAfterDuplicate = readGlobalAssumptions();
            const baseline = readOffer(testOfferId);

            setInput(baseline.social, '20');
            setInput(baseline.lunch, '1');
            setInput(baseline.dinner, '0.5');
            const overridden = readOffer(testOfferId);
            const assumptionsAfterDifferenceEdit = readGlobalAssumptions();

            const template = overridden.card.querySelector(
                '[data-action="apply-template"]'
            );
            template.value = 'standard-965';
            template.dispatchEvent(new Event('change', { bubbles: true }));
            const retainedAfterTemplate = readOffer(testOfferId);
            const retainedValues = {
                social: retainedAfterTemplate.social.value,
                lunch: retainedAfterTemplate.lunch.value,
                dinner: retainedAfterTemplate.dinner.value
            };

            setInput(retainedAfterTemplate.social, '');
            setInput(retainedAfterTemplate.lunch, '');
            setInput(retainedAfterTemplate.dinner, '');
            const inheritedAfterClear = readOffer(testOfferId);
            const captured = {
                testOfferId,
                assumptionsAfterDuplicate,
                assumptionsAfterDifferenceEdit,
                baseline: {
                    row: baseline.row,
                    summary: baseline.summary,
                    socialInsurance: baseline.socialInsurance
                },
                overridden: {
                    row: overridden.row,
                    summary: overridden.summary,
                    socialInsurance: overridden.socialInsurance
                },
                retainedAfterTemplate: {
                    socialValue: retainedValues.social,
                    lunchValue: retainedValues.lunch,
                    dinnerValue: retainedValues.dinner,
                    row: retainedAfterTemplate.row,
                    summary: retainedAfterTemplate.summary,
                    socialInsurance: retainedAfterTemplate.socialInsurance
                },
                inheritedAfterClear: {
                    socialValue: inheritedAfterClear.social.value,
                    lunchValue: inheritedAfterClear.lunch.value,
                    dinnerValue: inheritedAfterClear.dinner.value,
                    socialPlaceholder: inheritedAfterClear.social.placeholder,
                    lunchPlaceholder: inheritedAfterClear.lunch.placeholder,
                    dinnerPlaceholder: inheritedAfterClear.dinner.placeholder,
                    row: inheritedAfterClear.row,
                    summary: inheritedAfterClear.summary,
                    socialInsurance: inheritedAfterClear.socialInsurance
                }
            };

            const originalConfirm = window.confirm;
            window.confirm = () => true;
            inheritedAfterClear.card.querySelector(
                '[data-action="delete-offer"]'
            ).click();
            window.confirm = originalConfirm;
            captured.offerCountAfterCleanup =
                document.querySelectorAll('.offer-card').length;
            captured.cardOrderAfterCleanup = [
                ...document.querySelectorAll('.offer-card')
            ].map((card) => card.dataset.offerId);
            return captured;
        })()`);
        assert.match(
            perOfferOverrides.baseline.socialInsurance.label,
            /默认比例/
        );
        assert.equal(
            perOfferOverrides.assumptionsAfterDuplicate.summary,
            "查看 11 项全局默认假设"
        );
        assert.deepStrictEqual(
            perOfferOverrides.assumptionsAfterDuplicate.items,
            desktop.assumptionItems
        );
        assert.equal(
            perOfferOverrides.assumptionsAfterDifferenceEdit.summary,
            "查看 11 项全局默认假设"
        );
        assert.deepStrictEqual(
            perOfferOverrides.assumptionsAfterDifferenceEdit.items,
            desktop.assumptionItems
        );
        assert.match(
            perOfferOverrides.overridden.socialInsurance.label,
            /Offer 设置/
        );
        assert.match(
            perOfferOverrides.overridden.socialInsurance.expression,
            /20%/
        );
        assert.ok(
            perOfferOverrides.overridden.socialInsurance.amount >
                perOfferOverrides.baseline.socialInsurance.amount
        );
        assert.ok(
            perOfferOverrides.overridden.row.afterTaxIncome <
                perOfferOverrides.baseline.row.afterTaxIncome
        );
        assert.ok(
            perOfferOverrides.overridden.row.weeklyHours >
                perOfferOverrides.baseline.row.weeklyHours
        );
        assert.notEqual(
            perOfferOverrides.overridden.summary,
            perOfferOverrides.baseline.summary
        );
        assert.match(perOfferOverrides.overridden.summary, /^工作时长 · 周净 \d/);
        assert.equal(perOfferOverrides.retainedAfterTemplate.socialValue, "20");
        assert.equal(perOfferOverrides.retainedAfterTemplate.lunchValue, "1");
        assert.equal(perOfferOverrides.retainedAfterTemplate.dinnerValue, "0.5");
        assert.match(
            perOfferOverrides.retainedAfterTemplate.socialInsurance.expression,
            /20%/
        );
        assert.match(
            perOfferOverrides.retainedAfterTemplate.summary,
            /^工作时长 · 周净 \d/
        );
        assert.deepStrictEqual(
            [
                perOfferOverrides.inheritedAfterClear.socialValue,
                perOfferOverrides.inheritedAfterClear.lunchValue,
                perOfferOverrides.inheritedAfterClear.dinnerValue
            ],
            ["", "", ""]
        );
        assert.deepStrictEqual(
            [
                perOfferOverrides.inheritedAfterClear.socialPlaceholder,
                perOfferOverrides.inheritedAfterClear.lunchPlaceholder,
                perOfferOverrides.inheritedAfterClear.dinnerPlaceholder
            ],
            ["默认 10.5%", "默认 2", "默认 1"]
        );
        assert.match(
            perOfferOverrides.inheritedAfterClear.socialInsurance.label,
            /默认比例/
        );
        assert.match(
            perOfferOverrides.inheritedAfterClear.socialInsurance.expression,
            /10\.5%/
        );
        assert.equal(
            perOfferOverrides.inheritedAfterClear.socialInsurance.amount,
            perOfferOverrides.baseline.socialInsurance.amount
        );
        assert.equal(
            perOfferOverrides.inheritedAfterClear.row.afterTaxIncome,
            perOfferOverrides.baseline.row.afterTaxIncome
        );
        assert.ok(
            perOfferOverrides.inheritedAfterClear.row.weeklyHours <
                perOfferOverrides.retainedAfterTemplate.row.weeklyHours
        );
        assert.equal(perOfferOverrides.offerCountAfterCleanup, 4);
        assert.deepStrictEqual(
            perOfferOverrides.cardOrderAfterCleanup,
            ["demo-a", "demo-b", "demo-c", "demo-d"]
        );

        await delay(300);
        server.setSeedFilesUnavailable(true);
        await client.send("Page.reload");
        await waitFor(
            client,
            "document.readyState === 'complete' && document.querySelectorAll('.offer-card').length === 4",
            "Saved browser Offers did not survive a source-file fetch failure"
        );
        const refreshed = await evaluate(client, `({
            ariaBusy: document.querySelector('#offerComparator')
                .getAttribute('aria-busy'),
            hasInertAttribute: document.querySelector('#offerComparator')
                .hasAttribute('inert'),
            source: document.querySelector('#dataSourceLabel').textContent.trim(),
            status: document.querySelector('#saveStatus').textContent.trim(),
            resetText: document.querySelector('#resetOffersButton').textContent.trim(),
            resetTitle: document.querySelector('#resetOffersButton').title,
            resultHoursBasis: document.querySelector('#primaryHoursBasis').value,
            settingsHoursBasis: document.querySelector('#settingsPrimaryHoursBasis').value,
            cardsDefaultCollapsed: [...document.querySelectorAll('.offer-card')].every(
                (card) => card.querySelector('.offer-card__content').hidden
            )
        })`);
        assert.equal(refreshed.ariaBusy, "false");
        assert.equal(refreshed.hasInertAttribute, false);
        assert.equal(refreshed.source, "浏览器数据");
        assert.doesNotMatch(refreshed.status, /Failed to fetch|未载入/);
        assert.match(refreshed.status, /已载入此浏览器的自动保存/);
        assert.equal(refreshed.resetText, "清空数据");
        assert.equal(
            refreshed.resetTitle,
            "删除当前浏览器保存的全部 Offer 和计算设置。当前没有可恢复的 JSON 来源；操作后 Offer 列表为空，计算设置恢复默认值。"
        );
        assert.equal(refreshed.resultHoursBasis, "net");
        assert.equal(refreshed.settingsHoursBasis, "net");
        assert.equal(refreshed.cardsDefaultCollapsed, true);
        server.setSeedFilesUnavailable(false);

        const overtimeSummary = await evaluate(client, `(() => {
            const card = document.querySelector('.offer-card');
            const content = card.querySelector('.offer-card__content');
            if (content.hidden) {
                card.querySelector('[data-action="toggle-offer-card"]').click();
            }
            const summary = card.querySelector('.schedule-details > summary');
            const shifts = card.querySelector('[data-path="overtime.shiftsPerYear"]');
            const before = summary.textContent.trim();
            shifts.value = '52';
            shifts.dispatchEvent(new Event('input', { bubbles: true }));
            return {
                before,
                after: summary.textContent.trim()
            };
        })()`);
        assert.match(overtimeSummary.after, /^工作时长 · 周净 \d/);
        assert.notEqual(overtimeSummary.after, overtimeSummary.before);

        const expandedCard = await evaluate(client, `(() => {
            document.querySelector('#settingsPanel').open = false;
            document.querySelector('#offerEditorPanel').open = true;
            const card = document.querySelectorAll('.offer-card')[1];
            const content = card.querySelector('.offer-card__content');
            const toggle = card.querySelector('[data-action="toggle-offer-card"]');
            const collapsedHeight = card.getBoundingClientRect().height;
            toggle.click();
            return {
                offerId: card.dataset.offerId,
                collapsedHeight,
                expandedHeight: card.getBoundingClientRect().height,
                contentHidden: content.hidden,
                collapsedClass: card.classList.contains('is-collapsed'),
                buttonText: toggle.textContent.trim(),
                ariaExpanded: toggle.getAttribute('aria-expanded'),
                controlsContent: toggle.getAttribute('aria-controls') === content.id
            };
        })()`);
        assert.equal(expandedCard.contentHidden, false);
        assert.equal(expandedCard.collapsedClass, false);
        assert.equal(expandedCard.buttonText, "收起");
        assert.equal(expandedCard.ariaExpanded, "true");
        assert.equal(expandedCard.controlsContent, true);
        assert.ok(expandedCard.collapsedHeight < expandedCard.expandedHeight * 0.5);

        const rerenderedCycle = await evaluate(client, `(() => {
            const card = document.querySelector('.offer-card');
            const cycle = card.querySelector('[data-action="cycle-weeks"]');
            const nextCycle = cycle.value === '3' ? '2' : '3';
            cycle.value = nextCycle;
            cycle.dispatchEvent(new Event('change', { bubbles: true }));
            return {
                offerId: card.dataset.offerId,
                cycle: nextCycle
            };
        })()`);
        await waitFor(
            client,
            `(() => {
                const card = document.querySelector(
                    '.offer-card[data-offer-id="${expandedCard.offerId}"]'
                );
                const content = card && card.querySelector('.offer-card__content');
                const toggle = card &&
                    card.querySelector('[data-action="toggle-offer-card"]');
                const sourceCard = document.querySelector(
                    '.offer-card[data-offer-id="${rerenderedCycle.offerId}"]'
                );
                return card &&
                    !card.classList.contains('is-collapsed') &&
                    !content.hidden &&
                    toggle.textContent.trim() === '收起' &&
                    toggle.getAttribute('aria-expanded') === 'true' &&
                    toggle.getAttribute('aria-controls') === content.id &&
                    sourceCard.querySelector('[data-action="cycle-weeks"]').value ===
                        '${rerenderedCycle.cycle}';
            })()`,
            "An expanded Offer card did not remain expanded after rerendering"
        );

        const recollapsedCard = await evaluate(client, `(() => {
            const card = document.querySelector(
                '.offer-card[data-offer-id="${expandedCard.offerId}"]'
            );
            const toggle = card.querySelector('[data-action="toggle-offer-card"]');
            toggle.click();
            return {
                hidden: card.querySelector('.offer-card__content').hidden,
                text: toggle.textContent.trim(),
                ariaExpanded: toggle.getAttribute('aria-expanded')
            };
        })()`);
        assert.equal(recollapsedCard.hidden, true);
        assert.equal(recollapsedCard.text, "展开");
        assert.equal(recollapsedCard.ariaExpanded, "false");

        await evaluate(client, `(() => {
            document.querySelector('#resultPanel').open = true;
            document.querySelector(
                '.comparison-offer-link[data-offer-id="${expandedCard.offerId}"]'
            ).click();
        })()`);
        await waitFor(
            client,
            `(() => {
                const card = document.querySelector(
                    '.offer-card[data-offer-id="${expandedCard.offerId}"]'
                );
                const toggle = card &&
                    card.querySelector('[data-action="toggle-offer-card"]');
                return card &&
                    document.querySelector('#offerEditorPanel').open &&
                    card.classList.contains('is-jump-target') &&
                    !card.classList.contains('is-collapsed') &&
                    !card.querySelector('.offer-card__content').hidden &&
                    toggle.textContent.trim() === '收起' &&
                    toggle.getAttribute('aria-expanded') === 'true' &&
                    document.activeElement === card;
            })()`,
            "Jumping from the table did not expand the target Offer card"
        );

        await evaluate(client, `(() => {
            const firstCard = document.querySelector('.offer-card');
            const fields = [...firstCard.querySelectorAll(
                ':scope > .offer-card__content > .offer-card__grid > .field'
            )];
            const bonus = fields.find((field) => field.querySelector('label').textContent === '奖金计税');
            return {
                fieldWidth: fields[0].getBoundingClientRect().width,
                bonusWidth: bonus.getBoundingClientRect().width
            };
        })()`).then(({ fieldWidth, bonusWidth }) => {
            assert.ok(Math.abs(fieldWidth - bonusWidth) < 1);
        });

        const firstOfferId = await evaluate(client, `(() => {
            const button = document.querySelector('.offer-card__title-link');
            const id = button.dataset.offerId;
            button.click();
            return id;
        })()`);
        await waitFor(
            client,
            `document.querySelector('tr[data-offer-id="${firstOfferId}"]').classList.contains('is-jump-target')`,
            "Clicking an Offer title did not jump to its result row"
        );

        await evaluate(client, `(() => {
            const panel = document.querySelector('#offerEditorPanel');
            panel.open = true;
            const card = document.querySelector('.offer-card');
            card.querySelector('.schedule-details').open = true;
            const cycle = card.querySelector('[data-action="cycle-weeks"]');
            cycle.value = '3';
            cycle.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        await waitFor(
            client,
            "document.querySelector('.offer-card .schedule-matrix').tBodies.length === 3",
            "Changing the schedule cycle to three weeks did not render three week groups"
        );

        const schedule = await evaluate(client, `(() => {
            const card = document.querySelector('.offer-card');
            const matrix = card.querySelector('.schedule-matrix');
            const checks = [...matrix.querySelectorAll('input[type="checkbox"]')];
            const enabledChecks = checks.filter((check) => check.checked);
            enabledChecks.slice(0, -1).forEach((check) => {
                check.checked = false;
                check.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const lastEnabled = enabledChecks.at(-1);
            lastEnabled.focus();
            lastEnabled.checked = false;
            lastEnabled.dispatchEvent(new Event('change', { bubbles: true }));
            return {
                bodies: matrix.tBodies.length,
                enabled: checks.filter((check) => check.checked).length,
                allTimesDisabled: [...matrix.querySelectorAll('input[type="time"]')]
                    .every((input) => input.disabled),
                focusPreserved: document.activeElement === lastEnabled,
                documentOverflow: document.documentElement.scrollWidth - window.innerWidth
            };
        })()`);
        assert.equal(schedule.bodies, 3);
        assert.equal(schedule.enabled, 0);
        assert.equal(schedule.allTimesDisabled, true);
        assert.equal(schedule.focusPreserved, true);
        assert.ok(schedule.documentOverflow <= 1);

        const taxJump = await evaluate(client, `(() => {
            document.querySelector('#offerEditorPanel').open = false;
            document.querySelector('#resultPanel').open = true;
            const trigger = document.querySelector('.tax-cell__trigger');
            const result = {
                offerId: trigger.dataset.offerId,
                triggerId: trigger.id,
                explanationId: trigger.getAttribute('aria-controls')
            };
            trigger.click();
            return result;
        })()`);
        await waitFor(
            client,
            `(() => {
                const details = document.getElementById(${JSON.stringify(
                    taxJump.explanationId
                )});
                const summary = details && details.querySelector('summary');
                const trigger = document.getElementById(${JSON.stringify(
                    taxJump.triggerId
                )});
                return details &&
                    details.open &&
                    details.classList.contains('is-jump-target') &&
                    document.activeElement === summary &&
                    trigger.getAttribute('aria-expanded') === 'true';
            })()`,
            "The table tax amount did not open and focus its explanation"
        );
        const taxExplanation = await evaluate(client, `(() => {
            const details = document.getElementById(${JSON.stringify(
                taxJump.explanationId
            )});
            const summary = details.querySelector('summary');
            const body = details.querySelector('.tax-explanation__body');
            const expressions = [
                ...body.querySelectorAll('.tax-explanation__expression')
            ];
            const labels = [
                ...body.querySelectorAll('.tax-explanation__label')
            ];
            const comparison = body.querySelector('.tax-explanation__comparison');
            const note = body.querySelector('.tax-explanation__note');
            const offerLink = summary.querySelector(
                '.tax-explanation__summary-offer-link'
            );
            return {
                text: body.textContent,
                detailsOverflow: details.scrollWidth - details.clientWidth,
                bodyOverflow: body.scrollWidth - body.clientWidth,
                formulaOverflows: expressions.map((expression) =>
                    expression.scrollWidth - expression.clientWidth
                ),
                labelFontSizes: labels.map((label) =>
                    Number.parseFloat(getComputedStyle(label).fontSize)
                ),
                expressionFontSizes: expressions.map((expression) =>
                    Number.parseFloat(getComputedStyle(expression).fontSize)
                ),
                comparisonFontSize: Number.parseFloat(
                    getComputedStyle(comparison).fontSize
                ),
                noteFontSize: Number.parseFloat(getComputedStyle(note).fontSize),
                summaryFocused: document.activeElement === summary,
                highlighted: details.classList.contains('is-jump-target'),
                summaryOfferLinkCount: summary.querySelectorAll(
                    '.tax-explanation__summary-offer-link'
                ).length,
                offerLinkText: offerLink.textContent.trim(),
                duplicateBodyElementCount: body.querySelectorAll(
                    '.tax-explanation__heading, ' +
                    '.tax-explanation__total, ' +
                    '.tax-explanation__offer-link'
                ).length
            };
        })()`);
        assert.match(taxExplanation.text, /固定工资（Offer）/);
        assert.match(taxExplanation.text, /基本减除费用（内置年度规则）/);
        assert.match(taxExplanation.text, /归属于该 Offer 的增量个税/);
        assert.match(
            taxExplanation.text,
            /中国大陆居民个人综合所得年度税率（规则版本 v1）/
        );
        assert.match(
            taxExplanation.text,
            /Offer 增量税方案：并入综合所得 .*奖金单独计税 .*较低方案为/
        );
        assert.doesNotMatch(taxExplanation.text, /归属于该 Offer 的年度个税/);
        assert.ok(taxExplanation.detailsOverflow <= 1);
        assert.ok(taxExplanation.bodyOverflow <= 1);
        assert.ok(taxExplanation.formulaOverflows.every((overflow) => overflow <= 1));
        assert.ok(taxExplanation.labelFontSizes.every((fontSize) => fontSize >= 12.5));
        assert.ok(
            taxExplanation.expressionFontSizes.every((fontSize) => fontSize >= 14)
        );
        assert.ok(taxExplanation.comparisonFontSize >= 13);
        assert.ok(taxExplanation.noteFontSize >= 12.4);
        assert.equal(taxExplanation.summaryFocused, true);
        assert.equal(taxExplanation.highlighted, true);
        assert.equal(taxExplanation.summaryOfferLinkCount, 1);
        assert.equal(taxExplanation.duplicateBodyElementCount, 0);
        assert.ok(taxExplanation.offerLinkText.length > 0);

        await evaluate(client, `document
            .getElementById(${JSON.stringify(taxJump.explanationId)})
            .querySelector('.tax-explanation__summary-offer-link')
            .click()`);
        await waitFor(
            client,
            `(() => {
                const trigger = document.getElementById(${JSON.stringify(
                    taxJump.triggerId
                )});
                const cell = trigger && trigger.closest('.tax-cell');
                const details = document.getElementById(${JSON.stringify(
                    taxJump.explanationId
                )});
                return trigger &&
                    cell.classList.contains('is-jump-target') &&
                    document.activeElement === trigger &&
                    details.open;
            })()`,
            "The tax explanation Offer name did not return focus to its table cell"
        );
        const taxCellReturn = await evaluate(client, `(() => {
            const trigger = document.getElementById(${JSON.stringify(
                taxJump.triggerId
            )});
            const cell = trigger.closest('.tax-cell');
            const details = document.getElementById(${JSON.stringify(
                taxJump.explanationId
            )});
            return {
                offerId: trigger.dataset.offerId,
                focused: document.activeElement === trigger,
                highlighted: cell.classList.contains('is-jump-target'),
                expanded: trigger.getAttribute('aria-expanded'),
                explanationStillOpen: details.open
            };
        })()`);
        assert.equal(taxCellReturn.offerId, taxJump.offerId);
        assert.equal(taxCellReturn.focused, true);
        assert.equal(taxCellReturn.highlighted, true);
        assert.equal(taxCellReturn.expanded, "true");
        assert.equal(taxCellReturn.explanationStillOpen, true);

        const taxBodyLifecycle = await evaluate(client, `(() => {
            const details = document.getElementById(${JSON.stringify(
                taxJump.explanationId
            )});
            details.open = false;
            details.dispatchEvent(new Event('toggle'));
            const unmountedOnClose = !details.querySelector(
                '.tax-explanation__body'
            );
            details.open = true;
            details.dispatchEvent(new Event('toggle'));
            return {
                unmountedOnClose,
                remountedOnReopen: Boolean(details.querySelector(
                    '.tax-explanation__body'
                ))
            };
        })()`);
        assert.equal(taxBodyLifecycle.unmountedOnClose, true);
        assert.equal(taxBodyLifecycle.remountedOnReopen, true);

        const taxOpenStateAfterSort = await evaluate(client, `(() => {
            const metric = document.querySelector('#sortMetric');
            const direction = document.querySelector('#sortDirection');
            metric.value = 'monthlySalary';
            direction.value = 'asc';
            metric.dispatchEvent(new Event('change', { bubbles: true }));
            const details = document.getElementById(${JSON.stringify(
                taxJump.explanationId
            )});
            const trigger = document.getElementById(${JSON.stringify(
                taxJump.triggerId
            )});
            return {
                detailsOpen: details.open,
                triggerExpanded: trigger.getAttribute('aria-expanded')
            };
        })()`);
        assert.equal(taxOpenStateAfterSort.detailsOpen, true);
        assert.equal(taxOpenStateAfterSort.triggerExpanded, "true");
        await evaluate(client, `(() => {
            const metric = document.querySelector('#sortMetric');
            const direction = document.querySelector('#sortDirection');
            metric.value = 'afterTaxHourly';
            direction.value = 'desc';
            metric.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);

        const editOrder = await evaluate(client, `(() => {
            document.querySelector('#offerEditorPanel').open = true;
            const originalCards = [...document.querySelectorAll('.offer-card')];
            const sourceId = originalCards[0].dataset.offerId;
            originalCards[0].querySelector('[data-action="duplicate-offer"]').click();
            const afterDuplicate = [...document.querySelectorAll('.offer-card')];
            const duplicateCard = afterDuplicate[1];
            document.querySelector('#addOfferButton').click();
            const afterAdd = [...document.querySelectorAll('.offer-card')];
            const addedCard = afterAdd.at(-1);
            return {
                sourceId,
                duplicateFollowsSource:
                    afterDuplicate[0].dataset.offerId === sourceId &&
                    duplicateCard.dataset.offerId !== sourceId,
                duplicateExpanded:
                    !duplicateCard.querySelector('.offer-card__content').hidden,
                addedAtEnd: addedCard.querySelector(
                    '[data-path="company"]'
                ).value === '新公司',
                addedExpanded: !addedCard.querySelector('.offer-card__content').hidden,
                offerCount: afterAdd.length,
                assumptionSummary:
                    document.querySelector('#assumptionSummary').textContent.trim(),
                assumptionItems: [...document.querySelectorAll(
                    '#assumptionPanel .assumption-content li'
                )].map((item) => item.textContent.trim())
            };
        })()`);
        assert.equal(editOrder.duplicateFollowsSource, true);
        assert.equal(editOrder.duplicateExpanded, true);
        assert.equal(editOrder.addedAtEnd, true);
        assert.equal(editOrder.addedExpanded, true);
        assert.equal(editOrder.offerCount, 6);
        assert.equal(editOrder.assumptionSummary, "查看 11 项全局默认假设");
        assert.deepStrictEqual(editOrder.assumptionItems, desktop.assumptionItems);

        await client.send("Emulation.setDeviceMetricsOverride", {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true
        });
        await delay(150);

        const mobile = await evaluate(client, `(() => {
            const collapsedPrimaryPanels = ${collapsedPrimaryPanelsProbe};
            document.querySelector('#settingsPanel').open = true;
            document.querySelector('#offerEditorPanel').open = true;
            const settingsFields = [...document.querySelectorAll('#settingsForm .field')];
            const settingsRects = settingsFields.map((field) => field.getBoundingClientRect());
            const typography = ${typographyProbe};
            const cardPresentation = ${offerCardPresentationProbe};
            const firstCard = document.querySelector('.offer-card');
            const firstCardToggle = firstCard.querySelector(
                '[data-action="toggle-offer-card"]'
            );
            const firstCardTitle = firstCard.querySelector(
                '.offer-card__title-link'
            );
            const firstCardSubtitle = firstCard.querySelector(
                '[data-card-subtitle]'
            );
            if (!firstCard.classList.contains('is-collapsed')) {
                firstCardToggle.click();
            }
            const collapsedTitleTypography = typography(firstCardTitle);
            const collapsedSubtitleTypography = typography(firstCardSubtitle);
            const collapsedCardPresentation = cardPresentation(firstCard);
            firstCardToggle.click();
            const expandedTitleTypography = typography(firstCardTitle);
            const expandedSubtitleTypography = typography(firstCardSubtitle);
            const expandedCardPresentation = cardPresentation(firstCard);
            const typographyNodesStable =
                firstCardTitle === firstCard.querySelector(
                    '.offer-card__title-link'
                ) &&
                firstCardSubtitle === firstCard.querySelector(
                    '[data-card-subtitle]'
                );
            const firstCardHeader = firstCard.querySelector('.offer-card__header');
            const schedule = document.querySelector('.offer-card .schedule-details');
            schedule.open = true;
            const wrap = schedule.querySelector('.schedule-matrix-wrap');
            const schedulePrimaryControls = schedule.querySelector(
                '.schedule-primary-controls'
            );
            const schedulePrimaryControlRects = [
                ...schedulePrimaryControls.children
            ].map((field) => field.getBoundingClientRect());
            const schedulePrimaryControlsRect =
                schedulePrimaryControls.getBoundingClientRect();
            const summaryCards = [...document.querySelectorAll('#resultSummary article')];
            const resultControlRects = [...document.querySelectorAll('.sort-controls .sort-field')]
                .map((field) => field.getBoundingClientRect());
            const taxExplanationList = document.querySelector('#taxExplanationList');
            const taxExplanations = [
                ...taxExplanationList.querySelectorAll('.tax-explanation')
            ];
            const openTaxExplanation =
                taxExplanations.find((details) => details.open) ||
                taxExplanations[0];
            openTaxExplanation.open = true;
            const taxExplanationBody = openTaxExplanation.querySelector(
                '.tax-explanation__body'
            );
            const taxExpressions = [
                ...taxExplanationBody.querySelectorAll(
                    '.tax-explanation__expression'
                )
            ];
            const taxExplanationRects = taxExplanations.map((details) =>
                details.getBoundingClientRect()
            );
            const taxOfferLinkHeights = taxExplanations.map((details) =>
                details.querySelector(
                    '.tax-explanation__summary-offer-link'
                ).getBoundingClientRect().height
            );
            return {
                settingsColumns: new Set(settingsRects.map((rect) => Math.round(rect.left))).size,
                resultControlColumns: new Set(
                    resultControlRects.map((rect) => Math.round(rect.left))
                ).size,
                resultControlRows: new Set(
                    resultControlRects.map((rect) => Math.round(rect.top))
                ).size,
                resultControlWidths: resultControlRects.map((rect) => rect.width),
                documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
                matrixScrollsInternally: wrap.scrollWidth > wrap.clientWidth,
                matrixWithinViewport: wrap.getBoundingClientRect().right <= window.innerWidth + 1,
                schedulePrimaryControlCount: schedulePrimaryControlRects.length,
                schedulePrimaryControlColumns: new Set(
                    schedulePrimaryControlRects.map((rect) => Math.round(rect.left))
                ).size,
                schedulePrimaryControlRows: new Set(
                    schedulePrimaryControlRects.map((rect) => Math.round(rect.top))
                ).size,
                schedulePrimaryControlsWithinContainer:
                    schedulePrimaryControlRects.every((rect) =>
                        rect.left >= schedulePrimaryControlsRect.left - 1 &&
                        rect.right <= schedulePrimaryControlsRect.right + 1
                    ),
                collapsedTitleTypography,
                expandedTitleTypography,
                collapsedSubtitleTypography,
                expandedSubtitleTypography,
                collapsedCardPresentation,
                expandedCardPresentation,
                typographyNodesStable,
                offerHeaderFits: firstCardHeader.scrollWidth <= firstCardHeader.clientWidth + 1,
                summaryCardsFit: summaryCards.every((card) =>
                    card.scrollWidth <= card.clientWidth + 1 &&
                    card.querySelector('.summary-metric').getBoundingClientRect().right <=
                        card.getBoundingClientRect().right + 1
                ),
                taxExplanationColumns: new Set(
                    taxExplanationRects.map((rect) => Math.round(rect.left))
                ).size,
                taxExplanationListOverflow:
                    taxExplanationList.scrollWidth - taxExplanationList.clientWidth,
                taxExplanationBodyOverflow:
                    taxExplanationBody.scrollWidth - taxExplanationBody.clientWidth,
                taxFormulaOverflows: taxExpressions.map((expression) =>
                    expression.scrollWidth - expression.clientWidth
                ),
                taxExplanationsWithinViewport: taxExplanationRects.every((rect) =>
                    rect.left >= -1 && rect.right <= window.innerWidth + 1
                ),
                collapsedPrimaryPanels,
                taxOfferLinkHeights
            };
        })()`);
        assert.deepStrictEqual(
            mobile.collapsedPrimaryPanels.map((panel) => panel.name),
            ["我的计算设置", "Offer 信息", "对比结果", "计算方法"]
        );
        const mobilePrimaryPanelMetrics = mobile.collapsedPrimaryPanels.map(
            ({ name, ...metrics }) => metrics
        );
        mobilePrimaryPanelMetrics.slice(1).forEach((metrics) => {
            assert.deepStrictEqual(metrics, mobilePrimaryPanelMetrics[0]);
        });
        assert.equal(mobile.settingsColumns, 2);
        assert.equal(mobile.resultControlColumns, 3);
        assert.equal(mobile.resultControlRows, 1);
        assert.ok(
            Math.max(...mobile.resultControlWidths) -
                Math.min(...mobile.resultControlWidths) < 1
        );
        assert.ok(mobile.documentOverflow <= 1);
        assert.equal(mobile.matrixScrollsInternally, true);
        assert.equal(mobile.matrixWithinViewport, true);
        assert.equal(mobile.schedulePrimaryControlCount, 4);
        assert.equal(mobile.schedulePrimaryControlColumns, 2);
        assert.equal(mobile.schedulePrimaryControlRows, 2);
        assert.equal(mobile.schedulePrimaryControlsWithinContainer, true);
        assert.deepStrictEqual(
            mobile.collapsedTitleTypography,
            mobile.expandedTitleTypography
        );
        assert.deepStrictEqual(
            mobile.collapsedSubtitleTypography,
            mobile.expandedSubtitleTypography
        );
        assert.deepStrictEqual(
            mobile.collapsedCardPresentation,
            mobile.expandedCardPresentation
        );
        assert.equal(mobile.typographyNodesStable, true);
        assert.equal(mobile.offerHeaderFits, true);
        assert.equal(mobile.summaryCardsFit, true);
        assert.equal(mobile.taxExplanationColumns, 1);
        assert.ok(mobile.taxExplanationListOverflow <= 1);
        assert.ok(mobile.taxExplanationBodyOverflow <= 1);
        assert.ok(mobile.taxFormulaOverflows.every((overflow) => overflow <= 1));
        assert.equal(mobile.taxExplanationsWithinViewport, true);
        assert.ok(mobile.taxOfferLinkHeights.every((height) => height >= 32));

        await client.send("Emulation.setDeviceMetricsOverride", {
            width: 375,
            height: 812,
            deviceScaleFactor: 1,
            mobile: true
        });
        await delay(100);
        const narrowMobile = await evaluate(client, `(() => {
            const rects = [...document.querySelectorAll('.sort-controls .sort-field')]
                .map((field) => field.getBoundingClientRect());
            const collapsedPrimaryPanels = ${collapsedPrimaryPanelsProbe};
            return {
                columns: new Set(rects.map((rect) => Math.round(rect.left))).size,
                rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
                widths: rects.map((rect) => rect.width),
                primaryPanelWidths: collapsedPrimaryPanels.map(
                    (panel) => panel.width
                ),
                primaryPanelHeights: collapsedPrimaryPanels.map(
                    (panel) => panel.height
                ),
                primaryPanelSummariesFit: collapsedPrimaryPanels.map(
                    (panel) => panel.summaryFits
                ),
                documentOverflow: document.documentElement.scrollWidth - window.innerWidth
            };
        })()`);
        assert.equal(narrowMobile.columns, 1);
        assert.equal(narrowMobile.rows, 3);
        assert.ok(
            Math.max(...narrowMobile.widths) -
                Math.min(...narrowMobile.widths) < 1
        );
        assert.ok(
            Math.max(...narrowMobile.primaryPanelWidths) -
                Math.min(...narrowMobile.primaryPanelWidths) < 0.1
        );
        assert.ok(
            Math.max(...narrowMobile.primaryPanelHeights) -
                Math.min(...narrowMobile.primaryPanelHeights) < 0.1
        );
        assert.ok(narrowMobile.primaryPanelSummariesFit.every(Boolean));
        assert.ok(narrowMobile.documentOverflow <= 1);

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
            offerCount: document.querySelectorAll('.offer-card').length,
            hoursBasisValues: [...document.querySelectorAll(
                '[data-hours-basis-control]'
            )].map((control) => control.value),
            cardsDefaultCollapsed: [...document.querySelectorAll('.offer-card')].every(
                (card) => card.querySelector('.offer-card__content').hidden
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
                offerCount: document.querySelectorAll('.offer-card').length,
                mountedOfferControls: document.querySelectorAll(
                    '.offer-card__content input, .offer-card__content select'
                ).length,
                scheduleMatrices: document.querySelectorAll(
                    '.offer-card .schedule-matrix'
                ).length,
                taxExplanationCount: document.querySelectorAll(
                    '#taxExplanationList .tax-explanation'
                ).length,
                taxBodyCount: document.querySelectorAll(
                    '#taxExplanationList .tax-explanation__body'
                ).length,
                totalDomNodes: document.querySelectorAll('*').length
            };
            const firstCard = document.querySelector('.offer-card');
            const toggle = firstCard.querySelector(
                '[data-action="toggle-offer-card"]'
            );
            toggle.click();
            const expanded = {
                scheduleWeeks: firstCard.querySelector(
                    '.schedule-matrix'
                ).tBodies.length,
                mountedOfferControls: firstCard.querySelectorAll(
                    '.offer-card__content input, .offer-card__content select'
                ).length
            };
            toggle.click();
            const collapsedAgain = {
                mountedOfferControls: firstCard.querySelectorAll(
                    '.offer-card__content input, .offer-card__content select'
                ).length,
                scheduleMatrices: firstCard.querySelectorAll(
                    '.schedule-matrix'
                ).length
            };
            document.querySelector('#addOfferButton').click();
            const addAtLimit = {
                offerCount: document.querySelectorAll('.offer-card').length,
                status: document.querySelector('#saveStatus').textContent.trim()
            };
            firstCard.querySelector('[data-action="duplicate-offer"]').click();
            const duplicateAtLimit = {
                offerCount: document.querySelectorAll('.offer-card').length,
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
                offerCount: document.querySelectorAll('.offer-card').length,
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
        assert.equal(scaleLimit.initial.taxExplanationCount, 100);
        assert.equal(scaleLimit.initial.taxBodyCount, 0);
        assert.ok(scaleLimit.initial.totalDomNodes < 5000);
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
            "document.querySelectorAll('.offer-card').length === 4",
            "The scale-limit fixture did not reset to the example state"
        );

        await evaluate(client, "document.querySelector('#addOfferButton').click()");
        await delay(300);
        server.setSeedFilesUnavailable(true);
        await client.send("Page.reload");
        await waitFor(
            client,
            `document.querySelectorAll('.offer-card').length === 5 &&
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
                offerCount: document.querySelectorAll('.offer-card').length,
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
            const offerCountBefore = document.querySelectorAll('.offer-card').length;
            document.querySelector('#addOfferButton').click();
            return {
                ariaBusy: application.getAttribute('aria-busy'),
                hasInertAttribute: application.hasAttribute('inert'),
                inertProperty: application.inert,
                status: document.querySelector('#saveStatus').textContent.trim(),
                offerCountBefore,
                offerCountAfter: document.querySelectorAll('.offer-card').length
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

        console.log("offer_compare browser smoke tests passed");
    } catch (error) {
        const diagnostics = browser.browserDiagnostics();
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
