(function (root) {
    "use strict";

    function create(options) {
        var ui = root.OfferCompareUi;
        var core = root.OfferCompareCore;
        var model = root.OfferCompareModel;
        var selectors = root.OfferCompareSelectors;
        var createElement = ui.createElement;
        var createId = ui.createId;
        var numberFormatter = ui.numberFormatter;
        var ratePercentValue = ui.ratePercentValue;
        var weekdayNames = ui.weekdayNames;
        var weeklyHoursSummaryLabel = ui.weeklyHoursSummaryLabel;
        var dialog = options.dialog;
        var form = dialog.querySelector("form");
        var fields = dialog.querySelector("#offerEditFields");
        var preview = dialog.querySelector("#offerEditPreview");
        var status = dialog.querySelector("#offerEditStatus");
        var title = dialog.querySelector("#offerEditTitle");
        var draft;
        var settings;
        var context;
        var calculation;
        var overtimeOpen = false;

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
            input.required = options.path === "company" ||
                (input.type === "number" && !options.nullable);
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
            var weeklyHours = settings.primaryHoursBasis === "net"
                ? calculatedOffer.work.averageWeeklyNetHours
                : calculatedOffer.work.averageWeeklyPresenceHours;

            return "工作时长 · " +
                weeklyHoursSummaryLabel(settings.primaryHoursBasis) + " " +
                numberFormatter.format(weeklyHours) + " 小时";
        }

        function createScheduleEditor(offer, calculatedOffer) {
            var details = createElement("details", "schedule-details overtime-details");
            var summary = createElement("summary", "", "额外班次与加班费");
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
                placeholder: "默认 " + numberFormatter.format(settings.lunchBreakHours),
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
                placeholder: "默认 " + numberFormatter.format(settings.dinnerBreakHours),
                hint: "留空继承全局默认；填写后用于这个岗位，默认仅在 " +
                    settings.dinnerThreshold + " 后下班时扣除。"
            });

            details.appendChild(summary);
            controls.append(
                createTemplateField(offer),
                cycleField,
                lunchBreakField,
                dinnerBreakField
            );
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
            content.appendChild(overtimeGrid);
            details.appendChild(content);
            details.open = overtimeOpen;
            details.addEventListener("toggle", function () {
                if (details.isConnected) { overtimeOpen = details.open; }
            });
            var section = createElement("section", "offer-edit-section");
            var heading = createElement("h3", "", "工作安排");
            var hours = createElement("p", "schedule-summary", scheduleSummaryText(offer, calculatedOffer));
            section.append(heading, hours, controls, createScheduleMatrix(offer), details);
            return section;
        }

        function clearFieldValidation() {
            form.querySelectorAll(
                "[data-field-validation-error]"
            ).forEach(function (message) {
                message.remove();
            });
            form.querySelectorAll(
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


        function calculate() {
            calculation = core.calculateAll({ version: core.VERSION, settings: settings, offers: [draft] });
            return calculation;
        }

        function renderFields() {
            var offer = draft;
            var grid = createElement("div", "offer-card__grid");
            calculate();
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
                hint: "没有可靠的全国通用缴费基数上下限；城市未知时使用“通用”，个人社保和公积金均按月薪与填写比例直接估算。"
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
                placeholder: "默认 " + numberFormatter.format(settings.socialInsuranceRate * 100) + "%",
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

            var basic = createElement("section", "offer-edit-section");
            var basicGrid = createElement("div", "offer-card__grid");
            Array.from(grid.children).slice(0, 3).forEach(function (field) { basicGrid.appendChild(field); });
            basic.append(createElement("h3", "", "基本信息"), basicGrid);
            var pay = createElement("section", "offer-edit-section");
            pay.append(createElement("h3", "", "薪酬待遇"), grid);
            var scrollTop = fields.scrollTop;
            fields.replaceChildren(basic, pay, createScheduleEditor(offer, calculation.results[0]));
            fields.scrollTop = scrollTop;
            refresh();
        }

        function renderSchedule(focusSelector, action) {
            var previous = fields.lastElementChild;
            // Preserve incomplete numeric text when rebuilding the schedule controls.
            var values = Array.from(previous.querySelectorAll("[data-path]")).map(function (control) {
                return { path: control.dataset.path, value: control.value };
            });
            var cycle = previous.querySelector('[data-action="cycle-weeks"]');
            var invalidCycle = !cycle.validity.valid && action !== "apply-template"
                ? cycle.value : null;
            var scrollTop = fields.scrollTop;
            calculate();
            var next = createScheduleEditor(draft, calculation.results[0]);
            previous.replaceWith(next);
            values.forEach(function (entry) {
                var control = Array.from(next.querySelectorAll("[data-path]")).find(function (candidate) {
                    return candidate.dataset.path === entry.path;
                });
                if (control) { control.value = entry.value; }
            });
            if (invalidCycle !== null) {
                next.querySelector('[data-action="cycle-weeks"]').value = invalidCycle;
            }
            fields.scrollTop = scrollTop;
            refresh();
            var control = fields.querySelector(focusSelector);
            if (control) { control.focus({ preventScroll: true }); }
        }

        function controlsForIssue(issue) {
            var path = issue.path.replace(/^offers\[0\]\.?/, "");
            var dayMatch = /^schedule\.days\[(\d+)\]/.exec(path);
            if (dayMatch) {
                var day = calculation.state.offers[0].schedule.days[Number(dayMatch[1])];
                return day ? Array.from(fields.querySelectorAll("[data-day-field]")).filter(function (control) {
                    return Number(control.dataset.week) === day.week && Number(control.dataset.weekday) === day.weekday;
                }) : [];
            }
            if (path === "overtime") { return Array.from(fields.querySelectorAll('[data-path^="overtime."]')); }
            return Array.from(fields.querySelectorAll("[data-path]")).filter(function (control) {
                return control.dataset.path === path;
            });
        }

        function refresh() {
            calculate();
            clearFieldValidation();
            fields.querySelectorAll("input, select").forEach(function (control) {
                if (control.dataset.path === "company") {
                    control.setCustomValidity(control.value.trim() ? "" : "请填写公司名称。");
                }
                if (!control.disabled && !control.validity.valid) {
                    markControlInvalid(control, control.validity.valueMissing
                        ? "请填写此项。" : "请输入允许范围内的有效值。");
                }
            });
            calculation.validation.errors.forEach(function (issue) {
                controlsForIssue(issue).forEach(function (control) { markControlInvalid(control, issue.message); });
            });
            var invalid = fields.querySelector('[aria-invalid="true"]');
            var hasErrors = Boolean(invalid) || calculation.validation.errors.length > 0;
            var view = selectors.createComparisonViews(calculation)[0];
            preview.replaceChildren();
            [
                ["税后年收入", ui.formatMoney(view.annualTakeHomeCash)],
                [settings.primaryHoursBasis === "net" ? "周净工时" : "周在岗时长", ui.formatHours(view.weeklyHours)],
                ["税后等效时薪", ui.formatHourly(view.afterTaxHourly)]
            ].forEach(function (metric) {
                var item = createElement("div");
                item.append(createElement("span", "", metric[0]), createElement("strong", "", hasErrors ? "—" : metric[1]));
                preview.appendChild(item);
            });
            var summary = fields.querySelector(".schedule-summary");
            if (summary) { summary.textContent = scheduleSummaryText(draft, calculation.results[0]); }
            status.classList.toggle("is-error", hasErrors);
            status.textContent = hasErrors
                ? "请检查标出的输入。" + (calculation.validation.errors[0] ? calculation.validation.errors[0].message : "")
                : "参考结果 · 取消不会保留本次修改";
            return !hasErrors;
        }

        function inputValue(control) {
            if (control.dataset.nullable === "true" && control.value.trim() === "") { return null; }
            if (control.type === "number") {
                var value = ui.parseNumericInput(control.value, 0);
                return control.dataset.percent === "true" ? value / 100 : value;
            }
            return control.value;
        }

        form.addEventListener("input", function (event) {
            var control = event.target;
            if (control.dataset.path) {
                ui.setByPath(draft, control.dataset.path, inputValue(control));
            } else if (control.dataset.dayField) {
                var day = draft.schedule.days.find(function (item) {
                    return item.week === Number(control.dataset.week) &&
                        item.weekday === Number(control.dataset.weekday);
                });
                if (day) { day[control.dataset.dayField] = control.value; }
            }
            refresh();
        });

        form.addEventListener("change", function (event) {
            var control = event.target;
            var action = control.dataset.action;
            if (!action) { return; }
            if (!control.validity.valid) { refresh(); return; }
            var focusSelector = '[data-action="' + action + '"]';
            if (action === "apply-template") {
                var template = model.scheduleForTemplate(control.value);
                if (!template) { return; }
                template.lunchBreakHours = draft.schedule.lunchBreakHours;
                template.dinnerBreakHours = draft.schedule.dinnerBreakHours;
                draft.schedule = template;
            } else if (action === "cycle-weeks") {
                draft = model.resizeScheduleCycle(draft, control.value, core.MAX_CYCLE_WEEKS);
            } else if (action === "toggle-day") {
                draft = model.toggleScheduleDay(draft, Number(control.dataset.week), Number(control.dataset.weekday), control.checked);
                focusSelector += '[data-week="' + control.dataset.week + '"][data-weekday="' + control.dataset.weekday + '"]';
            } else { return; }
            var currentDetails = fields.querySelector(".overtime-details");
            overtimeOpen = currentDetails && currentDetails.open;
            renderSchedule(focusSelector, action);
        });

        function finish(saved) {
            if (!dialog.open) { return; }
            var closedContext = Object.assign({}, context, { id: draft.id, saved: saved });
            dialog.close();
            document.documentElement.classList.remove("offer-editor-open");
            fields.replaceChildren();
            preview.replaceChildren();
            draft = null;
            context = null;
            options.onClose(closedContext);
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            if (!refresh()) {
                var invalid = fields.querySelector('[aria-invalid="true"]');
                if (invalid) {
                    var details = invalid.closest("details");
                    if (details) { details.open = true; }
                    invalid.focus({ preventScroll: true });
                    invalid.scrollIntoView({ block: "nearest", behavior: "instant" });
                }
                return;
            }
            if (options.onSave(ui.clone(calculation.state.offers[0]), context) !== false) {
                finish(true);
            } else {
                status.classList.add("is-error");
                status.textContent = "未能保存，请检查 Offer 数量或重新打开编辑。";
            }
        });
        dialog.querySelector("#cancelOfferEdit").addEventListener("click", function () { finish(false); });
        dialog.querySelector("#closeOfferEdit").addEventListener("click", function () { finish(false); });
        dialog.addEventListener("cancel", function (event) { event.preventDefault(); finish(false); });

        return {
            open: function (offer, openContext) {
                if (dialog.open) { return; }
                draft = ui.clone(offer);
                settings = ui.clone(options.getSettings());
                context = Object.assign({}, openContext);
                context.trigger = context.trigger || document.activeElement;
                overtimeOpen = false;
                title.textContent = context.mode === "edit" ? "编辑 Offer" : context.mode === "copy" ? "复制 Offer" : "新增 Offer";
                renderFields();
                dialog.showModal();
                document.documentElement.classList.add("offer-editor-open");
                fields.scrollTop = 0;
                var company = fields.querySelector('[data-path="company"]');
                company.focus({ preventScroll: true });
                if (context.mode !== "edit") { company.select(); }
            }
        };
    }

    root.OfferCompareEditor = { create: create };
}(window));
