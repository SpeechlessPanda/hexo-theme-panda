# Changelog

All notable changes to [hexo-theme-panda](https://github.com/SpeechlessPanda/hexo-theme-panda) are documented here.

## [1.1.5] - 2026-09-23

### Fixed

- Scrolled nav band no longer zooms into the middle of the background photo. `background-size: cover` on the 60px `#nav` box sized the image against that bar, so the window showed a random mid-slice instead of the top of `#web_bg`. The band now paints a viewport-sized `#nav::before` (`100vw×100vh`, `cover`, `center`, clipped to 60px). Rest-state `#nav` stays transparent. iOS still drops the image layer and keeps the scrim + blur.

### Changed

- Upgrading docs: note that a registry mirror which has not caught up yet makes `npm update` report "Already up to date" while a newer release exists on npm — pin the version instead (`npm install hexo-theme-panda@latest`).

### Release audit

| Check | Result |
|-------|--------|
| Dependency / security | No dependency change. CSS-only: one extra pseudo-element on the scrolled nav, no network, no filesystem writes. |
| Tests | `node --test test/*.test.js` **33/33**. `test/_smoke_nav_band.js` single / array / color. Smoke now pins `::before`, `100vw`/`100vh`, `clip-path`, and forbids `background-attachment: fixed` on the 60px box. Existing smokes (blog header, series, hideToggle) pass. |
| Packaging | Same `files` as 1.1.4. Version bump is load-bearing — the local `?v=` reads `package.json`, so 1.1.5 is also the cache-bust. |
| Runtime smoke | Isolated nav-band generate smoke: single / array / color. Real site (`D:/project/blog`, Hexo 8.1.2) rebuilt against the working tree: start banner `1.1.5`, closing line `[panda] theme 1.1.5 · Hexo 8.1.2 · 145 files generated`, footer `Panda 1.1.5`, assets `?v=1.1.5`. Restored the installed 1.1.4 package afterwards. |
| Performance | One extra composited layer on the 60px bar while scrolled. No extra JS listeners. |
| Docs | README EN/CN "Website background & nav band", `_config.yml` comments, this changelog. NOTICE unchanged (behavior, not a new feature). |
| Content / assets | No new fonts, no CDN. |
| Deferred | npm publish is manual (`npm publish` after the GitHub release). |

## [1.1.4] - 2026-09-22

### Added

- `hexo generate` now closes with `[panda] theme X.Y.Z · Hexo A.B.C · N files generated`. Hexo's own summary line counts files but never names the theme that wrote them, so after an upgrade there was no place to check which version actually produced a build — the footer and the `?v=` cache-bust only describe output that is already in front of you. On a CI-built site the log line is the only witness, and it now names the theme, the Hexo version and the file count.
- `🔄 Upgrading` section in README / README_CN: the two commands that make an upgrade real (`npm update` + `hexo clean && hexo generate`), why each half matters, the CI case (commit `package.json` and the lockfile, or the deployed site keeps rendering the pinned version), and a four-row table for confirming the bump landed.

### Release audit

| Check | Result |
|-------|--------|
| Dependency / security | No dependency change. New file is one `generateAfter` listener that reads `package.json` and logs; no network, no filesystem writes. |
| Tests | `node --test test/*.test.js` 33/33. `test/generate-report.test.js` covers the emitted line (theme version must match `package.json` exactly, hexo version, file count), the zero-route case, and a hexo instance with no router. |
| Packaging | `scripts/events/generate-report.js` ships inside the existing `scripts` entry of `files`; nothing new to include. Version bump is load-bearing as before — the local `?v=` reads `package.json`, so 1.1.4 is also the cache-bust. |
| Runtime smoke | Real site (`D:/project/blog`, Hexo 8.1.2) rebuilt against the working tree: start banner `1.1.4`, closing line `[panda] theme 1.1.4 · Hexo 8.1.2 · 58 files generated`, footer `Panda 1.1.4`, assets `?v=1.1.4`. Restored the installed theme and rebuilt, footer back to `Panda 1.1.3`. |
| Performance | One string interpolation on `generateAfter`, outside every render path. |
| Docs | README EN/CN install stub now points at the new `🔄 Upgrading` section instead of repeating a one-line command; `_config.yml` untouched; this changelog. |
| Content / assets | No new fonts, no CDN, NOTICE unchanged. |
| Deferred | None. |

## [1.1.3] - 2026-09-21

### Changed

- npm install is now a single command: `npm install hexo-theme-panda`. The renderers Panda needs (`hexo-renderer-pug`, `hexo-renderer-stylus`, `hexo-util`, `moment-timezone`) are already declared in the theme's own `dependencies`, so every package manager installs them automatically — the README's extra renderer flags were redundant. Git clone is now documented as the "hacking on the theme" path, not the default.

### Added

- The build warns when Panda loads from a vendored `themes/` copy. Hexo resolves `themes/<theme>` **before** `node_modules/hexo-theme-<theme>` (`hexo/lib/hexo/load_config.js`), so a leftover clone silently shadows the npm package and `npm update hexo-theme-panda` appears to do nothing while the old theme keeps rendering. The warning names the directory it loaded from and tells you which of the two modes you are in.

### Release audit

| Check | Result |
|-------|--------|
| Dependency / security | No dependency changes — the four renderers were already declared. Only the README instructions and one `hexo.log.warn` are new. No network surface. |
| Tests | `node --test test/*.test.js` 30/30. Generate smokes (blog header, series ×8, hideToggle, nav band) unchanged and passing. |
| Packaging | Same `files` as 1.1.2. Version bump is load-bearing: the local CDN `?v=` reads `package.json`, so 1.1.3 is also the cache-bust for the new warning and the doc-only changes. |
| Runtime smoke | Temp site with the theme installed from `node_modules`: banner + version render, `theme_dir` resolves to `node_modules/hexo-theme-panda`, no warning. Same site with a `themes/panda` clone present: warning fires and names that directory. |
| Performance | One string compare on `ready`. No render-path change. |
| Docs | README EN/CN installation section (single-command install, `themes/` precedence warning, upgrade command), `_config.yml` untouched, this changelog. |
| Content / assets | No new fonts or CDN. NOTICE unchanged (no upstream delta). |
| Deferred | None. |

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

[1.1.5]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.1.4...1.1.5
[1.1.4]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.1.3...1.1.4
[1.1.3]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.1.2...1.1.3
[1.1.2]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/SpeechlessPanda/hexo-theme-panda/releases/tag/1.0.0
