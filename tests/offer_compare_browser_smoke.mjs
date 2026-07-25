import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(testsDirectory, "..");
const browserCandidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
];

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function existingBrowser() {
    for (const candidate of browserCandidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // Try the next installed browser path.
        }
    }
    throw new Error("Microsoft Edge was not found");
}

function contentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return {
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml"
    }[extension] || "application/octet-stream";
}

async function startPublicExampleServer() {
    let seedFilesUnavailable = false;
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url, "http://127.0.0.1");
            const pathname = decodeURIComponent(requestUrl.pathname);

            if (pathname === "/tools/data/offer_compare_private.json") {
                response.writeHead(seedFilesUnavailable ? 503 : 404);
                response.end();
                return;
            }

            if (seedFilesUnavailable &&
                    pathname === "/tools/data/offer_compare_examples.json") {
                response.writeHead(503);
                response.end();
                return;
            }

            const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
            const filePath = path.resolve(workspace, relativePath);
            const workspacePrefix = workspace.endsWith(path.sep)
                ? workspace
                : workspace + path.sep;

            if (filePath !== workspace && !filePath.startsWith(workspacePrefix)) {
                response.writeHead(403);
                response.end();
                return;
            }

            const body = await readFile(filePath);
            response.writeHead(200, {
                "Cache-Control": "no-store",
                "Content-Type": contentType(filePath)
            });
            response.end(body);
        } catch {
            response.writeHead(404);
            response.end();
        }
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    server.setSeedFilesUnavailable = (value) => {
        seedFilesUnavailable = Boolean(value);
    };
    return server;
}

async function waitForDevTools(profileDirectory, browserProcess) {
    const activePortFile = path.join(profileDirectory, "DevToolsActivePort");

    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (browserProcess.exitCode !== null) {
            throw new Error("Browser exited before DevTools became available");
        }
        try {
            const [port] = (await readFile(activePortFile, "utf8")).trim().split(/\r?\n/);
            if (port) {
                return Number(port);
            }
        } catch {
            // Edge creates the file after its browser process is ready.
        }
        await delay(100);
    }
    throw new Error("Timed out waiting for the DevTools port");
}

class CdpClient {
    constructor(webSocketUrl) {
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        this.socket = new WebSocket(webSocketUrl);
    }

    async open() {
        await new Promise((resolve, reject) => {
            this.socket.addEventListener("open", resolve, { once: true });
            this.socket.addEventListener("error", reject, { once: true });
        });
        this.socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);

            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) {
                    reject(new Error(message.error.message));
                } else {
                    resolve(message.result);
                }
                return;
            }

            const callbacks = this.listeners.get(message.method) || [];
            callbacks.forEach((callback) => callback(message.params));
        });
    }

    on(method, callback) {
        const callbacks = this.listeners.get(method) || [];
        callbacks.push(callback);
        this.listeners.set(method, callbacks);
    }

    send(method, params = {}) {
        const id = this.nextId;
        this.nextId += 1;
        this.socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
    }

    close() {
        this.socket.close();
    }
}

async function evaluate(client, expression) {
    const response = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
    });

    if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
    }
    return response.result.value;
}

async function waitFor(client, expression, message) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(client, expression)) {
            return;
        }
        await delay(100);
    }
    throw new Error(message);
}

