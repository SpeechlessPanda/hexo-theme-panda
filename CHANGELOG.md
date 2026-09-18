# Changelog

All notable changes to [hexo-theme-panda](https://github.com/SpeechlessPanda/hexo-theme-panda) are documented here.

## [1.1.0] - 2026-09-18

### Added

- Blog series: a one-level folder under `source/_posts` with a required `index.md` (`title` + `description`, no `date`) becomes one card on the post stream. Sibling markdown files are chapters: listed on `/series/<folder>/`, hidden from the stream, still RSS entries.
- Mixed listing: independent posts and series cards share one newest-first stream. A series card's date is its latest chapter. Empty series (index only) are omitted.
- In-series prev/next only walks sibling chapters. Independent posts keep their own neighbor chain.
- CLI: `hexo new series "<folder>"` writes `_posts/<folder>/index.md`; `hexo new --series "<folder>" "<title>"` writes a chapter (creates `index.md` if missing). Folder names are not slugized.
- Folder-only regroup: drag existing posts into the series folder — no extra front-matter — and they leave the stream on the next generate.
- Distinct from Butterfly's `{% series %}` tag (`series.enable` stays off). Config key: `blog_series` (default on).

### Release audit

| Check | Result |
|-------|--------|
| Dependency / security | Theme deps: `hexo-renderer-pug`, `hexo-renderer-stylus`, `hexo-util`, `moment-timezone`. No new network-facing surface; series is local filesystem + Hexo generators. `hexo-util` added so git-clone installs resolve `url_for` without relying on a site transitive. |
| Tests | `node --test test/*.test.js` (classify / mix / paginate / CLI path / rewrite). Generate smoke `test/_smoke_series.js` against a temp site using the live blog's Hexo. |
| Packaging | npm `files` includes layouts, scripts, languages, source, `_config.yml`, LICENSE, NOTICE, READMEs, CHANGELOG. Tests and `docs/superpowers/` stay out of the tarball. |
| Runtime smoke | Temp site generate: index mixes series card + independents by latest-chapter date; series landing lists chapters newest-first; Atom feed includes chapters not the unpublished index; chapter pages show series badge and in-series pagination only. `hexo new series` / `hexo new --series` paths verified in the same smoke. |
| Performance | Series classification is one pass over `Post` at generate; listing pagination reuses the index generator contract. No extra runtime JS. |
| Docs | README EN/CN, `_config.yml` comments, i18n (`blog_series.*`), NOTICE, this changelog. |
| Content / assets | No new third-party fonts or CDN. Apache-2.0 NOTICE updated. |
| Deferred | Not converting the demo blog's existing standalone posts into a series. Butterfly `{% series %}` tag remains unused. Nested folders deeper than one level under `_posts` stay ignored. |

## [1.0.0] - 2026-09-17

Initial public release. Fork of hexo-theme-butterfly 5.7.0 with memos, Atom feed, OG images, home-as-about, and gradient visuals.

[1.1.0]: https://github.com/SpeechlessPanda/hexo-theme-panda/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/SpeechlessPanda/hexo-theme-panda/releases/tag/1.0.0
