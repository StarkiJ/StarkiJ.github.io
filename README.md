# StarkiJ.github.io

Starki 的个人 GitHub Pages 静态主页。项目保持原生 HTML、CSS 和
JavaScript，不需要安装运行时依赖或执行构建步骤。

## 项目结构

- `index.html`：主页入口。
- `styles.css`：主页、导航和通用工具组件的共享样式。
- `notes/index.html`：按 C++、计算机基础、Android、算法与游戏开发分类的笔记目录。
- `notes/<kebab-case>/index.html`：学习笔记文章；较长源码可展开，也可下载同目录示例。
- `notes/notes.css`：文章排版、目录、概念表格和折叠示例的共享样式。
- `tools/<kebab-case>/`：每个工具拥有自己的 `index.html`、脚本和可选资源。
- `games/<kebab-case>/`：每个游戏拥有独立目录和入口页。
- `tests/unit/`：Offer 对比、工具复制失败和检查脚本的 Node 回归测试。
- `tests/cpp/examples.json`：可下载 C++ 示例的编译目标及故意错误示例的排除理由。
- `tests/browser/`：Offer 对比的 Edge 浏览器冒烟测试。
- `scripts/`：静态内容生成、链接与锚点、页面结构、源码和资源版本检查。

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
npm run check
npm run check:cpp
npm run test:browser
npm run check:all
```

`check` 包含 Node 回归、JavaScript 语法、生成内容、HTML 结构、笔记表格、
无障碍引用、下载源码一致性、站内链接与锚点、sitemap 和资源版本检查。
这些是静态检查，不替代浏览器中的布局与交互验证。

`check:cpp` 另需支持 C++17 的 GCC 或 Clang；默认使用 `g++`，
可通过 `CXX` 环境变量指定编译器可执行文件路径。编译产物写入临时目录并在完成后清理。
带 `data-example` 的完整程序会自动提取、编译、运行，并与同一 figure 的 `note-output`
输出对照；无输出块表示程序不应输出文字。下载示例按清单编译，执行其断言；
布局输出和性能耗时不作跨平台固定值断言，故意触发 UB 的诊断示例不执行。
新增下载源码时须登记编译目标或明确排除理由。自移动测试可能产生编译器警告，
保留该测试以验证自赋值边界。CI 在 Linux 上运行 `check` 和 `check:cpp`。

浏览器冒烟测试仅支持已安装 Microsoft Edge 的 Windows 环境，CI 单独运行该项。
如果 PowerShell 策略阻止执行 `npm.ps1`，可将命令中的 `npm` 替换为
`npm.cmd`。

修改 Offer 页引用的 JavaScript 或 CSS（包括共享的 `styles.css`）后，运行
`npm run version:offer-assets` 并提交更新的 HTML。资源 URL 使用内容版本，避免
GitHub Pages 发布后混用浏览器缓存的旧脚本；`npm run check` 会检查版本是否同步。

## 导航与笔记维护

`site-content.json` 是导航、笔记分类、标题、简介和首页推荐的维护入口。
修改后运行 `npm run generate`，将配置与生成后的页面一起提交；
`npm run check:generated` 会阻止导航、目录、篇数、文章元信息或 sitemap 漏更新。
`cardTitle` 只在卡片需要较短标题时填写，`description` 只在搜索摘要需要独立文案时填写。

文章正文仍直接编辑各自的 HTML。带有 `data-source` 的代码块由对应的
`.cpp` / `.hpp` 文件生成，请修改源码后运行生成命令；没有该属性的代码块直接在文章中维护。
新增笔记时，同时添加文章页面和配置中的条目。生成区域用 `generated:…` 注释标出，
站点导航及文章标题、摘要、canonical 等元信息也由生成脚本维护。

生成仅在维护时执行，提交的仍是完整静态页面，浏览时不依赖 Node.js 或动态加载模板。
第三方游戏目录（导弹游戏、小恐龙、电子木鱼）与音频不参与生成或重构。

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
