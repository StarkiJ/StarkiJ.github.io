(function () {
    "use strict";

    var core = window.OfferCompareCore;
    var dataLoader = window.OfferCompareData;
    var model = window.OfferCompareModel;
    var selectors = window.OfferCompareSelectors;
    var ui = window.OfferCompareUi;
    var storageKey = "starki.offerCompare.v2";
    var numberFormatter = ui.numberFormatter;
    var clone = ui.clone;
    var createElement = ui.createElement;
    var createId = ui.createId;
    var createUniqueOfferId = ui.createUniqueOfferId;
    var parseNumericInput = ui.parseNumericInput;
    var formatMoney = ui.formatMoney;
    var ratePercentValue = ui.ratePercentValue;
    var formatHours = ui.formatHours;
    var formatHourly = ui.formatHourly;
    var saveTimer = 0;
    var jumpHighlightTimer = 0;
    var uiState = {
        expandedTaxExplanationIds: Object.create(null),
        sortKey: "companyDepartment",
        sortDirection: "asc"
    };
    var state;
    var latestCalculation;
    var seedState;
    var seedSource = { kind: "empty", label: "空白数据", file: "" };
    var seedWarnings = [];
    var storageWarning = "";
    var activeDataOrigin = "source";
    var applicationReady = false;
    var offerMode = "";
    var modeTrigger = null;

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
        dataSourceLabel: document.getElementById("dataSourceLabel"),
        copyOfferButton: document.getElementById("copyOfferButton"),
        deleteOfferButton: document.getElementById("deleteOfferButton"),
        reorderOffersButton: document.getElementById("reorderOffersButton"),
        dataMenu: document.getElementById("dataMenu"),
        modeBar: document.getElementById("offerModeBar"),
        modeHint: document.getElementById("offerModeHint"),
        finishOrder: document.getElementById("finishOfferOrder"),
        cancelMode: document.getElementById("cancelOfferMode"),
        orderList: document.getElementById("offerOrderList"),
        orderStatus: document.getElementById("orderStatus"),
        addOfferButton: document.getElementById("addOfferButton"),
        resetOffersButton: document.getElementById("resetOffersButton"),
        importOffersButton: document.getElementById("importOffersButton"),
        exportOffersButton: document.getElementById("exportOffersButton"),
        importOffersInput: document.getElementById("importOffersInput"),
        saveStatus: document.getElementById("saveStatus"),
        resultPanel: document.getElementById("resultPanel"),
        resultToggle: document.getElementById("toggleOfferList"),
        resultContent: document.getElementById("offerListContent"),
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

    if (!core || !model || !selectors || !window.OfferCompareEditor || !window.OfferCompareOrder) {
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

    function saveViewPreferences() {
        try {
            window.localStorage.setItem(storageKey + ".view", JSON.stringify({
                sortKey: uiState.sortKey, sortDirection: uiState.sortDirection
            }));
        } catch (error) { /* Sorting remains available without browser storage. */ }
    }

    try {
        var storedView = JSON.parse(window.localStorage.getItem(storageKey + ".view") || "null");
        if (storedView && Array.from(elements.sortMetric.options).some(function (option) {
            return option.value === storedView.sortKey;
        })) {
            uiState.sortKey = storedView.sortKey;
            uiState.sortDirection = storedView.sortDirection === "asc" ? "asc" : "desc";
            elements.sortMetric.value = uiState.sortKey;
            elements.sortDirection.value = uiState.sortDirection;
        }
    } catch (error) { /* Ignore unavailable or outdated display preferences. */ }

    var editor = window.OfferCompareEditor.create({
        dialog: document.getElementById("offerEditDialog"),
        getSettings: function () { return state.settings; },
        onSave: function (offer, context) {
            if (context.mode === "edit") {
                if (!replaceOffer(offer)) { return false; }
            } else {
                if (!canCreateOffer("添加")) { return false; }
                var after = state.offers.findIndex(function (item) { return item.id === context.afterId; });
                if (after >= 0) { state.offers.splice(after + 1, 0, offer); }
                else { state.offers.push(offer); }
            }
            commitStateAndRefresh({ saveImmediately: true });
            return true;
        },
        onClose: function (context) {
            var trigger = context.trigger;
            if (!trigger || !trigger.isConnected) {
                var target = findOfferTarget(elements.comparisonTableBody,
                    "tr[data-offer-id]", context.mode === "copy" ? context.afterId : context.id);
                trigger = target && target.querySelector('.comparison-offer-link');
            }
            (trigger || elements.addOfferButton).focus({ preventScroll: true });
        }
    });

    var orderEditor = window.OfferCompareOrder.create({
        root: elements.resultPanel,
        tableBody: elements.comparisonTableBody,
        list: elements.orderList,
        status: elements.orderStatus
    });

    function offerIdentity(offer) {
        return (offer.department ? offer.company + " · " + offer.department : offer.company) +
            " · " + offer.city + " · " + formatMoney(offer.pay.monthlySalary) +
            " × " + numberFormatter.format(offer.pay.salaryMonths) + " 薪";
    }

    function syncOfferMode() {
        var busy = Boolean(offerMode);
        var count = state ? state.offers.length : 0;
        elements.resultPanel.dataset.offerMode = offerMode;
        elements.modeBar.hidden = !busy;
        elements.finishOrder.hidden = offerMode !== "order";
        elements.addOfferButton.disabled = busy;
        elements.copyOfferButton.disabled = busy || !count;
        elements.deleteOfferButton.disabled = busy || !count;
        elements.reorderOffersButton.disabled = busy || count < 2;
        elements.dataMenu.inert = busy;
        elements.resetOffersButton.disabled = busy || !state;
        elements.importOffersButton.disabled = busy;
        elements.exportOffersButton.disabled = busy;
        elements.sortMetric.disabled = busy;
        elements.sortDirection.disabled = busy || uiState.sortKey === "custom";
        elements.settingsForm.inert = busy;
        elements.hoursBasisControls.forEach(function (control) { control.disabled = busy; });
        elements.taxExplanations.inert = busy;
        elements.comparisonTableBody.querySelectorAll('.comparison-offer-link').forEach(function (button) {
            var offer = getOfferById(button.dataset.offerId);
            var action = offerMode === "copy" ? "复制" : offerMode === "delete" ? "删除" : "编辑";
            button.disabled = offerMode === "order";
            button.title = busy ? "选择此 Offer 进行" + action : "编辑此 Offer";
            button.setAttribute("aria-label", action + " " + offerIdentity(offer));
            if (busy) { button.setAttribute("aria-describedby", "offerModeHint"); }
            else { button.removeAttribute("aria-describedby"); }
        });
        elements.comparisonTableBody.querySelectorAll('.tax-cell__trigger').forEach(function (button) {
            button.disabled = busy;
        });
    }

    function setOfferListExpanded(expanded) {
        if (!expanded && elements.resultContent.contains(document.activeElement)) {
            elements.resultToggle.focus({ preventScroll: true });
        }
        elements.resultToggle.setAttribute("aria-expanded", String(expanded));
        elements.resultPanel.dataset.expanded = String(expanded);
        elements.resultContent.hidden = !expanded;
        if (!expanded) {
            elements.dataMenu.open = false;
            endOfferMode(false);
        }
    }

    function beginOfferMode(mode, trigger) {
        if (offerMode || !state.offers.length || (mode === "order" && state.offers.length < 2)) { return; }
        if (mode === "copy" && !canCreateOffer("复制")) { return; }
        offerMode = mode;
        modeTrigger = trigger;
        setOfferListExpanded(true);
        elements.dataMenu.open = false;
        elements.modeHint.textContent = mode === "order"
            ? "调整顺序：拖动手柄或使用上移、下移，完成后保存。"
            : "请选择要" + (mode === "copy" ? "复制" : "删除") + "的 Offer；点击任意目标行。";
        syncOfferMode();
        if (mode === "order") {
            orderEditor.start(sortViews(selectors.createComparisonViews(latestCalculation)));
        }
        var target = mode === "order"
            ? Array.from(elements.resultPanel.querySelectorAll('.offer-drag-handle')).find(function (button) { return button.getClientRects().length; })
            : elements.comparisonTableBody.querySelector('.comparison-offer-link');
        if (target) { target.focus({ preventScroll: true }); }
    }

    function endOfferMode(restoreFocus) {
        if (!offerMode) { return; }
        var wasOrder = offerMode === "order";
        offerMode = "";
        if (wasOrder) {
            orderEditor.stop();
            renderResults(latestCalculation);
        }
        syncOfferMode();
        elements.orderStatus.textContent = "";
        if (restoreFocus && modeTrigger) { modeTrigger.focus({ preventScroll: true }); }
        modeTrigger = null;
    }

    function finishOfferOrder() {
        if (offerMode !== "order") { return; }
        var ids = orderEditor.getOrder();
        var offers = new Map(state.offers.map(function (offer) { return [offer.id, offer]; }));
        endOfferMode(false);
        state.offers = ids.map(function (id) { return offers.get(id); });
        uiState.sortKey = "custom";
        saveViewPreferences();
        commitStateAndRefresh({ saveImmediately: true });
        elements.orderStatus.textContent = "已保存自定义顺序。";
        elements.reorderOffersButton.focus({ preventScroll: true });
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
        if (offerMode) { elements.resetOffersButton.disabled = true; }
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

    function saveStateSoon(immediate) {
        window.clearTimeout(saveTimer);

        if (latestCalculation && latestCalculation.validation.errors.length) {
            elements.saveStatus.textContent =
                "存在未通过校验的输入；无效更改暂未自动保存。";
            return;
        }

        activeDataOrigin = "browser";
        updateDataSourceLabel();
        function persist() {
            try {
                window.localStorage.setItem(
                    storageKey,
                    JSON.stringify(latestCalculation.state)
                );
                elements.saveStatus.textContent = "已保存到当前浏览器。";
            } catch (error) {
                elements.saveStatus.textContent = "浏览器未允许本地保存；本次计算仍然有效。";
            }
        }
        if (immediate) { persist(); }
        else { saveTimer = window.setTimeout(persist, 180); }
    }

    function updateSettingsSummary() {
        var settings = latestCalculation
            ? latestCalculation.state.settings
            : state.settings;

        elements.settingsSummaryMeta.textContent =
            settings.year + " · 默认社保 " +
            Number((settings.socialInsuranceRate * 100).toFixed(3)) + "%";
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
        elements.sortMetric.value = uiState.sortKey;
        elements.sortDirection.value = uiState.sortDirection;
        syncOfferMode();
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

    var taxView = window.OfferCompareTaxView.create({
        uiState: uiState,
        elements: elements,
        findOfferTarget: findOfferTarget,
        sortViews: sortViews,
        getLatestCalculation: function () {
            return latestCalculation;
        }
    });
    var selectedTaxLabel = taxView.selectedTaxLabel;
    var createTaxCell = taxView.createTaxCell;
    var syncTaxTriggerExpanded = taxView.syncTaxTriggerExpanded;
    var renderTaxExplanations = taxView.renderTaxExplanations;

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
            offerLink.type = "button";
            offerLink.dataset.action = "jump-to-offer";
            offerLink.dataset.offerId = view.id;
            offerLink.setAttribute("aria-label", "编辑 " + view.name);
            offerLink.title = "编辑此 Offer";
            var identityLine = createElement("span", "comparison-offer-identity");
            identityLine.append(name);
            offerLink.append(identityLine, meta);
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
            appendMetricCell(
                row,
                view.annualPretaxCash,
                formatMoney(view.annualPretaxCash),
                best.annualPretaxCash
            );
            row.appendChild(createTaxCell(view));
            appendMetricCell(
                row,
                view.annualTakeHomeCash,
                formatMoney(view.annualTakeHomeCash),
                best.annualTakeHomeCash
            );
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
            appendMetricCell(row, view.weeklyHours, formatHours(view.weeklyHours, "h"), best.weeklyHours);
            appendMetricCell(row, view.pretaxHourly, formatHourly(view.pretaxHourly, "h"), best.pretaxHourly);
            appendMetricCell(row, view.afterTaxHourly, formatHourly(view.afterTaxHourly, "h"), best.afterTaxHourly);
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
                formatHourly(hourlyBest.afterTaxHourly, "h")
            ),
            createSummaryItem(
                "税后到手最高",
                incomeBest.name,
                formatMoney(incomeBest.annualTakeHomeCash)
            ),
            createSummaryItem(
                "周工作时长最低",
                hoursBest.name,
                formatHours(hoursBest.weeklyHours, "h")
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
        elements.settingsForm.querySelectorAll(
            "[data-field-validation-error]"
        ).forEach(function (message) {
            message.remove();
        });
        elements.settingsForm.querySelectorAll(
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
        return settingsControls[validationIssue.path]
            ? [settingsControls[validationIssue.path]] : [];
    }

    function renderFieldValidation(calculation) {
        clearFieldValidation();

        elements.settingsForm.querySelectorAll("input, select").forEach(
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
        var views = selectors.createComparisonViews(latestCalculation);
        var errors = latestCalculation.validation.errors;

        if (errors.length) {
            elements.settingsPanel.open = true;
        }

        elements.hoursColumnHeading.textContent = "周工时";
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
        renderResultControls();
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
        renderResults(calculation);
        if (!options || options.save !== false) {
            saveStateSoon(options && options.saveImmediately);
        }
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

    function jumpToOffer(offerId, trigger) {
        var offer = getOfferById(offerId);
        if (offer) { editor.open(offer, { mode: "edit", trigger: trigger }); }
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
        if (offerMode) { return; }
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
        commitStateAndRefresh();
    }

    function handleHoursBasisChange(event) {
        if (offerMode) { return; }
        state.settings.primaryHoursBasis = event.currentTarget.value;
        commitStateAndRefresh();
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

    function addOffer(event) {
        if (offerMode) { return; }
        if (canCreateOffer("添加")) {
            editor.open(model.createOffer(createUniqueOfferId()), {
                mode: "new", trigger: event && event.currentTarget
            });
        }
    }

    function duplicateOffer(offerId, trigger) {
        var source = getOfferById(offerId);
        if (source && canCreateOffer("复制")) {
            editor.open(model.duplicateOffer(source, createUniqueOfferId()), {
                mode: "copy", afterId: offerId, trigger: trigger
            });
        }
    }

    function deleteOffer(offerId) {
        var offer = getOfferById(offerId);
        if (!offer) { return; }
        var views = sortViews(selectors.createComparisonViews(latestCalculation));
        var index = views.findIndex(function (view) { return view.id === offerId; });
        var next = views[index + 1] || views[index - 1];
        if (!window.confirm("确定删除以下 Offer 吗？\n" + offerIdentity(offer))) {
            endOfferMode(true);
            return;
        }
        endOfferMode(false);
        state.offers = state.offers.filter(function (candidate) { return candidate.id !== offerId; });
        delete uiState.expandedTaxExplanationIds[offerId];
        commitStateAndRefresh({ saveImmediately: true });
        var row = next && findOfferTarget(elements.comparisonTableBody, "tr[data-offer-id]", next.id);
        (row ? row.querySelector(".comparison-offer-link") : elements.addOfferButton).focus({ preventScroll: true });
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
        uiState.expandedTaxExplanationIds = Object.create(null);
        activeDataOrigin = "source";
        updateDataSourceLabel();
        renderSettings();
        commitStateAndRefresh({ save: false });
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
        link.download = "private.json";
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
            endOfferMode(false);
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
            uiState.expandedTaxExplanationIds = Object.create(null);
            renderSettings();
            commitStateAndRefresh({ saveImmediately: true });
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

    elements.comparisonTableBody.addEventListener("click", whenApplicationReady(function (event) {
        if (offerMode === "order") { return; }
        if (offerMode) {
            var row = event.target.closest("tr[data-offer-id]");
            if (!row) { return; }
            event.preventDefault();
            var id = row.dataset.offerId;
            if (offerMode === "copy") {
                endOfferMode(false);
                duplicateOffer(id, row.querySelector(".comparison-offer-link"));
            } else { deleteOffer(id); }
            return;
        }
        var trigger = event.target.closest("[data-action]");
        if (!trigger) { return; }
        if (trigger.dataset.action === "jump-to-offer") {
            jumpToOffer(trigger.dataset.offerId, trigger);
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
    elements.copyOfferButton.addEventListener("click", whenApplicationReady(function (event) { beginOfferMode("copy", event.currentTarget); }));
    elements.deleteOfferButton.addEventListener("click", whenApplicationReady(function (event) { beginOfferMode("delete", event.currentTarget); }));
    elements.reorderOffersButton.addEventListener("click", whenApplicationReady(function (event) { beginOfferMode("order", event.currentTarget); }));
    elements.cancelMode.addEventListener("click", function () { endOfferMode(true); });
    elements.finishOrder.addEventListener("click", finishOfferOrder);
    elements.resultToggle.addEventListener("click", function () {
        setOfferListExpanded(elements.resultContent.hidden);
    });
    elements.resultToggle.closest("header").addEventListener("click", function (event) {
        if (!event.target.closest(".comparison-actions, button")) {
            elements.resultToggle.click();
        }
    });
    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape" || document.getElementById("offerEditDialog").open) { return; }
        if (offerMode) { event.preventDefault(); endOfferMode(true); }
        else if (elements.dataMenu.open) {
            elements.dataMenu.open = false;
            elements.dataMenu.querySelector("summary").focus();
        }
    });
    document.addEventListener("click", function (event) {
        if (!elements.dataMenu.contains(event.target)) { elements.dataMenu.open = false; }
    });
    elements.dataMenu.addEventListener("click", function (event) {
        if (event.target.closest("button")) {
            elements.dataMenu.open = false;
            elements.dataMenu.querySelector("summary").focus({ preventScroll: true });
        }
    });
    elements.resetOffersButton.addEventListener("click", whenApplicationReady(resetOffers));
    elements.exportOffersButton.addEventListener("click", whenApplicationReady(exportState));
    elements.importOffersButton.addEventListener("click", whenApplicationReady(function () {
        elements.importOffersInput.click();
    }));
    elements.importOffersInput.addEventListener("change", whenApplicationReady(function () {
        importState(elements.importOffersInput.files[0]);
    }));
    function handleSortChange() {
        if (offerMode) { return; }
        uiState.sortKey = elements.sortMetric.value;
        uiState.sortDirection = elements.sortDirection.value;
        saveViewPreferences();
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
        commitStateAndRefresh({ save: false });
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
            commitStateAndRefresh({ save: false });
        } finally {
            finishInitialization();
        }
    });
}());
