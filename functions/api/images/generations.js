const OXYY_URL = "https://api.oxyy.ai/v1/images/generations";

function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function onRequestPost({ request, env }) {
  const keys = String(env.OXY_API_KEYS || env.OXY_API_KEY || "")
    .split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean);
  if (!keys.length) return jsonError("Oxyy server configuration is missing.", 503);

  let body;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON request.", 400); }
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return jsonError("A prompt is required.", 400);
  }

  let lastResponse;
  for (const key of keys) {
    lastResponse = await fetch(OXYY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    if (![401, 403, 429, 500, 502, 503].includes(lastResponse.status)) break;
  }

  const headers = new Headers(lastResponse.headers);
  headers.set("cache-control", "no-store");
  headers.delete("set-cookie");
  return new Response(lastResponse.body, { status: lastResponse.status, headers });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "access-control-allow-methods": "POST, OPTIONS" } });
}
