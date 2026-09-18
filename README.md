# StarkiJ.github.io

个人 GitHub Pages 静态主页，包含工具、小游戏和用于面试复习的技术笔记。页面使用原生 HTML、CSS 和 JavaScript；仓库提交可直接浏览的完整页面。

## 本地预览

在项目根目录启动静态服务器：

```text
python -m http.server 8000
```

打开 `http://localhost:8000/index.html`。Offer 对比需要读取 JSON，笔记检索使用 ES 模块，因此建议通过本地服务器预览。

## 修改笔记

笔记目录是 [`notes/index.html`](notes/index.html)。分类、标题和简介在 [`site-content.json`](site-content.json) 中维护；正文在 `content/notes/<slug>/body.html` 及同目录片段中维护，`notes/<slug>/index.html` 是生成后的页面。

修改后运行 `npm run generate`，并一起提交源文件、配置和生成页面。正文组织与链接规则见[笔记维护说明](content/notes/README.md)。

## 检查

需要 Node.js 22 或更高版本：

```text
npm run check          # 测试、生成内容、页面、链接与资源检查
npm run check:cpp      # 编译并验证 C++ 示例；需要 C++17 编译器
npm run test:browser   # 浏览器冒烟测试；需要 Windows 和 Microsoft Edge
npm run check:all      # 运行上述全部检查
```

修改 Offer 页引用的 JavaScript 或 CSS 后，运行 `npm run version:offer-assets` 更新资源版本。PowerShell 无法运行 `npm.ps1` 时可使用 `npm.cmd`。

Offer 对比的公开示例与本机私有数据格式见[数据说明](tools/offer-compare/data/README.md)。
