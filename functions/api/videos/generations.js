const CRUN_BASE = "https://api.crun.ai";
const CRUN_CREATE = `${CRUN_BASE}/api/v1/client/job/CreateTask`;
const CRUN_TASKINFO = `${CRUN_BASE}/api/v1/client/job/TaskInfo`;

const keyCooldowns = new Map();
let roundRobinIndex = 0;
const idempotencyCache = new Map();

const RETRYABLE_STATUSES = new Set([401, 403, 402, 429, 500, 502, 503, 504]);

function jsonError(message, status = 500, extra = {}) {
  return new Response(JSON.stringify({ error: { message, ...extra } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function parseKeys(env) {
  const raw = String(env.CRUN_API_KEYS || env.CRUN_API_KEY || env.MAGIC_HOUR_API_KEYS || "");
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

function sanitizeMessage(msg) {
  if (!msg) return "";
  return String(msg).replace(/ak_[a-zA-Z0-9]+/gi, "[key]").slice(0, 900);
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

function mapModelToCrun(model) {
  return "wan/2-7-t2v";
}
const CRUN_FALLBACK_MODELS = ["wan/2-7-t2v", "ltx-2.3", "wan-2.2"];
const CRUN_FALLBACK_RESS = ["720P", "480P"];
function mapResolutionToCrun(res){
  return "720P";
}

async function uploadToTmpFiles(base64, mime) {
  try{
    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob = new Blob([binary], { type: mime || "image/png" });
    const form = new FormData();
    form.append("file", blob, "image.png");
    const res = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: form
    });
    if (!res.ok) throw new Error("tmpfiles failed " + res.status);
    const data = await res.json();
    let url = data?.data?.url || data?.url;
    if (url && url.includes("tmpfiles.org/") && !url.includes("/dl/")) {
      url = url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
    }
    if (!url) throw new Error("No url from tmpfiles");
    return url;
  } catch(e){
    throw { status: 502, message: "Image upload for Crun failed: " + (e.message||String(e)) };
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const keys = parseKeys(env || {});
  if (!keys.length) return jsonError("Crun server configuration is missing. Set CRUN_API_KEYS in Cloudflare Pages environment variables.", 503);

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
  const prompt = body.prompt.trim();
  if (prompt.length > 5000) return jsonError("Prompt is too long. Maximum 5000 characters.", 400);

  const rawModel = String(body.model||"sora-2").trim();
  const model = mapModelToCrun(rawModel);
  const duration = body.duration != null ? Number(body.duration) : 4;
  const aspect = String(body.aspect_ratio || body.aspectRatio || "16:9").toLowerCase();
  const resolution = "720P";

  const hasImage = !!(body.image || body.image_base64 || body.imageBase64);
  let imageBase64 = body.image_base64 || body.imageBase64 || null;
  let imageMime = "image/png";
  let imageDataUrl = body.image || null;
  if (!imageBase64 && imageDataUrl && String(imageDataUrl).startsWith("data:")){
    const m = String(imageDataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if(m){ imageMime = m[1]; imageBase64 = m[2]; }
  }
  if (body.images && Array.isArray(body.images) && body.images[0] && !imageBase64){
    const first = body.images[0];
    if(String(first).startsWith("data:")){
      const m = String(first).match(/^data:([^;]+);base64,(.*)$/);
      if(m){ imageMime = m[1]; imageBase64 = m[2]; }
    }
  }

  const tryModels = [model, ...CRUN_FALLBACK_MODELS.filter(m=>m!==model)];
  const tryRess = ["720P","480P"];
  const order = pickKeyOrder(keys);
  let lastError = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < order.length; attempt++) {
    const keyIdx = order[attempt];
    const key = keys[keyIdx];
    let imageUrl = null;
    try {
      if (hasImage && imageBase64){
        imageUrl = await uploadToTmpFiles(imageBase64, imageMime);
      }
      let resp = null;
      let lastTryErr = null;
      outerVideoTry: for (const tryModel of tryModels){
        for (const tryRes of tryRess){
          const input = {
            prompt: prompt,
            duration: Number(duration) || 4,
            aspect_ratio: aspect,
            resolution: tryRes
          };
          if (imageUrl) input.img_urls = [imageUrl];

          const r = await fetch(CRUN_CREATE, {
            method: "POST",
            headers: { "content-type": "application/json", "X-API-KEY": key },
            body: JSON.stringify({ model: tryModel, input, callback_url: "" })
          });
          const ctTmp = r.headers.get("content-type") || "";
          let jTmp=null; let tTmp="";
          try{ if(ctTmp.includes("application/json")){ jTmp=await r.json(); tTmp=JSON.stringify(jTmp);} else { tTmp=await r.text(); try{ jTmp=JSON.parse(tTmp);}catch{}} }catch{ tTmp=""; }
          if (r.ok){
            let outJson = jTmp;
            const taskId = outJson?.data?.task_id || outJson?.task_id;
            if (!taskId) throw { status: 502, message: "Missing task_id from Crun" };
            let out = { id: taskId, task_id: taskId, status: "queued", model: rawModel, crun_model: tryModel, triedRes: tryRes, image_url: imageUrl || null };
            out._shilo_proxy = { keyIndex: keyIdx + 1, totalKeys: keys.length, model: rawModel, crunModel: tryModel, triedRes };
            const successBody = JSON.stringify(out);
            const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-proxy-key-index": String(keyIdx + 1), "x-proxy-total-keys": String(keys.length), "x-proxy-model": rawModel });
            keyCooldowns.delete(key);
            if (idempotencyKey) idempotencyCache.set(idempotencyKey, { body: successBody, status: 200, headers: Object.fromEntries(outHeaders.entries()), ts: Date.now() });
            return new Response(successBody, { status: 200, headers: outHeaders });
          }
          const msgTmp = jTmp?.message || tTmp || `Request failed with ${r.status}`;
          const isInsufficient = r.status===402 && /Insufficient Credits/i.test(msgTmp);
          const isTier = /not available for your subscription tier|Resolution .* not available/i.test(msgTmp);
          if (isTier || isInsufficient){
            lastTryErr = { status: r.status, message: msgTmp, raw: tTmp, code: jTmp?.code || "" };
            continue;
          }
          resp = r; 
          // capture for outer handling
          // store last error and break to outer retry logic
          const retryAfterMsTmp = getRetryAfterMs(r.headers);
          let respJsonTmp = jTmp; let respTextTmp = tTmp;
          // fall through to outer error handling by setting resp and breaking
          // we need to handle outer
          lastError = { message: sanitizeMessage(msgTmp), status: r.status, raw: tTmp, code: jTmp?.code || "" };
          lastStatus = r.status;
          if (RETRYABLE_STATUSES.has(r.status) && attempt < order.length - 1){
            const baseCd = retryAfterMsTmp ? retryAfterMsTmp + 800 : 18_000;
            setCooldown(key, baseCd);
            await new Promise(rr=> setTimeout(rr, 420+Math.random()*500));
          }
          break outerVideoTry;
        }
      }
      if (lastTryErr){
        lastError = { message: sanitizeMessage(lastTryErr.message), status: lastTryErr.status, raw: lastTryErr.raw, code: lastTryErr.code || "" };
        lastStatus = lastTryErr.status;
        if (attempt < order.length - 1){
          setCooldown(key, 30_000);
          await new Promise(r=> setTimeout(r, 400+Math.random()*400));
          continue;
        }
        break;
      }
      // if we reach here without resp, continue to next key
      continue;
    } catch (e) {

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
      } catch { respText = ""; }

      if (resp.ok) {
        const taskId = respJson?.data?.task_id || respJson?.task_id || respJson?.id || respJson?.data?.id;
        if (!taskId) throw { status: 502, message: "Missing task_id from Crun" };
        let outJson = { id: taskId, task_id: taskId, status: "queued", model: rawModel, crun_model: model, image_url: imageUrl || null };
        outJson._shilo_proxy = { keyIndex: keyIdx + 1, totalKeys: keys.length, model: rawModel, crunModel: model };
        const successBody = JSON.stringify(outJson);
        const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-proxy-key-index": String(keyIdx + 1), "x-proxy-total-keys": String(keys.length), "x-proxy-model": rawModel });
        if (retryAfterMs) outHeaders.set("retry-after", String(Math.ceil(retryAfterMs/1000)));
        keyCooldowns.delete(key);
        if (idempotencyKey) {
          idempotencyCache.set(idempotencyKey, { body: successBody, status: 200, headers: Object.fromEntries(outHeaders.entries()), ts: Date.now() });
        }
        return new Response(successBody, { status: 200, headers: outHeaders });
      }

      const errMsgRaw = respJson?.message || respJson?.error?.message || respText || `Request failed with ${resp.status}`;
      const sanitized = sanitizeMessage(errMsgRaw);
      lastError = { message: sanitized, status: resp.status, raw: respText, code: respJson?.code || "" };
      lastStatus = resp.status;

      if (RETRYABLE_STATUSES.has(resp.status)) {
        const baseCd = retryAfterMs ? retryAfterMs + 800 : resp.status === 429 ? 45_000 : 18_000;
        setCooldown(key, baseCd);
        if (attempt < order.length - 1) {
          await new Promise(r => setTimeout(r, 420 + Math.random()*500));
          continue;
        }
      }
      if (attempt < order.length - 1) {
        setCooldown(key, 12_000);
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      }
    } catch (e) {
      const status = e.status || 0;
      lastError = { message: sanitizeMessage(e.message||String(e)), status: status || 500, raw: e.raw || String(e) };
      lastStatus = status || 500;
      setCooldown(key, 12_000);
      if (attempt < order.length - 1){
        await new Promise(r=> setTimeout(r, 400+Math.random()*400));
        continue;
      }
    }
  }

  const finalStatus = lastStatus && lastStatus >= 400 ? lastStatus : 500;
  let finalMsg = lastError?.message || "All Crun keys were tried without success.";
  finalMsg = sanitizeMessage(finalMsg);
  if (finalStatus === 429 || finalStatus === 402) {
    finalMsg = "Crun reports insufficient credits. Check https://crun.ai";
  } else if (finalStatus === 401 || finalStatus === 403) {
    finalMsg = "Crun rejected the credential. Check CRUN_API_KEYS.";
  }
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  const bodyOut = JSON.stringify({ error: { message: finalMsg, code: lastError?.code || "proxy_failed", status: finalStatus } });
  return new Response(bodyOut, { status: finalStatus >= 400 ? finalStatus : 500, headers });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const keys = parseKeys(env || {});
  if (!keys.length) return jsonError("Crun server configuration is missing.", 503);

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const jobId = params?.id || params?.jobId || url.searchParams.get("jobId") || url.searchParams.get("task_id") || url.searchParams.get("id") || pathParts[pathParts.length - 1];
  if (!jobId || jobId === "generations") return jsonError("Missing job ID for polling. Use ?jobId=xxx", 400);

  const order = pickKeyOrder(keys);
  let lastError = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < order.length; attempt++) {
    const keyIdx = order[attempt];
    const key = keys[keyIdx];
    try {
      const resp = await fetch(`${CRUN_TASKINFO}?task_id=${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: { "X-API-KEY": key }
      });
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
        let outJson = respJson?.data || respJson;
        if (outJson && typeof outJson === "object") outJson._shilo_proxy = { keyIndex: keyIdx + 1, totalKeys: keys.length };
        if (outJson && outJson.result?.media_urls?.[0] && !outJson.video_url){
          outJson.video_url = outJson.result.media_urls[0];
        }
        if (outJson && outJson.media_urls?.[0] && !outJson.video_url){
          outJson.video_url = outJson.media_urls[0];
        }
        if (outJson && outJson.result?.video_url && !outJson.video_url){
          outJson.video_url = outJson.result.video_url;
        }
        const body = JSON.stringify(outJson ? { ...respJson, data: outJson } : respJson);
        const outHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-proxy-key-index": String(keyIdx + 1), "x-proxy-total-keys": String(keys.length) });
        if (outJson?.status === "success" || outJson?.status === "completed") keyCooldowns.delete(key);
        return new Response(body, { status: resp.status, headers: outHeaders });
      }

      if (resp.status === 404) continue;
      const errMsgRaw = respJson?.message || respText || `Request failed with ${resp.status}`;
      const sanitized = sanitizeMessage(errMsgRaw);
      lastError = { message: sanitized, status: resp.status, raw: respText };
      lastStatus = resp.status;
      if (RETRYABLE_STATUSES.has(resp.status)) {
        setCooldown(key, 18_000);
        break;
      }
      if (attempt < order.length - 1) continue;
      const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return new Response(JSON.stringify({ error: { message: sanitized, status: resp.status } }), { status: resp.status, headers });
    } catch (e) {
      lastError = { message: "Network error polling Crun.", status: 0, raw: String(e) };
      lastStatus = 0;
      setCooldown(key, 12_000);
      break;
    }
    if (attempt < order.length - 1) {
      await new Promise(r => setTimeout(r, 280 + Math.random()*220));
      continue;
    }
  }

  return jsonError(lastError?.message || "Polling failed after retries.", lastStatus || 500);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, x-api-key, x-idempotency-key", "access-control-max-age": "86400" } });
}
