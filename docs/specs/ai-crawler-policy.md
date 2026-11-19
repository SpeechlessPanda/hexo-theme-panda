# AI Crawler Policy — Source-Verified Reference

Research date: **2026-11-19**. Every claim below was read from the cited primary source on that date.
Claims that could not be confirmed against a primary source are marked `UNVERIFIED`.

Purpose: ground the theme's native `robots.txt` generator in a **balanced** policy that separates three
distinct intents:

| Intent | Meaning for this theme |
| --- | --- |
| **Search indexing** | Allow. The blog must be discoverable in search surfaces. |
| **User-triggered agent access** | Allow. A human asked an assistant to fetch this page; that is the same act as a browser visit. |
| **Model training** | Deny. Content may be read, not absorbed into weights. |

This maps onto robots.txt as: *do not* write a blanket `Disallow: /`, because that conflates the three.
Use per-token groups instead.

---

## 1. OpenAI — `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`

Source: <https://developers.openai.com/api/docs/bots> (canonical alias: <https://platform.openai.com/docs/bots>)

**Framing (direct quote).** "OpenAI uses OAI-SearchBot and GPTBot robots.txt tags to enable webmasters to
manage how their sites and content work with AI. Each setting is independent of the others – for example, a
webmaster can allow OAI-SearchBot in order to appear in search results while disallowing GPTBot to indicate
that crawled content should not be used for training OpenAI's generative AI foundation models."

- **`GPTBot`** — training crawler. Quote: *"GPTBot is used to make our generative AI foundation models more
  useful and safe. It is used to crawl content that may be used in training our generative AI foundation
  models. Disallowing GPTBot indicates a site's content should not be used in training generative AI
  foundation models."*
  - robots.txt: explicitly supported; the token names the crawler.
  - Blocking effect: opts the content out of **training** only. OpenAI documents no effect on Search
    inclusion from this token.
  - UA example: `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot`
- **`OAI-SearchBot`** — search crawler. Quote: *"OAI-SearchBot is used to surface websites in search results
  in ChatGPT's search features. Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search
  answers, though can still appear as navigational links."*
  - robots.txt: supported. Quote: *"Please use OAI-SearchBot in robots.txt for managing Search opt outs and
    automatic crawl."*
  - Blocking effect: loss of ChatGPT **search answers** surface (navigational links may remain).
- **`ChatGPT-User`** — user-triggered fetcher. Quote: *"When users ask ChatGPT or a CustomGPT a question, it
  may visit a web page with a ChatGPT-User agent. … ChatGPT-User is not used for crawling the web in an
  automatic fashion. Because these actions are initiated by a user, robots.txt rules may not apply.
  ChatGPT-User is not used to determine whether content may appear in Search."*
  - robots.txt: **not a reliable control**. OpenAI states rules may not apply.
  - Blocking effect: not a documented training or indexing control; would only affect user-initiated visits
    (and OpenAI documents no robots.txt guarantee even for that).

**Policy reading.** `GPTBot` is the *only* OpenAI training knob. Blocking `OAI-SearchBot` hurts search.
Blocking `ChatGPT-User` buys nothing and breaks user-initiated access.

