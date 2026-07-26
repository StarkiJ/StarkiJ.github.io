(function (root) {
    "use strict";

    var ui = root.OfferCompareUi;

    function create(options) {
        var uiState = options.uiState;
        var elements = options.elements;
        var findOfferTarget = options.findOfferTarget;
        var sortViews = options.sortViews;
        var getLatestCalculation = options.getLatestCalculation;
        var numberFormatter = ui.numberFormatter;
        var createElement = ui.createElement;
        var createId = ui.createId;
        var formatMoney = ui.formatMoney;
        var formatPreciseMoney = ui.formatPreciseMoney;
        var formatRate = ui.formatRate;
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
                getLatestCalculation().taxPolicy,
                getLatestCalculation().taxBaseline
            );
        });

        elements.taxExplanations.hidden = !explanations.length;
        elements.taxExplanationList.replaceChildren.apply(
            elements.taxExplanationList,
            explanations
        );
    }

        return Object.freeze({
            selectedTaxLabel: selectedTaxLabel,
            createTaxCell: createTaxCell,
            syncTaxTriggerExpanded: syncTaxTriggerExpanded,
            renderTaxExplanations: renderTaxExplanations
        });
    }

    root.OfferCompareTaxView = Object.freeze({ create: create });
}(window));
