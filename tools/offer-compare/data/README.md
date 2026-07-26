# Offer 分析对比数据文件

公开页面默认读取 `examples.json` 中的代称示例。为保证示例和自动化测试结果
可复现，该文件固定使用 2026 年税务年份，不随系统日期自动变化；实际比较时
可在页面设置中修改税务年份。

如需在本机使用真实 Offer，请创建同目录下的
`private.json`。该路径已写入仓库根目录的 `.gitignore`，
不会作为新文件加入 Git。它与公开示例都采用页面“导出 JSON”得到的
完整规范化结构：顶层固定包含 `version`、`settings` 和 `offers`，
可继承的 Offer 字段使用 `null` 表示采用默认设置。
为便于阅读和维护，`schedule.days` 中的每个工作日对象固定写在一行；
页面导出的 JSON 也使用相同排版。

每个 Offer 可以通过 `socialInsuranceRate` 覆盖默认个人社保比例，
并通过 `schedule.lunchBreakHours`、`schedule.dinnerBreakHours` 覆盖
默认休息时长；留为 `null` 时继续继承 `settings`。休息时长按 Offer
统一设置，不再细分到排班表中的单个班次。

加载优先级如下：

1. 当前浏览器已经自动保存的数据；
2. 本机的 `private.json`；
3. 公开的 `examples.json`。

静态网页无法静默写回仓库文件。页面中的增删改查只保存在当前浏览器；
如需更新私有文件，请导出 JSON 后手动将其内容替换到稳定文件
`private.json`。除公开示例 `examples.json` 外，
`tools/offer-compare/data/private.json` 不会被 Git 跟踪，防止误提交。
