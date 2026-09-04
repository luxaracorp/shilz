# Shilo Workspace — Image + Video Studio

Premium **image + video** atelier for **Oxyy** — `nano-banana-2` (Nano Banana Pro), `veo-3`, `veo-3.1-fast`, `grok-imagine-video`, `grok-imagine-video-1.5` via secure Cloudflare Pages Functions.  
Atelier Noir · Champagne Noir · Glass composer · No traditional backend.

> Static frontend only. All Oxyy credentials live in Cloudflare Workers bindings (`context.env`). Deployable to Cloudflare Pages or static hosting + Pages Functions in seconds.

---

## ✨ Features

- **Image:** text → image, image → edit with **nano-banana-2** (60 credits/image). Ratios `1:1` `16:9` `9:16` `4:3` `3:4` `3:2` `2:3` `21:9` → `size` `1024x1024…4096x2304` (64-px rounded). Resolutions `1K` `2K` `4K`.
- **Video:** text → video, image → video with **Veo 3**, **Veo 3.1 Fast**, **Grok Imagine Video / 1.5**. Controls: duration `4`/`6`/`8`s, aspect ratio, resolution `720p`/`1080p`, audio toggle. Uses Oxyy async `POST /v1/videos/generations` + `GET /v1/videos/generations/:job_id` polling (5s interval, 5-min timeout).
- **Mode switch:** Image / Video toggle in composer; composer labels, credit text, and hero are model-aware.
- **Projects:** local `localStorage` system `shilo_workspace_projects_v1` — create/rename/delete/switch projects, store images+videos per project, search by prompt/tags, filter `all|image|video`, sort `newest|oldest|image|video`, add tags, rename assets, delete assets, open in lightbox (`<img>`/`<video controls>`), download (`data:` & `https:`), export/import JSON. Migrates `shilo_workspace_history_v2` → default project `My Studio` without loss.
- **Asset cards:** unified cards show prompt, model, mode, duration, ratio, resolution, timestamp, project tag, retry/download/open; shimmer/loading/reveal animations preserved, glass atelier styling, responsive.
- **Reference images:** click/drag/paste `PNG`/`JPEG`/`WebP` `<12 MB` — sent as `image`/`image_base64` data URL to Oxyy for both image edits and `image-to-video`.
- **Secure proxy:** `functions/api/images/generations.js` & `functions/api/videos/generations.js` read `env.OXY_API_KEYS`|`env.OXY_API_KEY` (comma/newline-separated), round-robin/LRU, per-key cooldowns (`429→45s|Retry-After`, `5xx→18s`, `network→12s`), idempotency (`X-Idempotency-Key`), `Cache-Control: no-store`, sanitized errors, never log keys, return `X-Proxy-Key-Index`/`X-Proxy-Total-Keys` for “Key 2/4 used” UI.
- **Branding:** Shilo logo (`icon.png`), Instrument Serif + Inter, Atelier Noir/Champagne, premium motion (respects `prefers-reduced-motion`).
- **Vanilla:** HTML/CSS/JS only, < 90 KB, no database.

---

## 📁 Project structure

```
shilo-workspace/
├── index.html                         # Atelier shell — mode switch, projects bar, composer, history/projects panels, lightbox (img+video)
├── style.css                          # Atelier Noir system — glass, amber glow, mode & projects styling
├── app.js                             # Image + video generation, projects, key indicator, composer, lightbox
├── functions/api/images/generations.js# Secure Oxyy image proxy (key pool, retry, idempotency)
├── functions/api/videos/generations.js# Secure Oxyy video proxy + async polling
├── config.example.js                  # Placeholders + env docs
├── .gitignore                         # Ignores config.js
└── README.md
```

---

## 🔑 1. Configure Cloudflare Pages Functions

In **Cloudflare Dashboard → Workers & Pages → Your Pages project → Settings → Environment variables** add:

- `OXY_API_KEY` — single key, or
- `OXY_API_KEYS` — **recommended** comma- or `newline`-separated list (up to N keys) for rotation.

Example value for `OXY_API_KEYS`:

```
oxyy-aaaa...,oxyy-bbbb...,oxyy-cccc...
```

Or newline separated:

```
oxyy-aaaa...
oxyy-bbbb...
```

Both `functions/api/images/generations.js` and `functions/api/videos/generations.js` share the same pool. The frontend posts to same-origin:

```
POST /api/images/generations   → proxies to https://api.oxyy.ai/v1/images/generations
POST /api/videos/generations   → proxies to https://api.oxyy.ai/v1/videos/generations
GET  /api/videos/generations/:id → poll (server-side)
```

No keys ever reach the browser. Use Worker-compatible bindings only: `fetch`, `Request`, `Response`, `context.env`, Web APIs. Never create an Express/Node server.

