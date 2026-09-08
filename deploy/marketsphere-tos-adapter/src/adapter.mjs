import { FeedState } from './state.mjs';

const PREF_URL = 'https://api.schwabapi.com/trader/v1/userPreference';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function envList(name, fallback = '') {
  return (process.env[name] ?? fallback).split(',').map(x => x.trim()).filter(Boolean);
}
function isEnabled() { return /^true$/i.test(process.env.SCHWAB_TOS_ENABLED ?? 'false'); }
function accessToken() { return (process.env.SCHWAB_ACCESS_TOKEN ?? '').trim(); }
function requestIdFactory() { let n = 0; return () => String(++n); }

export class SchwabTosAdapter {
  constructor() {
    this.symbols = envList('SCHWAB_TOS_SYMBOLS', 'SPY,QQQ');
    this.services = envList('SCHWAB_TOS_SERVICES', 'LEVELONE_EQUITIES');
    this.state = new FeedState({ symbols: this.symbols, services: this.services });
    this.ws = null;
    this.stopped = false;
    this.nextRequestId = requestIdFactory();
    this.reconnectDelayMs = 1000;
    this.maxReconnectMs = 30000;
    this.fields = process.env.SCHWAB_TOS_FIELDS ?? '0,1,2,3,8,10,11,12,13,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42';
  }
  async start() {
    if (!isEnabled()) { this.state.setMode('DISABLED'); this.state.setAuth('NOT_CONFIGURED'); return; }
    if (!accessToken()) { this.state.setMode('AUTH_REQUIRED'); this.state.setAuth('MISSING_ACCESS_TOKEN'); return; }
    this.loop().catch(() => this.state.recordError('ADAPTER_LOOP_FAILED'));
  }
  async loop() {
    while (!this.stopped) {
      try { await this.connectOnce(); this.reconnectDelayMs = 1000; }
      catch (err) { this.state.recordError(err?.code || err?.name || 'CONNECT_FAILED'); this.state.setMode('DISCONNECTED'); this.state.setSocket('DISCONNECTED'); }
      if (this.stopped) break;
      this.state.reconnects += 1;
      await sleep(this.reconnectDelayMs + Math.floor(Math.random() * 300));
      this.reconnectDelayMs = Math.min(this.maxReconnectMs, this.reconnectDelayMs * 2);
    }
  }
  async getStreamerInfo() {
    this.state.setMode('AUTHENTICATING');
    const response = await fetch(PREF_URL, { method:'GET', headers:{ accept:'application/json', authorization:`Bearer ${accessToken()}` }, signal:AbortSignal.timeout(10000) });
    if (response.status === 401 || response.status === 403) { this.state.setAuth('TOKEN_REJECTED'); const e = new Error('AUTH_REJECTED'); e.code='AUTH_REJECTED'; throw e; }
    if (!response.ok) { const e = new Error('PREFERENCE_HTTP_ERROR'); e.code=`PREFERENCE_HTTP_${response.status}`; throw e; }
    const body = await response.json();
    const info = Array.isArray(body?.streamerInfo) ? body.streamerInfo[0] : null;
    if (!info?.streamerSocketUrl || !info?.schwabClientCustomerId || !info?.schwabClientCorrelId) { const e = new Error('STREAMER_INFO_INCOMPLETE'); e.code='STREAMER_INFO_INCOMPLETE'; throw e; }
    this.state.setAuth('VERIFIED');
    return info;
  }
  async connectOnce() {
    const info = await this.getStreamerInfo(); this.state.setMode('CONNECTING'); this.state.setSocket('CONNECTING');
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(info.streamerSocketUrl); this.ws = ws;
      const fail = (code) => { if (!settled) { settled = true; const e = new Error(code); e.code = code; reject(e); } };
      ws.addEventListener('open', () => { this.state.setSocket('CONNECTED'); this.sendLogin(info); });
      ws.addEventListener('message', (event) => this.onMessage(event.data, info));
      ws.addEventListener('error', () => fail('WEBSOCKET_ERROR'));
      ws.addEventListener('close', () => { this.state.setSocket('DISCONNECTED'); this.state.setSubscription('NOT_SUBSCRIBED'); this.state.setMode('DISCONNECTED'); if (!settled) { settled = true; resolve(); } });
    });
  }
  send(obj) { if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false; this.ws.send(JSON.stringify(obj)); return true; }
  request(service, command, parameters, info) {
    return { requests:[{ service, command, requestid:this.nextRequestId(), SchwabClientCustomerId:info.schwabClientCustomerId, SchwabClientCorrelId:info.schwabClientCorrelId, parameters }] };
  }
  sendLogin(info) {
    this.state.setAuth('LOGIN_SENT');
    this.send(this.request('ADMIN','LOGIN',{ Authorization:accessToken(), SchwabClientChannel:info.schwabClientChannel, SchwabClientFunctionId:info.schwabClientFunctionId },info));
  }
  subscribe(info) {
    const keys = this.symbols.join(',');
    for (const service of this.services) { const parameters = { keys }; if (service.startsWith('LEVELONE_')) parameters.fields = this.fields; this.send(this.request(service,'SUBS',parameters,info)); }
    this.state.setSubscription('SUBS_SENT');
  }
  onMessage(raw, info) {
    let msg; try { msg = JSON.parse(String(raw)); } catch { this.state.parseErrors += 1; this.state.recordError('JSON_PARSE_ERROR'); return; }
    if (Array.isArray(msg.notify)) for (const n of msg.notify) if (n?.heartbeat) this.state.heartbeat(n.heartbeat);
    if (Array.isArray(msg.response)) for (const r of msg.response) {
      this.state.response(); const code = Number(r?.content?.code);
      if (r?.service === 'ADMIN' && r?.command === 'LOGIN') {
        if (code === 0) { this.state.setAuth('VERIFIED'); this.subscribe(info); }
        else { this.state.setAuth('LOGIN_REJECTED'); this.state.recordError(`LOGIN_CODE_${Number.isFinite(code) ? code : 'UNKNOWN'}`); }
      }
      if (r?.command === 'SUBS') {
        if (code === 0) { this.state.setSubscription('ACK'); this.state.setMode('LIVE'); }
        else { this.state.setSubscription('NACK'); this.state.recordError(`SUBS_CODE_${Number.isFinite(code) ? code : 'UNKNOWN'}`); }
      }
    }
    if (Array.isArray(msg.data)) for (const d of msg.data) {
      this.state.data(d?.service ?? 'UNKNOWN', d?.timestamp, d?.content ?? []);
      if (this.state.auth === 'VERIFIED' && this.state.subscription === 'ACK') this.state.setMode('LIVE');
    }
  }
  stop() { this.stopped = true; try { this.ws?.close(); } catch {} }
}
