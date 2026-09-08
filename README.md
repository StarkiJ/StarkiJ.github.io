# StarkiJ.github.io

Starki 的个人 GitHub Pages 静态主页。项目保持原生 HTML、CSS 和
JavaScript，不需要安装运行时依赖或执行构建步骤。

## 项目结构

- `index.html`：主页入口。
- `styles.css`：主页、导航和通用工具组件的共享样式。
- `notes/<kebab-case>/index.html`：学习笔记文章，主页的“学习笔记”栏目提供入口。
- `notes/notes.css`：文章排版、目录和学习路线的共享样式。
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

修改 Offer 页引用的 JavaScript 或 CSS（包括共享的 `styles.css`）后，运行
`npm run version:offer-assets` 并提交更新的 HTML。资源 URL 使用内容版本，避免
GitHub Pages 发布后混用浏览器缓存的旧脚本；`npm run check` 会检查版本是否同步。

## Offer 对比数据

在 Offer 列表中点击公司 / 部门名称打开填写窗口，或使用“新增 Offer”。窗口内实时预览
税后收入、工时和时薪；点击“保存”才提交到当前浏览器，取消不会更改已有数据。
列表默认展开，点击标题或箭头可折叠，标题栏操作按钮始终可用。
折叠时取消临时选择或未完成的排序，不更改已保存数据。
复制、删除使用列表上方的公共按钮，再选择目标行；复制先编辑草稿，删除前确认具体 Offer。
“数据”菜单提供导入、导出和重置，表格下方保留来源和保存状态提示。
点击表格中的个税金额查看只读计算详情，关闭或 Esc 返回原位置。

首次使用默认按公司、部门名称升序排列，之后记住所选排序。
点击“调整顺序”，从当前显示顺序开始拖动手柄或使用上移 / 下移；手机使用紧凑列表。
点击“完成”才保存，取消或 Esc 放弃调整。手柄也支持键盘上下方向键。
自定义顺序保存在 `offers` 数组中；指标排序只改变显示，不覆盖自定义顺序。
刷新后沿用排序偏好，导出 JSON 保留自定义顺序；导入后可切换“自定义顺序”查看文件中的顺序。

公开示例位于 `tools/offer-compare/data/examples.json`。如需在本机使用
私有数据，可创建同目录的 `private.json`；该文件已被 `.gitignore`
排除。详细格式见该目录的 `README.md`。

## 维护提醒

Offer 对比当前只核验到 2027 年税务口径。在支持 2028 年及以后年份前，
需要根据页面列出的主管部门来源复核综合所得税率和全年一次性奖金政策。