**Cross-vendor signal status (OpenAI).** OpenAI announced on 2026-10-30 that it *will honor* the shared
`__usage_ai-training` signal: *"We aim to implement the signal in the coming months"*, and *"This new signal
will not replace the controls we already provide through robots.txt."*
Source: <https://openai.com/index/helping-websites-express-ai-training-preferences/>
(OpenAI's own page is Cloudflare-403 to automated clients; text obtained via read proxy
<https://r.jina.ai/https://openai.com/index/helping-websites-express-ai-training-preferences/>.)
No implementation date and no precedence rule are published → future precedence between `GPTBot` and
`__usage-*` is `UNVERIFIED` for OpenAI.

---

## 2. Anthropic — `ClaudeBot`, `Claude-SearchBot`, `Claude-User`

Source: <https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler>
(legacy host `support.anthropic.com` redirects here)

**Framing (direct quote).** "Anthropic uses a variety of robots to gather data from the public web for model
development, to search the web, and to retrieve web content at users' direction. Anthropic uses different
robots to enable website owner transparency and choice."

- **`ClaudeBot`** — training. Quote: *"`ClaudeBot` helps enhance the utility and safety of our generative AI
  models by collecting web content that could potentially contribute to their training."* Blocking: *"When a
  site restricts `ClaudeBot` access, it signals that the site's future materials should be excluded from our
  AI model training datasets."*
- **`Claude-SearchBot`** — search. Quote: *"`Claude-SearchBot` navigates the web to improve search result
  quality for users."* Blocking: *"prevents our system from indexing your content for search optimization,
  which may reduce your site's visibility and accuracy in user search results."*
- **`Claude-User`** — user-triggered. Quote: *"When individuals ask questions to Claude, it may access
  websites using a `Claude-User` agent."* Blocking: *"prevents our system from retrieving your content in
  response to a user query, which may reduce your site's visibility for user-directed web search."*

**robots.txt support (direct quotes).** "Anthropic's Bots *respect "do not crawl" signals* by honoring
industry standard directives in robots.txt." Blocking recipe given in the doc:

```
User-agent: ClaudeBot
Disallow: /
```

Also supported: the non-standard `Crawl-delay` extension (example `Crawl-delay: 1` under `User-agent:
ClaudeBot`). IP-based blocking is explicitly discouraged: *"Alternate methods like blocking IP address(es)
… may not work correctly or persistently guarantee an opt-out, as doing so impedes our ability to read your
robots.txt file."*

**`Claude-Agent` is a separate thing.** Agentic browser traffic carries `Claude-Agent`, *not* any of the
three robots tokens: *"Agentic browser use is different from Anthropic's robots (crawlers and fetchers,
including `ClaudeBot`, `Claude-User`, and `Claude-SearchBot`)."* An `allowed`/`disallowed` decision for it is
made via IP list <https://claude.com/.well-known/sail>, not robots.txt.
Source: <https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf>

**AIPREF support (Anthropic) — with a documented precedence rule.** "As of October 30, 2026, Anthropic has
begun recognizing a machine-readable signal that lets website owners express a preference about whether their
content may be used to train AI models." Precedence, quoted: *"If your robots.txt file names ClaudeBot, we
follow that rule, even if your general setting says something different. If your robots.txt file doesn't
mention ClaudeBot, we follow the general setting described above."* Anthropic also warns the reading may
change: *"Because standards in this space are still evolving, the way we read and apply these settings may
change too."*

---

## 3. Google — `Googlebot`, `Google-Extended`, `Google-Agent`

Sources:
- <https://developers.google.com/crawling/docs/crawlers-fetchers/overview-google-crawlers>
- <https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers>
- <https://developers.google.com/crawling/docs/crawlers-fetchers/google-user-triggered-fetchers>
- <https://developers.google.com/crawling/docs/crawlers-fetchers/allow-google-agent>
- <https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec>
- <https://developers.google.com/search/docs/appearance/ai-features>

**`Googlebot`** — the actual crawler. Quote: *"Crawling preferences addressed to the `Googlebot` user agent
affect Google Search (including Discover and all Google Search features), as well as other products such as
Google Images, Video mode, Google News, and Discover."* Common crawlers *"always obey robots.txt rules when
crawling automatically."*
Nuance worth keeping: a disallowed URL can still be indexed. Google: *"Google can't index the content of
pages which are disallowed for crawling, but it may still index the URL and show it in search results
without a snippet."*

**`Google-Extended` is a control token, not a crawler.** Exact quote: *"Google-Extended doesn't have a
separate HTTP request user agent string. Crawling is done with existing Google user agent strings; the
robots.txt user-agent token is used in a control capacity."*
What blocking affects, quoted: *"`Google-Extended` is a standalone product token that web publishers can use to
manage whether content Google crawls from their sites may be used for training future generations of Gemini
models that power Gemini Apps and Vertex AI API for Gemini and for grounding (providing content from the
Google Search index to the model at prompt time to improve factuality and relevancy) in Gemini Apps and
Grounding with Google Search on Vertex AI."*
And: *"Google-Extended does not impact a site's inclusion in Google Search nor is it used as a ranking signal
in Google Search."*
Consequence: `Google-Extended: Disallow` removes **training + grounding**, not indexing. Google states the
positive side explicitly in its AIPREF post: *"Websites that specifically allow Google-Extended are eligible
to appear in responses and receive clicks via grounding in Gemini Apps."*

