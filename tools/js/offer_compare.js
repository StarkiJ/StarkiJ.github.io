(function () {
    "use strict";

    var core = window.OfferCompareCore;
    var dataLoader = window.OfferCompareData;
    var storageKey = "starki.offerCompare.v2";
    var legacyStorageKey = "starki.offerCompare.v1";
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
    var companyNameCollator = new Intl.Collator("zh-CN-u-co-pinyin", {
        usage: "sort",
        sensitivity: "base",
        numeric: true
    });
    var saveTimer = 0;
    var jumpHighlightTimer = 0;
    var collapsedOfferIds = Object.create(null);
    var expandedTaxExplanationIds = Object.create(null);
    var state;
    var latestCalculation;
    var seedState;
    var seedSource = { kind: "empty", label: "空白数据", file: "" };
    var seedWarnings = [];
    var storageWarning = "";
    var activeDataOrigin = "source";

    var elements = {
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
        comparisonTableWrap: document.getElementById("comparisonTableWrap"),
        comparisonTableBody: document.getElementById("comparisonTableBody"),
        hoursColumnHeading: document.getElementById("hoursColumnHeading"),
        taxExplanations: document.getElementById("taxExplanations"),
        taxExplanationList: document.getElementById("taxExplanationList")
    };

    if (!core) {
        elements.resultStatus.textContent = "计算模块加载失败，请刷新页面后重试。";
        return;
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
        return (prefix + "-" + suffix).replace(/[^a-zA-Z0-9_-]+/g, "-");
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

    function loadStoredState() {
        var keys = [storageKey, legacyStorageKey];
        var failedKey = "";
        var index;

        for (index = 0; index < keys.length; index += 1) {
            try {
                var stored = window.localStorage.getItem(keys[index]);
                if (stored) {
                    var parsed = JSON.parse(stored);
                    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.offers)) {
                        throw new Error("浏览器保存缺少 offers 数组");
                    }
                    if (failedKey) {
                        storageWarning = "浏览器中的一份旧保存已损坏，已回退到可用保存。";
                    }
                    return core.normalize(parsed);
                }
            } catch (error) {
                failedKey = keys[index];
            }
        }
        if (failedKey) {
            storageWarning = "浏览器中的一份旧保存已损坏，已回退到可用来源。";
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
        activeDataOrigin = "browser";
        updateDataSourceLabel();
        saveTimer = window.setTimeout(function () {
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(state));
                elements.saveStatus.textContent = "已保存到当前浏览器。";
            } catch (error) {
                elements.saveStatus.textContent = "浏览器未允许本地保存；本次计算仍然有效。";
            }
        }, 180);
    }

    function updateSettingsSummary() {
        elements.settingsSummaryMeta.textContent =
            state.settings.year + " · 默认社保 " +
            Number((state.settings.socialInsuranceRate * 100).toFixed(3)) + "%";
    }

    function defaultSocialInsurancePlaceholder() {
        return "默认 " +
            Number((state.settings.socialInsuranceRate * 100).toFixed(3)) + "%";
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
        elements.socialSecurityRate.value = Number((state.settings.socialInsuranceRate * 100).toFixed(3));
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
            (options.full ? " full" : "") +
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

    function scheduleFromPattern(start, normalEnd, earlyEnd, earlyWeekdays, cycleWeeks, addSaturday) {
        var days = [];
        var week;
        var weekday;

        for (week = 1; week <= cycleWeeks; week += 1) {
            for (weekday = 1; weekday <= 5; weekday += 1) {
                days.push({
                    week: week,
                    weekday: weekday,
                    start: start,
                    end: earlyWeekdays.indexOf(weekday) >= 0 ? earlyEnd : normalEnd
                });
            }
        }
        if (addSaturday) {
            days.push({
                week: cycleWeeks,
                weekday: 6,
                start: start,
                end: earlyEnd
            });
        }
        return { cycleWeeks: cycleWeeks, days: days };
    }

    function scheduleForTemplate(templateName) {
        var templates = {
            "standard-965": scheduleFromPattern("09:00", "18:00", "18:00", [], 1, false),
            "995-early": scheduleFromPattern("09:00", "21:00", "18:00", [3, 5], 1, false),
            "1095-early": scheduleFromPattern("10:00", "21:00", "18:00", [3], 1, false),
            "10105-early": scheduleFromPattern("10:00", "22:00", "18:00", [3, 5], 1, false),
            "1085-early": scheduleFromPattern("10:00", "20:00", "18:00", [3, 5], 1, false),
            "alternate-109": scheduleFromPattern("10:00", "21:00", "18:00", [3], 2, true)
        };

        return templates[templateName] ? clone(templates[templateName]) : null;
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

    function scheduleDayFor(offer, week, weekday) {
        return offer.schedule.days.find(function (candidate) {
            return candidate.week === week && candidate.weekday === weekday;
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
                var day = scheduleDayFor(offer, week, weekday);
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
            ? calculatedOffer.metrics.averageWeeklyNetHours
            : calculatedOffer.metrics.averageWeeklyPresenceHours;

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

        content.hidden = collapsed;
        card.classList.toggle("is-collapsed", collapsed);
        button.textContent = collapsed ? "展开" : "收起";
        button.setAttribute("aria-expanded", collapsed ? "false" : "true");
        button.setAttribute(
            "aria-label",
            (collapsed ? "展开" : "收起") + offerName + "的详细信息"
        );

        collapsedOfferIds[card.dataset.offerId] = collapsed;
    }

    function toggleOfferCard(offerId) {
        var card = findOfferTarget(elements.offerList, ".offer-card", offerId);

        if (card) {
            setOfferCardCollapsed(card, !card.classList.contains("is-collapsed"));
        }
    }

    function createOfferCard(offer) {
        var calculatedOffer = core.calculateOffer(offer, state.settings);
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
        var grid = createElement("div", "offer-card__grid");

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

        grid.append(
            createInputField(offer, {
                label: "公司",
                path: "company",
                value: offer.company
            }),
            createInputField(offer, {
                label: "部门",
                path: "department",
                value: offer.department
            }),
            createInputField(offer, {
                label: "城市",
                path: "city",
                value: offer.city,
                hint: "未知时使用“通用”。"
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
                    : Number((offer.socialInsuranceRate * 100).toFixed(3)),
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
                value: Number((offer.housingFundRate * 100).toFixed(3)),
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
        card.appendChild(content);
        setOfferCardCollapsed(
            card,
            Object.prototype.hasOwnProperty.call(collapsedOfferIds, offer.id)
                ? Boolean(collapsedOfferIds[offer.id])
                : true
        );
        return card;
    }

    function renderOfferCards() {
        var expandedScheduleIds = [];

        elements.offerList.querySelectorAll(".offer-card").forEach(function (card) {
            var scheduleDetails = card.querySelector(".schedule-details");
            if (scheduleDetails && scheduleDetails.open) {
                expandedScheduleIds.push(card.dataset.offerId);
            }
        });

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
            state.offers.map(createOfferCard)
        );

        elements.offerList.querySelectorAll(".offer-card").forEach(function (card) {
            var scheduleDetails = card.querySelector(".schedule-details");
            if (scheduleDetails && expandedScheduleIds.indexOf(card.dataset.offerId) >= 0) {
                scheduleDetails.open = true;
            }
        });
    }

    function selectedHours(result) {
        return state.settings.primaryHoursBasis === "net"
            ? result.metrics.averageWeeklyNetHours
            : result.metrics.averageWeeklyPresenceHours;
    }

    function viewForResult(result, sourceIndex) {
        var metrics = result.metrics;
        var weeklyHours = selectedHours(result);
        var annualHours = weeklyHours * state.settings.weeksPerYear;

        return {
            result: result,
            id: result.id,
            sourceIndex: sourceIndex,
            name: result.name,
            company: result.company,
            department: result.department,
            city: result.city,
            monthlySalary: result.payBreakdown.monthlySalary,
            salaryMonths: result.payBreakdown.salaryMonths,
            weeklyHours: weeklyHours,
            annualPretaxCash: metrics.annualPretaxCash,
            annualTakeHomeCash: metrics.annualTakeHomeCash,
            pretaxHourly: annualHours > 0 ? metrics.annualPretaxCash / annualHours : 0,
            afterTaxHourly: annualHours > 0 ? metrics.annualTakeHomeCash / annualHours : 0,
            housingFundEquity: metrics.housingFundEquity,
            cashAndHousingFundEquity: metrics.cashAndHousingFundEquity,
            annualIncomeTax: metrics.annualIncomeTax
        };
    }

    function sortViews(views) {
        var sortKey = elements.sortMetric.value;
        var direction = elements.sortDirection.value === "asc" ? 1 : -1;
        var accessors = {
            monthlySalary: function (view) { return view.monthlySalary; },
            salaryMonths: function (view) { return view.salaryMonths; },
            weeklyHours: function (view) { return view.weeklyHours; },
            annualPretaxCash: function (view) { return view.annualPretaxCash; },
            annualTakeHomeCash: function (view) { return view.annualTakeHomeCash; },
            pretaxHourly: function (view) { return view.pretaxHourly; },
            afterTaxHourly: function (view) { return view.afterTaxHourly; },
            housingFundEquity: function (view) { return view.housingFundEquity; },
            cashAndHousingFundEquity: function (view) { return view.cashAndHousingFundEquity; },
            annualIncomeTax: function (view) { return view.annualIncomeTax; }
        };
        var selected = accessors[sortKey] || accessors.afterTaxHourly;

        return views.slice().sort(function (left, right) {
            var difference;

            if (sortKey === "companyDepartment") {
                difference = companyNameCollator.compare(left.company, right.company) ||
                    companyNameCollator.compare(left.department, right.department);
            } else {
                difference = selected(left) - selected(right);
            }
            if (difference === 0 || Math.abs(difference) < 1e-9) {
                return left.sourceIndex - right.sourceIndex;
            }
            return difference * direction;
        });
    }

    function bestValues(views) {
        function maximum(field) {
            return views.reduce(function (best, view) {
                return Math.max(best, view[field]);
            }, -Infinity);
        }
        function minimum(field) {
            return views.reduce(function (best, view) {
                return Math.min(best, view[field]);
            }, Infinity);
        }

        return {
            monthlySalary: maximum("monthlySalary"),
            salaryMonths: maximum("salaryMonths"),
            weeklyHours: minimum("weeklyHours"),
            annualPretaxCash: maximum("annualPretaxCash"),
            annualTakeHomeCash: maximum("annualTakeHomeCash"),
            pretaxHourly: maximum("pretaxHourly"),
            afterTaxHourly: maximum("afterTaxHourly"),
            housingFundEquity: maximum("housingFundEquity"),
            cashAndHousingFundEquity: maximum("cashAndHousingFundEquity")
        };
    }

    function isBest(value, best) {
        return Number.isFinite(value) && Number.isFinite(best) && Math.abs(value - best) < 0.0001;
    }

    function appendMetricCell(row, value, formattedValue, best) {
        var cell = createElement("td", isBest(value, best) ? "metric-best" : "", formattedValue);
        row.appendChild(cell);
    }

    function selectedTaxLabel(result) {
        return result.tax.selectedMode === "separate"
            ? "奖金单独计税"
            : "奖金并入综合所得";
    }

    function taxInputs(result) {
        var metrics = result.metrics;
        var settings = result.settings;
        var offer = result.offer;
        var otherRegularIncome = metrics.annualOvertimePay +
            metrics.annualOtherCash +
            settings.otherComprehensiveIncome;
        var regularIncome = metrics.annualBaseSalary +
            otherRegularIncome;
        var deductions = settings.basicDeduction +
            settings.specialAdditionalDeduction +
            settings.otherDeductions +
            metrics.employeeSocialInsurance +
            metrics.employeeHousingFund;

        return {
            monthlySalary: offer.pay.monthlySalary,
            fixedSalaryMonths: 12,
            bonusMonths: Math.max(0, offer.pay.salaryMonths - 12),
            annualBaseSalary: metrics.annualBaseSalary,
            annualOvertimePay: metrics.annualOvertimePay,
            annualOtherCash: metrics.annualOtherCash,
            otherComprehensiveIncome: settings.otherComprehensiveIncome,
            otherRegularIncome: otherRegularIncome,
            regularIncome: regularIncome,
            bonus: metrics.annualBonus,
            basicDeduction: settings.basicDeduction,
            specialAdditionalDeduction: settings.specialAdditionalDeduction,
            otherDeductions: settings.otherDeductions,
            employeeSocialInsurance: metrics.employeeSocialInsurance,
            socialInsuranceRate: result.contributions.socialInsuranceRate,
            socialInsuranceMonths: result.contributions.socialInsuranceMonths,
            employeeHousingFund: metrics.employeeHousingFund,
            housingFundRate: offer.housingFundRate,
            housingFundMonths: settings.housingFundMonths,
            baselineDeductions: settings.basicDeduction +
                settings.specialAdditionalDeduction +
                settings.otherDeductions,
            deductions: deductions
        };
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

    function createTaxExplanationBody(result) {
        var tax = result.tax;
        var scenario = tax.selectedMode === "separate" ? tax.separate : tax.merged;
        var inputs = taxInputs(result);
        var body = createElement("div", "tax-explanation__body");
        var socialInsuranceLabel = result.offer.socialInsuranceRate === null
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
        if (tax.selectedMode === "separate") {
            appendTaxFormula(
                body,
                "综合所得应纳税额",
                "max(0，" + formatPreciseMoney(inputs.regularIncome) + " − " +
                    formatPreciseMoney(inputs.deductions) + ") = " +
                    formatPreciseMoney(scenario.taxableComprehensiveIncome)
            );
            appendTaxFormula(
                body,
                "综合所得税",
                formatPreciseMoney(scenario.taxableComprehensiveIncome) + " × " +
                    formatRate(scenario.comprehensiveRate) + " − " +
                    formatPreciseMoney(scenario.comprehensiveQuickDeduction) + " = " +
                    formatPreciseMoney(scenario.comprehensiveTax)
            );
            appendTaxFormula(
                body,
                "奖金月度折算",
                formatPreciseMoney(inputs.bonus) + " ÷ 12 = " +
                    formatPreciseMoney(scenario.bonusMonthlyEquivalent)
            );
            appendTaxFormula(
                body,
                "奖金税",
                formatPreciseMoney(inputs.bonus) + " × " +
                    formatRate(scenario.bonusRate) + " − " +
                    formatPreciseMoney(scenario.bonusQuickDeduction) + " = " +
                    formatPreciseMoney(scenario.bonusTax)
            );
            appendTaxFormula(
                body,
                "含其他收入的总税额",
                formatPreciseMoney(scenario.comprehensiveTax) + " + " +
                    formatPreciseMoney(scenario.bonusTax) + " = " +
                    formatPreciseMoney(scenario.totalTax),
                false
            );
        } else {
            appendTaxFormula(
                body,
                "应纳税所得额",
                "max(0，" + formatPreciseMoney(inputs.regularIncome) + " + " +
                    formatPreciseMoney(inputs.bonus) + " − " +
                    formatPreciseMoney(inputs.deductions) + ") = " +
                    formatPreciseMoney(scenario.taxableComprehensiveIncome)
            );
            appendTaxFormula(
                body,
                "含其他收入的总税额",
                formatPreciseMoney(scenario.taxableComprehensiveIncome) + " × " +
                    formatRate(scenario.comprehensiveRate) + " − " +
                    formatPreciseMoney(scenario.comprehensiveQuickDeduction) + " = " +
                    formatPreciseMoney(scenario.totalTax),
                false
            );
        }

        appendTaxFormula(
            body,
            "无该 Offer 的基线税额",
            "max(0，其他综合所得 " +
                formatPreciseMoney(inputs.otherComprehensiveIncome) + " − 非 Offer 扣除 " +
                formatPreciseMoney(inputs.baselineDeductions) + ") = " +
                formatPreciseMoney(tax.baseline.taxableComprehensiveIncome) + "；" +
                formatPreciseMoney(tax.baseline.taxableComprehensiveIncome) + " × " +
                formatRate(tax.baseline.comprehensiveRate) + " − " +
                formatPreciseMoney(tax.baseline.comprehensiveQuickDeduction) + " = " +
                formatPreciseMoney(tax.baseline.totalTax)
        );
        appendTaxFormula(
            body,
            "归属于该 Offer 的增量个税",
            formatPreciseMoney(scenario.totalTax) + " − " +
                formatPreciseMoney(tax.baseline.totalTax) + " = " +
                formatPreciseMoney(result.metrics.annualIncomeTax),
            true
        );

        comparison = createElement("p", "tax-explanation__comparison");
        if (tax.separateAvailable) {
            var mergedOfferTax = tax.merged.totalTax - tax.baseline.totalTax;
            var separateOfferTax = tax.separate.totalTax - tax.baseline.totalTax;
            var lowerMode = mergedOfferTax <= separateOfferTax
                ? "并入综合所得"
                : "奖金单独计税";
            var difference = Math.abs(mergedOfferTax - separateOfferTax);
            comparison.textContent =
                "Offer 增量税方案：并入综合所得 " + formatPreciseMoney(mergedOfferTax) +
                "；奖金单独计税 " + formatPreciseMoney(separateOfferTax) +
                "。较低方案为“" + lowerMode + "”，相差 " +
                formatPreciseMoney(difference) + "。" +
                (tax.requestedMode === "auto" ? "" : " 当前结果按 Offer 中的手动选择计算。");
        } else {
            comparison.textContent =
                "当前税务年份不使用全年一次性奖金单独计税，奖金已并入综合所得。";
        }
        body.appendChild(comparison);

        policyNote = createElement(
            "p",
            "tax-explanation__note",
            "数值来自该 Offer、上方计算设置和计算器内置税率表，按 " +
                tax.policyYear +
                " 税务年份及中国大陆居民个人完整年度估算；额外 N 薪按目标奖金处理，实际计税资格与申报结果请以发放方式为准。"
        );
        body.appendChild(policyNote);
        return body;
    }

    function createTaxCell(result) {
        var cell = createElement("td", "tax-cell");
        var trigger = createElement("button", "tax-cell__trigger");
        var value = createElement("span", "tax-cell__value", formatMoney(result.metrics.annualIncomeTax));
        var indicator = createElement("span", "tax-cell__indicator", "↓");

        cell.id = createId("tax-cell", result.id);
        cell.dataset.offerId = result.id;
        trigger.type = "button";
        trigger.id = createId("tax-cell-trigger", result.id);
        trigger.dataset.action = "jump-to-tax-explanation";
        trigger.dataset.offerId = result.id;
        trigger.setAttribute(
            "aria-label",
            formatMoney(result.metrics.annualIncomeTax) + "，前往 " +
                result.name + " 的个人所得税计算说明"
        );
        trigger.setAttribute("aria-controls", createId("tax-explanation", result.id));
        trigger.setAttribute(
            "aria-expanded",
            expandedTaxExplanationIds[result.id] ? "true" : "false"
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

    function createTaxExplanation(view) {
        var result = view.result;
        var details = createElement("details", "tax-explanation");
        var summary = document.createElement("summary");
        var identity = createElement("span", "tax-explanation__summary-identity");
        var offerLink = createElement(
            "a",
            "tax-explanation__summary-offer-link",
            result.name
        );
        var taxAmount = createElement("span", "tax-explanation__summary-tax");

        details.id = createId("tax-explanation", result.id);
        details.dataset.offerId = result.id;
        offerLink.href = "#" + createId("tax-cell", result.id);
        offerLink.dataset.action = "jump-to-tax-cell";
        offerLink.dataset.offerId = result.id;
        offerLink.setAttribute(
            "aria-label",
            "返回汇总表中 " + result.name + " 的个人所得税金额"
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
        details.append(summary, createTaxExplanationBody(result));
        details.open = Boolean(expandedTaxExplanationIds[result.id]);
        details.addEventListener("toggle", function () {
            expandedTaxExplanationIds[result.id] = details.open;
            syncTaxTriggerExpanded(result.id, details.open);
        });
        return details;
    }

    function renderTaxExplanations(views) {
        var explanations = sortViews(views).map(createTaxExplanation);

        elements.taxExplanations.hidden = !explanations.length;
        elements.taxExplanationList.replaceChildren.apply(
            elements.taxExplanationList,
            explanations
        );
    }

    function renderTable(views) {
        var sortedViews = sortViews(views);
        var best = bestValues(views);
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
            row.appendChild(createTaxCell(view.result));
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

    function resultWithMaximum(views, field) {
        return views.reduce(function (best, current) {
            return !best || current[field] > best[field] ? current : best;
        }, null);
    }

    function resultWithMinimum(views, field) {
        return views.reduce(function (best, current) {
            return !best || current[field] < best[field] ? current : best;
        }, null);
    }

    function renderSummary(views) {
        var hourlyBest = resultWithMaximum(views, "afterTaxHourly");
        var incomeBest = resultWithMaximum(views, "annualTakeHomeCash");
        var hoursBest = resultWithMinimum(views, "weeklyHours");

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
            "查看 " + calculation.defaultAssumptionCount + " 项全局默认假设";
        if (existingList) {
            existingList.replaceWith(list);
        } else if (content) {
            content.appendChild(list);
        }
    }

    function renderResults() {
        latestCalculation = core.calculateAll(state);
        state = latestCalculation.state;
        renderResultControls();
        var views = latestCalculation.results.map(viewForResult);
        var errors = latestCalculation.validation.errors;
        var warnings = latestCalculation.validation.warnings;

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

        if (errors.length) {
            elements.resultStatus.textContent =
                "有 " + errors.length + " 项输入需要检查：" + errors[0].message;
            elements.resultStatus.classList.add("is-error");
        } else {
            elements.resultStatus.textContent =
                views.length + " 个 Offer · " +
                latestCalculation.defaultAssumptionCount + " 项全局默认假设 · " +
                warnings.length + " 条可选完善信息";
            elements.resultStatus.classList.remove("is-error");
        }
    }

    function normalizeAndRefresh(options) {
        state = core.normalize(state);
        updateSettingsSummary();
        if (options && options.renderOffers) {
            renderOfferCards();
        }
        updateOfferDefaultPlaceholders();
        renderResults();
        if (options && options.updateScheduleSummaries) {
            updateAllScheduleCardSummaries();
        }
        saveStateSoon();
    }

    function updateScheduleCardSummary(offerId) {
        var offer = getOfferById(offerId);
        var card = findOfferTarget(elements.offerList, ".offer-card", offerId);
        var summary = card ? card.querySelector(".schedule-details > summary") : null;

        if (offer && summary) {
            summary.textContent = scheduleSummaryText(
                offer,
                core.calculateOffer(offer, state.settings)
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
            setOfferCardCollapsed(card, false);
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
            expandedTaxExplanationIds[offerId] = true;
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
                parseNumericInput(target.value, state.settings.socialInsuranceRate * 100) / 100;
        } else if (target === elements.annualSpecialDeduction) {
            state.settings.specialAdditionalDeduction =
                parseNumericInput(target.value, state.settings.specialAdditionalDeduction);
        } else {
            return;
        }
        normalizeAndRefresh({ renderOffers: false });
    }

    function handleHoursBasisChange(event) {
        state.settings.primaryHoursBasis = event.currentTarget.value;
        normalizeAndRefresh({
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
            return target.dataset.percent === "true" ? number / 100 : number;
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
            state = core.normalize(state);
            var normalizedOffer = getOfferById(target.dataset.offerId);
            var card = target.closest(".offer-card");
            if (card && normalizedOffer) {
                updateCardHeader(card, normalizedOffer);
            }
            renderResults();
            if (target.dataset.path.indexOf("overtime.") === 0 ||
                    target.dataset.path.indexOf("schedule.") === 0) {
                updateScheduleCardSummary(target.dataset.offerId);
            }
            saveStateSoon();
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
                normalizeAndRefresh({ renderOffers: false });
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
            var template = scheduleForTemplate(target.value);
            if (template) {
                template.lunchBreakHours = offer.schedule.lunchBreakHours;
                template.dinnerBreakHours = offer.schedule.dinnerBreakHours;
                offer.schedule = template;
                normalizeAndRefresh({ renderOffers: true });
                restoreScheduleControlFocus(offer.id, "apply-template");
            }
            return;
        }

        if (action === "cycle-weeks") {
            var oldCycle = offer.schedule.cycleWeeks;
            var maximumCycle = core.MAX_CYCLE_WEEKS || 52;
            var newCycle = Math.max(
                1,
                Math.min(maximumCycle, Math.round(parseNumericInput(target.value, oldCycle)))
            );
            if (newCycle > oldCycle) {
                var addedWeek;
                for (addedWeek = oldCycle + 1; addedWeek <= newCycle; addedWeek += 1) {
                    var sourceWeek = ((addedWeek - 1) % oldCycle) + 1;
                    offer.schedule.days
                        .filter(function (day) {
                            return day.week === sourceWeek;
                        })
                        .forEach(function (day) {
                            var copiedDay = clone(day);
                            copiedDay.week = addedWeek;
                            offer.schedule.days.push(copiedDay);
                        });
                }
            } else {
                offer.schedule.days = offer.schedule.days.filter(function (day) {
                    return day.week <= newCycle;
                });
            }
            offer.schedule.cycleWeeks = newCycle;
            target.value = newCycle;
            normalizeAndRefresh({ renderOffers: true });
            restoreScheduleControlFocus(offer.id, "cycle-weeks");
            return;
        }

        if (action === "toggle-day") {
            var week = Number(target.dataset.week);
            var weekday = Number(target.dataset.weekday);
            if (target.checked) {
                var referenceDay = offer.schedule.days.find(function (day) {
                    return day.week === week;
                }) || offer.schedule.days[0];
                offer.schedule.days.push({
                    week: week,
                    weekday: weekday,
                    start: referenceDay ? referenceDay.start : "09:00",
                    end: referenceDay ? referenceDay.end : "18:00"
                });
            } else {
                offer.schedule.days = offer.schedule.days.filter(function (day) {
                    return !(day.week === week && day.weekday === weekday);
                });
            }
            state = core.normalize(state);
            var normalizedOffer = getOfferById(offer.id);
            var normalizedDay = normalizedOffer
                ? scheduleDayFor(normalizedOffer, week, weekday)
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
            renderResults();
            saveStateSoon();
        }
    }

    function addOffer() {
        var offer = {
            id: createUniqueOfferId(),
            company: "新公司",
            department: "",
            city: "通用",
            pay: {
                monthlySalary: 10000,
                salaryMonths: 12,
                otherAnnualCash: 0,
                bonusTaxMode: "auto"
            },
            socialInsuranceRate: null,
            housingFundRate: 0.05,
            schedule: Object.assign(
                scheduleFromPattern("09:00", "18:00", "18:00", [], 1, false),
                {
                    lunchBreakHours: null,
                    dinnerBreakHours: null
                }
            ),
            overtime: {
                shiftsPerYear: 0,
                start: "09:00",
                end: "18:00",
                paidHours: 8,
                payMultiplier: 0,
                payBaseMonthly: null
            }
        };
        state.offers.push(offer);
        collapsedOfferIds[offer.id] = false;
        normalizeAndRefresh({ renderOffers: true });
        var addedCard = elements.offerList.querySelector(
            '[data-offer-id="' + offer.id + '"]'
        );
        if (addedCard) {
            addedCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function duplicateOffer(offerId) {
        var source = getOfferById(offerId);
        if (!source) {
            return;
        }
        var copy = clone(source);
        copy.id = createUniqueOfferId();
        copy.department = copy.department ? copy.department + "（副本）" : "副本";
        collapsedOfferIds[copy.id] = false;
        var sourceIndex = state.offers.findIndex(function (offer) {
            return offer.id === offerId;
        });
        state.offers.splice(sourceIndex + 1, 0, copy);
        normalizeAndRefresh({ renderOffers: true });
    }

    function deleteOffer(offerId) {
        var offer = getOfferById(offerId);
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
        delete collapsedOfferIds[offerId];
        delete expandedTaxExplanationIds[offerId];
        normalizeAndRefresh({ renderOffers: true });
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
        try {
            window.localStorage.removeItem(legacyStorageKey);
        } catch (error) {
            storageCleared = false;
        }
        state = clone(seedState);
        collapsedOfferIds = Object.create(null);
        expandedTaxExplanationIds = Object.create(null);
        activeDataOrigin = "source";
        updateDataSourceLabel();
        renderSettings();
        renderOfferCards();
        renderResults();
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
        var blob = new Blob(
            [core.stringifyState(state)],
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
            if (!Array.isArray(parsed.offers) || parsed.offers.length > 100) {
                throw new Error("JSON 必须包含不超过 100 个 Offer。");
            }
            var imported = core.normalize(parsed);
            var validation = core.validateState(imported);

            if (!imported.offers.length || validation.errors.length) {
                throw new Error(validation.errors.length
                    ? validation.errors[0].message
                    : "JSON 中没有可用的 Offer。");
            }
            if (!window.confirm("导入会替换当前 Offer 和计算设置，确定继续吗？")) {
                return;
            }
            state = imported;
            collapsedOfferIds = Object.create(null);
            expandedTaxExplanationIds = Object.create(null);
            renderSettings();
            renderOfferCards();
            renderResults();
            saveStateSoon();
            elements.saveStatus.textContent = "导入成功，已保存到当前浏览器。";
        }).catch(function (error) {
            elements.saveStatus.textContent = "导入失败：" + error.message;
        }).finally(function () {
            elements.importOffersInput.value = "";
        });
    }

    elements.settingsForm.addEventListener("input", handleSettingsInput);
    elements.settingsForm.addEventListener("change", handleSettingsInput);

    elements.offerList.addEventListener("input", function (event) {
        if (!event.target.dataset.action) {
            handleOfferValueInput(event.target);
        }
    });

    elements.offerList.addEventListener("change", function (event) {
        if (event.target.dataset.action) {
            handleScheduleAction(event.target);
        }
    });

    elements.offerList.addEventListener("click", function (event) {
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
    });

    elements.comparisonTableBody.addEventListener("click", function (event) {
        var trigger = event.target.closest("[data-action]");

        if (!trigger) {
            return;
        }
        if (trigger.dataset.action === "jump-to-offer") {
            jumpToOffer(trigger.dataset.offerId);
        } else if (trigger.dataset.action === "jump-to-tax-explanation") {
            jumpToTaxExplanation(trigger.dataset.offerId);
        }
    });

    elements.taxExplanationList.addEventListener("click", function (event) {
        var trigger = event.target.closest('[data-action="jump-to-tax-cell"]');

        if (trigger) {
            event.preventDefault();
            event.stopPropagation();
            jumpToTaxCell(trigger.dataset.offerId);
        }
    });

    elements.addOfferButton.addEventListener("click", addOffer);
    elements.resetOffersButton.addEventListener("click", resetOffers);
    elements.exportOffersButton.addEventListener("click", exportState);
    elements.importOffersButton.addEventListener("click", function () {
        elements.importOffersInput.click();
    });
    elements.importOffersInput.addEventListener("change", function () {
        importState(elements.importOffersInput.files[0]);
    });
    elements.sortMetric.addEventListener("change", renderResults);
    elements.sortDirection.addEventListener("change", renderResults);
    elements.hoursBasisControls.forEach(function (control) {
        control.addEventListener("change", handleHoursBasisChange);
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
        activeDataOrigin = storedState ? "browser" : "source";

        updateDataSourceLabel();
        elements.saveStatus.textContent = initialSaveStatus(Boolean(storedState));
        renderSettings();
        renderOfferCards();
        renderResults();
    }

    initialize().catch(function (error) {
        seedState = core.createDefaultState();
        state = clone(seedState);
        seedSource = { kind: "empty", label: "空白数据", file: "" };
        seedWarnings = ["初始化失败：" + error.message];
        activeDataOrigin = "source";
        updateDataSourceLabel();
        elements.saveStatus.textContent = seedWarnings[0];
        renderSettings();
        renderOfferCards();
        renderResults();
    });
}());
