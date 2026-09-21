# Changelog

All notable changes to [hexo-theme-panda](https://github.com/SpeechlessPanda/hexo-theme-panda) are documented here.

## [1.1.2] - 2026-09-21

### Added

- Website background image drives the fixed nav bar. When Butterfly's `background` is an image, `#page-header.nav-fixed #nav` paints the **top band of that same image**, locked to the viewport (`background-attachment: fixed` + `cover` + `center` — the exact geometry `#web_bg` already uses), so the 60px nav window shows the top strip of the rendered page background: same pixels, no seam, nothing scrolls away, and no flat gradient bar pasted on top.
- Legibility by mode: a scrim (`gradient.nav_band_mask_light/dark`) under white / `#eaf4ff` nav text. Measured on a mid-tone 1727×910 photo: 5.0:1 (light) and 5.2:1 (dark). Both the scrims and the text colors are configurable, because a very light or very dark image can need a different tone.
- Config keys: `nav.background_band` (default on), `nav.band_text_light`, `nav.band_text_dark`, `gradient.nav_band_mask_light`, `gradient.nav_band_mask_dark`.
- Random-array `background` keeps the nav on the image `#web_bg` actually picked: the existing random-pick script now also sets `--panda-nav-bg-image` and toggles the `panda-nav-band` class (PJAX send/complete included). A color or CSS-gradient pick falls back to the normal gradient nav.
- iOS Safari fallback: `background-attachment: fixed` degrades to `scroll` there, which would zoom the image into the 60px bar, so `.apple` drops the image and keeps the scrim + blur.
- The band rules live in their own partial emitted after the gradient partial, so they also apply with `gradient.enable: false`.

### Fixed

- Series chapter prev/next could silently fall back to the global date chain. `wrapPostGenerator` wrapped the `post` generator once at script-load time, but `scripts/filters/random_cover.js` also registers `post` and theme script load order is not guaranteed — when it loaded after the wrapper, it replaced it and the series rewiring never ran (chapter pages linked to unrelated posts). The wrapper now tracks what it registered and re-wraps the current generator at `after_init`, so the rewiring survives either load order. Reproduced on ~50% of builds before the fix; `test/_smoke_series.js` now passes 8/8 consecutive runs.

### Release audit

| Check | Result |
|-------|--------|
| Dependency / security | No new dependencies. One build-time helper (`bgImageUrl`, same classification as `getBgPath`), one new pug partial, one extra runtime property write for array backgrounds. No network surface. |
| Tests | `node --test test/*.test.js` 30/30. New generate smoke `test/_smoke_nav_band.js`: single image (`<html>` carries `panda-nav-band`; band rule present with fixed/center/cover; compound `[data-theme='dark'].panda-nav-band` / `.apple.panda-nav-band` gates; every selector inside the band block gated; band emitted after `gradient.nav_light`), array background (no baked class, `var(--panda-nav-bg-image, none)`, script syncs url + `null` for non-images), color background (no band at all). Existing smokes (blog header, series, hideToggle) pass; series smoke re-run 8× to confirm the load-order fix; hideToggle smoke now reads the version from `package.json` instead of pinning `?v=1.1.1`. |
| Packaging | Same `files` as 1.1.1. Version bump is load-bearing: the local CDN `?v=` reads `package.json`. |
| Runtime smoke | Temp site with a real background image, `nav.fixed: true`, scrolled: nav computed `background-attachment: fixed, fixed` / `background-position: 50% 50%` / `background-size: cover` — identical geometry to `#web_bg`. Sampled nav text row: light (109,113,94) → 5.0:1 vs `#ffffff`; dark (104,103,73) → 5.2:1 vs `#eaf4ff`. `.apple` + dark: image layer gone, `backdrop-filter: saturate(1.2) blur(6px)` restored. |
| Performance | One extra background-image on the nav while scrolled; `backdrop-filter` is switched off in the band state (it only blurred content that the band now covers). No extra JS listeners. |
| Docs | README EN/CN feature table + "Website background & nav band" section, `_config.yml` comments, `default_config.js` mirror, NOTICE, this changelog. |
| Content / assets | No new fonts or CDN. Apache-2.0 NOTICE updated. |
| Deferred | None. |

## [1.1.1] - 2026-09-18

### Added

- `{% hideToggle %}`: expanded blocks show a bottom collapse bar that closes the section and scrolls back to its header — long sections no longer need scrolling to the top. Centered ghost style (grey text, hover uses the theme color), not a second grey title bar. i18n: zh-CN/zh-HK 收起, zh-TW 收合, en Collapse, ja 閉じる, ko 접기.

### Fixed

- Theme asset URLs include `?v=<package version>`. Shipping the hideToggle JS/CSS without bumping the version left returning visitors on cached 1.1.0 `main.js` / `index.css` (button with no handler, no styles). 1.1.1 is the cache-bust.

### Release audit

| Check | Result |
|-------|--------|
| Dependency / security | No new dependencies. Collapse handler is a click on existing article markup; no network surface. |
| Tests | `node --test test/*.test.js` (hideToggle HTML / i18n fallback / hideInline+hideBlock unchanged, plus existing series / page-type). Generate smoke: `test/_smoke_hide_toggle.js` (`{% hideToggle %}` emits `.toggle-collapse` + zh-CN 「收起」, asset URLs `?v=1.1.1`). |
| Packaging | Same `files` as 1.1.0. Version bump is load-bearing: local CDN `?v=` reads `package.json`. |
| Runtime smoke | Temp site generate of a post with hideToggle: details.toggle + bottom button + i18n label. Live demo already shipped the same markup via the vendored blog copy. |
| Performance | One extra `<button>` per hideToggle; click handler is the existing article-level listener (no extra querySelectorAll gate). |
| Docs | README EN/CN feature table + usage note, NOTICE, this changelog. |
| Content / assets | No new fonts or CDN. Apache-2.0 NOTICE updated. |
| Deferred | None. |

## [1.1.0] - 2026-09-18

### Added

- Blog series: a one-level folder under `source/_posts` with a required `index.md` (`title` + `description`, no `date`) becomes one card on the post stream. Sibling markdown files are chapters: listed on `/series/<folder>/`, hidden from the stream, still RSS entries.
- Mixed listing: independent posts and series cards share one newest-first stream. A series card's date is its latest chapter. Empty series (index only) are omitted.
- In-series prev/next only walks sibling chapters. Independent posts keep their own neighbor chain.
- CLI: `hexo new series "<folder>"` writes `_posts/<folder>/index.md`; `hexo new --series "<folder>" "<title>"` writes a chapter (creates `index.md` if missing). Folder names are not slugized.
- Folder-only regroup: drag existing posts into the series folder — no extra front-matter — and they leave the stream on the next generate.
- Distinct from Butterfly's `{% series %}` tag (`series.enable` stays off). Config key: `blog_series` (default on).

### Fixed

- Relocated post stream (`index_generator.path` other than `/`) uses the inner-page header (short banner + `page.articles` title) instead of the homepage full-screen typewriter.
- Terminal welcome banner rules and version sit at PANDA letter width.

### Release audit

| Check | Result |
|-------|--------|
| Dependency / security | Theme deps: `hexo-renderer-pug`, `hexo-renderer-stylus`, `hexo-util`, `moment-timezone`. No new network-facing surface; series is local filesystem + Hexo generators. `hexo-util` added so git-clone installs resolve `url_for` without relying on a site transitive. |
| Tests | `node --test test/*.test.js` (classify / mix / paginate / CLI path / rewrite / page-type). Generate smokes: `test/_smoke_series.js`, `test/_smoke_blog_header.js` (`/` full_page + typewriter; `/blog/` `not-home-page` + `page.articles`). |
| Packaging | npm `files` includes layouts, scripts, languages, source, `_config.yml`, LICENSE, NOTICE, READMEs, CHANGELOG. Tests and `docs/superpowers/` stay out of the tarball. |
| Runtime smoke | Temp site generate: index mixes series card + independents by latest-chapter date; series landing lists chapters newest-first; Atom feed includes chapters not the unpublished index; chapter pages show series badge and in-series pagination only. `hexo new series` / `hexo new --series` paths verified. Relocated listing (`index_generator.path: /blog`) uses inner-page header; `/` with `layout: home` keeps the full-screen hero. |
| Performance | Series classification is one pass over `Post` at generate; listing pagination reuses the index generator contract. Page-type check is O(1) per render. No extra runtime JS. |
| Docs | README EN/CN, `_config.yml` comments, i18n (`blog_series.*`), NOTICE, this changelog. |
| Content / assets | No new third-party fonts or CDN. Apache-2.0 NOTICE updated. |
| Deferred | Not converting the demo blog's existing standalone posts into a series. Butterfly `{% series %}` tag remains unused. Nested folders deeper than one level under `_posts` stay ignored. |

## [1.0.0] - 2026-09-17

Initial public release. Fork of hexo-theme-butterfly 5.7.0 with memos, Atom feed, OG images, home-as-about, and gradient visuals.

[1.1.2]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/SpeechlessPanda/hexo-theme-panda/releases/tag/1.0.0
