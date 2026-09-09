import { FeedState } from './state.mjs';
import { CredentialGuard } from './credential_guard.mjs';

const PREF_URL = 'https://api.schwabapi.com/trader/v1/userPreference';
const DEFAULT_PREF_RESPONSE_MAX_BYTES = 512 * 1024;
const DEFAULT_STREAM_FRAME_MAX_BYTES = 2 * 1024 * 1024;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function envList(name, fallback = '') {
  return (process.env[name] ?? fallback).split(',').map(x => x.trim()).filter(Boolean);
}
function isEnabled() { return /^true$/i.test(process.env.SCHWAB_TOS_ENABLED ?? 'false'); }
function requestIdFactory() { let n = 0; return () => String(++n); }
function fail(code) { const e = new Error(code); e.code = code; return e; }
function normalizeHost(value) { return String(value ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''); }
function streamHostAllowlist() { return envList('SCHWAB_STREAM_HOST_ALLOWLIST').map(normalizeHost).filter(Boolean); }
function boundedBytes(raw, fallback, min, max) {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function preferenceResponseMaxBytes() {
  return boundedBytes(process.env.SCHWAB_PREF_RESPONSE_MAX_BYTES, DEFAULT_PREF_RESPONSE_MAX_BYTES, 16 * 1024, 2 * 1024 * 1024);
}
function streamFrameMaxBytes() {
  return boundedBytes(process.env.SCHWAB_MAX_FRAME_BYTES, DEFAULT_STREAM_FRAME_MAX_BYTES, 64 * 1024, 8 * 1024 * 1024);
}
function credentialMode(state) {
  return state === 'TOKEN_EXPIRED' ? 'AUTH_FAILED' : 'AUTH_REQUIRED';
}

export function validateStreamerUrl(raw, allowedHosts = streamHostAllowlist()) {
  let url;
  try { url = new URL(String(raw ?? '')); }
  catch { throw fail('STREAMER_URL_INVALID'); }
  if (url.protocol !== 'wss:') throw fail('STREAMER_URL_PROTOCOL_REJECTED');
  if (url.username || url.password) throw fail('STREAMER_URL_CREDENTIALS_REJECTED');
  if (url.port && url.port !== '443') throw fail('STREAMER_URL_PORT_REJECTED');

  const host = normalizeHost(url.hostname);
  const allow = allowedHosts.map(normalizeHost).filter(Boolean);
  if (!allow.length) throw fail('STREAMER_HOST_ALLOWLIST_REQUIRED');
  const trusted = allow.some(entry => host === entry || host.endsWith(`.${entry}`));
  if (!trusted) throw fail('STREAMER_HOST_REJECTED');
  return url.toString();
}

export async function readJsonBounded(response, maxBytes = preferenceResponseMaxBytes()) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw fail('PREFERENCE_RESPONSE_TOO_LARGE');

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw fail('PREFERENCE_RESPONSE_TOO_LARGE');
    try { return JSON.parse(text); }
    catch { throw fail('PREFERENCE_RESPONSE_INVALID_JSON'); }
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw fail('PREFERENCE_RESPONSE_TOO_LARGE');
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  try { return JSON.parse(Buffer.concat(chunks, total).toString('utf8')); }
  catch (err) {
    if (err?.code === 'PREFERENCE_RESPONSE_TOO_LARGE') throw err;
    throw fail('PREFERENCE_RESPONSE_INVALID_JSON');
  }
}

export class SchwabTosAdapter {
  constructor({ credentialGuard } = {}) {
    this.symbols = envList('SCHWAB_TOS_SYMBOLS', 'SPY,QQQ');
    this.services = envList('SCHWAB_TOS_SERVICES', 'LEVELONE_EQUITIES');
    this.state = new FeedState({ symbols: this.symbols, services: this.services });
    this.credentials = credentialGuard ?? new CredentialGuard();
    this.ws = null;
    this.stopped = false;
    this.nextRequestId = requestIdFactory();
    this.reconnectDelayMs = 1000;
    this.maxReconnectMs = 30000;
    this.maxFrameBytes = streamFrameMaxBytes();
    this.fields = process.env.SCHWAB_TOS_FIELDS ?? '0,1,2,3,8,10,11,12,13,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42';
  }

  credentialStatus() { return this.credentials.status(); }

  applyCredentialFailure(code) {
    const state = String(code || 'CREDENTIAL_REJECTED');
    this.state.setAuth(state);
    this.state.setMode(credentialMode(state));
    this.state.setSocket('DISCONNECTED');
    this.state.setSubscription('NOT_SUBSCRIBED');
    this.state.recordError(state);
  }

  enforceCredentialLease() {
    const credential = this.credentialStatus();
    if (credential.state === 'READY') return true;
    this.applyCredentialFailure(credential.state);
    try { this.ws?.close(); } catch {}
    return false;
  }

  async start() {
    if (!isEnabled()) { this.state.setMode('DISABLED'); this.state.setAuth('NOT_CONFIGURED'); return; }
    const credential = this.credentialStatus();
    if (credential.state !== 'READY') { this.applyCredentialFailure(credential.state); return; }
    if (!streamHostAllowlist().length) { this.state.setMode('AUTH_REQUIRED'); this.state.setAuth('STREAM_HOST_ALLOWLIST_REQUIRED'); return; }
    this.loop().catch(() => this.state.recordError('ADAPTER_LOOP_FAILED'));
  }

