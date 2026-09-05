const MH_BASE = "https://api.magichour.ai";
const MH_UPLOAD_URL = `${MH_BASE}/v1/files/upload-urls`;
const MH_TEXT_TO_VIDEO = `${MH_BASE}/v1/text-to-video`;
const MH_IMAGE_TO_VIDEO = `${MH_BASE}/v1/image-to-video`;
const MH_VIDEO_PROJECTS = `${MH_BASE}/v1/video-projects`;

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
  const raw = String(env.MAGIC_HOUR_API_KEYS || env.MAGIC_HOUR_API_KEY || env.MH_API_KEYS || "");
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
  return String(msg).replace(/mhk_live_[a-zA-Z0-9]+/gi, "[key]").slice(0, 900);
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
  if (!order.length) keys.forEach((_, idx) => order.push(idx));
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

function mapModelToMH(model) {
  const m = String(model||"").trim().toLowerCase();
  if (m === "ltx-2.3" || m === "ltx") return "ltx-2.3";
  if (m === "sora-2" || m === "grok-imagine-video" || m === "grok" || m === "sora" || m === "seedance-2.5" || m === "seedance" || m === "veo3.1" || m === "veo-3.1" || m === "veo3.1-lite") return "ltx-2.3";
  return "ltx-2.3";
}

