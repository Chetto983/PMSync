// backend/load-test/processors/auth.js — Artillery processor (CommonJS).
// Artillery loads processors as plain Node — ts-node is NOT available.
// See 157-RESEARCH.md §Security V7 — cookie redaction is mandatory.

'use strict';

module.exports = {
  // Redact Set-Cookie and authorization-bearing headers in response artifacts.
  // Artillery writes `response.headers` into report JSON; without redaction,
  // session cookies end up in CI artifacts.
  redactCookie(requestParams, response, context, ee, next) {
    if (response && response.headers) {
      if (response.headers['set-cookie']) {
        response.headers['set-cookie'] = '<redacted>';
      }
      if (response.headers['authorization']) {
        response.headers['authorization'] = '<redacted>';
      }
    }
    return next();
  },

  // Rotate through pre-seeded user pool deterministically based on VU id.
  // Exposes `context.vars.loadtestEmail` for scenarios that want a stable
  // per-VU identity instead of $randomNumber.
  pickUser(requestParams, context, ee, next) {
    const raw = context.vars.$uuid || context.$uuid || Math.random() * 1000;
    const idx = Math.floor(Number(raw)) % 1000;
    context.vars.loadtestEmail = `loadtest+${idx}@pmsync.local`;
    return next();
  },
};
