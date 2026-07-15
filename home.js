(() => {
    const header = document.querySelector(".home-page .site-header");
    const sectionLinks = Array.from(document.querySelectorAll('.home-page .site-nav a[href^="#"]'));
    const sections = sectionLinks
        .map((link) => document.querySelector(link.getAttribute("href")))
        .filter(Boolean);

    if (!header || sections.length === 0) {
        return;
    }

    let frameRequested = false;

    function updateNavigation() {
        const viewportTop = header.offsetHeight;
        const activationLine = viewportTop + (window.innerHeight - viewportTop) * 0.2;
        let activeSection = sections[0];

        sections.forEach((section) => {
            if (section.getBoundingClientRect().top <= activationLine) {
                activeSection = section;
            }
        });

        const pageBottom = document.documentElement.scrollHeight;
        const hasReachedBottom = window.scrollY + window.innerHeight >= pageBottom - 2;

        if (hasReachedBottom) {
            activeSection = sections[sections.length - 1];
        }

        sectionLinks.forEach((link) => {
            const isActive = link.getAttribute("href") === `#${activeSection.id}`;
            link.classList.toggle("is-active", isActive);

            if (isActive) {
                link.setAttribute("aria-current", "location");
            } else {
                link.removeAttribute("aria-current");
            }
        });

        header.classList.toggle("is-scrolled", window.scrollY > 8);
        frameRequested = false;
    }

    function scheduleUpdate() {
        if (!frameRequested) {
            window.requestAnimationFrame(updateNavigation);
            frameRequested = true;
        }
    }

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    updateNavigation();
})();
