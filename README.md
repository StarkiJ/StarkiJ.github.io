# StarkiJ.github.io

Starki 的个人 GitHub Pages 静态主页。项目保持原生 HTML、CSS 和
JavaScript，不需要安装运行时依赖或执行构建步骤。

## 项目结构

- `index.html`：主页入口。
- `styles.css`：主页、导航和通用工具组件的共享样式。
- `tools/<kebab-case>/`：每个工具拥有自己的 `index.html`、脚本和可选资源。
- `games/<kebab-case>/`：每个游戏拥有独立目录和入口页。
- `tests/unit/`：Offer 对比的 Node 单元测试。
- `tests/browser/`：Offer 对比的 Edge 浏览器冒烟测试。
- `scripts/check-links.mjs`：本地链接和 sitemap 一致性检查。

工具和游戏统一使用小写 kebab-case 目录。站内链接、canonical 和 sitemap
全部显式指向 `index.html`，以同时兼容 GitHub Pages 和通过 `file://`
打开的本地页面。

## 本地运行

主页本身可以直接打开，但 Offer 对比会通过 `fetch` 读取 JSON 数据。为保证
所有功能正常，请在项目根目录启动本地静态服务器，例如：

```text
python -m http.server 8000
```

然后访问 `http://localhost:8000/index.html`。

## 本地检查

需要 Node.js 22 或更高版本：

```text
npm test
npm run check:links
npm run test:browser
npm run check:all
```

其中浏览器冒烟测试仅支持已安装 Microsoft Edge 的 Windows 环境。
如果 PowerShell 策略阻止执行 `npm.ps1`，可将命令中的 `npm` 替换为
`npm.cmd`。

## Offer 对比数据

公开示例位于 `tools/offer-compare/data/examples.json`。如需在本机使用
私有数据，可创建同目录的 `private.json`；该文件已被 `.gitignore`
排除。详细格式见该目录的 `README.md`。

## 维护提醒

Offer 对比当前只核验到 2027 年税务口径。在支持 2028 年及以后年份前，
需要根据页面列出的主管部门来源复核综合所得税率和全年一次性奖金政策。
