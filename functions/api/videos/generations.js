const OXYY_BASE = "https://api.oxyy.ai/v1";
const OXYY_VIDEO_URL = `${OXYY_BASE}/videos/generations`;

const keyCooldowns = new Map();
let roundRobinIndex = 0;
const idempotencyCache = new Map();

const RETRYABLE_STATUSES = new Set([401, 403, 402, 429, 500, 502, 503, 504]);
const PERMANENT_400_PATTERNS = [/moderation/i, /policy/i, /validation/i, /malformed/i, /invalid.*prompt/i, /content.*policy/i];

function jsonError(message, status = 500, extra = {}) {
  return new Response(JSON.stringify({ error: { message, ...extra } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function parseKeys(env) {
  const raw = String(env.OXY_API_KEYS || env.OXY_API_KEY || "");
  return raw.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
}

function getRetryAfterMs(headers) {
  const ra = headers.get("retry-after") || headers.get("Retry-After");
  if (!ra) return null;
  const secs = parseInt(String(ra).trim(), 10);
  if (!Number.isNaN(secs) && secs >= 0 && secs <= 3600) return secs * 1000;
  const dateMs = Date.parse(ra);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    if (diff > 0 && diff < 3600_000) return diff;
  }
  return null;
}

function isPermanentValidationError(status, message) {
  if (status !== 400) return false;
  const msg = String(message || "");
  return PERMANENT_400_PATTERNS.some(rx => rx.test(msg));
}

function sanitizeMessage(msg) {
  if (!msg) return "";
  return String(msg).replace(/oxyy-[a-z0-9]+/gi, "[key]").slice(0, 900);
}

function pickKeyOrder(keys) {
  const now = Date.now();
  const available = [];
  const cooling = [];
  keys.forEach((k, idx) => {
    const cd = keyCooldowns.get(k) || 0;
    if (cd > now) cooling.push({ idx, cd });
    else available.push({ idx, cd });
  });
  available.sort((a, b) => {
    const ra = keyCooldowns.get(keys[a.idx]) || 0;
    const rb = keyCooldowns.get(keys[b.idx]) || 0;
    return ra - rb;
  });
  cooling.sort((a, b) => a.cd - b.cd);
  const order = [];
  if (available.length) {
    const start = roundRobinIndex % available.length;
    for (let i = 0; i < available.length; i++) order.push(available[(start + i) % available.length].idx);
    roundRobinIndex = (roundRobinIndex + 1) % available.length;
  }
  for (const c of cooling) order.push(c.idx);
  if (!order.length) {
    keys.forEach((_, idx) => order.push(idx));
  }
  return order;
}

function setCooldown(key, ms) {
  keyCooldowns.set(key, Date.now() + ms);
}

function pruneIdempotencyCache() {
  const now = Date.now();
  for (const [k, v] of idempotencyCache.entries()) {
    if (now - v.ts > 600_000) idempotencyCache.delete(k);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const keys = parseKeys(env || {});
  if (!keys.length) return jsonError("Oxyy server configuration is missing. Set OXY_API_KEY or OXY_API_KEYS in Cloudflare Pages environment variables.", 503);

  const idempotencyKey = request.headers.get("x-idempotency-key") || request.headers.get("X-Idempotency-Key") || "";
  if (idempotencyKey) {
    pruneIdempotencyCache();
    const cached = idempotencyCache.get(idempotencyKey);
    if (cached && Date.now() - cached.ts < 600_000) {
      const h = new Headers(cached.headers);
      h.set("cache-control", "no-store");
      h.set("x-proxy-cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers: h });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request.", 400);
  }
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return jsonError("A prompt is required.", 400);
  }
  if (typeof body.model !== "string" || !body.model.trim()) {
    return jsonError("A video model is required.", 400);
  }
  const prompt = body.prompt.trim();
  if (prompt.length > 4000) return jsonError("Prompt is too long. Maximum 4000 characters.", 400);

  const model = body.model.trim();
  const duration = body.duration != null ? Number(body.duration) : undefined;
  if (duration != null && (!Number.isFinite(duration) || duration < 1 || duration > 30)) {
    return jsonError("Duration must be between 1 and 30 seconds.", 400);
  }
  const aspect = body.aspect_ratio || body.aspectRatio;
  if (aspect && !["1:1","16:9","9:16","4:3","3:4","3:2","2:3","21:9","2:3","3:2","9:16","16:9","1:1","4:3","3:4"].includes(String(aspect))) {
  }
  const order = pickKeyOrder(keys);
  let lastError = null;
  let lastStatus = 500;
  let lastErrorBody = "";

  for (let attempt = 0; attempt < order.length; attempt++) {
    const keyIdx = order[attempt];
    const key = keys[keyIdx];
    const cdUntil = keyCooldowns.get(key) || 0;
    if (cdUntil > Date.now() && attempt < keys.length - 1) {
    }

    let resp;
    try {
      const headers = { "content-type": "application/json", "authorization": `Bearer ${key}` };
      if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
      resp = await fetch(OXYY_VIDEO_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
    } catch (e) {
      lastError = { message: "Network error reaching Oxyy. Check connectivity and try again.", code: "network", status: 0, raw: String(e) };
      lastStatus = 0;
      setCooldown(key, 12_000);
      if (attempt < order.length - 1) {
        await new Promise(r => setTimeout(r, 300 + Math.random()*300));
        continue;
      }
      break;
    }

    const retryAfterMs = getRetryAfterMs(resp.headers);
    let respJson = null;
    let respText = "";
    const ct = resp.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) {
        respJson = await resp.json();
        respText = JSON.stringify(respJson);
      } else {
        respText = await resp.text();
        try { respJson = JSON.parse(respText); } catch {}
      }
    } catch {
      respText = "";
    }

    if (resp.ok) {
      const jobId = respJson?.id || respJson?.job_id || respJson?.task_id || respJson?.data?.id;
      const status = respJson?.status || respJson?.data?.status;
      const videoUrl = respJson?.video_url || respJson?.videoUrl || respJson?.data?.video_url || respJson?.url || respJson?.data?.url;

      if (jobId && (status === "queued" || status === "in_progress" || status === "processing" || status === "running" || !videoUrl)) {
        const pollResult = await pollVideoJob(jobId, key, retryAfterMs);
        if (pollResult.ok) {
          const successBody = JSON.stringify({
            ...pollResult.data,
            _shilo_proxy: { keyIndex: keyIdx + 1, totalKeys: keys.length, model }
          });
          const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-proxy-key-index": String(keyIdx + 1), "x-proxy-total-keys": String(keys.length), "x-proxy-model": model });
          if (retryAfterMs) outHeaders.set("retry-after", String(Math.ceil(retryAfterMs/1000)));
          keyCooldowns.delete(key);
          if (idempotencyKey) {
            idempotencyCache.set(idempotencyKey, { body: successBody, status: 200, headers: Object.fromEntries(outHeaders.entries()), ts: Date.now() });
          }
          return new Response(successBody, { status: 200, headers: outHeaders });
        } else {
          const sanitized = sanitizeMessage(pollResult.error || "Video generation failed.");
          const statusCode = pollResult.status || 500;
          const shouldRetry = RETRYABLE_STATUSES.has(statusCode) && !isPermanentValidationError(statusCode, sanitized);
          if (shouldRetry && attempt < order.length - 1) {
            const cd = retryAfterMs ? retryAfterMs + 800 : (statusCode === 429 ? 45_000 : statusCode === 402 ? 45_000 : 18_000);
            setCooldown(key, cd);
            lastError = { message: sanitized, status: statusCode, raw: respText };
            lastStatus = statusCode;
            lastErrorBody = respText;
            await new Promise(r => setTimeout(r, 400 + Math.random()*400));
            continue;
          }
          const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          const errBody = JSON.stringify({ error: { message: sanitized || "Video generation failed.", code: pollResult.code || "video_failed", status: statusCode } });
          return new Response(errBody, { status: statusCode >= 400 ? statusCode : 500, headers: outHeaders });
        }
      }

      let successJson = respJson;
      if (successJson && typeof successJson === "object") {
        successJson._shilo_proxy = { keyIndex: keyIdx + 1, totalKeys: keys.length, model };
      }
      const successBody = JSON.stringify(successJson || { video_url: videoUrl, id: jobId });
      const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-proxy-key-index": String(keyIdx + 1), "x-proxy-total-keys": String(keys.length), "x-proxy-model": model });
      if (idempotencyKey) {
        idempotencyCache.set(idempotencyKey, { body: successBody, status: 200, headers: Object.fromEntries(outHeaders.entries()), ts: Date.now() });
      }
      keyCooldowns.delete(key);
      return new Response(successBody, { status: 200, headers: outHeaders });
    }

    const errMsgRaw = respJson?.error?.message || respJson?.message || respText || `Request failed with ${resp.status}`;
    const sanitized = sanitizeMessage(errMsgRaw);
    lastError = { message: sanitized, status: resp.status, raw: respText, code: respJson?.error?.code || "" };
    lastStatus = resp.status;
    lastErrorBody = respText;

    if (isPermanentValidationError(resp.status, sanitized)) {
      const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return new Response(JSON.stringify({ error: { message: sanitized || "Request was not accepted. Check prompt and parameters.", code: "validation_error", status: resp.status } }), { status: resp.status, headers: outHeaders });
    }

    if (RETRYABLE_STATUSES.has(resp.status)) {
      const baseCd = retryAfterMs ? retryAfterMs + 800 : resp.status === 429 ? 45_000 : resp.status === 402 ? 45_000 : resp.status === 500 || resp.status === 503 ? 18_000 : 12_000;
      setCooldown(key, baseCd);
      if (attempt < order.length - 1) {
        const delay = retryAfterMs ? Math.min(retryAfterMs, 5000) + 400 : 420 + Math.random()*500;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    } else if (resp.status === 400) {
      const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return new Response(JSON.stringify({ error: { message: sanitized || "The request was not accepted. Try rephrasing.", code: "bad_request", status: 400 } }), { status: 400, headers: outHeaders });
    } else {
      if (attempt < order.length - 1) {
        setCooldown(key, 12_000);
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
    }
  }

  const finalStatus = lastStatus && lastStatus >= 400 ? lastStatus : 500;
  let finalMsg = lastError?.message || "All Oxyy keys were tried without success. Please try again.";
  finalMsg = sanitizeMessage(finalMsg);
  if (finalStatus === 429 || finalStatus === 402) {
    const hasCredit = /credit|quota|balance|limit:\s*0/i.test(lastErrorBody || finalMsg);
    if (hasCredit) finalMsg = "Oxyy reports insufficient credits or quota. Top up at https://api.oxyy.ai";
    else finalMsg = lastError?.message ? finalMsg : "All Oxyy keys are rate-limited. Please wait ~60s and try again.";
  } else if (finalStatus === 401 || finalStatus === 403) {
    finalMsg = "Oxyy rejected the server-side credential. Check OXY_API_KEY in the Pages project settings.";
  } else if (finalStatus === 0) {
    finalMsg = "Could not reach Oxyy. Check your connection and try again.";
  }
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (lastError && getRetryAfterMs(new Headers({ "retry-after": String(lastError.retryDelay || "") }))) {
  }
  const bodyOut = JSON.stringify({ error: { message: finalMsg, code: lastError?.code || "proxy_failed", status: finalStatus, proxy: { attempted: order.length, totalKeys: keys.length } } });
  return new Response(bodyOut, { status: finalStatus >= 400 ? finalStatus : 500, headers });
}

async function pollVideoJob(jobId, key, initialRetryAfter) {
  const pollUrl = `${OXYY_VIDEO_URL}/${encodeURIComponent(jobId)}`;
  const maxWaitMs = 300_000;
  const start = Date.now();
  let interval = 5000;
  if (initialRetryAfter && initialRetryAfter > 1000 && initialRetryAfter < 15000) interval = Math.min(initialRetryAfter, 5000);

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, interval));
    let resp;
    try {
      resp = await fetch(pollUrl, {
        method: "GET",
        headers: { "authorization": `Bearer ${key}` }
      });
    } catch (e) {
      interval = Math.min(interval + 1000, 8000);
      continue;
    }
    if (resp.status === 404) {
      const txt = await resp.text().catch(() => "");
      return { ok: false, error: sanitizeMessage(txt) || "Video job not found.", status: 404, code: "not_found" };
    }
    let data = null;
    let text = "";
    try {
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("application/json")) data = await resp.json();
      else { text = await resp.text(); try { data = JSON.parse(text); } catch {} }
    } catch {}
    const status = data?.status || data?.data?.status || "";
    if (status === "completed" || status === "succeeded" || status === "success") {
      const videoUrl = data?.video_url || data?.videoUrl || data?.url || data?.data?.video_url || data?.data?.url || data?.output?.[0]?.url;
      if (videoUrl) {
        return { ok: true, data: { ...data, video_url: videoUrl } };
      }
      if (data?.video_url || data?.url) return { ok: true, data };
      return { ok: true, data };
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      const err = data?.error?.message || data?.message || text || "Video generation failed.";
      return { ok: false, error: sanitizeMessage(err), status: 500, code: "generation_failed" };
    }
    const ra = getRetryAfterMs(resp.headers);
    if (ra) interval = Math.min(Math.max(ra, 4000), 8000);
    else interval = 5000;
  }
  return { ok: false, error: "Video generation timed out. Please try again.", status: 504, code: "timeout" };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, x-idempotency-key", "access-control-max-age": "86400" } });
}
