# Shilo Workspace — Nano Banana Pro

Premium image studio for **Oxyy Nano Banana Pro** (`nano-banana-2` via a secure Cloudflare Pages Function).  
Apple-level polish · ChatGPT-style conversation · glass composer · no backend.

> Static frontend only. No server, no database, no auth. Deployable to Cloudflare Pages or GitHub Pages in seconds.

---

## ✨ Features

- **Text → image** and **reference image → edit/transform** with Oxyy `nano-banana-2` (60 credits/image)
- **All ratios:** `1:1` `16:9` `9:16` `4:3` `3:4` `3:2` `2:3` `21:9` → mapped to `size` e.g. `1024x1024`, `1024x576`
- **All resolutions:** `1K` `2K` `4K` (longest side 1024/2048/4096, rounded to 64px)
- **Server-side key failover** — configure `OXY_API_KEY` or comma/newline-separated `OXY_API_KEYS` in Cloudflare Pages; keys never reach the browser
- **Premium UX:** `Hello, Shilo.` hero, floating glass composer, animated thread, shimmer loader, lightbox, history gallery — now refined for Nano Banana Pro
- **Reference images:** click to upload, drag & drop, or paste (PNG/JPEG/WebP, <12 MB) — sent as `image` data URL to Oxyy
- **Local history** via `localStorage` with graceful quota handling
- **Vanilla stack** — HTML/CSS/JS only, < 65 KB total, instant load

---

## 📁 Project structure

```
shilo-workspace/
├── index.html          # App shell — hero, thread, composer, history, lightbox
├── style.css           # Premium dark system — glass, motion, responsive (Pro polish)
├── app.js              # Oxyy integration (api.oxyy.ai), key manager, composer, viewer, history
├── functions/api/images/generations.js # Same-origin secure Oxyy proxy
├── config.example.js   # Server-variable guidance only
├── .gitignore          # Ignores config.js
└── README.md
```

---

## 🔑 1. Configure the Pages Function

In Cloudflare Pages, open Settings → Environment variables and add `OXY_API_KEY`.
For failover, use `OXY_API_KEYS` with comma- or newline-separated values.

```bash
cp config.example.js config.js
# then edit config.js
```

Do not put Oxyy credentials in `config.js`, HTML, or frontend JavaScript. The frontend posts to `/api/images/generations`; the Pages Function adds the Bearer credential server-side.

```js
window.OXY_KEYS = [
  "oxyy-c1ac9357ab8d55370a5c3f983cb015307af986c690c3bd6e521089de696b9399",
  "oxyy-d05b8ad0a122e33116ee568074c449fa046f92bfc1c6018ea4df34871af66361",
  "oxyy-e9e2510ef42e89743ed4b82719f2a6bc671bc7a14f17dde09706549f461dae71"
];
window.GEMINI_KEYS = window.OXY_KEYS.slice(); // compat alias

window.OXY_BASE_URL = "https://api.oxyy.ai/v1";
window.OXY_MODEL = "nano-banana-2";
window.GEMINI_MODEL = "nano-banana-2";
```

`config.example.js` contains only placeholders:

```js
window.OXY_KEYS = [
  "PASTE_OXY_KEY_1_HERE",
  "PASTE_OXY_KEY_2_HERE",
  "PASTE_OXY_KEY_3_HERE"
];
window.GEMINI_KEYS = window.OXY_KEYS.slice();
window.OXY_BASE_URL = "https://api.oxyy.ai/v1";
window.OXY_MODEL = "nano-banana-2";
window.GEMINI_MODEL = "nano-banana-2";
```

> **Security:** keys live only in `config.js`. They are never hardcoded in `index.html`, `app.js`, or CSS. The UI shows only an aggregate dot indicator (ready / cooling / generating) — never the key values. The app never logs keys. You accept that a deployed client-side app can be inspected by anyone with access to the URL; keep the deployment private.

---

## ▶️ 2. Run locally

Any static server works. Pick one:

```bash
# Python (recommended)
python -m http.server 8080

# Node
npx serve .

# Bun / Deno / PHP — any static server
```

Then open:

```
http://localhost:8080
```

You should see **Hello, Shilo.** with a subtle reveal animation. Typing a prompt and pressing **Enter** (Shift+Enter for newline) generates via Oxyy Nano Banana Pro.