  async loop() {
    while (!this.stopped) {
      try { await this.connectOnce(); this.reconnectDelayMs = 1000; }
      catch (err) {
        const code = err?.code || err?.name || 'CONNECT_FAILED';
        if (/^(MISSING_ACCESS_TOKEN|TOKEN_)/.test(code)) this.applyCredentialFailure(code);
        else { this.state.recordError(code); this.state.setMode('DISCONNECTED'); this.state.setSocket('DISCONNECTED'); }
      }
      if (this.stopped) break;
      if (['AUTH_REQUIRED','AUTH_FAILED'].includes(this.state.mode)) break;
      this.state.reconnects += 1;
      await sleep(this.reconnectDelayMs + Math.floor(Math.random() * 300));
      this.reconnectDelayMs = Math.min(this.maxReconnectMs, this.reconnectDelayMs * 2);
    }
  }

  async getStreamerInfo() {
    this.state.setMode('AUTHENTICATING');
    const token = this.credentials.requireAccessToken();
    const response = await fetch(PREF_URL, { method:'GET', headers:{ accept:'application/json', authorization:`Bearer ${token}` }, signal:AbortSignal.timeout(10000) });
    if (response.status === 401 || response.status === 403) { this.state.setAuth('TOKEN_REJECTED'); throw fail('AUTH_REJECTED'); }
    if (!response.ok) throw fail(`PREFERENCE_HTTP_${response.status}`);
    const body = await readJsonBounded(response);
    const info = Array.isArray(body?.streamerInfo) ? body.streamerInfo[0] : null;
    if (!info?.streamerSocketUrl || !info?.schwabClientCustomerId || !info?.schwabClientCorrelId) throw fail('STREAMER_INFO_INCOMPLETE');
    const streamerSocketUrl = validateStreamerUrl(info.streamerSocketUrl);
    this.state.setAuth('VERIFIED');
    return { ...info, streamerSocketUrl };
  }

  async connectOnce() {
    const info = await this.getStreamerInfo(); this.state.setMode('CONNECTING'); this.state.setSocket('CONNECTING');
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(info.streamerSocketUrl); this.ws = ws;
      const failConnection = (code) => { if (!settled) { settled = true; reject(fail(code)); } };
      ws.addEventListener('open', () => {
        this.state.setSocket('CONNECTED');
        try { this.sendLogin(info); }
        catch (err) { this.applyCredentialFailure(err?.code || 'CREDENTIAL_REJECTED'); try { ws.close(); } catch {} failConnection(err?.code || 'CREDENTIAL_REJECTED'); }
      });
      ws.addEventListener('message', (event) => this.onMessage(event.data, info));
      ws.addEventListener('error', () => failConnection('WEBSOCKET_ERROR'));
      ws.addEventListener('close', () => { this.state.setSocket('DISCONNECTED'); this.state.setSubscription('NOT_SUBSCRIBED'); if (!['AUTH_REQUIRED','AUTH_FAILED'].includes(this.state.mode)) this.state.setMode('DISCONNECTED'); if (!settled) { settled = true; resolve(); } });
    });
  }

  send(obj) { if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false; this.ws.send(JSON.stringify(obj)); return true; }

  request(service, command, parameters, info) {
    return { requests:[{ service, command, requestid:this.nextRequestId(), SchwabClientCustomerId:info.schwabClientCustomerId, SchwabClientCorrelId:info.schwabClientCorrelId, parameters }] };
  }

  sendLogin(info) {
    const token = this.credentials.requireAccessToken();
    this.state.setAuth('LOGIN_SENT');
    this.send(this.request('ADMIN','LOGIN',{ Authorization:token, SchwabClientChannel:info.schwabClientChannel, SchwabClientFunctionId:info.schwabClientFunctionId },info));
  }

  subscribe(info) {
    const keys = this.symbols.join(',');
    for (const service of this.services) {
      const parameters = { keys };
      if (service.startsWith('LEVELONE_')) parameters.fields = this.fields;
      this.send(this.request(service,'SUBS',parameters,info));
    }
    this.state.setSubscription('SUBS_SENT');
    this.state.setMode('SUBSCRIBING');
  }

  onMessage(raw, info) {
    const text = String(raw);
    if (Buffer.byteLength(text, 'utf8') > this.maxFrameBytes) {
      this.state.recordError('STREAM_FRAME_TOO_LARGE');
      return;
    }

    let msg;
    try { msg = JSON.parse(text); }
    catch { this.state.parseErrors += 1; this.state.recordError('JSON_PARSE_ERROR'); return; }

    if (!this.enforceCredentialLease()) return;

    if (Array.isArray(msg.notify)) {
      for (const n of msg.notify) {
        if (n?.heartbeat) {
          this.state.heartbeat(n.heartbeat);
          this.state.setMode(this.state.derivedMode());
        }
      }
    }

    if (Array.isArray(msg.response)) for (const r of msg.response) {
      this.state.response();
      const code = Number(r?.content?.code);
      if (r?.service === 'ADMIN' && r?.command === 'LOGIN') {
        if (code === 0) { this.state.setAuth('VERIFIED'); this.subscribe(info); }
        else { this.state.setAuth('LOGIN_REJECTED'); this.state.recordError(`LOGIN_CODE_${Number.isFinite(code) ? code : 'UNKNOWN'}`); }
      }
      if (r?.command === 'SUBS') {
        if (code === 0) {
          this.state.setSubscription('ACK');
          this.state.setMode('SUBSCRIBED_AWAITING_DATA');
        } else {
          this.state.setSubscription('NACK');
          this.state.recordError(`SUBS_CODE_${Number.isFinite(code) ? code : 'UNKNOWN'}`);
        }
      }
    }

    if (Array.isArray(msg.data)) for (const d of msg.data) {
      const sequence = d?.sequence ?? d?.seq ?? null;
      this.state.data(d?.service ?? 'UNKNOWN', d?.timestamp, d?.content ?? [], sequence);
      this.state.setMode(this.state.derivedMode());
    }
  }

  stop() { this.stopped = true; try { this.ws?.close(); } catch {} }
}
