<div align="right">中文 | <a title="English" href="README.md">English</a></div>

<p align="center">
  <img src="./source/img/panda-icon.svg" width="120" alt="Panda Logo"/>
</p>

<h1 align="center">hexo-theme-panda</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/SpeechlessPanda/hexo-theme-panda?style=for-the-badge" alt="License" /></a>
  <a href="https://www.npmjs.com/package/hexo-theme-panda"><img src="https://img.shields.io/npm/v/hexo-theme-panda?style=for-the-badge" alt="npm" /></a>
  <a href="https://hexo.io"><img src="https://img.shields.io/badge/Hexo-%3E%3D%205.3.0-0E83CD?style=for-the-badge&amp;logo=hexo&amp;logoColor=white" alt="Hexo" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D%2018-339933?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js" /></a>
  <a href="https://speechlesspanda.github.io"><img src="https://img.shields.io/badge/Demo-live-success?style=for-the-badge" alt="Demo" /></a>
</p>

<p align="center">卡片式 Hexo 主题：碎碎念时间线、渐变视觉、内置 Atom feed 与 OG 图生成</p>
<p align="center">基于 <a href="https://github.com/jerryc127/hexo-theme-butterfly">hexo-theme-butterfly</a> 5.7.0 二次开发（Apache-2.0）</p>
<p align="center"><strong>演示站点</strong>: <a href="https://speechlesspanda.github.io">SpeechlessPanda's Blog</a></p>

---

## ✨ Panda 在 Butterfly 之上新增了什么

| 特性 | 说明 | 默认 |
|------|------|------|
| 碎碎念增强 | 每条碎碎念独立 Giscus 评论区（多 iframe 方案）、有评论自动展开、独立页面深链、本地搜索命中 | 开 |
| 首页即关于页 | 首页直接渲染 `about/index.md`，文章流移到 `/blog/` | 开（可关） |
| 最新碎碎念卡片 | 文章流顶部展示最新一条碎碎念 | 开 |
| Atom feed | 自写生成器：文章+碎碎念混排，旧文更新可重新推送 | 开 |
| OG 分享图 | 每篇文章自动生成 1200×630 渐变分享图（需 `@resvg/resvg-js`） | 关 |
| 渐变外观 | 蓝→紫→橙渐变页头/页脚/背景（可配置颜色，设背景图自动让位） | 开 |
| 链接新标签 | 正文/碎碎念链接统一新标签页打开 | 开 |
| 代码高亮扩展 | 额外注册 fish、typst 语法高亮 | 内置 |

Butterfly 原有的全部能力（PJAX、深色模式、多种评论、搜索、字数统计、看板娘等）原样保留，配置方式完全兼容 Butterfly 文档。

## 📦 安装

### 方式一：npm（推荐）

需要 Hexo **≥ 5.3.0**。在 Hexo **站点根目录**执行（不要进主题文件夹）：

```bash
npm install hexo-theme-panda hexo-renderer-pug hexo-renderer-stylus
```

### 方式二：Git clone

```bash
git clone https://github.com/SpeechlessPanda/hexo-theme-panda.git themes/panda
npm install hexo-renderer-pug hexo-renderer-stylus hexo-util moment-timezone
```

然后改站点 `_config.yml`：

```yaml
theme: panda
```

从零建站：

```bash
npm install -g hexo-cli
hexo init my-blog && cd my-blog
npm install hexo-theme-panda hexo-renderer-pug hexo-renderer-stylus
```

再设置 `theme: panda`。

## 🖥️ 日常命令

