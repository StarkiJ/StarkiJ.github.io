function measureCollapsedPrimaryPanels() {
    const primaryPanels = [
        ["我的计算设置", document.querySelector("#settingsPanel")],
        ["Offer 列表", document.querySelector("#resultPanel")],
        [
            "计算方法",
            document.querySelector('[data-testid="calculation-method"]')
        ]
    ];
    const openStates = primaryPanels.map(([, panel]) => panel.querySelector('#toggleOfferList')
        ? panel.dataset.expanded === 'true' : panel.open);
    function setExpanded(panel, expanded) {
        const toggle = panel.querySelector('#toggleOfferList');
        if (toggle) {
            if ((toggle.getAttribute('aria-expanded') === 'true') !== expanded) { toggle.click(); }
        } else { panel.open = expanded; }
    }

    primaryPanels.forEach(([, panel]) => {
        setExpanded(panel, false);
    });
    const measurements = primaryPanels.map(([name, panel]) => {
        const summary = panel.querySelector(":scope > summary, :scope > header");
        const heading = summary.querySelector(".settings-summary__heading, .collapsible-tool-summary__heading");
        const eyebrow = heading.querySelector(".eyebrow");
        const panelRect = panel.getBoundingClientRect();
        const summaryRect = summary.getBoundingClientRect();
        const summaryStyle = getComputedStyle(summary);
        const marker = summary.querySelector('.comparison-collapse-icon');
        const markerStyle = marker ? getComputedStyle(marker) : getComputedStyle(summary, "::after");

        return {
            name,
            width: panelRect.width,
            height: panelRect.height,
            summaryHeight: summaryRect.height,
            minHeight: summaryStyle.minHeight,
            padding: summaryStyle.padding,
            gap: summaryStyle.gap,
            titleFontSize: getComputedStyle(
                summary.querySelector("h2")
            ).fontSize,
            headingGap: getComputedStyle(heading).gap,
            eyebrowFontSize: getComputedStyle(eyebrow).fontSize,
            markerWidth: markerStyle.width,
            markerHeight: markerStyle.height,
            markerBorderRightWidth: markerStyle.borderRightWidth,
            markerBorderBottomWidth: markerStyle.borderBottomWidth,
            summaryFits: summary.scrollWidth <= summary.clientWidth + 1
        };
    });

    primaryPanels.forEach(([, panel], index) => {
        setExpanded(panel, openStates[index]);
    });
    return measurements;
}

function readTypography(element) {
    const style = getComputedStyle(element);
    return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        fontFamily: style.fontFamily
    };
}

export {
    measureCollapsedPrimaryPanels,
    readTypography
};
