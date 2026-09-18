<div align="right"><a title="中文" href="README_CN.md">中文</a> | English</div>

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

<p align="center">A card-style Hexo theme: memos timeline, gradient visuals, built-in Atom feed & OG image generation</p>
<p align="center">Forked and extended from <a href="https://github.com/jerryc127/hexo-theme-butterfly">hexo-theme-butterfly</a> 5.7.0 (Apache-2.0)</p>
<p align="center"><strong>Demo</strong>: <a href="https://speechlesspanda.github.io">SpeechlessPanda's Blog</a></p>

---

## ✨ What Panda adds on top of Butterfly

| Feature | Description | Default |
|---------|-------------|---------|
| Memos enhancements | Per-memo Giscus comment iframes, auto-expand commented memos, standalone deep-link pages, local-search injection | on |
| Home-as-about | Home renders `about/index.md`; the post stream moves to `/blog/` | on (optional) |
| Latest memo card | The newest memo pinned on top of the post stream | on |
| Atom feed | Custom generator mixing posts + memos, with update-notification entries | on |
| OG share images | Per-post 1200×630 gradient images (requires `@resvg/resvg-js`) | off |
| Gradient look | Blue→purple→orange gradient header/footer/background (configurable, yields to your images) | on |
| Link target blank | Article/memo links open in a new tab | on |
| Extra highlighting | fish & typst grammars registered out of the box | built-in |

Everything Butterfly offers (PJAX, dark mode, comment systems, search, word count, etc.) is kept intact and configured exactly the Butterfly way.

## 📦 Installation

### npm (recommended)

Hexo **≥ 5.3.0**. Run this in the Hexo **site** root (not inside the theme):

```bash
npm install hexo-theme-panda hexo-renderer-pug hexo-renderer-stylus
```

### Git clone

```bash
git clone https://github.com/SpeechlessPanda/hexo-theme-panda.git themes/panda
npm install hexo-renderer-pug hexo-renderer-stylus hexo-util moment-timezone
```

Enable the theme in the site `_config.yml`:

```yaml
theme: panda
```

New site from scratch:

```bash
npm install -g hexo-cli
hexo init my-blog && cd my-blog
npm install hexo-theme-panda hexo-renderer-pug hexo-renderer-stylus
```

Then set `theme: panda` as above.

## 🖥️ Daily commands

