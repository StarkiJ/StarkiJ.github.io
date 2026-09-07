(function () {
    "use strict";

    // This controller only changes a draft sequence of IDs. The application saves on Done.
    window.OfferCompareOrder = { create: function (options) {
        var ui = window.OfferCompareUi;
        var root = options.root;
        var ids = [];
        var views = new Map();
        var active = false;
        var drag = null;
        var frame = 0;
        var suppressClickUntil = 0;
        var viewport = window.matchMedia("(max-width: 640px)");

        function controls(id) {
            var group = ui.createElement("div", "offer-order-controls");
            [["drag", "⠿", "拖动排序；也可用方向键调整"], ["up", "↑", "上移"], ["down", "↓", "下移"]].forEach(function (item) {
                var button = ui.createElement("button", item[0] === "drag" ? "offer-drag-handle" : "offer-order-arrow", item[1]);
                button.type = "button";
                button.dataset.orderAction = item[0];
                button.dataset.offerId = id;
                button.title = item[2];
                button.setAttribute("aria-label", item[2] + " " + views.get(id).name);
                button.setAttribute("aria-describedby", "orderStatus");
                group.appendChild(button);
            });
            return group;
        }

        function announce(id) {
            options.status.textContent = "“" + views.get(id).name + "”位于第 " + (ids.indexOf(id) + 1) + " 位，共 " + ids.length + " 项。";
        }

        function arrange() {
            [options.tableBody, options.list].forEach(function (container) {
                var rows = new Map(Array.from(container.children).map(function (row) { return [row.dataset.offerId, row]; }));
                ids.forEach(function (id, index) {
                    var row = rows.get(id);
                    if (container.children[index] !== row) { container.insertBefore(row, container.children[index] || null); }
                    row.querySelector('[data-order-action="up"]').disabled = index === 0;
                    row.querySelector('[data-order-action="down"]').disabled = index === ids.length - 1;
                });
            });
        }

        function move(id, next) {
            var index = ids.indexOf(id);
            if (index < 0 || next < 0 || next >= ids.length || next === index) { return; }
            var focused = document.activeElement;
            ids.splice(index, 1);
            ids.splice(next, 0, id);
            arrange();
            if (!drag && focused && focused.isConnected) {
                var focusTarget = focused.disabled ? focused.parentElement.querySelector('.offer-drag-handle') : focused;
                focusTarget.focus({ preventScroll: true });
            }
            announce(id);
        }

        function stopDrag(cancelled) {
            if (!drag) { return; }
            var current = drag;
            drag = null;
            cancelAnimationFrame(frame);
            if (root.hasPointerCapture(current.pointerId)) { root.releasePointerCapture(current.pointerId); }
            current.row.classList.remove("is-order-dragging");
            current.preview.remove();
            if (cancelled) { ids = current.before; arrange(); }
            if (current.started) { suppressClickUntil = performance.now() + 300; }
            if (current.handle.isConnected) { current.handle.focus({ preventScroll: true }); }
            announce(current.id);
        }

        function updateDrag() {
            if (!drag || !drag.started) { return; }
            var candidates = Array.from(drag.container.children).filter(function (row) { return row.dataset.offerId !== drag.id; });
            var next = candidates.findIndex(function (row) {
                var rect = row.getBoundingClientRect();
                return drag.y < rect.top + rect.height / 2;
            });
            move(drag.id, next < 0 ? candidates.length : next);
            drag.preview.style.top = Math.max(8, Math.min(window.innerHeight - 64, drag.y - 22)) + "px";
            drag.preview.style.left = Math.max(8, Math.min(window.innerWidth - drag.preview.offsetWidth - 8, drag.x + 18)) + "px";
        }

        function scrollFrame() {
            if (!drag) { return; }
            if (drag.started) {
                var edgeTop = Math.max(100, document.getElementById("offerModeBar").getBoundingClientRect().bottom + 20);
                var speed = drag.y < edgeTop ? -12 : drag.y > window.innerHeight - 64 ? 12 : 0;
                if (speed) { window.scrollBy(0, speed); updateDrag(); }
            }
            frame = requestAnimationFrame(scrollFrame);
        }

        root.addEventListener("pointerdown", function (event) {
            var handle = event.target.closest('.offer-drag-handle');
            if (!active || !handle || event.button !== 0 || !event.isPrimary || drag) { return; }
            var row = handle.closest('[data-offer-id].offer-order-item, tr[data-offer-id]');
            event.preventDefault();
            handle.focus({ preventScroll: true });
            var preview = ui.createElement("div", "offer-order-preview", views.get(handle.dataset.offerId).name);
            preview.hidden = true;
            preview.setAttribute("aria-hidden", "true");
            document.body.appendChild(preview);
            drag = { id: handle.dataset.offerId, handle: handle, row: row, container: row.parentElement,
                pointerId: event.pointerId, x: event.clientX, y: event.clientY, startY: event.clientY,
                before: ids.slice(), preview: preview, started: false };
            root.setPointerCapture(event.pointerId);
            frame = requestAnimationFrame(scrollFrame);
        });
        root.addEventListener("pointermove", function (event) {
            if (!drag || drag.pointerId !== event.pointerId) { return; }
            drag.x = event.clientX;
            drag.y = event.clientY;
            if (!drag.started && Math.abs(drag.y - drag.startY) >= 5) {
                drag.started = true;
                drag.preview.hidden = false;
                drag.row.classList.add("is-order-dragging");
            }
            updateDrag();
        });
        root.addEventListener("pointerup", function (event) {
            if (drag && drag.pointerId === event.pointerId) { stopDrag(false); }
        });
        root.addEventListener("pointercancel", function () { stopDrag(true); });
        root.addEventListener("lostpointercapture", function () { stopDrag(true); });
        window.addEventListener("blur", function () { stopDrag(true); });
        viewport.addEventListener("change", function () { stopDrag(true); });
        root.addEventListener("click", function (event) {
            if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
        }, true);
        root.addEventListener("click", function (event) {
            var button = event.target.closest('[data-order-action]');
            if (!active || !button || button.disabled || button.dataset.orderAction === "drag") { return; }
            move(button.dataset.offerId, ids.indexOf(button.dataset.offerId) + (button.dataset.orderAction === "up" ? -1 : 1));
        });
        root.addEventListener("keydown", function (event) {
            var handle = event.target.closest('.offer-drag-handle');
            if (!active || !handle || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) { return; }
            event.preventDefault();
            move(handle.dataset.offerId, ids.indexOf(handle.dataset.offerId) + (event.key === "ArrowUp" ? -1 : 1));
        });

        return {
            start: function (sortedViews) {
                active = true;
                ids = sortedViews.map(function (view) { return view.id; });
                views = new Map(sortedViews.map(function (view) { return [view.id, view]; }));
                options.list.replaceChildren();
                Array.from(options.tableBody.children).forEach(function (row) {
                    row.firstElementChild.appendChild(controls(row.dataset.offerId));
                });
                sortedViews.forEach(function (view) {
                    var row = ui.createElement("li", "offer-order-item");
                    row.dataset.offerId = view.id;
                    var identity = ui.createElement("div", "offer-order-identity");
                    identity.append(ui.createElement("strong", "", view.name),
                        ui.createElement("span", "", view.city + " · " + ui.formatMoney(view.monthlySalary) + " × " + ui.numberFormatter.format(view.salaryMonths) + " 薪"));
                    row.append(identity, controls(view.id));
                    options.list.appendChild(row);
                });
                options.list.hidden = false;
                arrange();
                announce(ids[0]);
            },
            getOrder: function () { return ids.slice(); },
            stop: function () {
                stopDrag(true);
                active = false;
                options.tableBody.querySelectorAll('.offer-order-controls').forEach(function (group) { group.remove(); });
                options.list.replaceChildren();
                options.list.hidden = true;
                views.clear();
            }
        };
    } };
}());