**`Google-Agent` is user-triggered and robots.txt does not govern it.** It is listed among
*user-triggered fetchers*, of which Google says: *"Because the fetch was requested by a user, these fetchers
generally ignore robots.txt rules."* Description: *"Google-Agent is used by agents hosted on Google
infrastructure to navigate the web and perform actions upon user request. It uses IP ranges from
user-triggered-agents.json."*
The robots.txt spec repeats the boundary: *"The REP isn't applicable to Google's crawlers that are controlled
by users (for example, feed subscriptions), or crawlers that are used to increase user safety."*
Google's actual control surface for `Google-Agent` is the CDN/WAF/bot-detection allowlist documented at
`.../allow-google-agent` (match `User-Agent` containing `Google-Agent`, IPs from
`user-triggered-agents.json`, plus experimental Web Bot Auth signatures under `https://agent.bot.goog`).
There is **no** documented robots.txt token that blocks `Google-Agent`; a `User-agent: Google-Agent` group
exists only as a UA string, not as a documented robots control. → Treat "block `Google-Agent` via robots.txt"
as `UNVERIFIED`.

**Google + AIPREF.** Google plans support: *"We aim to support this new control along with other AI providers
in 2027."* The crawler list carries the mechanics: *"Google intends to support the AIPREF shared
machine-readable training preference signal (with "`user-agent: __usage_ai-training`") in early 2027."*
Mapping, quoted: *"When a website uses this policy token to opt out of training in its robots.txt file (and
Google-Extended is not explicitly specified), Google plans to interpret that as if the publisher had
disallowed Google-Extended."*
Source: <https://developers.google.com/search/blog/2026/10/ai-training-control>

---

## 4. `__usage_ai-training` — AIPREF draft status, syntax, carrier

**Status (explicit).**

| Field | Value |
| --- | --- |
| Draft name | `draft-kelley-aipref-training-preference-signal` |
| Latest version | **`-01`** |
| Date | **16 November 2026** (version `-00` was 2026-10-30) |
| Type | **Active Internet-Draft (individual)** |
| Stream | *(None)* — "No stream defined" |
| Intended RFC status | *(None)* |
| IESG state | I-D Exists |
| Expires | 20 May 2027 |
| Is it an RFC? | **No.** Not an RFC, not WG-adopted, no formal standing. |

Datatracker states, verbatim: *"This document is an Internet-Draft (I-D). Anyone may submit an I-D to the
IETF. This I-D is **not endorsed by the IETF** and has **no formal standing** in the IETF standards
process."*
Source: <https://datatracker.ietf.org/doc/draft-kelley-aipref-training-preference-signal/>
Raw text: <https://www.ietf.org/archive/id/draft-kelley-aipref-training-preference-signal-01.txt>
It is **not** in the AIPREF WG's active document list (which holds only `draft-ietf-aipref-attach-05` and
`draft-ietf-aipref-vocab-08`); it appears there under "Related Internet-Drafts". Author: Kevin Kelley,
Anthropic. Source: <https://datatracker.ietf.org/wg/aipref/documents/>

**Carrier: robots.txt group keyed by a policy token. Not the `Content-Usage` header.**

Abstract, quoted: *"This document describes how a service operator binds usage preferences (e.g., "no AI
training") to paths by writing ordinary robots.txt groups keyed by a per-purpose policy token in the User-
Agent line. It introduces no new directive names and no new grammar: the path language, longest-match
precedence, and group structure of robots.txt are not changed."*

§1, quoted:

> ```
> User-Agent: __usage_ai-training
> Disallow: /
> Allow: /press-kit/
> ```
>
> "This expresses a preference _against_ AI training for all paths except those under /press-kit/, for which
> it expresses a preference _in favor_ (Section 4.2)."

§4.1, quoted: *"This document defines the policy token __usage_ai-training. The policy token conforms to the
product-token syntax in Section 2.2.1 of [ROBOTS] (letters, _, -). Consumers MUST match policy tokens
exactly, apart from case, as for any product token."*

§4.2 semantics, quoted:
- *"However, wildcard groups (i.e., User-Agent: *) MUST NOT be interpreted as matching the policy token."*
- *"If the lookup finds that the path is disallowed, a preference against the use described by the policy
  token has been expressed for that path. If it finds that the path is allowed, a preference in favor of that
  use has been expressed."*
- *"If no group contains the __usage_ai-training policy token (i.e., there is no User-Agent:
  __usage_ai-training line in the file), then no preference has been expressed."*

§4.4, quoted: *"This policy token is not a directive for crawling behavior. A consumer MAY use preferences to
inform crawling. … If a service operator wishes to limit crawling, it MAY use groups for crawlers' product
tokens in robots.txt to do so."*

§4.5, quoted: *"Consumers MAY document that they interpret rules that match proprietary policy tokens as
being more specific than the __usage_ai-training policy token."* (This is exactly the Anthropic precedence
rule in §2 above.)