All of these run in the **site root**. Full CLI: [Hexo commands](https://hexo.io/docs/commands).

| Command | What it does |
|---------|----------------|
| `hexo new "My post"` | New article → `source/_posts/My-post.md` |
| `hexo new page about` | New page → `source/about/index.md` |
| `hexo new draft "WIP"` | Draft → `source/_drafts/WIP.md` |
| `hexo publish WIP` | Move a draft into `_posts` |
| `hexo server` / `hexo s` | Local preview at http://localhost:4000/ |
| `hexo s --draft` | Preview including drafts |
| `hexo generate` / `hexo g` | Build static files into `public/` |
| `hexo deploy` / `hexo d` | Publish `public/` with your deployer |
| `hexo g -d` | Generate, then deploy |
| `hexo clean` | Delete `db.json` and `public/` |
| `hexo clean && hexo g -d` | Full republish |
| `hexo clean && hexo s` | Stale theme/config? wipe cache, then preview |

Memos (碎碎念) are **not** created with `hexo new`. Edit `source/_data/shuoshuo.yml`, then `hexo s` or `hexo g`.

### Deploy (publish the blog)

`hexo deploy` needs a deployer plugin. GitHub Pages example:

```bash
npm install hexo-deployer-git
```

```yaml
# site _config.yml
deploy:
  type: git
  repo: git@github.com:<user>/<user>.github.io.git
  branch: main
```

```bash
hexo clean && hexo g -d
```

Panda writes `public/atom.xml` itself. Do **not** also enable `hexo-generator-feed` (both would claim the same path).

## ⚙️ Configuration

Same convention as Butterfly: **don't edit `themes/panda/_config.yml`**. Create `_config.panda.yml` in your site root and put your overrides there (Hexo deep-merges, overlay wins).

The fully-commented default config lives in [_config.yml](_config.yml).

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

## ✅ Requirements

- [Hexo](https://hexo.io/) **≥ 5.3.0** (8.x works; this is what the demo runs)
- Node.js **≥ 18**
- Renderers: `hexo-renderer-pug` and `hexo-renderer-stylus` (install them if your site does not already have them)

Optional extras, only if you turn the matching feature on:

| Feature | Extra install |
|---------|----------------|
| OG share images (`og_image.enable`) | `npm install @resvg/resvg-js` |
| Local search injection | Butterfly-style `search.use: local_search` plus a search data file |
| Memo comment counts | `GH_DISCUSSION_TOKEN` in the build environment |

## 🐼 Panda features

### Home-as-about

```yaml
# _config.panda.yml
home_about:
  enable: true            # falls back to the post list when the source page is missing
  source: about/index.md
```

Move the post stream to `/blog/` and bind the home page:

```yaml
# site _config.yml
index_generator:
  path: /blog
```

```markdown
---
title: About
layout: home
---
```

(source/index.md)

### Memos (shuoshuo)

1. Create `source/memos/index.md`:

```markdown
---
title: Memos
type: shuoshuo
---
```

2. Write entries in `source/_data/shuoshuo.yml`:

```yaml
- date: 2026-09-10 12:00   # site timezone (_config.yml `timezone`)
  content: Supports **markdown** and [links](https://example.com)
  tags: [life]              # optional
  key: my-custom-key        # optional; derived from date otherwise
```

```yaml
# _config.panda.yml
memos:
  enable: true
  path: /memos/            # page path (shared by card link, standalone pages, feed)
  data_key: shuoshuo       # source/_data/<data_key>.yml
  latest_card: true        # "latest memo" card on the post stream
  standalone_pages: true   # one deep-linkable page per memo
  search_injection: true   # inject into local search (needs search.use: local_search)
  comment_count: true      # build-time Giscus counts -> auto-expand commented memos
```

Comments use Giscus (`comments.use: Giscus` + `giscus.*`, same as Butterfly). Each memo gets its own discussion via the theme's multi-iframe giscus `/widget` integration.

> `comment_count` needs `GH_DISCUSSION_TOKEN` (a GitHub token with discussions read access) in the build environment. Without it, the step is skipped silently and comment areas stay collapsed.

### Atom feed

```yaml
# _config.panda.yml
feed:
  enable: true           # on by default; do not run hexo-generator-feed together
  path: atom.xml
  post_limit: 20
  excerpt_limit: 140
  update_notify_hours: 24  # re-push posts updated more than 24h after publish
  include_memos: true
```

Entry identity lives entirely in the URL path (never query/fragment), which every reader preserves; memo entries link to their standalone pages and update entries to auto-generated redirect stubs.

### OG share images

```bash
npm install @resvg/resvg-js   # once, in your site
```

```yaml
# _config.panda.yml
og_image:
  enable: true
  width: 1200
  height: 630
```

The LXGW WenKai font (SIL OFL 1.1) is downloaded once into `fonts/` on first build. Each post gets `og-images/<slug>.png` wired into `og:image`.

### Gradient look

On by default. Setting Butterfly's `background`, `default_top_img` or `footer_img` makes the matching gradient area yield to your image automatically. To recolor:

```yaml
# _config.panda.yml
gradient:
  header_light: linear-gradient(135deg, ...)
  header_dark: linear-gradient(135deg, ...)
  web_bg_light: linear-gradient(180deg, ...)
  web_bg_dark: linear-gradient(180deg, ...)
  # plus header_mask_* / nav_* — see the default config comments
```

Disable entirely: `gradient.enable: false`.

### Misc

```yaml
# _config.panda.yml
link_target_blank: true   # article/memo links open in a new tab (default on)
```

fish / typst code highlighting works out of the box.

## 🔄 Migrating from Butterfly

1. Replace `themes/butterfly` with this theme (or swap the npm package) and set `theme: panda`
2. Rename `_config.butterfly.yml` to `_config.panda.yml`
3. Butterfly's legacy `_data/butterfly.yml` override is not supported (Panda warns on startup)
4. Every other config key is compatible

## 📄 License

[Apache-2.0](LICENSE). Panda is derived from [hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly) by Jerry (Apache-2.0); see [NOTICE](NOTICE) for attribution and the list of changes. Modified files carry a notice in their header comments. The OG font [LXGW WenKai](https://github.com/lxgw/LxgwWenKai) is SIL OFL 1.1.
