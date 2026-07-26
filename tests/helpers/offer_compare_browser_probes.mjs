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

function readOfferCardPresentation(card) {
    const cardStyle = getComputedStyle(card);
    const header = card.querySelector(".offer-card__header");
    const headerStyle = getComputedStyle(header);
    const heading = card.querySelector(".offer-card__identity h3");
    const headingStyle = getComputedStyle(heading);
    const title = card.querySelector(".offer-card__title-link");
    const titleStyle = getComputedStyle(title);
    const subtitle = card.querySelector("[data-card-subtitle]");
    const subtitleStyle = getComputedStyle(subtitle);
    const actions = card.querySelector(".offer-card__actions");
    const actionsStyle = getComputedStyle(actions);
    const headerRect = header.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();

    return {
        card: {
            paddingTop: cardStyle.paddingTop,
            paddingRight: cardStyle.paddingRight,
            paddingBottom: cardStyle.paddingBottom,
            paddingLeft: cardStyle.paddingLeft,
            rowGap: cardStyle.rowGap,
            columnGap: cardStyle.columnGap
        },
        header: {
            alignItems: headerStyle.alignItems,
            borderBottomWidth: headerStyle.borderBottomWidth,
            borderBottomStyle: headerStyle.borderBottomStyle,
            borderBottomColor: headerStyle.borderBottomColor,
            paddingBottom: headerStyle.paddingBottom,
            rowGap: headerStyle.rowGap,
            columnGap: headerStyle.columnGap,
            height: headerRect.height
        },
        heading: {
            marginTop: headingStyle.marginTop,
            marginRight: headingStyle.marginRight,
            marginBottom: headingStyle.marginBottom,
            marginLeft: headingStyle.marginLeft
        },
        title: {
            display: titleStyle.display,
            width: titleStyle.width,
            maxWidth: titleStyle.maxWidth,
            marginTop: titleStyle.marginTop,
            marginRight: titleStyle.marginRight,
            marginBottom: titleStyle.marginBottom,
            marginLeft: titleStyle.marginLeft,
            whiteSpace: titleStyle.whiteSpace,
            overflow: titleStyle.overflow,
            textOverflow: titleStyle.textOverflow,
            overflowWrap: titleStyle.overflowWrap
        },
        subtitle: {
            display: subtitleStyle.display,
            marginTop: subtitleStyle.marginTop,
            marginRight: subtitleStyle.marginRight,
            marginBottom: subtitleStyle.marginBottom,
            marginLeft: subtitleStyle.marginLeft,
            whiteSpace: subtitleStyle.whiteSpace,
            overflow: subtitleStyle.overflow,
            textOverflow: subtitleStyle.textOverflow,
            overflowWrap: subtitleStyle.overflowWrap
        },
        actions: {
            alignSelf: actionsStyle.alignSelf,
            topOffset: Number((actionsRect.top - headerRect.top).toFixed(3))
        }
    };
}

export {
    measureCollapsedPrimaryPanels,
    readOfferCardPresentation,
    readTypography
};