---

## ☁️ 3. Deploy to Cloudflare Pages

1. Push the repo to GitHub (ensure `config.js` is **not** committed — check `git status`).
2. In Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (or `.`)
4. Deploy. Cloudflare serves the static files directly.
5. For a private deployment: **Settings → Access** or keep the Pages URL unlisted.

If you need keys on the deployed site, commit only `config.example.js` and manually upload `config.js` via **Cloudflare Pages → Functions → or drag-and-drop** (or set keys via a separate private fork). Most users keep generation local-only.

---

## 📄 4. Deploy to GitHub Pages

1. Create a repo, push **without** `config.js`:

   ```bash
   git init
   git add index.html style.css app.js config.example.js .gitignore README.md
   git commit -m "Shilo Workspace — Nano Banana Pro via Oxyy"
   git branch -M main
   git remote add origin https://github.com/<you>/shilo-workspace.git
   git push -u origin main
   ```

2. GitHub → **Settings → Pages** → **Build and deployment** → **Source: Deploy from a branch** → **Branch: main / root**.
3. Wait for deployment, open `https://<you>.github.io/shilo-workspace/`.

> For GitHub Pages with private keys, keep the repo **private** or host `config.js` only on your local clone and deploy a key-less build that you run locally.

---

## 🧠 5. How the Oxyy integration works

**Endpoint** (OpenAI-compatible):

```
POST https://api.oxyy.ai/v1/images/generations
Authorization: Bearer <OXY_API_KEY>
Content-Type: application/json
```

**Request body** (`app.js: callOxyy`):

```json
{
  "model": "nano-banana-2",
  "prompt": "a small cat, photorealistic",
  "n": 1,
  "size": "1024x1024",
  "response_format": "b64_json",
  "image": "data:image/jpeg;base64,...",
  "aspect_ratio": "1:1",
  "resolution": "1K"
}
```

- `model` is fixed to `nano-banana-2` from `config.js` (`window.OXY_MODEL`), displayed as **Nano Banana Pro** in the UI.
- `size` is computed from ratio + resolution (`1K=1024`, `2K=2048`, `4K=4096` longest side, ratio-preserved, rounded to 64px).
- `image` (data URL) is only added when a reference image is attached; also sent as `reference_image`/`input_image`/`images` for compatibility.
- `response_format: "b64_json"` requests base64 inline.

**Response parsing** is robust for OpenAI shape:

- Primary: `data[0].b64_json` → `data:image/png;base64,...`
- Fallbacks: `data[0].url` (fetched to base64 best-effort), `data[0].b64Json`, `images[]`, `b64_json`, deep scan
- MIME preserved; image rendered without re-encoding.

**No raw dumps**: API JSON is never rendered into the DOM; only the extracted image and sanitized errors are shown.

---

## 🔁 6. How multi-key failover works

`config.js` provides 3 Oxyy keys (`A/B/C`). The client-side manager:

1. **Picks an available key** — prefers the last successful key (if not cooling), otherwise any ready key; cooling keys are sorted by soonest expiry.
2. **Makes the request** with `Authorization: Bearer <key>` to `https://api.oxyy.ai/v1`.
3. **On transient failure** (`429`, `500`, `503`, network error) — puts that key on **cooldown** (`429 → 45s` or `Retry-After` header, `5xx → 18s`, `network → 12s`), shows *Trying another Oxyy key…*, and retries the next key.
4. **On auth/config failure** (`401`/`403`, `400`) — also cools the key (30 s) and tries the next key, but limits `400` retries to 2 attempts.
5. **Tracks** `lastSuccessfulKey`, `failures`, `cooldownUntil` per key.
6. **Caps retries** at `number of keys` (max 3) — never loops endlessly.
7. **Never circumvents** provider security: respects `Retry-After`, small inter-retry delays (300–700 ms), surfaces *Generation unavailable* when all keys are exhausted.

**Status indicator** (top-right, next to History):

- ● green = ready
- ● amber pulsing = busy (generating)
- ● red = cooling
- Text: `3 ready` / `2 ready · 1 cooling · 12s` / `generating…` / `cooling down · 45s` — **click the pill to reset cooldowns instantly**.

