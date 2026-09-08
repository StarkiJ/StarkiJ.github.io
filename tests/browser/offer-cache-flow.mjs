import assert from "node:assert/strict";
import { evaluate, waitFor } from "./helpers/harness.mjs";

export async function checkCachedAssetUpgrade({ client, pageUrl }) {
    let active = true;
    const servedLegacyScripts = [];
    const requests = [];
    const pending = [];
    const errors = [];
    client.on("Fetch.requestPaused", event => {
        if (!active) { return; }
        const url = new URL(event.request.url);
        requests.push(url);
        // Model a browser/proxy returning the pre-upgrade script for its old URL.
        // It cannot initialize the new page; versioned URLs must bypass that entry.
        const legacy = !url.search;
        if (legacy) { servedLegacyScripts.push(url.pathname); }
        pending.push(client.send(legacy ? "Fetch.fulfillRequest" : "Fetch.continueRequest",
            legacy ? {
                requestId: event.requestId,
                responseCode: 200,
                responseHeaders: [{ name: "Content-Type", value: "application/javascript" }],
                body: Buffer.from("window.__staleOfferScriptLoaded = true;").toString("base64")
            } : { requestId: event.requestId }
        ).catch(error => errors.push(error.message)));
    });

    try {
        await client.send("Fetch.enable", {
            patterns: [{ urlPattern: new URL("js/*.js*", pageUrl).href, requestStage: "Request" }]
        });
        await client.send("Page.navigate", { url: pageUrl });
        await waitFor(client,
            `document.querySelector('#offerComparator')?.getAttribute('aria-busy') === 'false'`,
            "The updated page did not bypass stale script URLs");
        assert.ok(requests.length >= 10);
        assert.deepStrictEqual(servedLegacyScripts, []);
        assert.ok(requests.every(url => /^[a-f0-9]{12}$/.test(url.searchParams.get("v"))));
        assert.equal(await evaluate(client, `window.__staleOfferScriptLoaded === true`), false);
        assert.equal(await evaluate(client, `document.querySelectorAll('#comparisonTableBody tr[data-offer-id]').length`), 4);
    } finally {
        await Promise.all(pending);
        await client.send("Fetch.disable");
        active = false;
    }
    assert.deepStrictEqual(errors, []);
}