async function uploadImageToMH(base64, mime, apiKey) {
  const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("png") ? "png" : "png";
  const uploadRes = await fetch(MH_UPLOAD_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ items: [{ type: "image", extension: ext }] })
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text().catch(()=> "");
    let data=null; try{ data=JSON.parse(txt); }catch{}
    const msg = data?.message || txt || `Upload URL failed (${uploadRes.status})`;
    throw { status: uploadRes.status, message: sanitizeMessage(msg), raw: txt, code: data?.code || "" };
  }
  let uploadData;
  try{ uploadData = await uploadRes.json(); }catch{ throw { status: 502, message: "Malformed upload URL response" }; }
  const item = uploadData?.items?.[0] || uploadData?.data?.[0];
  const uploadUrl = item?.upload_url || item?.uploadUrl;
  const filePath = item?.file_path || item?.filePath;
  if (!uploadUrl || !filePath) throw { status: 502, message: "Missing upload URL from Magic Hour" };

  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": mime || "image/png" },
    body: binary
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(()=> "");
    throw { status: putRes.status, message: sanitizeMessage(txt) || `Image upload failed (${putRes.status})` };
  }
  return filePath;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const keys = parseKeys(env || {});
  if (!keys.length) return jsonError("Magic Hour server configuration is missing. Set MAGIC_HOUR_API_KEYS in Cloudflare Pages environment variables.", 503);

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

  const rawModel = body.model.trim();
  let model = mapModelToMH(rawModel);
  const duration = body.duration != null ? Number(body.duration) : (body.end_seconds != null ? Number(body.end_seconds) : 4);
  if (duration != null && (!Number.isFinite(duration) || duration < 1 || duration > 60)) {
    return jsonError("Duration must be between 1 and 60 seconds.", 400);
  }
  const aspect = body.aspect_ratio || body.aspectRatio || body.aspect || "16:9";
  const resolution = body.resolution || body.resolution === "720p" ? body.resolution : (body.resolution || "720p");
  const resNorm = String(resolution).toLowerCase().includes("1080") ? "1080p" : String(resolution).toLowerCase().includes("720") ? "720p" : String(resolution).toLowerCase().includes("480") ? "480p" : "720p";
  const tryModels = [model, ...["wan-2.2","ltx-2.3","minimax-h3"].filter(m=>m!==model)];
  const tryResolutions = resNorm==="1080p" ? ["1080p","720p","480p"] : resNorm==="720p" ? ["720p","480p"] : [resNorm,"480p"].filter((v,i,a)=>a.indexOf(v)===i);

  const hasImage = !!(body.image || body.image_base64 || body.imageBase64 || body.reference_image);
  let imageBase64 = body.image_base64 || body.imageBase64 || null;
  let imageMime = "image/png";
  let imageDataUrl = body.image || body.reference_image || null;
  if (!imageBase64 && imageDataUrl && String(imageDataUrl).startsWith("data:")){
    const m = String(imageDataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if(m){ imageMime = m[1]; imageBase64 = m[2]; }
  }
  if (body.images && Array.isArray(body.images) && body.images[0] && !imageBase64){
    const first = body.images[0];
    if(String(first).startsWith("data:")){
      const m = String(first).match(/^data:([^;]+);base64,(.*)$/);
      if(m){ imageMime = m[1]; imageBase64 = m[2]; imageDataUrl = first; }
    }
  }

  const order = pickKeyOrder(keys);
  let lastError = null;
  let lastStatus = 500;
  let lastErrorBody = "";

  for (let attempt = 0; attempt < order.length; attempt++) {
    const keyIdx = order[attempt];
    const key = keys[keyIdx];
    let filePath = null;
    try {
      if (hasImage && imageBase64){
        filePath = await uploadImageToMH(imageBase64, imageMime, key);
      }
      let resp = null;
      let respJson = null;
      let respText = "";
      let retryAfterMs = null;
      let usedModel = model;
      let usedRes = resNorm;
      let lastTierError = null;
      outerTry: for (const tryModel of tryModels){
        for (const tryRes of tryResolutions){
          const common = {
            name: `Shilo Video - ${new Date().toISOString().slice(0,19)}`,
            model: tryModel,
            end_seconds: duration,
            aspect_ratio: String(aspect).toLowerCase(),
            resolution: tryRes,
          };
          let mhBody;
          let mhUrl;
          if (filePath){
            mhUrl = MH_IMAGE_TO_VIDEO;
            mhBody = {
              ...common,
              style: { prompt: prompt },
              assets: { image_file_path: filePath }
            };
            if (body.audio === true) mhBody.audio = true;
            if (body.audio === false) mhBody.audio = false;
          } else {
            mhUrl = MH_TEXT_TO_VIDEO;
            mhBody = {
              ...common,
              style: { prompt: prompt }
            };
            if (body.audio === true) mhBody.audio = true;
            if (body.audio === false) mhBody.audio = false;
          }

          const r = await fetch(mhUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "authorization": `Bearer ${key}` },
            body: JSON.stringify(mhBody)
          });
          const ctTmp = r.headers.get("content-type") || "";
          let j = null; let t = "";
          try{
            if (ctTmp.includes("application/json")){ j = await r.json(); t = JSON.stringify(j); }
            else { t = await r.text(); try{ j = JSON.parse(t); }catch{} }
          }catch{ t=""; }
          if (r.ok){
            resp = r; respJson = j; respText = t; usedModel = tryModel; usedRes = tryRes; retryAfterMs = getRetryAfterMs(r.headers);
            break outerTry;
          }
          const errRaw = j?.message || j?.error?.message || j?.code || t || `Request failed with ${r.status}`;
          const isTier = /not available for your subscription tier|Resolution .* not available/i.test(errRaw);
          if (isTier){
            lastTierError = { status: r.status, message: errRaw, raw: t, code: j?.code || "" };
            continue;
          }
          resp = r; respJson = j; respText = t; usedModel = tryModel; usedRes = tryRes; retryAfterMs = getRetryAfterMs(r.headers);
          break outerTry;
        }
      }
      if (!resp){
        if (lastTierError){
          const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          return new Response(JSON.stringify({ error: { message: sanitizeMessage(lastTierError.message) + " — auto-tried fallback failed. Try 480p with wan-2.2/ltx-2.3.", code: "tier_not_available", status: 422 } }), { status: 422, headers });
        }
        throw { status: 500, message: "No response from Magic Hour" };
      }

      if (resp.ok) {
        let outJson = respJson;
        if (outJson && typeof outJson === "object") outJson._shilo_proxy = { keyIndex: keyIdx + 1, totalKeys: keys.length, model: rawModel, mhModel: usedModel, filePath: filePath || null, usedRes };
        const successBody = JSON.stringify(outJson || {});
        const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-proxy-key-index": String(keyIdx + 1), "x-proxy-total-keys": String(keys.length), "x-proxy-model": rawModel, "x-proxy-mh-model": usedModel });
        if (retryAfterMs) outHeaders.set("retry-after", String(Math.ceil(retryAfterMs/1000)));
        keyCooldowns.delete(key);
        if (idempotencyKey) {
          idempotencyCache.set(idempotencyKey, { body: successBody, status: resp.status, headers: Object.fromEntries(outHeaders.entries()), ts: Date.now() });
        }
        return new Response(successBody, { status: resp.status, headers: outHeaders });
      }

      const errMsgRaw = respJson?.message || respJson?.error?.message || respJson?.code || respText || `Request failed with ${resp.status}`;
      const sanitized = sanitizeMessage(errMsgRaw);
      lastError = { message: sanitized, status: resp.status, raw: respText, code: respJson?.code || "" };
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
    } catch (e) {
      const status = e.status || 0;
      const msg = e.message || "Video creation failed.";
      const isAuth = status === 401 || status === 403;
      const isBad = status === 400;
      if (status === 400 && isPermanentValidationError(status, msg)){
        return jsonError(msg, 400);
      }
      lastError = { message: sanitizeMessage(msg), status: status || 500, raw: e.raw || String(e), code: e.code || "" };
      lastStatus = status || 500;
      lastErrorBody = e.raw || "";
      if (RETRYABLE_STATUSES.has(status) || status===0){
        const cd = status===429 ? 45_000 : status===500||status===503 ? 18_000 : 12_000;
        setCooldown(key, cd);
        if (attempt < order.length - 1){
          await new Promise(r=> setTimeout(r, 400+Math.random()*400));
          continue;
        }
      } else if (isAuth || isBad){
        setCooldown(key, 30_000);
        if (attempt < order.length - 1){
          await new Promise(r=> setTimeout(r, 300));
          continue;
        }
      }
      if (attempt < order.length - 1) continue;
    }
  }

  const finalStatus = lastStatus && lastStatus >= 400 ? lastStatus : 500;
  let finalMsg = lastError?.message || "All Magic Hour keys were tried without success. Please try again.";
  finalMsg = sanitizeMessage(finalMsg);
  if (finalStatus === 429 || finalStatus === 402) {
    const hasCredit = /credit|quota|balance|limit:\s*0/i.test(lastErrorBody || finalMsg);
    if (hasCredit) finalMsg = "Magic Hour reports insufficient credits. Check https://magichour.ai";
    else finalMsg = lastError?.message ? finalMsg : "All Magic Hour keys are rate-limited. Please wait ~60s and try again.";
  } else if (finalStatus === 401 || finalStatus === 403) {
    finalMsg = "Magic Hour rejected the server credential. Check MAGIC_HOUR_API_KEYS in Pages settings.";
  } else if (finalStatus === 0) {
    finalMsg = "Could not reach Magic Hour. Check your connection and try again.";
  }
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  const bodyOut = JSON.stringify({ error: { message: finalMsg, code: lastError?.code || "proxy_failed", status: finalStatus, proxy: { attempted: order.length, totalKeys: keys.length } } });
  return new Response(bodyOut, { status: finalStatus >= 400 ? finalStatus : 500, headers });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const keys = parseKeys(env || {});
  if (!keys.length) return jsonError("Magic Hour server configuration is missing.", 503);

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const jobId = params?.id || params?.jobId || url.searchParams.get("jobId") || url.searchParams.get("id") || url.searchParams.get("job_id") || pathParts[pathParts.length - 1];
  if (!jobId || jobId === "generations") return jsonError("Missing job ID for polling. Use ?jobId=xxx", 400);

  const order = pickKeyOrder(keys);
  let lastError = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < order.length; attempt++) {
    const keyIdx = order[attempt];
    const key = keys[keyIdx];
    const tryUrls = [
      `${MH_VIDEO_PROJECTS}/${encodeURIComponent(jobId)}`,
      `${MH_TEXT_TO_VIDEO}/${encodeURIComponent(jobId)}`,
      `${MH_IMAGE_TO_VIDEO}/${encodeURIComponent(jobId)}`
    ];
    for (const u of tryUrls){
      try {
        const resp = await fetch(u, {
          method: "GET",
          headers: { "authorization": `Bearer ${key}` }
        });
        if (resp.status === 404) continue;
        const ct = resp.headers.get("content-type") || "";
        let respJson = null;
        let respText = "";
        try {
          if (ct.includes("application/json")) {
            respJson = await resp.json();
            respText = JSON.stringify(respJson);
          } else {
            respText = await resp.text();
            try { respJson = JSON.parse(respText); } catch {}
          }
        } catch { respText = ""; }

        if (resp.ok) {
          let outJson = respJson;
          if (outJson && typeof outJson === "object") outJson._shilo_proxy = { keyIndex: keyIdx + 1, totalKeys: keys.length };
          const body = JSON.stringify(outJson || {});
          const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-proxy-key-index": String(keyIdx + 1), "x-proxy-total-keys": String(keys.length) });
          keyCooldowns.delete(key);
          return new Response(body, { status: resp.status, headers: outHeaders });
        }

        const errMsgRaw = respJson?.message || respJson?.error?.message || respText || `Request failed with ${resp.status}`;
        const sanitized = sanitizeMessage(errMsgRaw);
        lastError = { message: sanitized, status: resp.status, raw: respText };
        lastStatus = resp.status;

        if (RETRYABLE_STATUSES.has(resp.status)) {
          const ra = getRetryAfterMs(resp.headers);
          const cd = ra ? ra + 800 : resp.status === 429 ? 45_000 : 18_000;
          setCooldown(key, cd);
          break;
        }
        if (resp.status !== 404){
          const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          return new Response(JSON.stringify({ error: { message: sanitized, status: resp.status } }), { status: resp.status, headers });
        }
      } catch (e) {
        lastError = { message: "Network error polling Magic Hour.", status: 0, raw: String(e) };
        lastStatus = 0;
        setCooldown(key, 12_000);
        break;
      }
    }
    if (attempt < order.length - 1) {
      await new Promise(r => setTimeout(r, 280 + Math.random()*220));
      continue;
    }
  }

  return jsonError(lastError?.message || "Polling failed after retries.", lastStatus || 500);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, x-idempotency-key", "access-control-max-age": "86400" } });
}
