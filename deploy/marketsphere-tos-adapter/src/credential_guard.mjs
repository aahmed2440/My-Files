const DEFAULT_EXPIRY_SAFETY_MARGIN_MS = 120000;

function boundedInt(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseExpiry(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{13}$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : NaN;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export class CredentialGuard {
  constructor({ env = process.env } = {}) {
    this.env = env;
  }

  #token() {
    return String(this.env.SCHWAB_ACCESS_TOKEN ?? '').trim();
  }

  safetyMarginMs() {
    return boundedInt(
      this.env.SCHWAB_TOKEN_EXPIRY_SAFETY_MARGIN_MS,
      DEFAULT_EXPIRY_SAFETY_MARGIN_MS,
      30000,
      10 * 60 * 1000
    );
  }

  status({ nowMs = Date.now() } = {}) {
    const tokenPresent = Boolean(this.#token());
    const expiryRaw = String(this.env.SCHWAB_ACCESS_TOKEN_EXPIRES_AT ?? '').trim();
    const expiryMs = parseExpiry(expiryRaw);
    const safetyMarginMs = this.safetyMarginMs();

    let state = 'READY';
    let secondsRemaining = null;
    let expiresAt = null;

    if (!tokenPresent) {
      state = 'MISSING_ACCESS_TOKEN';
    } else if (!expiryRaw) {
      state = 'TOKEN_EXPIRY_UNVERIFIED';
    } else if (!Number.isFinite(expiryMs)) {
      state = 'TOKEN_EXPIRY_INVALID';
    } else {
      secondsRemaining = Math.floor((expiryMs - nowMs) / 1000);
      expiresAt = new Date(expiryMs).toISOString();
      if (expiryMs <= nowMs) state = 'TOKEN_EXPIRED';
      else if (expiryMs - nowMs <= safetyMarginMs) state = 'TOKEN_EXPIRING';
    }

    return {
      credential_schema_version: 1,
      state,
      access_token_present: tokenPresent,
      access_token_value_exposed: false,
      expires_at: expiresAt,
      seconds_remaining: secondsRemaining,
      safety_margin_seconds: Math.floor(safetyMarginMs / 1000),
      storage: 'PROCESS_ENV_ONLY',
      persistence: 'PROHIBITED',
      logging: 'PROHIBITED',
      trading_authority: 'NONE',
      production_mutation: false
    };
  }

  requireAccessToken({ nowMs = Date.now() } = {}) {
    const status = this.status({ nowMs });
    if (status.state !== 'READY') throw fail(status.state);
    return this.#token();
  }
}
