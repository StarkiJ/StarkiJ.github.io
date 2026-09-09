import assert from "node:assert/strict";
import { evaluate, startSiteBrowser, waitFor } from "./helpers/harness.mjs";

const browser = await startSiteBrowser("/index.html");
const { client, pageUrl, runtimeErrors } = browser;

async function visit(path, ready) {
    await client.send("Page.navigate", { url: new URL(path, pageUrl).href });
    await waitFor(client, ready, `${path} did not become ready`);
}

try {
    await visit("/tools/text-diff/index.html", "typeof window.TextDiffCore === 'object'");
    await evaluate(client, String.raw`
        document.querySelector('#oldText').value = '你好世界\nunchanged';
        document.querySelector('#newText').value = '你好朋友\nunchanged';
        document.querySelector('#newText').dispatchEvent(new Event('input'));
    `);
    await waitFor(client, "document.querySelectorAll('.diff-inline-change').length > 0", "Live diff did not render");
    assert.equal(await evaluate(client, "getComputedStyle(document.querySelector('.diff-add')).backgroundColor"), "rgb(233, 247, 239)");
    assert.equal(await evaluate(client, "getComputedStyle(document.querySelector('.line-editor')).display"), "grid");
    await evaluate(client, `
        document.querySelector('#oldText').dispatchEvent(new Event('input'));
        document.querySelector('#clearButton').click();
    `);
    await new Promise(resolve => setTimeout(resolve, 450));
    assert.equal(await evaluate(client, "document.querySelector('#resultPanel').hidden"), true);

    await visit("/games/gobang/index.html", "typeof window.GobangAI === 'object' && document.querySelector('#gameStatus').textContent.length > 0");
    for (const difficulty of ["normal", "medium", "hard"]) {
        await evaluate(client, `
            var select = document.querySelector('#difficulty');
            select.value = ${JSON.stringify(difficulty)};
            select.dispatchEvent(new Event('change'));
            document.querySelector('#c1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
        `);
        await waitFor(client, "moveCount === 2 && isHumanTurn", `${difficulty} AI did not complete its turn`);
        assert.equal(await evaluate(client, "board[7][7]"), 1);
    }
    await evaluate(client, `
        var color = document.querySelector('#pieceColor');
        color.value = 'white';
        color.dispatchEvent(new Event('change'));
    `);
    await waitFor(client, "moveCount === 1 && isHumanTurn", "Computer did not start when the human chose white");

    assert.deepEqual(runtimeErrors, []);
    console.log("Site tool and game browser smoke tests passed");
} finally {
    await browser.close();
}