**The `Content-Usage` header is a different draft.** `draft-ietf-aipref-attach-05` (AIPREF WG, 2026-08-18,
Intended status Proposed Standard) defines **both** an HTTP header field and a robots.txt rule, and it does
**not** use `__usage_ai-training`. Its wire forms, quoted:

```
HTTP/1.1 200 OK
Content-Usage: train-ai=n
```

```
User-Agent: *
Allow: /
Content-Usage: train-ai=n
```
The `Content-Usage` field is *"a structured field dictionary"* whose keys come from
`draft-ietf-aipref-vocab-08` §6.1 (`train-ai`, `ai-use`, `search`), values `y`/`n`.
Sources: <https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/>
<https://www.ietf.org/archive/id/draft-ietf-aipref-attach-05.txt>
<https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/>

**Bottom line.** `__usage_ai-training` is a **robots.txt `User-Agent` policy token only** — never a header
name, never a robots.txt directive name, and not `train-ai`. `train-ai=n` is the vocabulary label used by the
`Content-Usage` mechanism, a separate draft. Do not mix the two spellings.

**Deployment reality (as of 2026-11-19):**
- Anthropic: honoring it since 2026-10-30 (§2).
- OpenAI: committed, "in the coming months" (§1).
- Google: "early 2027" (§3).
- Microsoft/Bing: not verified from a primary Microsoft source → `UNVERIFIED`.

---

## 5. `Sitemap:` — absolute URL required?

**RFC 9309 does not specify `Sitemap` at all.** It is only an "other record":

> "Crawlers MAY interpret other records that are not part of the robots.txt protocol -- for example,
> "Sitemaps" [SITEMAPS]. Crawlers MAY be lenient when interpreting other records. … Parsing of other records
> MUST NOT interfere with the parsing of explicitly defined records in Section 2. For example, a "Sitemaps"
> record MUST NOT terminate a group."
> — RFC 9309 §2.2.4, <https://www.rfc-editor.org/rfc/rfc9309.html#section-2.2.4>

So RFC 9309 imposes **no** URL-form requirement, and no grammar for the line beyond "other record".

**The normative-ish answer comes from sitemaps.org**, which requires the full URL: *"simply add the following
line including the full URL to the sitemap: `Sitemap: http://www.example.com/sitemap.xml`"*, and *"This
directive is independent of the user-agent line, so it doesn't matter where you place it in your file."*
Source: <https://www.sitemaps.org/protocol.html#submit_robots>

**Google states it as a hard requirement**, quoted: *"The `[absoluteURL]` line points to the location of a
sitemap or sitemap index file. It must be a fully qualified URL, including the protocol and host, and doesn't
have to be URL-encoded. The URL doesn't have to be on the same host as the robots.txt file. You can specify
multiple `sitemap` fields, with no limit… The sitemap field isn't tied to any specific user agent and may be
followed by all crawlers, provided it isn't disallowed for crawling."*
Also, field name case-insensitive, value case-sensitive; and Google *"ignore[s] the `sitemap` line"* when
grouping rules, so a `Sitemap:` line between two `user-agent` groups does not terminate the group.
Source: <https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec>

**Verdict: yes, absolute URL (scheme + host + path).** Required by sitemaps.org and enforced-by-documentation
by Google; merely conventional under RFC 9309.

---

## 6. Balanced policy for hexo-theme-panda

Recommended emitted file (shape, not final wiring):

```
User-agent: *
Allow: /
Disallow: /admin/

User-agent: OAI-SearchBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Googlebot
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: __usage_ai-training
Disallow: /

Sitemap: https://<host>/sitemap.xml
```

Design notes:

- **Never** express the training opt-out via `User-agent: *` / `Disallow: /`. That would kill search *and*
  user-triggered access, and per §4.2 the `*` group **MUST NOT** be read as the policy token anyway — so it
  would not even work as a training signal.
- Explicit training disallows (`GPTBot`, `ClaudeBot`, `Google-Extended`) are *more specific* than
  `__usage_ai-training` under §4.5 and under Anthropic's published rule, so emitting both is consistent, not
  contradictory.
- Do **not** emit `User-agent: ChatGPT-User`, `Claude-User`, or `Google-Agent` disallows: OpenAI says
  robots.txt may not apply, Google says fetchers generally ignore robots.txt, and blocking them only
  degrades the human on the other end. `Google-Agent` blocking belongs in the CDN/WAF if ever wanted.
