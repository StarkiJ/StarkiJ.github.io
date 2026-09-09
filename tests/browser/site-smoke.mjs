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

    await visit("/tools/password-generator/index.html", "document.querySelector('#passwordOutput')?.textContent.length > 0");
    assert.equal(await evaluate(client, "document.querySelector('#passwordOutput').textContent.length"),
        await evaluate(client, "Number(document.querySelector('#passwordLength').value)"));

    await visit("/tools/random-number/index.html", "typeof window.ToolRandom === 'object'");
    await evaluate(client, `
        document.querySelector('#minValue').value = '1';
        document.querySelector('#maxValue').value = '10';
        document.querySelector('#count').value = '10';
        document.querySelector('#allowDuplicates').value = 'false';
        document.querySelector('#randomNumberForm').dispatchEvent(new Event('submit', { cancelable: true }));
    `);
    assert.deepEqual(await evaluate(client, "Array.from(document.querySelectorAll('#randomNumberContainer .chip'), e => Number(e.textContent)).sort((a,b) => a-b)"),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    await visit("/tools/random-groups/index.html", "typeof window.ToolRandom === 'object'");
    await evaluate(client, String.raw`
        document.querySelector('#names').value = '甲\n乙\n丙\n丁\n戊';
        document.querySelector('#numGroups').value = '2';
        document.querySelector('#groupForm').dispatchEvent(new Event('submit', { cancelable: true }));
    `);
    assert.deepEqual(await evaluate(client, "Array.from(document.querySelectorAll('.group-list'), e => e.children.length)"), [3, 2]);
    assert.equal(await evaluate(client, "new Set(Array.from(document.querySelectorAll('.group-list li'), e => e.textContent)).size"), 5);

    for (const game of ["snake", "tetris"]) {
        await visit(`/games/${game}/index.html`, "typeof gameState === 'string'");
        await evaluate(client, "document.querySelector('#startButton').click()");
        assert.equal(await evaluate(client, "gameState"), "playing");
        await evaluate(client, "document.querySelector('#pauseButton').click()");
        assert.equal(await evaluate(client, "gameState"), "paused");
    }

    assert.deepEqual(runtimeErrors, []);
    console.log("Site tool and game browser smoke tests passed");
} finally {
    await browser.close();
}
