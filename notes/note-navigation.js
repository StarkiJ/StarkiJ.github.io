(() => {
    const toc = document.querySelector(".note-toc");
    if (!toc) return;
    const panel = toc.querySelector(".note-toc-panel");
    const branches = Array.from(toc.querySelectorAll(".note-toc-branch"));
    const defaults = branches.map(branch => branch.open);
    const controls = toc.querySelector(".note-toc-controls");
    controls.hidden = branches.length === 0;
    if (window.matchMedia("(max-width: 850px)").matches) panel.open = false;
    toc.querySelector("[data-toc-expand]").addEventListener("click", () => {
        branches.forEach(branch => { branch.open = true; });
    });
    toc.querySelector("[data-toc-collapse]").addEventListener("click", () => {
        branches.forEach((branch, index) => { branch.open = defaults[index]; });
    });
    function revealLocation() {
        toc.querySelectorAll("[aria-current]").forEach(item => item.removeAttribute("aria-current"));
        let anchor;
        try { anchor = decodeURIComponent(location.hash.slice(1)); } catch { return; }
        if (!anchor) return;
        const link = Array.from(toc.querySelectorAll("a")).find(item => item.hash.slice(1) === anchor);
        if (!link) return;
        for (let parent = link.parentElement; parent && parent !== panel; parent = parent.parentElement) {
            if (parent.tagName === "DETAILS") parent.open = true;
        }
        link.setAttribute("aria-current", "location");
    }
    window.addEventListener("hashchange", revealLocation);
    revealLocation();
})();
