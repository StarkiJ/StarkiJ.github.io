(function () {
    "use strict";

    var core = window.OfferCompareCore;
    var dataLoader = window.OfferCompareData;
    var model = window.OfferCompareModel;
    var selectors = window.OfferCompareSelectors;
    var ui = window.OfferCompareUi;
    // Check dependencies before reading their exports or initializing controls.
    if (!core || !model || !selectors || !ui ||
            !window.OfferCompareEditor || !window.OfferCompareOrder ||
            !window.OfferCompareTaxView || !window.OfferCompareStorage ||
            !window.OfferCompareComparisonView) {
        var application = document.getElementById("offerComparator");
        application.setAttribute("aria-busy", "false");
        application.removeAttribute("inert");
        document.getElementById("resultStatus").textContent =
            "应用模块加载失败，请刷新页面后重试。";
        return;
    }
    var storage = window.OfferCompareStorage.create({ core: core });
    var numberFormatter = ui.numberFormatter;
    var clone = ui.clone;
    var createElement = ui.createElement;
    var createUniqueOfferId = ui.createUniqueOfferId;
    var parseNumericInput = ui.parseNumericInput;
    var formatMoney = ui.formatMoney;
    var ratePercentValue = ui.ratePercentValue;
    var uiState = {
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
        hoursColumnHeading: document.getElementById("hoursColumnHeading")
    };

    var fieldValidation = ui.createFieldValidation(elements.settingsForm);

    elements.application.setAttribute("aria-busy", "true");
    elements.application.setAttribute("inert", "");
    uiState.sortKey = elements.sortMetric.value;
    uiState.sortDirection = elements.sortDirection.value;

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
        storage.saveView({ sortKey: uiState.sortKey, sortDirection: uiState.sortDirection });
    }

    var storedView = storage.loadView(Array.from(elements.sortMetric.options, function (option) { return option.value; }));
    if (storedView) {
        uiState.sortKey = storedView.sortKey;
        uiState.sortDirection = storedView.sortDirection;
        elements.sortMetric.value = uiState.sortKey;
        elements.sortDirection.value = uiState.sortDirection;
    }

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
        storage.cancelPending();

        if (latestCalculation && latestCalculation.validation.errors.length) {
            elements.saveStatus.textContent =
                "存在未通过校验的输入；无效更改暂未自动保存。";
            return;
        }

        activeDataOrigin = "browser";
        updateDataSourceLabel();
        storage.save(latestCalculation.state, immediate, function () {
            elements.saveStatus.textContent = "已保存到当前浏览器。";
        }, function () {
            elements.saveStatus.textContent = "浏览器未允许本地保存；本次计算仍然有效。";
        });
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

    var taxView = window.OfferCompareTaxView.create({
        dialog: document.getElementById("taxDetailDialog"),
        getLatestCalculation: function () {
            return latestCalculation;
        }
    });
    var comparisonView = window.OfferCompareComparisonView.create({ elements: elements, taxView: taxView });

    function controlsForValidationIssue(validationIssue) {
        var settingsControls = {
            "settings.year": elements.taxYear,
            "settings.socialInsuranceRate": elements.socialSecurityRate,
            "settings.specialAdditionalDeduction": elements.annualSpecialDeduction
        };
        return settingsControls[validationIssue.path]
            ? [settingsControls[validationIssue.path]] : [];
    }

    function renderFieldValidation(calculation) {
        fieldValidation.clear();

        elements.settingsForm.querySelectorAll("input, select").forEach(
            function (control) {
                if (!control.disabled && control.validity &&
                        !control.validity.valid) {
                    fieldValidation.mark(
                        control,
                        "请输入控件允许范围内的有效值。"
                    );
                }
            }
        );
        calculation.validation.errors.forEach(function (validationIssue) {
            controlsForValidationIssue(validationIssue).forEach(
                function (control) {
                    fieldValidation.mark(control, validationIssue.message);
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

        comparisonView.render(latestCalculation, views, sortViews(views));
        renderResultControls();
        renderFieldValidation(latestCalculation);

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

    function jumpToOffer(offerId, trigger) {
        var offer = getOfferById(offerId);
        if (offer) { editor.open(offer, { mode: "edit", trigger: trigger }); }
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
        storageCleared = storage.clear();
        state = clone(seedState);
        latestCalculation = null;
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
        storage.download(latestCalculation ? latestCalculation.state : state);
        elements.saveStatus.textContent = "JSON 已导出；文件为未加密明文，请妥善保存。";
    }

    function importState(file) {
        if (!file) {
            return;
        }
        storage.readImport(file).then(function (imported) {
            endOfferMode(false);
            if (!window.confirm("导入会替换当前 Offer 和计算设置，确定继续吗？")) {
                return;
            }
            state = imported;
            latestCalculation = null;
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
        } else if (trigger.dataset.action === "show-tax-details") {
            taxView.open(trigger.dataset.offerId, trigger);
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
        if (event.key !== "Escape" || document.querySelector("dialog[open]")) { return; }
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
        var stored = storage.load();
        storageWarning = stored.warning;
        storedState = stored.state;
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
