(function (root) {
    "use strict";

    var ui = root.OfferCompareUi;

    function create(options) {
        var dialog = options.dialog;
        var content = dialog.querySelector("#taxDetailBody");
        var identity = dialog.querySelector("#taxDetailIdentity");
        var title = dialog.querySelector("#taxDetailTitle");
        var returnTarget = null;
        var selectedId = null;
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
            container.appendChild(createElement("h3", "tax-explanation__section-title", title));
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
                "专项附加扣除（我的计算设置）",
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
                "数值来自该 Offer、“我的计算设置”和计算器内置" +
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

            cell.id = createId("tax-cell", view.id);
            cell.dataset.offerId = view.id;
            trigger.type = "button";
            trigger.id = createId("tax-cell-trigger", view.id);
            trigger.dataset.action = "show-tax-details";
            trigger.title = "查看个税计算详情";
            trigger.dataset.offerId = view.id;
            trigger.setAttribute(
                "aria-label",
                formatMoney(result.metrics.annualIncomeTax) + "，查看 " +
                    view.name + " 的个人所得税计算详情"
            );
            trigger.setAttribute("aria-controls", dialog.id);
            trigger.setAttribute("aria-haspopup", "dialog");
            trigger.appendChild(value);
            cell.appendChild(trigger);
            return cell;
        }

        function close() {
            if (!dialog.open) { return; }
            dialog.close();
            document.documentElement.classList.remove("tax-detail-open");
            content.replaceChildren();
            identity.textContent = "";
            delete dialog.dataset.offerId;
            var target = returnTarget && returnTarget.isConnected ? returnTarget :
                Array.from(document.querySelectorAll(".tax-cell__trigger")).find(function (button) {
                    return button.dataset.offerId === selectedId;
                });
            if (target) { target.focus({ preventScroll: true }); }
            returnTarget = null;
            selectedId = null;
        }

        function open(offerId, trigger) {
            if (document.querySelector("dialog[open]")) { return; }
            var calculation = getLatestCalculation();
            var view = root.OfferCompareSelectors.createComparisonViews(calculation).find(function (item) {
                return item.id === offerId;
            });
            if (!view) { return; }
            selectedId = offerId;
            returnTarget = trigger;
            dialog.dataset.offerId = offerId;
            identity.textContent = view.name + " · " + view.city + " · " +
                formatMoney(view.monthlySalary) + " × " + numberFormatter.format(view.salaryMonths) + " 薪";
            var overview = createElement("section", "tax-detail-overview");
            overview.setAttribute("aria-label", "个税计算结果");
            overview.append(
                createElement("span", "", "归属于该 Offer 的年度个税"),
                createElement("strong", "tax-detail-amount", formatPreciseMoney(view.annualIncomeTax)),
                createElement("p", "tax-detail-method", calculation.taxPolicy.requestedYear + " 年 · " + selectedTaxLabel(view.result))
            );
            content.replaceChildren(overview, createTaxExplanationBody(view, calculation.taxPolicy, calculation.taxBaseline));
            dialog.showModal();
            document.documentElement.classList.add("tax-detail-open");
            content.scrollTop = 0;
            title.focus({ preventScroll: true });
        }

        dialog.querySelector("#closeTaxDetail").addEventListener("click", close);
        dialog.querySelector("#dismissTaxDetail").addEventListener("click", close);
        dialog.addEventListener("cancel", function (event) { event.preventDefault(); close(); });

        return Object.freeze({
            selectedTaxLabel: selectedTaxLabel,
            createTaxCell: createTaxCell,
            open: open
        });
    }

    root.OfferCompareTaxView = Object.freeze({ create: create });
}(window));