全部在**站点根目录**执行。完整列表见 [Hexo 指令](https://hexo.io/zh-cn/docs/commands)。

| 命令 | 作用 |
|------|------|
| `hexo new "第一篇文章"` | 新建文章 → `source/_posts/第一篇文章.md` |
| `hexo new page about` | 新建页面 → `source/about/index.md` |
| `hexo new draft "草稿"` | 新建草稿 → `source/_drafts/草稿.md` |
| `hexo publish 草稿` | 把草稿移到 `_posts` 发表 |
| `hexo server` / `hexo s` | 本地预览 http://localhost:4000/ |
| `hexo s --draft` | 预览时包含草稿 |
| `hexo generate` / `hexo g` | 生成静态文件到 `public/` |
| `hexo deploy` / `hexo d` | 按站点 `deploy` 配置发布 `public/` |
| `hexo g -d` | 先生成再发布 |
| `hexo clean` | 删除 `db.json` 和 `public/` |
| `hexo clean && hexo g -d` | 全量重新发布博客 |
| `hexo clean && hexo s` | 改主题/配置后页面还是旧的：清缓存再预览 |

碎碎念**不是**用 `hexo new` 建的。改 `source/_data/shuoshuo.yml`，再 `hexo s` 或 `hexo g`。

### 发布博客

`hexo deploy` 需要部署插件。GitHub Pages 示例：

```bash
npm install hexo-deployer-git
```

```yaml
# 站点 _config.yml
deploy:
  type: git
  repo: git@github.com:<user>/<user>.github.io.git
  branch: main
```

```bash
hexo clean && hexo g -d
```

Panda 自己写 `public/atom.xml`。**不要**同时启用 `hexo-generator-feed`（会抢同一个路径）。

## ⚙️ 配置方式

与 Butterfly 完全一致：**不要改主题里的 `themes/panda/_config.yml`**，在站点根目录新建 `_config.panda.yml`，把要改的键写进去即可（Hexo 深合并，覆盖文件优先）。

```yaml
# _config.panda.yml
menu:
  首页: / || fas fa-home
  归档: /archives/ || fas fa-archive
  碎碎念: /memos/ || fas fa-comment-dots
```

主题完整默认配置见 [themes/panda/_config.yml](_config.yml)，每个键都有注释。

```mermaid
flowchart LR
  overlay["_config.panda.yml"] --> hexo[Hexo]
  theme["_config.yml"] --> init["scripts/events/init.js"]
  init --> hexo
  hexo --> layouts["layout/*.pug"]
  hexo --> memos["scripts/panda/memos.js"]
  hexo --> feed["scripts/panda/feed.js"]
  hexo --> og["scripts/panda/og-image.js"]
```

## ✅ 环境要求

- [Hexo](https://hexo.io/) **≥ 5.3.0**（演示站跑的是 8.x）
- Node.js **≥ 18**
- 渲染器：`hexo-renderer-pug`、`hexo-renderer-stylus`（站点里没有的话需要装）

按需额外安装：

| 功能 | 额外依赖 |
|------|----------|
| OG 分享图（`og_image.enable`） | `npm install @resvg/resvg-js` |
| 碎碎念注入本地搜索 | Butterfly 同款 `search.use: local_search` + 搜索数据文件 |
| 碎碎念评论计数 | 构建环境提供 `GH_DISCUSSION_TOKEN` |

## 🐼 Panda 功能配置

### 首页即关于页

```yaml
# _config.panda.yml
home_about:
  enable: true            # 默认开；找不到来源页时自动回退为文章列表
  source: about/index.md  # 渲染哪个页面
```

配合使用：站点 `_config.yml` 把文章流挪到 `/blog/`，并创建 `source/index.md`：

```yaml
# 站点 _config.yml
index_generator:
  path: /blog
```

```markdown
---
title: 关于
layout: home
---
```

### 碎碎念（memos）

1. 创建页面 `source/memos/index.md`：

```markdown
---
title: 碎碎念
type: shuoshuo
---
```

2. 数据写入 `source/_data/shuoshuo.yml`：

```yaml
- date: 2026-09-10 12:00   # 站点时区（_config.yml 的 timezone）
  content: 支持 **markdown** 和 [链接](https://example.com)
  tags: [生活]              # 可选
  key: my-custom-key        # 可选；不写则按日期生成
```

```yaml
# _config.panda.yml
memos:
  enable: true
  path: /memos/            # 页面路径（最新卡片、独立页、feed 共用）
  data_key: shuoshuo       # source/_data/<data_key>.yml
  latest_card: true        # 文章流顶部「最新碎碎念」卡片
  standalone_pages: true   # 每条生成 /memos/<时间戳>/ 独立页（深链）
  search_injection: true   # 注入本地搜索（需 search.use: local_search）
  comment_count: true      # 构建时查 Giscus 评论数，有评论的自动展开
```

评论基于 Giscus（`comments.use: Giscus` + `giscus.*`，与 Butterfly 相同）。每条碎碎念一个独立 discussion，嵌入方式是主题自带的 giscus `/widget` 多 iframe 方案，同页多条互不影响。

> `comment_count` 需要构建环境提供 `GH_DISCUSSION_TOKEN`（GitHub token，discussions 读权限）。没有 token 时静默跳过，评论区保持默认折叠。

### Atom feed

```yaml
# _config.panda.yml
feed:
  enable: true           # 默认开；不要同时装 hexo-generator-feed
  path: atom.xml
  post_limit: 20
  excerpt_limit: 140
  update_notify_hours: 24  # 旧文更新超过 24h 换新 id 重新推送
  include_memos: true
```

条目身份标识全部放在 URL 路径里（不用 query/fragment），兼容所有阅读器；碎碎念条目链接指向独立页，旧文更新条目指向自动生成的跳转 stub 页。

### OG 分享图

```bash
npm install @resvg/resvg-js   # 站点里装一次
```

```yaml
# _config.panda.yml
og_image:
  enable: true
  width: 1200
  height: 630
```

首次构建自动下载 LXGW WenKai 字体（OFL 协议）到站点 `fonts/` 缓存。每篇文章生成 `og-images/<slug>.png` 并注入 `og:image`。

### 渐变外观

默认开启。设置 Butterfly 原有的 `background`（背景图）、`default_top_img`（页头图）、`footer_img` 时，对应区域的渐变**自动让位**给图片，无需手动关渐变。改颜色：

```yaml
# _config.panda.yml
gradient:
  header_light: linear-gradient(135deg, ...)   # 页头/页脚（浅色）
  header_dark: linear-gradient(135deg, ...)    # 页头/页脚（深色）
  web_bg_light: linear-gradient(180deg, ...)   # 页面背景（浅色）
  web_bg_dark: linear-gradient(180deg, ...)    # 页面背景（深色）
  # 还有 header_mask_* / nav_*，见默认配置注释
```

整体关闭：`gradient.enable: false`。

### 其他

```yaml
# _config.panda.yml
link_target_blank: true   # 正文/碎碎念链接新标签页打开（默认开）
```

fish / typst 代码高亮开箱即用，无需配置。

## 🔄 从 Butterfly 迁移

1. `themes/butterfly` 换成本主题（或 npm 包互换），站点 `_config.yml` 改 `theme: panda`
2. 站点根 `_config.butterfly.yml` 重命名为 `_config.panda.yml`
3. Butterfly 的 `_data/butterfly.yml` 旧式配置不再支持（Panda 会在启动时报错提示）
4. 其余配置键全部兼容

## 📄 协议

[Apache-2.0](LICENSE)。Panda 基于 [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)（作者 Jerry，Apache-2.0）二次开发，署名与修改说明见 [NOTICE](NOTICE)；被修改的文件头部均有修改声明。字体内嵌下载使用 [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)（SIL OFL 1.1）。
