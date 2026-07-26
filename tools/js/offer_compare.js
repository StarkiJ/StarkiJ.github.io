(function () {
    "use strict";

    var core = window.OfferCompareCore;
    var dataLoader = window.OfferCompareData;
    var model = window.OfferCompareModel;
    var selectors = window.OfferCompareSelectors;
    var storageKey = "starki.offerCompare.v2";
    var weekdayNames = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    var moneyFormatter = new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        maximumFractionDigits: 0
    });
    var preciseMoneyFormatter = new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        maximumFractionDigits: 2
    });
    var numberFormatter = new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 1
    });
    var saveTimer = 0;
    var jumpHighlightTimer = 0;
    var uiState = {
        collapsedOfferIds: Object.create(null),
        expandedScheduleIds: Object.create(null),
        expandedTaxExplanationIds: Object.create(null),
        sortKey: "afterTaxHourly",
        sortDirection: "desc"
    };
    var state;
    var latestCalculation;
    var seedState;
    var seedSource = { kind: "empty", label: "空白数据", file: "" };
    var seedWarnings = [];
    var storageWarning = "";
    var activeDataOrigin = "source";
    var applicationReady = false;

    var elements = {
        application: document.getElementById("offerComparator"),
        settingsPanel: document.getElementById("settingsPanel"),
        settingsSummaryMeta: document.getElementById("settingsSummaryMeta"),
        settingsForm: document.getElementById("settingsForm"),
        taxYear: document.getElementById("taxYear"),
        socialSecurityRate: document.getElementById("socialSecurityRate"),
        annualSpecialDeduction: document.getElementById("annualSpecialDeduction"),
        hoursBasisControls: document.querySelectorAll("[data-hours-basis-control]"),
        assumptionPanel: document.getElementById("assumptionPanel"),
        assumptionSummary: document.getElementById("assumptionSummary"),
        offerEditorPanel: document.getElementById("offerEditorPanel"),
        offerCountLabel: document.getElementById("offerCountLabel"),
        dataSourceLabel: document.getElementById("dataSourceLabel"),
        offerList: document.getElementById("offerList"),
        addOfferButton: document.getElementById("addOfferButton"),
        resetOffersButton: document.getElementById("resetOffersButton"),
        importOffersButton: document.getElementById("importOffersButton"),
        exportOffersButton: document.getElementById("exportOffersButton"),
        importOffersInput: document.getElementById("importOffersInput"),
        saveStatus: document.getElementById("saveStatus"),
        resultPanel: document.getElementById("resultPanel"),
        resultSummary: document.getElementById("resultSummary"),
        resultStatus: document.getElementById("resultStatus"),
        sortMetric: document.getElementById("sortMetric"),
        sortDirection: document.getElementById("sortDirection"),
        comparisonTableBody: document.getElementById("comparisonTableBody"),
        hoursColumnHeading: document.getElementById("hoursColumnHeading"),
        taxExplanations: document.getElementById("taxExplanations"),
        taxExplanationList: document.getElementById("taxExplanationList")
    };

    elements.application.setAttribute("aria-busy", "true");
    elements.application.setAttribute("inert", "");
    uiState.sortKey = elements.sortMetric.value;
    uiState.sortDirection = elements.sortDirection.value;

    if (!core || !model || !selectors) {
        elements.application.setAttribute("aria-busy", "false");
        elements.application.removeAttribute("inert");
        elements.resultStatus.textContent = "应用模块加载失败，请刷新页面后重试。";
        return;
    }

    function finishInitialization() {
        applicationReady = true;
        elements.application.setAttribute("aria-busy", "false");
        elements.application.removeAttribute("inert");
    }

    function whenApplicationReady(handler) {
        return function (event) {
            if (!applicationReady || !state) {
                if (event && typeof event.preventDefault === "function") {
                    event.preventDefault();
                }
                return;
            }
            return handler.apply(this, arguments);
        };
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createElement(tagName, className, textContent) {
        var element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }
        if (textContent !== undefined) {
            element.textContent = textContent;
        }
        return element;
    }

    function createId(prefix, suffix) {
        var source = String(prefix) + "-" + String(suffix);
        var readable = source.replace(/[^a-zA-Z0-9_-]+/g, "-");
        var hash = 2166136261;
        var index;

        for (index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return readable + "-" + (hash >>> 0).toString(36);
    }

    function createUniqueOfferId() {
        var randomPart;

        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            randomPart = window.crypto.randomUUID();
        } else {
            randomPart = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        }
        return "offer-" + randomPart;
    }

    function parseNumericInput(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function formatMoney(value) {
        return moneyFormatter.format(Number.isFinite(value) ? value : 0);
    }

    function formatPreciseMoney(value) {
        return preciseMoneyFormatter.format(Number.isFinite(value) ? value : 0);
    }

    function formatRate(value) {
        return numberFormatter.format((Number.isFinite(value) ? value : 0) * 100) + "%";
    }

    function ratePercentValue(value) {
        return Number.isFinite(value)
            ? Number((value * 100).toFixed(3))
            : "";
    }

    function formatHours(value) {
        return numberFormatter.format(Number.isFinite(value) ? value : 0) + " 小时";
    }

    function formatHourly(value) {
        return formatMoney(Number.isFinite(value) ? value : 0) + "/小时";
    }

    function weeklyHoursSummaryLabel(value) {
        return value === "net" ? "周净" : "周在岗";
    }

    function setByPath(target, path, value) {
        var parts = path.split(".");
        var current = target;
        var index;

        for (index = 0; index < parts.length - 1; index += 1) {
            if (!current[parts[index]] || typeof current[parts[index]] !== "object") {
                current[parts[index]] = {};
            }
            current = current[parts[index]];
        }
        current[parts[parts.length - 1]] = value;
    }

    function getOfferById(offerId) {
        return state.offers.find(function (offer) {
            return offer.id === offerId;
        });
    }

    function replaceOffer(updatedOffer) {
        var index;

        if (!updatedOffer) {
            return false;
        }
        index = state.offers.findIndex(function (offer) {
            return offer.id === updatedOffer.id;
        });
        if (index < 0) {
            return false;
        }
        state.offers[index] = updatedOffer;
        return true;
    }

    function calculatedOfferById(offerId) {
        return selectors.findResultByOfferId(latestCalculation, offerId);
    }

    function normalizedOfferById(offerId) {
        var offers = latestCalculation && latestCalculation.state
            ? latestCalculation.state.offers
            : [];

        return offers.find(function (offer) {
            return offer.id === offerId;
        }) || null;
    }

    function loadStoredState() {
        try {
            var stored = window.localStorage.getItem(storageKey);
            if (!stored) {
                return null;
            }
            var parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== "object" ||
                    !Array.isArray(parsed.offers)) {
                throw new Error("浏览器保存缺少 offers 数组");
            }
            var parsedState = core.parseState(parsed);
            if (parsedState.validation.errors.length) {
                throw new Error(parsedState.validation.errors[0].message);
            }
            return parsedState.state;
        } catch (error) {
            storageWarning =
                "浏览器保存不可用或版本不兼容，已回退到可用来源。";
        }
        return null;
    }

    function updateDataSourceLabel() {
        var label = activeDataOrigin === "browser" ? "浏览器数据" : seedSource.label;
        var offerCount = seedState && Array.isArray(seedState.offers)
            ? seedState.offers.length
            : 0;
        var hasSourceData = seedSource.kind !== "empty";
        var resetLabel;
        var resetDescription;

        elements.dataSourceLabel.textContent = label;
        elements.dataSourceLabel.dataset.source = activeDataOrigin === "browser"
            ? "browser"
            : seedSource.kind;
        elements.dataSourceLabel.title = activeDataOrigin === "browser"
            ? "当前使用浏览器自动保存；重置目标为本次打开页面时载入的“" +
                seedSource.label + "”。"
            : "当前使用“" + seedSource.label + "”。";

        if (!hasSourceData) {
            resetLabel = "清空数据";
            resetDescription =
                "删除当前浏览器保存的全部 Offer 和计算设置。当前没有可恢复的 JSON 来源；操作后 Offer 列表为空，计算设置恢复默认值。";
        } else {
            resetLabel = seedSource.kind === "private"
                ? "重置为私有数据"
                : seedSource.kind === "example"
                    ? "重置为示例数据"
                    : "重置数据";
            resetDescription =
                "删除当前浏览器保存的全部 Offer 和计算设置，恢复为本次打开页面时载入的“" +
                seedSource.label + "”快照（" + offerCount +
                " 个 Offer）；不会重新读取或修改 JSON 文件。";
        }

        elements.resetOffersButton.textContent = resetLabel;
        elements.resetOffersButton.title = resetDescription;
        elements.resetOffersButton.disabled = false;
    }

    function initialSaveStatus(hasStoredState) {
        var storageWarningText = storageWarning ? storageWarning + " " : "";
        var warningText;

        if (hasStoredState) {
            return storageWarningText +
                "已载入此浏览器的自动保存；更改不会写回 JSON 或上传到 GitHub。";
        }
        warningText = storageWarningText || (
            seedSource.kind === "empty" && seedWarnings.length
                ? seedWarnings[0] + " "
                : ""
        );
        if (seedSource.kind === "private") {
            return warningText + "已从本机私有 JSON 载入；网页更改只会自动保存到此浏览器。";
        }
        if (seedSource.kind === "example") {
            return warningText + "未载入本机私有 JSON，正在使用脱敏示例；更改只保存在此浏览器。";
        }
        return warningText + "数据文件不可用，已使用空白数据；更改只保存在此浏览器。";
    }

    function saveStateSoon() {
        window.clearTimeout(saveTimer);

        if (latestCalculation && latestCalculation.validation.errors.length) {
            elements.saveStatus.textContent =
                "存在未通过校验的输入；无效更改暂未自动保存。";
            return;
        }

        activeDataOrigin = "browser";
        updateDataSourceLabel();
        saveTimer = window.setTimeout(function () {
            try {
                window.localStorage.setItem(
                    storageKey,
                    JSON.stringify(latestCalculation.state)
                );
                elements.saveStatus.textContent = "已保存到当前浏览器。";
            } catch (error) {
                elements.saveStatus.textContent = "浏览器未允许本地保存；本次计算仍然有效。";
            }
        }, 180);
    }

    function updateSettingsSummary() {
        var settings = latestCalculation
            ? latestCalculation.state.settings
            : state.settings;

        elements.settingsSummaryMeta.textContent =
            settings.year + " · 默认社保 " +
            Number((settings.socialInsuranceRate * 100).toFixed(3)) + "%";
    }

    function defaultSocialInsurancePlaceholder() {
        var settings = latestCalculation
            ? latestCalculation.state.settings
            : state.settings;

        return "默认 " +
            Number((settings.socialInsuranceRate * 100).toFixed(3)) + "%";
    }

    function updateOfferDefaultPlaceholders() {
        elements.offerList.querySelectorAll(
            '[data-path="socialInsuranceRate"]'
        ).forEach(function (input) {
            input.placeholder = defaultSocialInsurancePlaceholder();
        });
    }

    function renderSettings() {
        elements.taxYear.value = state.settings.year;
        elements.socialSecurityRate.value = ratePercentValue(
            state.settings.socialInsuranceRate
        );
        elements.annualSpecialDeduction.value = state.settings.specialAdditionalDeduction;
        syncHoursBasisControls();
        updateSettingsSummary();
    }

    function syncHoursBasisControls() {
        elements.hoursBasisControls.forEach(function (control) {
            control.value = state.settings.primaryHoursBasis;
        });
    }

    function renderResultControls() {
        syncHoursBasisControls();
    }

    function createInputField(offer, options) {
        var wrapperClass = "field" +
            (options.className ? " " + options.className : "");
        var wrapper = createElement("div", wrapperClass);
        var inputId = createId(offer.id, options.path || options.name || options.label);
        var label = createElement("label", "", options.label);
        var labelRow = createElement("div", "field-label-row");
        var input;

        label.htmlFor = inputId;
        labelRow.appendChild(label);
        if (options.hint) {
            var help = createElement("button", "field-help", "?");
            help.type = "button";
            help.dataset.tooltip = options.hint;
            help.setAttribute("aria-label", options.label + "说明：" + options.hint);
            labelRow.appendChild(help);
        }
        wrapper.appendChild(labelRow);

        if (options.options) {
            input = document.createElement("select");
            options.options.forEach(function (option) {
                var optionElement = document.createElement("option");
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                input.appendChild(optionElement);
            });
        } else {
            input = document.createElement("input");
            input.type = options.type || "text";
            if (options.min !== undefined) {
                input.min = options.min;
            }
            if (options.max !== undefined) {
                input.max = options.max;
            }
            if (options.step !== undefined) {
                input.step = options.step;
            }
            if (input.type === "number") {
                input.inputMode = "decimal";
            }
        }

        input.id = inputId;
        input.value = options.value === null || options.value === undefined ? "" : options.value;
        input.dataset.offerId = offer.id;
        if (options.path) {
            input.dataset.path = options.path;
        }
        if (options.action) {
            input.dataset.action = options.action;
        }
        if (options.percent) {
            input.dataset.percent = "true";
        }
        if (options.nullable) {
            input.dataset.nullable = "true";
        }
        if (options.hint) {
            input.setAttribute("aria-description", options.hint);
        }
        if (options.placeholder) {
            input.placeholder = options.placeholder;
        }
        wrapper.appendChild(input);
        return wrapper;
    }

    function createTemplateField(offer) {
        return createInputField(offer, {
            label: "套用排班模板",
            name: "schedule-template",
            value: "current",
            action: "apply-template",
            options: [
                { value: "current", label: "当前自定义排班" },
                { value: "standard-965", label: "9:00–18:00 · 双休" },
                { value: "995-early", label: "9:00–21:00 · 周三五 18:00" },
                { value: "1095-early", label: "10:00–21:00 · 周三 18:00" },
                { value: "10105-early", label: "10:00–22:00 · 周三五 18:00" },
                { value: "1085-early", label: "10:00–20:00 · 周三五 18:00" },
                { value: "alternate-109", label: "10:00–21:00 · 大小周" }
            ],
            hint: "套用后仍可逐日修改。"
        });
    }

    function createScheduleMatrix(offer) {
        var wrap = createElement("div", "schedule-matrix-wrap");
        var table = createElement("table", "schedule-matrix");
        var caption = createElement(
            "caption",
            "visually-hidden",
            "工作日启用状态与上下班时间；窄屏时可左右滚动"
        );
        var colgroup = document.createElement("colgroup");
        var labelColumn = createElement("col", "schedule-matrix__labels");
        var dayColumns = document.createElement("col");
        var head = document.createElement("thead");
        var headRow = document.createElement("tr");
        var week;
        var weekday;

        dayColumns.span = 7;
        colgroup.append(labelColumn, dayColumns);
        headRow.appendChild(createElement("th", "schedule-matrix__corner", "设置"));
        headRow.firstChild.scope = "col";
        for (weekday = 1; weekday <= 7; weekday += 1) {
            var dayHeading = createElement("th", "", weekdayNames[weekday]);
            dayHeading.scope = "col";
            headRow.appendChild(dayHeading);
        }
        head.appendChild(headRow);
        table.append(caption, colgroup, head);

        for (week = 1; week <= offer.schedule.cycleWeeks; week += 1) {
            var body = createElement("tbody", "schedule-matrix__week");
            var weekHeadingRow = createElement("tr", "schedule-matrix__week-heading");
            var weekHeading = createElement(
                "th",
                "",
                offer.schedule.cycleWeeks === 1 ? "每周排班" : "周期第 " + week + " 周"
            );
            var enabledRow = document.createElement("tr");
            var startRow = document.createElement("tr");
            var endRow = document.createElement("tr");
            var enabledLabel = createElement("th", "schedule-matrix__row-label", "启用");
            var startLabel = createElement("th", "schedule-matrix__row-label", "上班");
            var endLabel = createElement("th", "schedule-matrix__row-label", "下班");

            weekHeading.colSpan = 8;
            weekHeading.scope = "rowgroup";
            weekHeadingRow.appendChild(weekHeading);
            enabledLabel.scope = "row";
            startLabel.scope = "row";
            endLabel.scope = "row";
            enabledRow.appendChild(enabledLabel);
            startRow.appendChild(startLabel);
            endRow.appendChild(endLabel);

            for (weekday = 1; weekday <= 7; weekday += 1) {
                var day = model.scheduleDayFor(offer, week, weekday);
                var enabledCell = document.createElement("td");
                var startCell = document.createElement("td");
                var endCell = document.createElement("td");
                var checkbox = document.createElement("input");
                var startInput = document.createElement("input");
                var endInput = document.createElement("input");

                checkbox.type = "checkbox";
                checkbox.checked = Boolean(day);
                checkbox.dataset.action = "toggle-day";
                checkbox.dataset.offerId = offer.id;
                checkbox.dataset.week = week;
                checkbox.dataset.weekday = weekday;
                checkbox.setAttribute(
                    "aria-label",
                    "第" + week + "周" + weekdayNames[weekday] + "启用"
                );

                startInput.type = "time";
                startInput.value = day ? day.start : "09:00";
                startInput.disabled = !day;
                startInput.dataset.offerId = offer.id;
                startInput.dataset.week = week;
                startInput.dataset.weekday = weekday;
                startInput.dataset.dayField = "start";
                startInput.setAttribute(
                    "aria-label",
                    "第" + week + "周" + weekdayNames[weekday] + "上班时间"
                );

                endInput.type = "time";
                endInput.value = day ? day.end : "18:00";
                endInput.disabled = !day;
                endInput.dataset.offerId = offer.id;
                endInput.dataset.week = week;
                endInput.dataset.weekday = weekday;
                endInput.dataset.dayField = "end";
                endInput.setAttribute(
                    "aria-label",
                    "第" + week + "周" + weekdayNames[weekday] + "下班时间"
                );

                enabledCell.appendChild(checkbox);
                startCell.appendChild(startInput);
                endCell.appendChild(endInput);
                enabledRow.appendChild(enabledCell);
                startRow.appendChild(startCell);
                endRow.appendChild(endCell);
            }

            body.append(weekHeadingRow, enabledRow, startRow, endRow);
            table.appendChild(body);
        }

        wrap.tabIndex = 0;
        wrap.setAttribute("role", "region");
        wrap.setAttribute("aria-label", "周期排班，可左右滚动");
        wrap.appendChild(table);
        return wrap;
    }

    function scheduleSummaryText(offer, calculatedOffer) {
        var weeklyHours = state.settings.primaryHoursBasis === "net"
            ? calculatedOffer.work.averageWeeklyNetHours
            : calculatedOffer.work.averageWeeklyPresenceHours;

        return "工作时长 · " +
            weeklyHoursSummaryLabel(state.settings.primaryHoursBasis) + " " +
            numberFormatter.format(weeklyHours) + " 小时";
    }

    function createScheduleEditor(offer, calculatedOffer) {
        var details = createElement("details", "schedule-details");
        var summary = createElement(
            "summary",
            "",
            scheduleSummaryText(offer, calculatedOffer)
        );
        var content = createElement("div", "schedule-details__content");
        var controls = createElement("div", "offer-card__grid schedule-primary-controls");
        var cycleField = createInputField(offer, {
            label: "循环周数（1–" + (core.MAX_CYCLE_WEEKS || 52) + "）",
            type: "number",
            name: "cycle-weeks",
            value: String(offer.schedule.cycleWeeks),
            action: "cycle-weeks",
            min: 1,
            max: core.MAX_CYCLE_WEEKS || 52,
            step: 1
        });
        var lunchBreakField = createInputField(offer, {
            label: "午休（小时/班次）",
            type: "number",
            path: "schedule.lunchBreakHours",
            value: offer.schedule.lunchBreakHours,
            min: 0,
            max: 8,
            step: 0.25,
            nullable: true,
            placeholder: "默认 " + numberFormatter.format(state.settings.lunchBreakHours),
            hint: "留空继承全局默认；填写后用于这个岗位的全部工作日和额外班次。"
        });
        var dinnerBreakField = createInputField(offer, {
            label: "晚休（小时/晚班）",
            type: "number",
            path: "schedule.dinnerBreakHours",
            value: offer.schedule.dinnerBreakHours,
            min: 0,
            max: 8,
            step: 0.25,
            nullable: true,
            placeholder: "默认 " + numberFormatter.format(state.settings.dinnerBreakHours),
            hint: "留空继承全局默认；填写后用于这个岗位，默认仅在 " +
                state.settings.dinnerThreshold + " 后下班时扣除。"
        });

        details.appendChild(summary);
        controls.append(
            createTemplateField(offer),
            cycleField,
            lunchBreakField,
            dinnerBreakField
        );
        content.append(controls, createScheduleMatrix(offer));

        var overtime = createElement("fieldset", "schedule-editor overtime-editor");
        overtime.appendChild(createElement("legend", "", "年度额外班次与加班费"));
        var overtimeGrid = createElement("div", "offer-card__grid overtime-grid");
        overtimeGrid.append(
            createInputField(offer, {
                label: "额外班次（次/年）",
                type: "number",
                path: "overtime.shiftsPerYear",
                value: offer.overtime.shiftsPerYear,
                min: 0,
                max: 366,
                step: 1
            }),
            createInputField(offer, {
                label: "加班费倍率",
                type: "number",
                path: "overtime.payMultiplier",
                value: offer.overtime.payMultiplier,
                min: 0,
                max: 10,
                step: 0.5,
                hint: "无加班费填 0，双倍日薪填 2。"
            }),
            createInputField(offer, {
                label: "额外班次开始",
                type: "time",
                path: "overtime.start",
                value: offer.overtime.start
            }),
            createInputField(offer, {
                label: "额外班次结束",
                type: "time",
                path: "overtime.end",
                value: offer.overtime.end
            }),
            createInputField(offer, {
                label: "每次计薪小时",
                type: "number",
                path: "overtime.paidHours",
                value: offer.overtime.paidHours,
                min: 0,
                max: 24,
                step: 0.5
            }),
            createInputField(offer, {
                label: "加班月薪基数",
                type: "number",
                path: "overtime.payBaseMonthly",
                value: offer.overtime.payBaseMonthly,
                min: 0,
                step: 100,
                nullable: true,
                hint: "留空时采用 Offer 月薪。"
            })
        );
        overtime.appendChild(overtimeGrid);
        content.appendChild(overtime);
        details.appendChild(content);
        details.open = Boolean(uiState.expandedScheduleIds[offer.id]);
        details.addEventListener("toggle", function () {
            uiState.expandedScheduleIds[offer.id] = details.open;
        });
        return details;
    }

    function updateCardHeader(card, offer) {
        var title = card.querySelector("[data-card-title]");
        var subtitle = card.querySelector("[data-card-subtitle]");
        var collapseButton = card.querySelector('[data-action="toggle-offer-card"]');
        var displayName = offer.department
            ? offer.company + " · " + offer.department
            : offer.company;

        if (title) {
            title.textContent = displayName;
            title.setAttribute("aria-label", displayName + "，在对比结果中查看");
        }
        if (subtitle) {
            subtitle.textContent = offer.city + " · " +
                formatMoney(offer.pay.monthlySalary) + " × " +
                numberFormatter.format(offer.pay.salaryMonths) + " 薪";
        }
        if (collapseButton) {
            collapseButton.setAttribute(
                "aria-label",
                (card.classList.contains("is-collapsed") ? "展开" : "收起") +
                    displayName + "的详细信息"
            );
        }
    }

    function setOfferCardCollapsed(card, collapsed) {
        var content = card.querySelector(".offer-card__content");
        var button = card.querySelector('[data-action="toggle-offer-card"]');
        var title = card.querySelector("[data-card-title]");
        var offerName = title && title.textContent.trim()
            ? title.textContent.trim()
            : "Offer";

        if (!content || !button) {
            return;
        }

        if (collapsed && content.dataset.mounted === "true") {
            content.replaceChildren();
            content.dataset.mounted = "false";
        }
        content.hidden = collapsed;
        card.classList.toggle("is-collapsed", collapsed);
        button.textContent = collapsed ? "展开" : "收起";
        button.setAttribute("aria-expanded", collapsed ? "false" : "true");
        button.setAttribute(
            "aria-label",
            (collapsed ? "展开" : "收起") + offerName + "的详细信息"
        );

        uiState.collapsedOfferIds[card.dataset.offerId] = collapsed;
    }

    function toggleOfferCard(offerId) {
        var card = findOfferTarget(elements.offerList, ".offer-card", offerId);

        if (card) {
            var collapsed = card.classList.contains("is-collapsed");

            if (collapsed && typeof card.mountOfferContent === "function") {
                card.mountOfferContent();
            }
            setOfferCardCollapsed(card, !collapsed);
            if (collapsed && latestCalculation) {
                renderFieldValidation(latestCalculation);
            }
        }
    }

    function createOfferCard(offer, calculatedOffer) {
        var card = createElement("article", "offer-card");
        var header = createElement("header", "offer-card__header");
        var headingGroup = createElement("div", "offer-card__identity");
        var title = createElement("h3");
        var titleButton = createElement("button", "offer-card__title-link");
        var subtitle = createElement("p");
        var headerActions = createElement("div", "offer-card__actions");
        var collapseButton = createElement("button", "secondary-button offer-card__toggle", "收起");
        var duplicateButton = createElement("button", "secondary-button", "复制");
        var deleteButton = createElement("button", "danger-button", "删除");
        var content = createElement("div", "offer-card__content");
        var grid;
        var collapsed = Object.prototype.hasOwnProperty.call(
            uiState.collapsedOfferIds,
            offer.id
        )
            ? Boolean(uiState.collapsedOfferIds[offer.id])
            : true;

        card.id = createId("offer-card", offer.id);
        card.dataset.offerId = offer.id;
        card.setAttribute("role", "listitem");
        card.tabIndex = -1;
        title.id = createId("offer-title", offer.id);
        subtitle.id = createId("offer-meta", offer.id);
        card.setAttribute("aria-labelledby", title.id);
        card.setAttribute("aria-describedby", subtitle.id);
        titleButton.type = "button";
        titleButton.dataset.cardTitle = "true";
        titleButton.dataset.action = "jump-to-result";
        titleButton.dataset.offerId = offer.id;
        title.appendChild(titleButton);
        subtitle.dataset.cardSubtitle = "true";
        headingGroup.append(title, subtitle);

        content.id = createId("offer-content", offer.id);
        collapseButton.type = "button";
        collapseButton.dataset.action = "toggle-offer-card";
        collapseButton.dataset.offerId = offer.id;
        collapseButton.setAttribute("aria-controls", content.id);
        duplicateButton.type = "button";
        duplicateButton.dataset.action = "duplicate-offer";
        duplicateButton.dataset.offerId = offer.id;
        deleteButton.type = "button";
        deleteButton.dataset.action = "delete-offer";
        deleteButton.dataset.offerId = offer.id;
        headerActions.append(deleteButton, duplicateButton, collapseButton);
        header.append(headingGroup, headerActions);
        card.appendChild(header);
        updateCardHeader(card, offer);

        card.appendChild(content);
        content.dataset.mounted = "false";
        card.mountOfferContent = function () {
            if (content.dataset.mounted === "true") {
                return;
            }
            offer = getOfferById(card.dataset.offerId) || offer;
            calculatedOffer = calculatedOfferById(card.dataset.offerId) ||
                calculatedOffer;
            grid = createElement("div", "offer-card__grid");
            grid.append(
            createInputField(offer, {
                label: "公司",
                path: "company",
                value: offer.company
            }),
            createInputField(offer, {
                label: "部门",
                path: "department",
                value: offer.department,
                hint: "可选；留空时只显示公司名，不影响任何计算。"
            }),
            createInputField(offer, {
                label: "城市",
                path: "city",
                value: offer.city,
                hint: "未知时使用“通用”，个人社保和公积金均按月薪与填写比例直接估算。"
            }),
            createInputField(offer, {
                label: "月薪（元）",
                type: "number",
                path: "pay.monthlySalary",
                value: offer.pay.monthlySalary,
                min: 0,
                step: 100
            }),
            createInputField(offer, {
                label: "总薪数",
                type: "number",
                path: "pay.salaryMonths",
                value: offer.pay.salaryMonths,
                min: 12,
                max: 60,
                step: 0.1,
                hint: "超过 12 薪的部分按目标奖金处理。"
            }),
            createInputField(offer, {
                label: "个人社保（%）",
                type: "number",
                path: "socialInsuranceRate",
                value: offer.socialInsuranceRate === null
                    ? null
                    : ratePercentValue(offer.socialInsuranceRate),
                min: 0,
                max: 100,
                step: 0.1,
                percent: true,
                nullable: true,
                placeholder: defaultSocialInsurancePlaceholder(),
                hint: "留空继承“我的计算设置”中的默认比例；填写 0 表示按 0% 估算。"
            }),
            createInputField(offer, {
                label: "公积金（%）",
                type: "number",
                path: "housingFundRate",
                value: ratePercentValue(offer.housingFundRate),
                min: 0,
                max: 100,
                step: 0.1,
                percent: true
            }),
            createInputField(offer, {
                label: "其他年现金（元）",
                type: "number",
                path: "pay.otherAnnualCash",
                value: offer.pay.otherAnnualCash,
                min: 0,
                step: 100,
                hint: "可填写固定补贴、签字费等。"
            }),
            createInputField(offer, {
                label: "奖金计税",
                path: "pay.bonusTaxMode",
                value: offer.pay.bonusTaxMode,
                options: [
                    { value: "auto", label: "自动择优" },
                    { value: "merged", label: "并入综合所得" },
                    { value: "separate", label: "奖金单独计税" }
                ]
            })
            );
            content.append(grid, createScheduleEditor(offer, calculatedOffer));
            content.dataset.mounted = "true";
        };
        if (!collapsed) {
            card.mountOfferContent();
        }
        setOfferCardCollapsed(card, collapsed);
        return card;
    }

    function renderOfferCards(calculation) {
        var currentCalculation = calculation || latestCalculation ||
            recalculateCurrentState();
        var calculatedById = Object.create(null);

        currentCalculation.state.offers.forEach(function (offer, index) {
            calculatedById[offer.id] = currentCalculation.results[index];
        });

        elements.offerList.querySelectorAll(".offer-card").forEach(
            function (card) {
                var scheduleDetails = card.querySelector(".schedule-details");

                if (scheduleDetails) {
                    uiState.expandedScheduleIds[card.dataset.offerId] =
                        scheduleDetails.open;
                }
            }
        );

        elements.offerCountLabel.textContent = state.offers.length
            ? state.offers.length + " 个 Offer"
            : "暂无 Offer";

        if (!state.offers.length) {
            var empty = createElement("div", "offer-empty");
            var content = createElement("div");
            content.append(
                createElement("h3", "", "还没有 Offer"),
                createElement("p", "", "点击“新增 Offer”开始录入。")
            );
            empty.appendChild(content);
            elements.offerList.replaceChildren(empty);
            return;
        }

        elements.offerList.replaceChildren.apply(
            elements.offerList,
            state.offers.map(function (offer) {
                return createOfferCard(offer, calculatedById[offer.id]);
            })
        );
    }

    function sortViews(views) {
        return selectors.sortViews(
            views,
            uiState.sortKey,
            uiState.sortDirection
        );
    }

    function appendMetricCell(row, value, formattedValue, best) {
        var cell = createElement(
            "td",
            selectors.isBest(value, best) ? "metric-best" : "",
            formattedValue
        );
        if (selectors.isBest(value, best)) {
            cell.appendChild(createElement("span", "visually-hidden", "（最佳）"));
        }
        row.appendChild(cell);
    }

    function selectedTaxLabel(result) {
        return result.tax.selectedMode === "separate"
            ? "奖金单独计税"
            : "奖金并入综合所得";
    }

    function appendTaxSection(container, title) {
        container.appendChild(createElement("h4", "tax-explanation__section-title", title));
    }

    function appendTaxFormula(container, label, expression, emphasized) {
        var line = createElement(
            "div",
            "tax-explanation__line" + (emphasized ? " is-total" : "")
        );
        line.append(
            createElement("span", "tax-explanation__label", label),
            createElement("span", "tax-explanation__expression", expression)
        );
        container.appendChild(line);
    }

    function appendTaxGuide(container, text) {
        container.appendChild(createElement("p", "tax-explanation__guide", text));
    }

    function createTaxExplanationBody(view, policy, baseline) {
        var result = view.result;
        var tax = result.tax;
        var scenario = tax.selectedScenario;
        var inputs = tax.inputs;
        var taxComparison = tax.comparison;
        var body = createElement("div", "tax-explanation__body");
        var socialInsuranceLabel = view.offer.socialInsuranceRate === null
            ? "个人社保（默认比例）"
            : "个人社保（Offer 设置）";
        var comparison;
        var policyNote;

        appendTaxSection(body, "收入来源");
        appendTaxFormula(
            body,
            "固定工资（Offer）",
            formatPreciseMoney(inputs.monthlySalary) + " × " +
                inputs.fixedSalaryMonths + " = " +
                formatPreciseMoney(inputs.annualBaseSalary)
        );
        appendTaxFormula(
            body,
            "目标奖金（额外 N 薪）",
            formatPreciseMoney(inputs.monthlySalary) + " × " +
                numberFormatter.format(inputs.bonusMonths) + " = " +
                formatPreciseMoney(inputs.bonus)
        );
        appendTaxFormula(
            body,
            "其他常规收入",
                "加班费（Offer）" + formatPreciseMoney(inputs.annualOvertimePay) +
                " + 其他年现金（Offer）" + formatPreciseMoney(inputs.annualOtherCash) +
                " + 其他综合所得（数据文件 / 默认 0）" +
                formatPreciseMoney(inputs.otherComprehensiveIncome) +
                " = " + formatPreciseMoney(inputs.otherRegularIncome)
        );
        appendTaxFormula(
            body,
            "常规收入合计",
            formatPreciseMoney(inputs.annualBaseSalary) + " + " +
                formatPreciseMoney(inputs.otherRegularIncome) + " = " +
                formatPreciseMoney(inputs.regularIncome),
            true
        );

        appendTaxSection(body, "扣除来源");
        appendTaxFormula(
            body,
            "基本减除费用（内置年度规则）",
            formatPreciseMoney(inputs.basicDeduction)
        );
        appendTaxFormula(
            body,
            "专项附加扣除（上方设置）",
            formatPreciseMoney(inputs.specialAdditionalDeduction)
        );
        appendTaxFormula(
            body,
            "其他依法扣除（数据文件 / 默认 0）",
            formatPreciseMoney(inputs.otherDeductions)
        );
        appendTaxFormula(
            body,
            socialInsuranceLabel,
            formatPreciseMoney(inputs.monthlySalary) + " × " +
                formatRate(inputs.socialInsuranceRate) + " × " +
                numberFormatter.format(inputs.socialInsuranceMonths) + " = " +
                formatPreciseMoney(inputs.employeeSocialInsurance)
        );
        appendTaxFormula(
            body,
            "个人公积金（Offer 比例）",
            formatPreciseMoney(inputs.monthlySalary) + " × " +
                formatRate(inputs.housingFundRate) + " × " +
                numberFormatter.format(inputs.housingFundMonths) + " = " +
                formatPreciseMoney(inputs.employeeHousingFund)
        );
        appendTaxFormula(
            body,
            "可扣除合计",
            formatPreciseMoney(inputs.basicDeduction) + " + " +
                formatPreciseMoney(inputs.specialAdditionalDeduction) + " + " +
                formatPreciseMoney(inputs.otherDeductions) + " + " +
                formatPreciseMoney(inputs.employeeSocialInsurance) + " + " +
                formatPreciseMoney(inputs.employeeHousingFund) + " = " +
                formatPreciseMoney(inputs.deductions),
            true
        );

        appendTaxSection(body, "所选方案的计算");
        appendTaxGuide(
            body,
            "“速算扣除数”来自对应的官方税率表，不是个人可另行申报的扣除项；" +
                "它用于把“应纳税所得额 × 适用税率”换算成超额累进税额。"
        );
        if (tax.selectedMode === "separate") {
            appendTaxFormula(
                body,
                "综合所得应纳税所得额（不含单独计税奖金）",
                "max(0，" + formatPreciseMoney(inputs.regularIncome) + " − " +
                    formatPreciseMoney(inputs.deductions) + ") = " +
                    formatPreciseMoney(scenario.taxableComprehensiveIncome)
            );
            appendTaxFormula(
                body,
                "综合所得适用税率与速算扣除数",
                "按年度综合所得税率表：" +
                    formatRate(scenario.comprehensiveRate) + "，" +
                    formatPreciseMoney(scenario.comprehensiveQuickDeduction)
            );
            appendTaxFormula(
                body,
                "综合所得部分应纳税额",
                formatPreciseMoney(scenario.taxableComprehensiveIncome) + " × " +
                    formatRate(scenario.comprehensiveRate) + " − " +
                    formatPreciseMoney(scenario.comprehensiveQuickDeduction) + " = " +
                    formatPreciseMoney(scenario.comprehensiveTax)
            );
            appendTaxFormula(
                body,
                "奖金换算月收入（仅用于查税率）",
                formatPreciseMoney(inputs.bonus) + " ÷ 12 = " +
                    formatPreciseMoney(scenario.bonusMonthlyEquivalent)
            );
            appendTaxFormula(
                body,
                "奖金适用税率与速算扣除数",
                "按月换算后的综合所得税率表：" +
                    formatRate(scenario.bonusRate) + "，" +
                    formatPreciseMoney(scenario.bonusQuickDeduction)
            );
            appendTaxFormula(
                body,
                "全年一次性奖金应纳税额",
                formatPreciseMoney(inputs.bonus) + " × " +
                    formatRate(scenario.bonusRate) + " − " +
                    formatPreciseMoney(scenario.bonusQuickDeduction) + " = " +
                    formatPreciseMoney(scenario.bonusTax)
            );
            appendTaxFormula(
                body,
                "本方案个税合计",
                formatPreciseMoney(scenario.comprehensiveTax) + " + " +
                    formatPreciseMoney(scenario.bonusTax) + " = " +
                    formatPreciseMoney(scenario.totalTax),
                false
            );
        } else {
            appendTaxFormula(
                body,
                "综合所得应纳税所得额（含奖金）",
                "max(0，" + formatPreciseMoney(inputs.regularIncome) + " + " +
                    formatPreciseMoney(inputs.bonus) + " − " +
                    formatPreciseMoney(inputs.deductions) + ") = " +
                    formatPreciseMoney(scenario.taxableComprehensiveIncome)
            );
            appendTaxFormula(
                body,
                "综合所得适用税率与速算扣除数",
                "按年度综合所得税率表：" +
                    formatRate(scenario.comprehensiveRate) + "，" +
                    formatPreciseMoney(scenario.comprehensiveQuickDeduction)
            );
            appendTaxFormula(
                body,
                "本方案年度综合所得应纳税额",
                formatPreciseMoney(scenario.taxableComprehensiveIncome) + " × " +
                    formatRate(scenario.comprehensiveRate) + " − " +
                    formatPreciseMoney(scenario.comprehensiveQuickDeduction) + " = " +
                    formatPreciseMoney(scenario.totalTax),
                false
            );
        }

        appendTaxSection(body, "归属到该 Offer 的税额");
        appendTaxGuide(
            body,
            "为避免把全局填写的其他综合所得税额重复算进每个 Offer，结果采用增量口径：" +
                "所选方案总税额减去“没有该 Offer 收入时”的基线税额。"
        );
        appendTaxFormula(
            body,
            "无该 Offer 的基线税额",
            "max(0，其他综合所得 " +
                formatPreciseMoney(inputs.otherComprehensiveIncome) + " − 非 Offer 扣除 " +
                formatPreciseMoney(inputs.baselineDeductions) + ") = " +
                formatPreciseMoney(baseline.taxableComprehensiveIncome) + "；" +
                formatPreciseMoney(baseline.taxableComprehensiveIncome) + " × " +
                formatRate(baseline.comprehensiveRate) + " − " +
                formatPreciseMoney(baseline.comprehensiveQuickDeduction) + " = " +
                formatPreciseMoney(baseline.totalTax)
        );
        appendTaxFormula(
            body,
            "归属于该 Offer 的增量个税",
            formatPreciseMoney(scenario.totalTax) + " − " +
                formatPreciseMoney(baseline.totalTax) + " = " +
                formatPreciseMoney(result.metrics.annualIncomeTax),
            true
        );

        comparison = createElement("p", "tax-explanation__comparison");
        if (tax.separateAvailable) {
            var mergedOfferTax = taxComparison.mergedIncrementalTax;
            var separateOfferTax = taxComparison.separateIncrementalTax;
            var lowerMode = taxComparison.lowerMode === "merged"
                ? "并入综合所得"
                : "奖金单独计税";
            comparison.textContent =
                "Offer 增量税方案：并入综合所得 " + formatPreciseMoney(mergedOfferTax) +
                "；奖金单独计税 " + formatPreciseMoney(separateOfferTax) +
                "。较低方案为“" + lowerMode + "”，相差 " +
                formatPreciseMoney(taxComparison.absoluteDifference) + "。" +
                (tax.requestedMode !== "auto" &&
                        tax.selectedMode === tax.requestedMode
                    ? " 当前结果按 Offer 中的手动选择计算。"
                    : "");
        } else {
            comparison.textContent =
                "当前税务年份不使用全年一次性奖金单独计税，奖金已并入综合所得。";
        }
        body.appendChild(comparison);

        policyNote = createElement(
            "p",
            "tax-explanation__note",
            "数值来自该 Offer、上方计算设置和计算器内置" +
                policy.comprehensive.label + "（规则版本 v" + policy.version + "），按 " +
                policy.requestedYear +
                " 税务年份及中国大陆居民个人完整年度估算；额外 N 薪按目标奖金处理，实际计税资格与申报结果请以发放方式为准。"
        );
        if (policy.estimated) {
            policyNote.textContent += " 该年份超出已核验范围（" +
                policy.verificationRange.from + "–" +
                policy.verificationRange.through + "），当前按最近的 " +
                policy.appliedYear + " 年规则估算。";
        }
        body.appendChild(policyNote);
        return body;
    }

    function createTaxCell(view) {
        var result = view.result;
        var cell = createElement("td", "tax-cell");
        var trigger = createElement("button", "tax-cell__trigger");
        var value = createElement("span", "tax-cell__value", formatMoney(result.metrics.annualIncomeTax));
        var indicator = createElement("span", "tax-cell__indicator", "↓");

        cell.id = createId("tax-cell", view.id);
        cell.dataset.offerId = view.id;
        trigger.type = "button";
        trigger.id = createId("tax-cell-trigger", view.id);
        trigger.dataset.action = "jump-to-tax-explanation";
        trigger.dataset.offerId = view.id;
        trigger.setAttribute(
            "aria-label",
            formatMoney(result.metrics.annualIncomeTax) + "，前往 " +
                view.name + " 的个人所得税计算说明"
        );
        trigger.setAttribute("aria-controls", createId("tax-explanation", view.id));
        trigger.setAttribute(
            "aria-expanded",
            uiState.expandedTaxExplanationIds[view.id] ? "true" : "false"
        );
        indicator.setAttribute("aria-hidden", "true");
        trigger.append(value, indicator);
        cell.appendChild(trigger);
        return cell;
    }

    function syncTaxTriggerExpanded(offerId, expanded) {
        var trigger = findOfferTarget(
            elements.comparisonTableBody,
            ".tax-cell__trigger[data-offer-id]",
            offerId
        );

        if (trigger) {
            trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
        }
    }

    function mountTaxExplanationBody(details, view, policy, baseline) {
        if (details.querySelector(".tax-explanation__body") ||
                !view || !policy || !baseline) {
            return;
        }
        details.appendChild(createTaxExplanationBody(view, policy, baseline));
    }

    function createTaxExplanation(view, policy, baseline) {
        var result = view.result;
        var details = createElement("details", "tax-explanation");
        var summary = document.createElement("summary");
        var identity = createElement("span", "tax-explanation__summary-identity");
        var offerLink = createElement(
            "a",
            "tax-explanation__summary-offer-link",
            view.name
        );
        var taxAmount = createElement("span", "tax-explanation__summary-tax");

        details.id = createId("tax-explanation", view.id);
        details.dataset.offerId = view.id;
        offerLink.href = "#" + createId("tax-cell", view.id);
        offerLink.dataset.action = "jump-to-tax-cell";
        offerLink.dataset.offerId = view.id;
        offerLink.setAttribute(
            "aria-label",
            "返回汇总表中 " + view.name + " 的个人所得税金额"
        );
        identity.append(
            offerLink,
            createElement(
                "span",
                "",
                view.city + " · " + selectedTaxLabel(result)
            )
        );
        taxAmount.append(
            createElement("span", "", "年度个税"),
            createElement("strong", "", formatMoney(result.metrics.annualIncomeTax))
        );
        summary.append(identity, taxAmount);
        details.appendChild(summary);
        details.open = Boolean(uiState.expandedTaxExplanationIds[view.id]);
        details.mountTaxBody = function () {
            mountTaxExplanationBody(details, view, policy, baseline);
        };
        if (details.open) {
            details.mountTaxBody();
        }
        details.addEventListener("toggle", function () {
            if (details.open) {
                details.mountTaxBody();
            } else {
                var body = details.querySelector(".tax-explanation__body");
                if (body) {
                    body.remove();
                }
            }
            uiState.expandedTaxExplanationIds[view.id] = details.open;
            syncTaxTriggerExpanded(view.id, details.open);
        });
        return details;
    }

    function renderTaxExplanations(views) {
        var explanations = sortViews(views).map(function (view) {
            return createTaxExplanation(
                view,
                latestCalculation.taxPolicy,
                latestCalculation.taxBaseline
            );
        });

        elements.taxExplanations.hidden = !explanations.length;
        elements.taxExplanationList.replaceChildren.apply(
            elements.taxExplanationList,
            explanations
        );
    }

    function renderTable(views) {
        var sortedViews = sortViews(views);
        var best = selectors.bestValues(views);
        var rows = sortedViews.map(function (view) {
            var row = document.createElement("tr");
            var offerCell = document.createElement("th");
            var offerLink = createElement("button", "comparison-offer-link");
            var name = createElement("strong", "", view.name);
            var meta = createElement(
                "span",
                "comparison-offer-meta",
                view.city + " · " + selectedTaxLabel(view.result)
            );

            row.id = createId("result-row", view.id);
            row.dataset.offerId = view.id;
            row.tabIndex = -1;
            offerCell.scope = "row";
            offerCell.dataset.action = "jump-to-offer";
            offerCell.dataset.offerId = view.id;
            offerLink.type = "button";
            offerLink.dataset.action = "jump-to-offer";
            offerLink.dataset.offerId = view.id;
            offerLink.setAttribute("aria-label", "前往编辑 " + view.name);
            offerLink.append(name, meta);
            offerCell.appendChild(offerLink);
            row.appendChild(offerCell);
            appendMetricCell(
                row,
                view.monthlySalary,
                formatMoney(view.monthlySalary),
                best.monthlySalary
            );
            appendMetricCell(
                row,
                view.salaryMonths,
                numberFormatter.format(view.salaryMonths) + " 薪",
                best.salaryMonths
            );
            appendMetricCell(row, view.weeklyHours, formatHours(view.weeklyHours), best.weeklyHours);
            appendMetricCell(
                row,
                view.annualPretaxCash,
                formatMoney(view.annualPretaxCash),
                best.annualPretaxCash
            );
            appendMetricCell(
                row,
                view.annualTakeHomeCash,
                formatMoney(view.annualTakeHomeCash),
                best.annualTakeHomeCash
            );
            appendMetricCell(row, view.pretaxHourly, formatHourly(view.pretaxHourly), best.pretaxHourly);
            appendMetricCell(row, view.afterTaxHourly, formatHourly(view.afterTaxHourly), best.afterTaxHourly);
            appendMetricCell(
                row,
                view.housingFundEquity,
                formatMoney(view.housingFundEquity),
                best.housingFundEquity
            );
            appendMetricCell(
                row,
                view.cashAndHousingFundEquity,
                formatMoney(view.cashAndHousingFundEquity),
                best.cashAndHousingFundEquity
            );
            row.appendChild(createTaxCell(view));
            return row;
        });

        elements.comparisonTableBody.replaceChildren.apply(elements.comparisonTableBody, rows);
    }

    function createSummaryItem(label, owner, metric) {
        var item = createElement("article");
        var main = createElement("div", "summary-main");

        main.append(
            createElement("strong", "summary-owner", owner),
            createElement("span", "summary-metric", metric)
        );
        item.append(createElement("h3", "", label), main);
        return item;
    }

    function renderSummary(views) {
        var leaders = selectors.summaryLeaders(views);
        var hourlyBest = leaders.afterTaxHourly;
        var incomeBest = leaders.annualTakeHomeCash;
        var hoursBest = leaders.weeklyHours;

        elements.resultSummary.classList.add("comparison-summary");
        elements.resultSummary.replaceChildren(
            createSummaryItem(
                "税后等效时薪最高",
                hourlyBest.name,
                formatHourly(hourlyBest.afterTaxHourly)
            ),
            createSummaryItem(
                "税后到手最高",
                incomeBest.name,
                formatMoney(incomeBest.annualTakeHomeCash)
            ),
            createSummaryItem(
                "周工作时长最低",
                hoursBest.name,
                formatHours(hoursBest.weeklyHours)
            )
        );
    }

    function renderAssumptions(calculation) {
        var content = elements.assumptionPanel.querySelector(".assumption-content");
        var existingList = content ? content.querySelector("ul") : null;
        var list = document.createElement("ul");

        calculation.assumptions.forEach(function (assumption) {
            var item = document.createElement("li");
            var label = createElement("strong", "", assumption.category + " · " + assumption.label + "：");
            item.append(label, document.createTextNode(assumption.value));
            list.appendChild(item);
        });

        elements.assumptionSummary.textContent =
            "查看 " + calculation.assumptions.length + " 项全局默认假设";
        if (existingList) {
            existingList.replaceWith(list);
        } else if (content) {
            content.appendChild(list);
        }
    }

    function clearFieldValidation() {
        elements.application.querySelectorAll(
            "[data-field-validation-error]"
        ).forEach(function (message) {
            message.remove();
        });
        elements.application.querySelectorAll(
            "[data-validation-marked]"
        ).forEach(function (control) {
            var originalDescription =
                control.dataset.validationOriginalDescription;

            control.removeAttribute("aria-invalid");
            control.removeAttribute("data-validation-marked");
            delete control.dataset.validationErrorId;
            delete control.dataset.validationOriginalDescription;
            if (originalDescription) {
                control.setAttribute("aria-describedby", originalDescription);
            } else {
                control.removeAttribute("aria-describedby");
            }
        });
    }

    function markControlInvalid(control, message) {
        var errorId;
        var error;
        var describedBy;

        if (!control || control.dataset.validationMarked === "true") {
            return;
        }
        errorId = createId("validation-error", control.id || (
            control.dataset.offerId + "-" +
            (control.dataset.path || control.dataset.dayField || "field") + "-" +
            (control.dataset.week || "global") + "-" +
            (control.dataset.weekday || "global")
        ));
        describedBy = control.getAttribute("aria-describedby") || "";
        error = createElement("span", "field-error", message);
        error.id = errorId;
        error.dataset.fieldValidationError = "true";

        control.dataset.validationMarked = "true";
        control.dataset.validationErrorId = errorId;
        control.dataset.validationOriginalDescription = describedBy;
        control.setAttribute("aria-invalid", "true");
        control.setAttribute(
            "aria-describedby",
            (describedBy ? describedBy + " " : "") + errorId
        );
        control.insertAdjacentElement("afterend", error);
    }

    function controlsForValidationIssue(validationIssue, calculation) {
        var settingsControls = {
            "settings.year": elements.taxYear,
            "settings.socialInsuranceRate": elements.socialSecurityRate,
            "settings.specialAdditionalDeduction": elements.annualSpecialDeduction
        };
        var match;
        var offer;
        var card;
        var relativePath;
        var dayMatch;
        var day;

        if (settingsControls[validationIssue.path]) {
            return [settingsControls[validationIssue.path]];
        }

        match = /^offers\[(\d+)\](?:\.(.+))?$/.exec(validationIssue.path);
        if (!match) {
            return [];
        }
        offer = calculation.state.offers[Number(match[1])];
        if (!offer) {
            return [];
        }
        card = findOfferTarget(elements.offerList, ".offer-card", offer.id);
        if (!card) {
            return [];
        }
        relativePath = match[2] || "";
        dayMatch = /^schedule\.days\[(\d+)\]/.exec(relativePath);
        if (dayMatch) {
            day = offer.schedule.days[Number(dayMatch[1])];
            if (!day) {
                return [];
            }
            return Array.prototype.filter.call(
                card.querySelectorAll("[data-day-field]"),
                function (control) {
                    return Number(control.dataset.week) === day.week &&
                        Number(control.dataset.weekday) === day.weekday;
                }
            );
        }
        if (relativePath === "overtime") {
            return Array.prototype.slice.call(
                card.querySelectorAll('[data-path^="overtime."]')
            );
        }
        return Array.prototype.slice.call(
            card.querySelectorAll('[data-path="' + relativePath + '"]')
        );
    }

    function renderFieldValidation(calculation) {
        clearFieldValidation();

        elements.application.querySelectorAll("input, select").forEach(
            function (control) {
                if (!control.disabled && control.validity &&
                        !control.validity.valid) {
                    markControlInvalid(
                        control,
                        "请输入控件允许范围内的有效值。"
                    );
                }
            }
        );
        calculation.validation.errors.forEach(function (validationIssue) {
            controlsForValidationIssue(validationIssue, calculation).forEach(
                function (control) {
                    markControlInvalid(control, validationIssue.message);
                }
            );
        });
    }

    function recalculateCurrentState() {
        latestCalculation = core.calculateAll(state);
        return latestCalculation;
    }

    function renderResults(calculation) {
        if (calculation) {
            latestCalculation = calculation;
        } else if (!latestCalculation) {
            recalculateCurrentState();
        }
        renderResultControls();
        var views = selectors.createComparisonViews(latestCalculation);
        var errors = latestCalculation.validation.errors;

        if (errors.length && elements.offerEditorPanel) {
            elements.offerEditorPanel.open = true;
            elements.settingsPanel.open = true;
        }

        elements.hoursColumnHeading.textContent = "周工作时长";
        renderAssumptions(latestCalculation);

        if (!views.length) {
            elements.resultSummary.classList.remove("comparison-summary");
            elements.resultSummary.replaceChildren(
                createElement("p", "", "添加至少一个 Offer 后，这里会显示对比结果。")
            );
            elements.comparisonTableBody.replaceChildren(
                (function () {
                    var row = document.createElement("tr");
                    var cell = createElement("td", "", "暂无可计算的 Offer");
                    cell.colSpan = 11;
                    row.appendChild(cell);
                    return row;
                }())
            );
        } else {
            renderSummary(views);
            renderTable(views);
        }
        renderTaxExplanations(views);
        renderFieldValidation(latestCalculation);

        if (errors.length) {
            elements.resultStatus.textContent =
                "有 " + errors.length + " 项输入需要检查：" + errors[0].message;
            elements.resultStatus.classList.add("is-error");
        } else {
            elements.resultStatus.textContent = views.length + " 个 Offer";
            elements.resultStatus.classList.remove("is-error");
        }
    }

    function commitStateAndRefresh(options) {
        var calculation = recalculateCurrentState();

        updateSettingsSummary();
        if (options && options.renderOffers) {
            renderOfferCards(calculation);
        }
        updateOfferDefaultPlaceholders();
        renderResults(calculation);
        if (options && options.updateScheduleSummaries) {
            updateAllScheduleCardSummaries();
        }
        if (!options || options.save !== false) {
            saveStateSoon();
        }
    }

    function updateScheduleCardSummary(offerId) {
        var offer = getOfferById(offerId);
        var calculatedOffer = calculatedOfferById(offerId);
        var card = findOfferTarget(elements.offerList, ".offer-card", offerId);
        var summary = card ? card.querySelector(".schedule-details > summary") : null;

        if (offer && calculatedOffer && summary) {
            summary.textContent = scheduleSummaryText(
                offer,
                calculatedOffer
            );
        }
    }

    function updateAllScheduleCardSummaries() {
        state.offers.forEach(function (offer) {
            updateScheduleCardSummary(offer.id);
        });
    }

    function restoreScheduleControlFocus(offerId, action) {
        window.requestAnimationFrame(function () {
            var card = findOfferTarget(elements.offerList, ".offer-card", offerId);
            var control = card
                ? Array.prototype.find.call(
                    card.querySelectorAll("[data-action]"),
                    function (candidate) {
                        return candidate.dataset.action === action;
                    }
                )
                : null;

            if (control) {
                control.focus({ preventScroll: true });
            }
        });
    }

    function findOfferTarget(container, selector, offerId) {
        return Array.prototype.find.call(container.querySelectorAll(selector), function (element) {
            return element.dataset.offerId === offerId;
        });
    }

    function jumpScrollBehavior() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    }

    function highlightJumpTarget(element, focusTarget) {
        var target = focusTarget || element;

        window.clearTimeout(jumpHighlightTimer);
        document.querySelectorAll(".is-jump-target").forEach(function (target) {
            target.classList.remove("is-jump-target");
        });
        element.classList.add("is-jump-target");
        try {
            target.focus({ preventScroll: true });
        } catch (error) {
            target.focus();
        }
        jumpHighlightTimer = window.setTimeout(function () {
            element.classList.remove("is-jump-target");
        }, 1800);
    }

    function jumpToOffer(offerId) {
        elements.offerEditorPanel.open = true;
        window.setTimeout(function () {
            var card = findOfferTarget(elements.offerList, ".offer-card", offerId);
            if (!card) {
                return;
            }
            if (typeof card.mountOfferContent === "function") {
                card.mountOfferContent();
            }
            setOfferCardCollapsed(card, false);
            if (latestCalculation) {
                renderFieldValidation(latestCalculation);
            }
            card.scrollIntoView({ behavior: jumpScrollBehavior(), block: "center" });
            highlightJumpTarget(card);
        });
    }

    function jumpToResult(offerId) {
        elements.offerEditorPanel.open = false;
        elements.resultPanel.open = true;
        window.setTimeout(function () {
            var row = findOfferTarget(elements.comparisonTableBody, "tr[data-offer-id]", offerId);
            if (!row) {
                return;
            }
            row.scrollIntoView({ behavior: jumpScrollBehavior(), block: "center" });
            highlightJumpTarget(row);
        });
    }

    function jumpToTaxExplanation(offerId) {
        elements.resultPanel.open = true;
        window.setTimeout(function () {
            var details = findOfferTarget(
                elements.taxExplanationList,
                ".tax-explanation[data-offer-id]",
                offerId
            );
            var summary;

            if (!details) {
                return;
            }
            details.open = true;
            if (typeof details.mountTaxBody === "function") {
                details.mountTaxBody();
            }
            uiState.expandedTaxExplanationIds[offerId] = true;
            syncTaxTriggerExpanded(offerId, true);
            summary = details.querySelector("summary");
            details.scrollIntoView({ behavior: jumpScrollBehavior(), block: "start" });
            highlightJumpTarget(details, summary);
        });
    }

    function jumpToTaxCell(offerId) {
        elements.resultPanel.open = true;
        window.setTimeout(function () {
            var cell = findOfferTarget(
                elements.comparisonTableBody,
                ".tax-cell[data-offer-id]",
                offerId
            );
            var trigger = cell ? cell.querySelector(".tax-cell__trigger") : null;

            if (!cell || !trigger) {
                return;
            }
            cell.scrollIntoView({
                behavior: jumpScrollBehavior(),
                block: "center",
                inline: "center"
            });
            highlightJumpTarget(cell, trigger);
        });
    }

    function handleSettingsInput(event) {
        var target = event.target;

        if (target === elements.taxYear) {
            state.settings.year = parseNumericInput(target.value, state.settings.year);
        } else if (target === elements.socialSecurityRate) {
            state.settings.socialInsuranceRate =
                parseNumericInput(
                    target.value,
                    ratePercentValue(state.settings.socialInsuranceRate)
                ) / 100;
        } else if (target === elements.annualSpecialDeduction) {
            state.settings.specialAdditionalDeduction =
                parseNumericInput(target.value, state.settings.specialAdditionalDeduction);
        } else {
            return;
        }
        commitStateAndRefresh({ renderOffers: false });
    }

    function handleHoursBasisChange(event) {
        state.settings.primaryHoursBasis = event.currentTarget.value;
        commitStateAndRefresh({
            renderOffers: false,
            updateScheduleSummaries: true
        });
    }

    function valueFromOfferInput(target) {
        if (target.dataset.nullable === "true" && target.value.trim() === "") {
            return null;
        }
        if (target.type === "number") {
            var number = parseNumericInput(target.value, 0);
            return target.dataset.percent === "true"
                ? number / 100
                : number;
        }
        return target.value;
    }

    function handleOfferValueInput(target) {
        var offer = getOfferById(target.dataset.offerId);

        if (!offer) {
            return;
        }

        if (target.dataset.path) {
            setByPath(offer, target.dataset.path, valueFromOfferInput(target));
            commitStateAndRefresh({ renderOffers: false });
            var normalizedOffer = normalizedOfferById(target.dataset.offerId);
            var card = target.closest(".offer-card");
            if (card && normalizedOffer) {
                updateCardHeader(card, normalizedOffer);
            }
            if (target.dataset.path.indexOf("overtime.") === 0 ||
                    target.dataset.path.indexOf("schedule.") === 0) {
                updateScheduleCardSummary(target.dataset.offerId);
            }
            return;
        }

        if (target.dataset.dayField) {
            var week = Number(target.dataset.week);
            var weekday = Number(target.dataset.weekday);
            var day = offer.schedule.days.find(function (candidate) {
                return candidate.week === week && candidate.weekday === weekday;
            });
            if (day) {
                day[target.dataset.dayField] = target.value;
                commitStateAndRefresh({ renderOffers: false });
                updateScheduleCardSummary(target.dataset.offerId);
            }
        }
    }

    function handleScheduleAction(target) {
        var offer = getOfferById(target.dataset.offerId);
        var action = target.dataset.action;

        if (!offer) {
            return;
        }

        if (action === "apply-template") {
            var template = model.scheduleForTemplate(target.value);
            if (template) {
                template.lunchBreakHours = offer.schedule.lunchBreakHours;
                template.dinnerBreakHours = offer.schedule.dinnerBreakHours;
                offer.schedule = template;
                commitStateAndRefresh({ renderOffers: true });
                restoreScheduleControlFocus(offer.id, "apply-template");
            }
            return;
        }

        if (action === "cycle-weeks") {
            var maximumCycle = core.MAX_CYCLE_WEEKS || 52;
            var resizedOffer = model.resizeScheduleCycle(
                offer,
                target.value,
                maximumCycle
            );

            replaceOffer(resizedOffer);
            target.value = resizedOffer.schedule.cycleWeeks;
            commitStateAndRefresh({ renderOffers: true });
            restoreScheduleControlFocus(offer.id, "cycle-weeks");
            return;
        }

        if (action === "toggle-day") {
            var week = Number(target.dataset.week);
            var weekday = Number(target.dataset.weekday);
            var toggledOffer = model.toggleScheduleDay(
                offer,
                week,
                weekday,
                target.checked
            );

            replaceOffer(toggledOffer);
            commitStateAndRefresh({ renderOffers: false });
            var normalizedOffer = normalizedOfferById(offer.id);
            var normalizedDay = normalizedOffer
                ? model.scheduleDayFor(normalizedOffer, week, weekday)
                : null;
            var card = target.closest(".offer-card");

            if (card) {
                card.querySelectorAll("[data-day-field]").forEach(function (input) {
                    if (Number(input.dataset.week) !== week ||
                            Number(input.dataset.weekday) !== weekday) {
                        return;
                    }
                    input.disabled = !normalizedDay;
                    input.value = normalizedDay
                        ? normalizedDay[input.dataset.dayField]
                        : (input.dataset.dayField === "start" ? "09:00" : "18:00");
                });
            }
            updateScheduleCardSummary(offer.id);
            if (target.isConnected) {
                target.focus({ preventScroll: true });
            }
        }
    }

    function canCreateOffer(actionLabel) {
        var maximumOffers = core.MAX_OFFERS || 100;

        if (state.offers.length >= maximumOffers) {
            elements.saveStatus.textContent =
                "最多支持 " + maximumOffers + " 个 Offer，无法继续" +
                actionLabel + "。";
            return false;
        }
        return true;
    }

    function addOffer() {
        if (!canCreateOffer("添加")) {
            return;
        }
        var offer = model.createOffer(createUniqueOfferId());
        state.offers.push(offer);
        uiState.collapsedOfferIds[offer.id] = false;
        commitStateAndRefresh({ renderOffers: true });
        var addedCard = elements.offerList.querySelector(
            '[data-offer-id="' + offer.id + '"]'
        );
        if (addedCard) {
            var companyInput = addedCard.querySelector('[data-path="company"]');
            addedCard.scrollIntoView({
                behavior: jumpScrollBehavior(),
                block: "start"
            });
            if (companyInput) {
                companyInput.focus({ preventScroll: true });
                companyInput.select();
            }
        }
    }

    function duplicateOffer(offerId) {
        var source = getOfferById(offerId);

        if (!source) {
            return;
        }
        if (!canCreateOffer("复制")) {
            return;
        }
        var copy = model.duplicateOffer(source, createUniqueOfferId());
        uiState.collapsedOfferIds[copy.id] = false;
        var sourceIndex = state.offers.findIndex(function (offer) {
            return offer.id === offerId;
        });
        state.offers.splice(sourceIndex + 1, 0, copy);
        commitStateAndRefresh({ renderOffers: true });
        var copiedCard = findOfferTarget(elements.offerList, ".offer-card", copy.id);
        var copiedCompanyInput = copiedCard
            ? copiedCard.querySelector('[data-path="company"]')
            : null;
        if (copiedCompanyInput) {
            copiedCompanyInput.focus({ preventScroll: true });
            copiedCompanyInput.select();
        }
    }

    function deleteOffer(offerId) {
        var offer = getOfferById(offerId);
        var sourceIndex = state.offers.findIndex(function (candidate) {
            return candidate.id === offerId;
        });
        var focusOffer = state.offers[sourceIndex + 1] ||
            state.offers[sourceIndex - 1] ||
            null;
        if (!offer) {
            return;
        }
        if (!window.confirm("确定删除“" +
                (offer.department ? offer.company + " · " + offer.department : offer.company) +
                "”吗？")) {
            return;
        }
        state.offers = state.offers.filter(function (candidate) {
            return candidate.id !== offerId;
        });
        delete uiState.collapsedOfferIds[offerId];
        delete uiState.expandedScheduleIds[offerId];
        delete uiState.expandedTaxExplanationIds[offerId];
        commitStateAndRefresh({ renderOffers: true });
        if (focusOffer) {
            var focusCard = findOfferTarget(
                elements.offerList,
                ".offer-card",
                focusOffer.id
            );
            var focusButton = focusCard
                ? focusCard.querySelector('[data-action="toggle-offer-card"]')
                : null;
            if (focusButton) {
                focusButton.focus();
            }
        } else {
            elements.addOfferButton.focus();
        }
    }

    function resetOffers() {
        var offerCount = seedState && Array.isArray(seedState.offers)
            ? seedState.offers.length
            : 0;
        var hasSourceData = seedSource.kind !== "empty";
        var confirmMessage = !hasSourceData
            ? "这会删除当前浏览器保存的全部 Offer 和计算设置。当前没有可恢复的 JSON 来源；操作后 Offer 列表为空，计算设置恢复默认值。确定清空吗？"
            : "这会删除当前浏览器保存的全部 Offer 和计算设置，并恢复为本次打开页面时载入的“" +
                seedSource.label + "”快照（" + offerCount +
                " 个 Offer）。不会重新读取或修改 JSON 文件。确定重置吗？";
        var storageCleared = true;
        var statusText;

        if (!window.confirm(confirmMessage)) {
            return;
        }
        window.clearTimeout(saveTimer);
        try {
            window.localStorage.removeItem(storageKey);
        } catch (error) {
            storageCleared = false;
        }
        state = clone(seedState);
        latestCalculation = null;
        uiState.collapsedOfferIds = Object.create(null);
        uiState.expandedScheduleIds = Object.create(null);
        uiState.expandedTaxExplanationIds = Object.create(null);
        activeDataOrigin = "source";
        updateDataSourceLabel();
        renderSettings();
        commitStateAndRefresh({ renderOffers: true, save: false });
        statusText = !hasSourceData
            ? "当前页面已清空 Offer，计算设置已恢复默认值；后续更改仍只会保存在当前浏览器。"
            : "当前页面已重置为本次打开页面时载入的“" + seedSource.label +
                "”快照（" + offerCount +
                " 个 Offer）；后续更改仍只会保存在当前浏览器。";
        if (!storageCleared) {
            statusText += " 但浏览器自动保存未能清除，刷新后旧数据可能重新出现。";
        }
        elements.saveStatus.textContent = statusText;
    }

    function exportState() {
        if (latestCalculation && latestCalculation.validation.errors.length) {
            elements.saveStatus.textContent =
                "导出失败：请先修正未通过校验的输入。";
            return;
        }
        var blob = new Blob(
            [core.stringifyState(
                latestCalculation ? latestCalculation.state : state
            )],
            { type: "application/json;charset=utf-8" }
        );
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "offer_compare_private.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        elements.saveStatus.textContent = "JSON 已导出；文件为未加密明文，请妥善保存。";
    }

    function importState(file) {
        if (!file) {
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            elements.saveStatus.textContent = "导入失败：JSON 文件不能超过 2 MB。";
            elements.importOffersInput.value = "";
            return;
        }
        file.text().then(function (content) {
            var parsed = JSON.parse(content);
            var parsedState;
            if (!Array.isArray(parsed.offers)) {
                throw new Error("JSON 必须包含 offers 数组。");
            }
            parsedState = core.parseState(parsed);
            var imported = parsedState.state;
            var validation = parsedState.validation;

            if (!imported.offers.length || validation.errors.length) {
                throw new Error(validation.errors.length
                    ? validation.errors[0].message
                    : "JSON 中没有可用的 Offer。");
            }
            if (!window.confirm("导入会替换当前 Offer 和计算设置，确定继续吗？")) {
                return;
            }
            state = imported;
            latestCalculation = null;
            uiState.collapsedOfferIds = Object.create(null);
            uiState.expandedScheduleIds = Object.create(null);
            uiState.expandedTaxExplanationIds = Object.create(null);
            renderSettings();
            commitStateAndRefresh({ renderOffers: true });
            elements.saveStatus.textContent = "导入成功，已保存到当前浏览器。";
        }).catch(function (error) {
            elements.saveStatus.textContent = "导入失败：" + error.message;
        }).finally(function () {
            elements.importOffersInput.value = "";
        });
    }

    elements.settingsForm.addEventListener(
        "input",
        whenApplicationReady(handleSettingsInput)
    );

    elements.offerList.addEventListener("input", whenApplicationReady(function (event) {
        if (!event.target.dataset.action) {
            handleOfferValueInput(event.target);
        }
    }));

    elements.offerList.addEventListener("change", whenApplicationReady(function (event) {
        if (event.target.dataset.action) {
            handleScheduleAction(event.target);
        }
    }));

    elements.offerList.addEventListener("click", whenApplicationReady(function (event) {
        var button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }
        if (button.dataset.action === "duplicate-offer") {
            duplicateOffer(button.dataset.offerId);
        } else if (button.dataset.action === "delete-offer") {
            deleteOffer(button.dataset.offerId);
        } else if (button.dataset.action === "toggle-offer-card") {
            toggleOfferCard(button.dataset.offerId);
        } else if (button.dataset.action === "jump-to-result") {
            jumpToResult(button.dataset.offerId);
        }
    }));

    elements.comparisonTableBody.addEventListener("click", whenApplicationReady(function (event) {
        var trigger = event.target.closest("[data-action]");

        if (!trigger) {
            return;
        }
        if (trigger.dataset.action === "jump-to-offer") {
            jumpToOffer(trigger.dataset.offerId);
        } else if (trigger.dataset.action === "jump-to-tax-explanation") {
            jumpToTaxExplanation(trigger.dataset.offerId);
        }
    }));

    elements.taxExplanationList.addEventListener("click", whenApplicationReady(function (event) {
        var trigger = event.target.closest('[data-action="jump-to-tax-cell"]');

        if (trigger) {
            event.preventDefault();
            event.stopPropagation();
            jumpToTaxCell(trigger.dataset.offerId);
        }
    }));

    elements.addOfferButton.addEventListener("click", whenApplicationReady(addOffer));
    elements.resetOffersButton.addEventListener("click", whenApplicationReady(resetOffers));
    elements.exportOffersButton.addEventListener("click", whenApplicationReady(exportState));
    elements.importOffersButton.addEventListener("click", whenApplicationReady(function () {
        elements.importOffersInput.click();
    }));
    elements.importOffersInput.addEventListener("change", whenApplicationReady(function () {
        importState(elements.importOffersInput.files[0]);
    }));
    function handleSortChange() {
        uiState.sortKey = elements.sortMetric.value;
        uiState.sortDirection = elements.sortDirection.value;
        renderResults(latestCalculation);
    }

    elements.sortMetric.addEventListener("change", whenApplicationReady(handleSortChange));
    elements.sortDirection.addEventListener("change", whenApplicationReady(handleSortChange));
    elements.hoursBasisControls.forEach(function (control) {
        control.addEventListener("change", whenApplicationReady(handleHoursBasisChange));
    });

    async function initialize() {
        var loaded;
        var storedState;

        if (dataLoader && typeof dataLoader.loadSeedState === "function") {
            loaded = await dataLoader.loadSeedState(core);
        } else {
            loaded = {
                state: core.createDefaultState(),
                source: { kind: "empty", label: "空白数据", file: "" },
                warnings: ["数据加载模块不可用。"]
            };
        }

        seedState = clone(loaded.state);
        seedSource = loaded.source;
        seedWarnings = loaded.warnings.slice();
        storedState = loadStoredState();
        state = storedState || clone(seedState);
        latestCalculation = null;
        activeDataOrigin = storedState ? "browser" : "source";

        updateDataSourceLabel();
        elements.saveStatus.textContent = initialSaveStatus(Boolean(storedState));
        renderSettings();
        commitStateAndRefresh({ renderOffers: true, save: false });
    }

    initialize().then(finishInitialization, function (error) {
        try {
            seedState = core.createDefaultState();
            state = clone(seedState);
            latestCalculation = null;
            seedSource = { kind: "empty", label: "空白数据", file: "" };
            seedWarnings = ["初始化失败：" + error.message];
            activeDataOrigin = "source";
            updateDataSourceLabel();
            elements.saveStatus.textContent = seedWarnings[0];
            renderSettings();
            commitStateAndRefresh({ renderOffers: true, save: false });
        } finally {
            finishInitialization();
        }
    });
}());
