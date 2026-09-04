// Shilo Workspace — local config (do not commit)
// All Oxyy credentials are configured in Cloudflare Pages project settings for production.
// This file is for local static-server development only. Keep it private and ensure it is gitignored.
//
// For Cloudflare Pages Functions, set:
//   OXY_API_KEY  — single Oxyy API key (oxyy-...)
//   OXY_API_KEYS — comma- or newline-separated list for server-side rotation (recommended)
// Environment variables are available as context.env.OXY_API_KEY / context.env.OXY_API_KEYS in functions/api/*
//
// Supported models (exact Oxyy IDs — do not guess):
//   Image: nano-banana-2 (Nano Banana Pro)
//   Video: veo-3, veo-3.1-fast, grok-imagine-video, grok-imagine-video-1.5
// Use the IDs exactly as returned by https://api.oxyy.ai/v1/models
//
// Local dev: python -m http.server 8080  or  npx serve .  — then open http://localhost:8080
// Production: Push to GitHub → Cloudflare Pages (Framework: None, Build output: /) → set env vars → Deploy

window.OXY_KEYS = [
  "PASTE_OXY_KEY_1_HERE",
  "PASTE_OXY_KEY_2_HERE",
  "PASTE_OXY_KEY_3_HERE"
];
window.GEMINI_KEYS = window.OXY_KEYS.slice();
window.OXY_BASE_URL = "https://api.oxyy.ai/v1";
window.OXY_MODEL = "nano-banana-2";
window.GEMINI_MODEL = "nano-banana-2";

// Optional: override video defaults for local testing
// window.OXY_VIDEO_MODEL = "veo-3";
// window.OXY_VIDEO_DURATION = "4";