async function run() {
    const server = await startPublicExampleServer();
    const serverAddress = server.address();
    const pageUrl = `http://127.0.0.1:${serverAddress.port}/tools/offer_compare.html`;
    const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "codex-offer-edge-qa-"));
    const browserPath = await existingBrowser();
    const browserProcess = spawn(browserPath, [
        "--headless=new",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-gpu-compositing",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--no-first-run",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDirectory}`,
        "--window-size=1440,1000",
        "about:blank"
    ], {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
    });
    let browserErrors = "";
    let client;

    browserProcess.stderr.setEncoding("utf8");
    browserProcess.stderr.on("data", (chunk) => {
        browserErrors = (browserErrors + chunk).slice(-4000);
    });

    try {
        const debuggingPort = await waitForDevTools(profileDirectory, browserProcess);
        const target = await fetch(
            `http://127.0.0.1:${debuggingPort}/json/new?about:blank`,
            { method: "PUT" }
        ).then((response) => response.json());

        client = new CdpClient(target.webSocketDebuggerUrl);
        await client.open();

        const runtimeErrors = [];
        client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
            runtimeErrors.push(exceptionDetails.text || "Unhandled browser exception");
        });
        client.on("Log.entryAdded", ({ entry }) => {
            const expectedSeedFileMiss = entry.url && (
                entry.url.endsWith("/tools/data/offer_compare_private.json") ||
                entry.url.endsWith("/tools/data/offer_compare_examples.json")
            );
            if (entry.level === "error" && !expectedSeedFileMiss) {
                runtimeErrors.push(entry.text);
            }
        });

        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Log.enable");
        await client.send("Emulation.setDeviceMetricsOverride", {
            width: 1440,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false
        });
        await client.send("Page.navigate", { url: pageUrl });
        await waitFor(
            client,
            "document.readyState === 'complete' && document.querySelectorAll('.offer-card').length === 4",
            "The public example Offers did not render"
        );

        const desktop = await evaluate(client, `(() => {
            const settings = document.querySelector('#settingsPanel');
            const primaryPanels = [
                ['我的计算设置', settings],
                ['Offer 信息', document.querySelector('#offerEditorPanel')],
                ['对比结果', document.querySelector('#resultPanel')],
                ['计算方法', document.querySelector(
                    '[data-testid="calculation-method"]'
                )]
            ];
            const primaryPanelOpenStates = primaryPanels.map(([, panel]) => panel.open);
            primaryPanels.forEach(([, panel]) => {
                panel.open = false;
            });
            const collapsedPrimaryPanels = primaryPanels.map(([name, panel]) => {
                const summary = panel.querySelector(':scope > summary');
                const heading = summary.querySelector('h2 > span:first-child');
                const eyebrow = heading.querySelector('.eyebrow');
                const panelRect = panel.getBoundingClientRect();
                const summaryRect = summary.getBoundingClientRect();
                const summaryStyle = getComputedStyle(summary);
                const markerStyle = getComputedStyle(summary, '::after');
                return {
                    name,
                    width: panelRect.width,
                    height: panelRect.height,
                    summaryHeight: summaryRect.height,
                    minHeight: summaryStyle.minHeight,
                    padding: summaryStyle.padding,
                    gap: summaryStyle.gap,
                    titleFontSize: getComputedStyle(summary.querySelector('h2')).fontSize,
                    headingGap: getComputedStyle(heading).gap,
                    eyebrowFontSize: getComputedStyle(eyebrow).fontSize,
                    markerWidth: markerStyle.width,
                    markerHeight: markerStyle.height,
                    markerBorderRightWidth: markerStyle.borderRightWidth,
                    markerBorderBottomWidth: markerStyle.borderBottomWidth,
                    summaryFits: summary.scrollWidth <= summary.clientWidth + 1
                };
            });
            primaryPanels.forEach(([, panel], index) => {
                panel.open = primaryPanelOpenStates[index];
            });
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
            const typography = (element) => {
                const style = getComputedStyle(element);
                return {
                    fontSize: style.fontSize,
                    lineHeight: style.lineHeight,
                    fontWeight: style.fontWeight,
                    fontFamily: style.fontFamily
                };
            };
            const cardPresentation = (card) => {
                const cardStyle = getComputedStyle(card);
                const header = card.querySelector('.offer-card__header');
                const headerStyle = getComputedStyle(header);
                const heading = card.querySelector('.offer-card__identity h3');
                const headingStyle = getComputedStyle(heading);
                const title = card.querySelector('.offer-card__title-link');
                const titleStyle = getComputedStyle(title);
                const subtitle = card.querySelector('[data-card-subtitle]');
                const subtitleStyle = getComputedStyle(subtitle);
                const actions = card.querySelector('.offer-card__actions');
                const actionsStyle = getComputedStyle(actions);
                const headerRect = header.getBoundingClientRect();
                const actionsRect = actions.getBoundingClientRect();

                return {
                    card: {
                        paddingTop: cardStyle.paddingTop,
                        paddingRight: cardStyle.paddingRight,
                        paddingBottom: cardStyle.paddingBottom,
                        paddingLeft: cardStyle.paddingLeft,
                        rowGap: cardStyle.rowGap,
                        columnGap: cardStyle.columnGap
                    },
                    header: {
                        alignItems: headerStyle.alignItems,
                        borderBottomWidth: headerStyle.borderBottomWidth,
                        borderBottomStyle: headerStyle.borderBottomStyle,
                        borderBottomColor: headerStyle.borderBottomColor,
                        paddingBottom: headerStyle.paddingBottom,
                        rowGap: headerStyle.rowGap,
                        columnGap: headerStyle.columnGap,
                        height: headerRect.height
                    },
                    heading: {
                        marginTop: headingStyle.marginTop,
                        marginRight: headingStyle.marginRight,
                        marginBottom: headingStyle.marginBottom,
                        marginLeft: headingStyle.marginLeft
                    },
                    title: {
                        display: titleStyle.display,
                        width: titleStyle.width,
                        maxWidth: titleStyle.maxWidth,
                        marginTop: titleStyle.marginTop,
                        marginRight: titleStyle.marginRight,
                        marginBottom: titleStyle.marginBottom,
                        marginLeft: titleStyle.marginLeft,
                        whiteSpace: titleStyle.whiteSpace,
                        overflow: titleStyle.overflow,
                        textOverflow: titleStyle.textOverflow,
                        overflowWrap: titleStyle.overflowWrap
                    },
                    subtitle: {
                        display: subtitleStyle.display,
                        marginTop: subtitleStyle.marginTop,
                        marginRight: subtitleStyle.marginRight,
                        marginBottom: subtitleStyle.marginBottom,
                        marginLeft: subtitleStyle.marginLeft,
                        whiteSpace: subtitleStyle.whiteSpace,
                        overflow: subtitleStyle.overflow,
                        textOverflow: subtitleStyle.textOverflow,
                        overflowWrap: subtitleStyle.overflowWrap
                    },
                    actions: {
                        alignSelf: actionsStyle.alignSelf,
                        topOffset: Number(
                            (actionsRect.top - headerRect.top).toFixed(3)
                        )
                    }
                };
            };
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
            const offerOverrideFields = offerCards.map((card) => ({
                social: card.querySelector('[data-path="socialInsuranceRate"]'),
                lunch: card.querySelector('[data-path="schedule.lunchBreakHours"]'),
                dinner: card.querySelector('[data-path="schedule.dinnerBreakHours"]')
            }));
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
            firstScheduleDetails.open = false;
            firstCardToggle.click();
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
                taxExplanationBodiesDeduplicated:
                    taxExplanations.every((details) => {
                        const body = details.querySelector('.tax-explanation__body');
                        return body &&
                            !body.querySelector(
                                '.tax-explanation__heading, ' +
                                '.tax-explanation__total, ' +
                                '.tax-explanation__offer-link'
                            );
                    }),
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
                offerOverrideFieldsValid: offerOverrideFields.every((fields) =>
                    fields.social &&
                    fields.social.value === '' &&
                    fields.social.dataset.nullable === 'true' &&
                    fields.social.placeholder === '默认 10.5%' &&
                    fields.social.getAttribute('aria-description').includes('留空继承') &&
                    fields.lunch &&
                    fields.lunch.value === '' &&
                    fields.lunch.dataset.nullable === 'true' &&
                    fields.lunch.placeholder === '默认 2' &&
                    fields.lunch.getAttribute('aria-description').includes('留空继承') &&
                    fields.lunch.closest('.schedule-primary-controls') &&
                    fields.dinner &&
                    fields.dinner.value === '' &&
                    fields.dinner.dataset.nullable === 'true' &&
                    fields.dinner.placeholder === '默认 1' &&
                    fields.dinner.getAttribute('aria-description').includes('留空继承') &&
                    fields.dinner.closest('.schedule-primary-controls')
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
                scheduleSummary: document.querySelector(
                    \`.offer-card[data-offer-id="\${firstOfferId}"] .schedule-details > summary\`
                ).textContent.trim(),
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
        assert.equal(desktop.taxExplanationBodiesDeduplicated, true);
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
        assert.equal(exportedJson.matchesCoreFormat, true);

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
                        '.offer-card [data-path="company"]'
                    ).value,
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
                        localStorage.getItem('starki.offerCompare.v2') === null &&
                        localStorage.getItem('starki.offerCompare.v1') === null
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
        assert.equal(resetToExample.afterReset.firstCompany, "A公司");
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

        const dynamicSocialPlaceholder = await evaluate(client, `(() => {
            const defaultRate = document.querySelector('#socialSecurityRate');
            const offerRate = document.querySelector(
                '.offer-card [data-path="socialInsuranceRate"]'
            );

            defaultRate.value = '11';
            defaultRate.dispatchEvent(new Event('input', { bubbles: true }));
            const updated = offerRate.placeholder;
            defaultRate.value = '10.5';
            defaultRate.dispatchEvent(new Event('input', { bubbles: true }));
            return {
                updated,
                restored: offerRate.placeholder
            };
        })()`);
        assert.equal(dynamicSocialPlaceholder.updated, "默认 11%");
        assert.equal(dynamicSocialPlaceholder.restored, "默认 10.5%");

        const sortIsolation = await evaluate(client, `(() => {
            const cardOrderBefore = [...document.querySelectorAll('.offer-card')]
                .map((card) => card.dataset.offerId);
            const metric = document.querySelector('#sortMetric');
            const direction = document.querySelector('#sortDirection');
            const resultOrder = () => [...document.querySelectorAll(
                '#comparisonTableBody tr[data-offer-id]'
            )].map((row) => row.dataset.offerId);
            const explanationOrder = () => [...document.querySelectorAll(
                '#taxExplanationList .tax-explanation[data-offer-id]'
            )].map((details) => details.dataset.offerId);

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
            return {
                cardOrderBefore,
                cardOrderAfterCompanySort,
                ascendingResultOrder,
                ascendingExplanationOrder,
                descendingResultOrder,
                descendingExplanationOrder
            };
        })()`);
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
            const firstOfferId = document.querySelector('.offer-card').dataset.offerId;
            select.value = 'net';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return {
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
            return {
                presenceState,
                finalSettingsValue: settingsSelect.value,
                finalResultValue: resultSelect.value
            };
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
                .find((card) => card.dataset.offerId !== sourceId &&
                    card.querySelector('[data-path="company"]').value === 'A公司');
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
            const primaryPanels = [
                ['我的计算设置', document.querySelector('#settingsPanel')],
                ['Offer 信息', document.querySelector('#offerEditorPanel')],
                ['对比结果', document.querySelector('#resultPanel')],
                ['计算方法', document.querySelector(
                    '[data-testid="calculation-method"]'
                )]
            ];
            const primaryPanelOpenStates = primaryPanels.map(([, panel]) => panel.open);
            primaryPanels.forEach(([, panel]) => {
                panel.open = false;
            });
            const collapsedPrimaryPanels = primaryPanels.map(([name, panel]) => {
                const summary = panel.querySelector(':scope > summary');
                const heading = summary.querySelector('h2 > span:first-child');
                const eyebrow = heading.querySelector('.eyebrow');
                const panelRect = panel.getBoundingClientRect();
                const summaryRect = summary.getBoundingClientRect();
                const summaryStyle = getComputedStyle(summary);
                const markerStyle = getComputedStyle(summary, '::after');
                return {
                    name,
                    width: panelRect.width,
                    height: panelRect.height,
                    summaryHeight: summaryRect.height,
                    minHeight: summaryStyle.minHeight,
                    padding: summaryStyle.padding,
                    gap: summaryStyle.gap,
                    titleFontSize: getComputedStyle(summary.querySelector('h2')).fontSize,
                    headingGap: getComputedStyle(heading).gap,
                    eyebrowFontSize: getComputedStyle(eyebrow).fontSize,
                    markerWidth: markerStyle.width,
                    markerHeight: markerStyle.height,
                    markerBorderRightWidth: markerStyle.borderRightWidth,
                    markerBorderBottomWidth: markerStyle.borderBottomWidth,
                    summaryFits: summary.scrollWidth <= summary.clientWidth + 1
                };
            });
            primaryPanels.forEach(([, panel], index) => {
                panel.open = primaryPanelOpenStates[index];
            });
            document.querySelector('#settingsPanel').open = true;
            document.querySelector('#offerEditorPanel').open = true;
            const settingsFields = [...document.querySelectorAll('#settingsForm .field')];
            const settingsRects = settingsFields.map((field) => field.getBoundingClientRect());
            const typography = (element) => {
                const style = getComputedStyle(element);
                return {
                    fontSize: style.fontSize,
                    lineHeight: style.lineHeight,
                    fontWeight: style.fontWeight,
                    fontFamily: style.fontFamily
                };
            };
            const cardPresentation = (card) => {
                const cardStyle = getComputedStyle(card);
                const header = card.querySelector('.offer-card__header');
                const headerStyle = getComputedStyle(header);
                const heading = card.querySelector('.offer-card__identity h3');
                const headingStyle = getComputedStyle(heading);
                const title = card.querySelector('.offer-card__title-link');
                const titleStyle = getComputedStyle(title);
                const subtitle = card.querySelector('[data-card-subtitle]');
                const subtitleStyle = getComputedStyle(subtitle);
                const actions = card.querySelector('.offer-card__actions');
                const actionsStyle = getComputedStyle(actions);
                const headerRect = header.getBoundingClientRect();
                const actionsRect = actions.getBoundingClientRect();

                return {
                    card: {
                        paddingTop: cardStyle.paddingTop,
                        paddingRight: cardStyle.paddingRight,
                        paddingBottom: cardStyle.paddingBottom,
                        paddingLeft: cardStyle.paddingLeft,
                        rowGap: cardStyle.rowGap,
                        columnGap: cardStyle.columnGap
                    },
                    header: {
                        alignItems: headerStyle.alignItems,
                        borderBottomWidth: headerStyle.borderBottomWidth,
                        borderBottomStyle: headerStyle.borderBottomStyle,
                        borderBottomColor: headerStyle.borderBottomColor,
                        paddingBottom: headerStyle.paddingBottom,
                        rowGap: headerStyle.rowGap,
                        columnGap: headerStyle.columnGap,
                        height: headerRect.height
                    },
                    heading: {
                        marginTop: headingStyle.marginTop,
                        marginRight: headingStyle.marginRight,
                        marginBottom: headingStyle.marginBottom,
                        marginLeft: headingStyle.marginLeft
                    },
                    title: {
                        display: titleStyle.display,
                        width: titleStyle.width,
                        maxWidth: titleStyle.maxWidth,
                        marginTop: titleStyle.marginTop,
                        marginRight: titleStyle.marginRight,
                        marginBottom: titleStyle.marginBottom,
                        marginLeft: titleStyle.marginLeft,
                        whiteSpace: titleStyle.whiteSpace,
                        overflow: titleStyle.overflow,
                        textOverflow: titleStyle.textOverflow,
                        overflowWrap: titleStyle.overflowWrap
                    },
                    subtitle: {
                        display: subtitleStyle.display,
                        marginTop: subtitleStyle.marginTop,
                        marginRight: subtitleStyle.marginRight,
                        marginBottom: subtitleStyle.marginBottom,
                        marginLeft: subtitleStyle.marginLeft,
                        whiteSpace: subtitleStyle.whiteSpace,
                        overflow: subtitleStyle.overflow,
                        textOverflow: subtitleStyle.textOverflow,
                        overflowWrap: subtitleStyle.overflowWrap
                    },
                    actions: {
                        alignSelf: actionsStyle.alignSelf,
                        topOffset: Number(
                            (actionsRect.top - headerRect.top).toFixed(3)
                        )
                    }
                };
            };
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
            const primaryPanels = [
                document.querySelector('#settingsPanel'),
                document.querySelector('#offerEditorPanel'),
                document.querySelector('#resultPanel'),
                document.querySelector('[data-testid="calculation-method"]')
            ];
            const primaryPanelOpenStates = primaryPanels.map((panel) => panel.open);
            primaryPanels.forEach((panel) => {
                panel.open = false;
            });
            const primaryPanelRects = primaryPanels.map((panel) =>
                panel.getBoundingClientRect()
            );
            const primaryPanelSummariesFit = primaryPanels.map((panel) => {
                const summary = panel.querySelector(':scope > summary');
                return summary.scrollWidth <= summary.clientWidth + 1;
            });
            primaryPanels.forEach((panel, index) => {
                panel.open = primaryPanelOpenStates[index];
            });
            return {
                columns: new Set(rects.map((rect) => Math.round(rect.left))).size,
                rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
                widths: rects.map((rect) => rect.width),
                primaryPanelWidths: primaryPanelRects.map((rect) => rect.width),
                primaryPanelHeights: primaryPanelRects.map((rect) => rect.height),
                primaryPanelSummariesFit,
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
            localStorage.removeItem('starki.offerCompare.v1');
        })()`);
        await client.send("Page.reload");
        await waitFor(
            client,
            `document.querySelector('#dataSourceLabel').textContent.trim() === '脱敏示例' &&
                document.querySelector('#saveStatus').textContent.includes('旧保存已损坏')`,
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
        assert.match(recovered.status, /旧保存已损坏/);
        assert.equal(recovered.offerCount, 4);
        assert.deepStrictEqual(recovered.hoursBasisValues, ["presence", "presence"]);
        assert.equal(recovered.cardsDefaultCollapsed, true);

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
                currentStorage: localStorage.getItem('starki.offerCompare.v2'),
                legacyStorage: localStorage.getItem('starki.offerCompare.v1')
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
        assert.equal(emptySourceReset.legacyStorage, null);
        server.setSeedFilesUnavailable(false);
        assert.deepStrictEqual(runtimeErrors, []);

        console.log("offer_compare browser smoke tests passed");
    } catch (error) {
        if (browserErrors) {
            error.message += `\nEdge diagnostics:\n${browserErrors}`;
        }
        throw error;
    } finally {
        if (client) {
            client.close();
        }
        browserProcess.kill();
        await new Promise((resolve) => {
            if (browserProcess.exitCode !== null) {
                resolve();
                return;
            }
            browserProcess.once("exit", resolve);
            setTimeout(resolve, 2000);
        });
        await new Promise((resolve) => server.close(resolve));
        await rm(profileDirectory, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
