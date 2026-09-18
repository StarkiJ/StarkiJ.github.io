# 笔记维护

笔记用于面试复习，按知识点组织。每节尽量讲清概念、机制、适用条件和边界；例子与经典追问只在有助于理解时加入。相关知识点可以串联，不要求统一的导语、结尾或章节模板。

## 修改位置

- `site-content.json`：分类、标题、摘要、复习提示、章节直达链接和日期。
- `content/notes/<slug>/body.html`：正文入口；长文可以引用同目录的章节片段。
- `notes/<slug>/index.html`：生成后的公开页面，不直接修改生成区域。

正文片段不是独立页面。文件拆分只为便于维护，不改变页面 URL 或文章篇数。`published` 记录发布日期，`updated` 记录内容更新；只有完成技术复核才填写 `reviewed`。

## 章节与链接

标题的 h2、h3、h4 层级决定页面目录和知识点搜索。按知识点选择标题，保持已有章节 `id` 稳定；移动内容时先更新站内链接，确有旧链接需要兼容才保留旧入口。跨篇内容尽量链接到负责解释该机制的章节，避免重复展开。

`href`、图片和 `data-source` 都按最终的 `notes/<slug>/index.html` 解析。可下载的 `.cpp` / `.hpp` 放在对应的 `notes/<slug>/` 下，正文使用 `<pre><code data-source="./example.cpp"></code></pre>` 引用。

长文可在 `body.html` 中按以下方式引用同目录的完整章节；引用须独占一行，文件名使用小写字母、数字或连字符：

```html
<section class="note-part" id="part" aria-labelledby="part-title">
<h2 id="part-title">分部标题</h2>
<!-- include: chapter.html -->
</section>
```

片段内的 HTML 标签须自行闭合，不跨文件拼接。页面外壳中的 `generated:note-body` 区域由生成命令填充。

## 生成与验证

修改后运行 `npm run generate` 和 `npm run check`；修改 C++ 示例后另运行 `npm run check:cpp`。一起提交正文源文件、配置、下载源码和生成页面。生成检查会发现遗漏或直接修改生成正文造成的不一致。