Local static hosting (GitHub Pages without Functions) will fail to generate — deploy to Cloudflare Pages for secure proxy, or use `config.js` locally (see below).

---

## 🎬 2. Supported model IDs (exact Oxyy IDs)

| Mode | Model ID | Display | Notes |
|------|----------|---------|-------|
| Image | `nano-banana-2` | Nano Banana Pro | 60 cr/img, supports `image` reference |
| Video | `veo-3` | Veo 3 | Google Veo 3, duration 4/6/8, `720p`/`1080p`, audio |
| Video | `veo-3.1-fast` | Veo 3.1 Fast | Fast variant, lower cost |
| Video | `grok-imagine-video` | Grok Imagine Video | xAI, 1–15s (single img up to 15s) |
| Video | `grok-imagine-video-1.5` | Grok Imagine 1.5 | Requires image for some durations |

`config.example.js` documents these. Always use IDs exactly as returned by `https://api.oxyy.ai/v1/models`; do not guess.

---

## 🧠 3. How generation works

**Image request** (`app.js: callOxyy`):

```json
POST /api/images/generations
{
  "model": "nano-banana-2",
  "prompt": "a small cat, photorealistic",
  "n": 1,
  "size": "1024x1024",
  "response_format": "b64_json",
  "image": "data:image/jpeg;base64,...",
  "reference_image": "data:image/jpeg;base64,...",
  "aspect_ratio": "1:1",
  "resolution": "1K"
}
```

**Video request** (`app.js: callOxyyVideo`) — text-to-video & image-to-video use same endpoint:

```json
POST /api/videos/generations
{
  "model": "veo-3",
  "prompt": "Slowly pan across the scene with gentle motion",
  "duration": 4,
  "resolution": "1080p",
  "aspect_ratio": "16:9",
  "aspectRatio": "16:9",
  "generate_audio": true,
  "image": "data:image/jpeg;base64,...",
  "image_base64": "...."
}
```

Fields are OpenAI-compatible. Video generation is **async**: proxy polls `GET https://api.oxyy.ai/v1/videos/generations/:job_id` every 5s until `completed` (returns `video_url`) or `failed`/timeout (5 min). Frontend waits once; no client polling needed.

Response parsing: `data[0].b64_json` → `data:image/png;base64,...`; video `video_url` → `<video controls>`; fallbacks `url`, `images[]`, deep scan; MIME preserved.

**Idempotency:** frontend sends `X-Idempotency-Key: <uuid>`; proxy caches response 10 min to prevent double charge on retry.

---

## 🔁 4. How key rotation works (server-side pool)

Both functions:

1. `parseKeys()` splits `OXY_API_KEYS`/`OXY_API_KEY` on commas/newlines.
2. In-memory `Map<key, cooldownUntil>` + `roundRobinIndex` — pick LRU: available keys first (sorted by earliest cooldown), then cooling keys nearest expiry.
3. On `401/403/402/429/500/502/503/504` try next key; on `400` with validation/moderation/malformed (`/moderation|policy|validation/i`) **do not retry** (permanent).
4. Respect `Retry-After` header (`45s` for `429`, `18s` for `5xx`, `12s` network, `30s` auth) + jitter; `setCooldown(key, ms)`.
5. No infinite loop — cap at `totalKeys`; small delays `300–700ms` between retries.
6. Never log or return keys; sanitize `oxyy-...` → `[key]`; return `x-proxy-key-index`/`x-proxy-total-keys`/`x-proxy-model` and `_shilo_proxy` JSON for UI (“Key 2/4 used”).

Browser `KEYS = ["proxy"]` (`app.js:11`) keeps UI single-slot; `updateKeyIndicator()` shows proxy readiness and expands to `ready · cooling` when server reports cooldowns. History/project toasts show key index on success.

---

## 📦 5. Projects & organization (local)

Storage keys:

- `shilo_workspace_projects_v1` — `[{ id, name, createdAt, updatedAt, assets: [...] }]`
- `shilo_workspace_active_project_v1` — active id
- `shilo_workspace_history_v2` — legacy, migrated once to default project `My Studio` (`shilo_migrated_v1` flag)

Asset shape:

```js
{ id, projectId, type:"image"|"video", prompt, model, mode, aspect, resolution, duration, audio, mediaUrl, mime, poster, timestamp, tags:[], title, refThumb }
```

UI:

