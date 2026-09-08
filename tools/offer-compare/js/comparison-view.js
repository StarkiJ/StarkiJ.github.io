(function (root) {
    "use strict";
    function create(options) {
        var elements = options.elements;
        var selectors = root.OfferCompareSelectors;
        var { createElement, createId, numberFormatter, formatMoney, formatHours, formatHourly } = root.OfferCompareUi;
        var selectedTaxLabel = options.taxView.selectedTaxLabel;
        var createTaxCell = options.taxView.createTaxCell;

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

        function renderTable(views) {
            var best = selectors.bestValues(views);
            var rows = views.map(function (view) {
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

        function render(calculation, views, sortedViews) {
            var errors = calculation.validation.errors;
            elements.hoursColumnHeading.textContent = "周工时";
            renderAssumptions(calculation);

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
                renderTable(sortedViews);
            }
            if (errors.length) {
                elements.resultStatus.textContent =
                    "有 " + errors.length + " 项输入需要检查：" + errors[0].message;
                elements.resultStatus.classList.add("is-error");
            } else {
                elements.resultStatus.textContent = views.length + " 个 Offer";
                elements.resultStatus.classList.remove("is-error");
            }
        }
        return { render: render };
    }
    root.OfferCompareComparisonView = { create: create };
}(window));
