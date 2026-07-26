function measureCollapsedPrimaryPanels() {
    const primaryPanels = [
        ["我的计算设置", document.querySelector("#settingsPanel")],
        ["Offer 信息", document.querySelector("#offerEditorPanel")],
        ["对比结果", document.querySelector("#resultPanel")],
        [
            "计算方法",
            document.querySelector('[data-testid="calculation-method"]')
        ]
    ];
    const openStates = primaryPanels.map(([, panel]) => panel.open);

    primaryPanels.forEach(([, panel]) => {
        panel.open = false;
    });
    const measurements = primaryPanels.map(([name, panel]) => {
        const summary = panel.querySelector(":scope > summary");
        const heading = summary.querySelector("h2 > span:first-child");
        const eyebrow = heading.querySelector(".eyebrow");
        const panelRect = panel.getBoundingClientRect();
        const summaryRect = summary.getBoundingClientRect();
        const summaryStyle = getComputedStyle(summary);
        const markerStyle = getComputedStyle(summary, "::after");

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
        panel.open = openStates[index];
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