- **Projects bar** (sticky below topbar): `<select>` switch, Rename/Delete, Search input, Sort/Filter selects, Manage + New buttons.
- **Projects panel** (slide-in): list with active highlight, Create input, Export JSON, Import JSON (`<input type=file>`), Clear all.
- **History panel** now shows *current project’s filtered assets* (search `prompt|title|tags|model`, filter image/video, sort newest/oldest/type). Each card: thumbnail (`<img>` or `<video muted loop>` + ▶ badge), prompt/title, time·model·ratio·res·duration·audio, tags, Open/Rename/Delete/Download.
- **Thread cards:** same meta + project pill, retry/download/open.
- **Lightbox:** auto-detects `<img>` vs `<video controls>`; download handles both.
- **Export/import:** `exportProjects()` downloads `{ version, exportedAt, projects }`; `importProjects(file)` merges, deduplicates ids, caps 96 assets/project.
- **Quota:** `persistProjects()` catches `QuotaExceeded` → strips `refThumb`, trims to 6 assets in oldest projects, else warns.

---

## 🎨 6. UI & branding

- Brand subtitle: **Image + Video Studio** (not Nano Banana-only).
- Hero: kicker `Atelier — Image + Video Studio`, credit `Oxyy · Nano Banana · Veo · Grok Imagine`, subtitle mentions images & videos, suggestions include video-friendly prompts.
- Composer: `Image|Video` pill toggle (`#modeSwitch`); image shows `Nano Banana 2` pill; video shows `Veo/Grok` pills, `Duration 4s/6s/8s`, `Resolution 720p/1080p`, `Audio` toggle; placeholder & footnote & badge change per mode; credit avoids hardcoding 60 for video.
- Premium Atelier Noir retained: `icon.png`, champagne `#E8D9B8`, warm obsidian `#0C0B0A`, glass 28px blur, Instrument Serif.

---

## ☁️ 7. Local development & deployment

**Local:**

```bash
# Python (recommended)
python -m http.server 8080
# or: npx serve .
# open http://localhost:8080
```

For local *secure* proxy, use Cloudflare Pages local: `npx wrangler pages dev . --compatibility-date=2025-09-04` (needs `wrangler.toml` with `OXY_API_KEYS`).

For quick local without Functions, create `config.js` from `config.example.js` (gitignored) with `window.OXY_KEYS=[...]` — requests go direct to `api.oxyy.ai` (keep deployment private).

**Deploy to Cloudflare Pages:**

1. Push to GitHub (ensure `config.js` not committed).
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
3. Build: Framework `None`, Build command *(empty)*, Output `/`.
4. Settings → Environment variables → add `OXY_API_KEYS` (or `OXY_API_KEY`) — *Production* and *Preview*.
5. Deploy. Frontend calls `POST /api/images/generations` & `POST /api/videos/generations` securely.

**Deploy to GitHub Pages (static only, no video proxy):** keep repo private or run Pages Functions via Cloudflare; otherwise static hosting will show “Oxyy server configuration is missing.”

---

## 🔒 8. Reliability & security

Handles: `401/403` auth, `402/429` credits/quota, `400` validation (no retry), `5xx`, network, malformed, expired URLs, quota. Never silently retry a charge-risk request without `X-Idempotency-Key`. Sanitizes all errors, never exposes keys, `Cache-Control: no-store`, retries with jitter and `Retry-After`.

Do not create accounts or bypass quotas — only keys legitimately configured by the owner are used.

**Limitations:** in-memory cooldowns per isolate (not global), polling caps 5 min, `localStorage` quota varies by browser (export often), GitHub Pages without Functions lacks proxy, video URLs may expire.

---

## ⌨️ Composer & shortcuts

- `Enter` → Generate (image or video per mode), `Shift+Enter` → newline
- Paperclip / drag & drop / `Ctrl+V` → attach reference (image for both modes)
- Mode pills → switch Image/Video; Duration/Resolution/Audio affect video payload
- `⌘/Ctrl+K` → focus prompt

---

## ✅ Tests (manual)

```bash
python -m http.server 8080
# 1. Image text→image (Nano Banana 2) — verify 60cr toast, card, history, lightbox, download, project save
# 2. Image image→image — attach ref, generate, verify edit
# 3. Video text→video (Veo 3) — 4s 16:9 720p audio on, verify polling, video card, play, download, project
# 4. Video image→video (Grok) — attach ref, generate, verify
# 5. Key failover — temporarily set one bad key in OXY_API_KEYS, verify “Trying another key…” and success via second key, check X-Proxy headers
# 6. Error 400 prompt — validation error, verify no retry loop
# 7. Projects — create/rename/delete/switch, search “k oi”, filter video, sort, add tag, rename asset, delete asset, export JSON, import JSON, verify migration
# 8. Quota — fill localStorage in DevTools, verify trim toast
# 9. Mobile — 375px width, verify composer, cards, bars, panels
# 10. No keys — clear env, verify 503 “Oxyy server configuration is missing.”
```

*Built without frameworks — just a beautiful, fast atelier for Nano Banana, Veo, and Grok Imagine via Oxyy.*