- Do not emit `Crawl-delay` for Google (unsupported per its spec: *"other fields such as `crawl-delay` aren't
  supported"*); Anthropic does support it.
- `Sitemap:` must be an absolute URL and belongs outside any group semantically (though parsers tolerate it
  anywhere); place it last.

---

## 7. Token reference table

| token | purpose | balanced-policy recommendation | caveat |
| --- | --- | --- | --- |
| `Googlebot` | Google Search / Discover / News / Images crawling | **Allow** | Blocking removes Search content indexing; URL may still appear snippet-less |
| `Google-Extended` | Control token only — Gemini training + grounding | **Disallow** | Not a crawler (no own UA); also forfeits Gemini grounding clicks; no Search impact |
| `Google-Agent` | User-triggered agent fetches on user request | **Do not disallow in robots.txt; allow at WAF if desired** | robots.txt generally ignored by user-triggered fetchers; REP documented as not applicable |
| `OAI-SearchBot` | ChatGPT search index | **Allow** | Opt-out removes site from ChatGPT search answers (navigational links may survive) |
| `GPTBot` | OpenAI foundation-model training crawl | **Disallow** | Training-only knob; documented as not affecting Search |
| `ChatGPT-User` | User-initiated fetches in ChatGPT / Custom GPTs | **Do not disallow** | "robots.txt rules may not apply"; not a Search or training signal |
| `Claude-SearchBot` | Anthropic search indexing | **Allow** | Disabling reduces visibility in user search results |
| `ClaudeBot` | Anthropic model training | **Disallow** | Takes priority over `__usage_ai-training` when explicitly named |
| `Claude-User` | User-initiated fetches for Claude | **Do not disallow** | Disabling blocks retrieval "in response to a user query" |
| `Claude-Agent` | Anthropic-hosted agentic browser (Claude Duet) | **Not a robots token — out of scope** | Governed by IP list `claude.com/.well-known/sail`, not robots.txt |
| `__usage_ai-training` | Cross-vendor training preference (robots.txt `User-Agent` policy token) | **Emit `Disallow: /`** | Individual I-D `-01`, 2026-11-16, **not an RFC**; support: Anthropic live, OpenAI pending, Google "early 2027"; `*` group must not be used for it |
| `Sitemap` | Discoverability hint | **Emit absolute URL** | Not defined by RFC 9309 (an "other record"); absolute URL required by sitemaps.org + Google |

---

## 8. Sources

1. OpenAI crawler overview — <https://developers.openai.com/api/docs/bots>
2. OpenAI, "Making it easier for websites to express AI training preferences" (2026-10-30) — <https://openai.com/index/helping-websites-express-ai-training-preferences/>
3. OpenAI, cloud browser / agent access — <https://developers.openai.com/commerce/agent-access>
4. Anthropic, crawler + blocking — <https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler>
5. Anthropic, hosted browser identity — <https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf>
6. Google, crawler/fetcher overview — <https://developers.google.com/crawling/docs/crawlers-fetchers/overview-google-crawlers>
7. Google, common crawlers (incl. `Google-Extended`) — <https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers>
8. Google, user-triggered fetchers (incl. `Google-Agent`) — <https://developers.google.com/crawling/docs/crawlers-fetchers/google-user-triggered-fetchers>
9. Google, allow `Google-Agent` traffic — <https://developers.google.com/crawling/docs/crawlers-fetchers/allow-google-agent>
10. Google, robots.txt interpretation — <https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec>
11. Google, AI features and your website — <https://developers.google.com/search/docs/appearance/ai-features>
12. Google Search blog, AI training control (2026-10-30) — <https://developers.google.com/search/blog/2026/10/ai-training-control>
13. IETF Datatracker, `draft-kelley-aipref-training-preference-signal-01` — <https://datatracker.ietf.org/doc/draft-kelley-aipref-training-preference-signal/>
14. IETF draft text (-01) — <https://www.ietf.org/archive/id/draft-kelley-aipref-training-preference-signal-01.txt>
15. IETF AIPREF WG documents — <https://datatracker.ietf.org/wg/aipref/documents/>
16. IETF, `draft-ietf-aipref-attach-05` (Content-Usage header + rule) — <https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/>
17. IETF, `draft-ietf-aipref-vocab-08` (labels `train-ai`, `ai-use`, `search`) — <https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/>
18. RFC 9309, Robots Exclusion Protocol — <https://www.rfc-editor.org/rfc/rfc9309.html>
19. RFC 5234, ABNF (case-insensitive literals) — <https://www.rfc-editor.org/rfc/rfc5234.html>
20. sitemaps.org protocol — <https://www.sitemaps.org/protocol.html>