**Differentiated errors** (human-friendly, never exposing keys):

| Condition | Title | Message |
|---|---|---|
| Network | Couldn't reach Oxyy | Check your connection and try again. |
| 429 (credit) | Oxyy credits exhausted | Insufficient credits for Nano Banana Pro (60 credits/image). Top up at https://api.oxyy.ai |
| 429 (rate-limit) | Generation unavailable | All keys are temporarily rate-limited… (shows Retry-After) |
| 401/403 | Authentication failed | Oxyy rejected the API keys. Verify `oxyy-...` keys in config.js. |
| 400 (prompt) | Request error | That prompt was rejected… |
| 500/503 | Oxyy is temporarily unavailable | Oxyy is temporarily unavailable… |
| No image in response | No image returned | No image was returned… |

---

## 🔒 7. Security implications of client-side API keys

This is a **private, client-side** app by design. Implications:

- **Any visitor** to the deployed URL can open DevTools → `config.js` / `Network` and see the keys. Only deploy to a **private, access-controlled** URL or run locally.
- **Keys are never committed**: `.gitignore` blocks `config.js`. Only `config.example.js` (placeholders) should be committed.
- **UI never reveals keys**: indicator is aggregate; toasts/errors are sanitized (`oxyy-…` → `[key]`); no `console.log` of keys.
- **No proxy**: requests go directly to `api.oxyy.ai`; the browser origin is the caller. Oxyy keys are `Bearer` tokens — keep them private.
- **Rate & credit** are per-key, per Oxyy account — a leaked key can be abused (60 credits/image). Rotate keys at https://api.oxyy.ai if exposure is suspected.
- **Mitigations** (optional, not included to keep the app zero-backend): add a Cloudflare Worker proxy that holds keys server-side, or restrict keys by IP in Oxyy dashboard.

---

## ⌨️ Composer & shortcuts

- **Enter** → Generate
- **Shift+Enter** → Newline
- **Click paperclip** / **drag & drop** / **paste (Ctrl+V)** → attach reference
- **Ratio / Resolution pills** → affect `size` sent to Oxyy
- While generating, composer is disabled and shows *Generating…*

---

## 🖼️ Viewer & history

- Click any generated image to open the **lightbox** (Esc or click outside to close, Download button inside — handles both `data:` and `https:` URLs).
- **History** (top-right) slides in, shows local thumbnails (lazy), time + ratio. Stored under `shilo_workspace_history_v2` in `localStorage`.
- If `localStorage` is full, the app **trims** oldest entries / strips reference thumbnails and keeps the latest images, then shows a toast — it never crashes.
- **Export** downloads history metadata (prompts + settings, not image bytes to keep the file small). **Clear all** wipes local history after confirmation. **Clear conversation** (top-right ×) clears the thread (and restores the hero).

---

## 🎨 Design notes — Nano Banana Pro polish

- **Palette:** near-black `#08080A` with soft whites, muted grays, `rgba(255,255,255,0.06)` borders, translucency + `backdrop-blur` for depth — refined Pro tier (no neon, no heavy gradients).
- **Type:** `Inter` for UI, `Instrument Serif` for the hero, `JetBrains Mono` for kbd hints.
- **Polish:** hero eyebrow with inset shadow + glow dot, brand Pro pill, composer with layered depth + focus ring, suggestion chips with lift + blur, cards with hover border + shadow, topbar with saturated blur.
- **Motion:** hero reveal, message slide-up, card shimmer, dot bounce, toast pop — all subtle, fast, expensive-feeling. Respects `prefers-reduced-motion: reduce`.

---

## ✅ Local test

```bash
python -m http.server 8080
# open http://localhost:8080 and verify:
# hero shows "Nano Banana Pro · 60 credits/image · Oxyy", prompt submit via Oxyy, image parsing (b64_json/url), key fallback (temporarily break one key),
# reference upload (click/drag/paste) as image, ratio/res → size, download (data: and https:), lightbox (Esc/click outside),
# retry, history persistence, quota handling (fill localStorage in DevTools), network off,
# mobile narrow width, keyboard (Tab, Enter, Shift+Enter), reduced-motion, console has no keys
```

---

*Built without frameworks, without a backend — just a beautiful, fast canvas for Nano Banana Pro via Oxyy.*
