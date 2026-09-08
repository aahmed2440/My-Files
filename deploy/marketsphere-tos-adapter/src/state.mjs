import crypto from 'node:crypto';

const nowIso = () => new Date().toISOString();
const age = (iso) => iso ? Math.max(0, Date.now() - Date.parse(iso)) : null;

export class FeedState {
  constructor({ symbols = [], services = [] } = {}) {
    this.startedAt = nowIso();
    this.source = 'SCHWAB_TOS';
    this.provider = 'Charles Schwab Trader API';
    this.adapterVersion = '0.1.0';
    this.tradingAuthority = 'NONE';
    this.productionMutation = false;
    this.symbolsConfigured = [...symbols];
    this.servicesConfigured = [...services];
    this.mode = 'DISABLED';
    this.auth = 'NOT_CONFIGURED';
    this.subscription = 'NOT_SUBSCRIBED';
    this.socket = 'DISCONNECTED';
    this.lastHeartbeatAt = null;
    this.lastDataAt = null;
    this.lastEventAt = null;
    this.lastServerTimestamp = null;
    this.clockSkewMs = null;
    this.heartbeats = 0;
    this.dataMessages = 0;
    this.eventsReceived = 0;
    this.responsesReceived = 0;
    this.reconnects = 0;
    this.parseErrors = 0;
    this.sequenceGaps = 0;
    this.symbolsObserved = new Set();
    this.lastErrorCode = null;
    this.lastErrorAt = null;
    this.firstDataProof = null;
    this.lastDataProof = null;
  }
  setMode(mode) { this.mode = mode; this.lastEventAt = nowIso(); }
  setAuth(auth) { this.auth = auth; this.lastEventAt = nowIso(); }
  setSubscription(subscription) { this.subscription = subscription; this.lastEventAt = nowIso(); }
  setSocket(socket) { this.socket = socket; this.lastEventAt = nowIso(); }
  recordError(code) { this.lastErrorCode = String(code || 'UNKNOWN').slice(0, 80); this.lastErrorAt = nowIso(); this.lastEventAt = this.lastErrorAt; }
  heartbeat(serverMs) {
    const t = nowIso(); this.lastHeartbeatAt = t; this.lastEventAt = t; this.heartbeats += 1;
    if (serverMs && Number.isFinite(Number(serverMs))) { this.lastServerTimestamp = Number(serverMs); this.clockSkewMs = Date.now() - Number(serverMs); }
  }
  response() { this.responsesReceived += 1; this.lastEventAt = nowIso(); }
  data(service, timestamp, content = []) {
    const t = nowIso(); this.lastDataAt = t; this.lastEventAt = t; this.dataMessages += 1;
    const n = Array.isArray(content) ? content.length : 1; this.eventsReceived += n;
    for (const item of Array.isArray(content) ? content : [content]) {
      const symbol = item?.key ?? item?.symbol ?? item?.['0'] ?? item?.['1'];
      if (typeof symbol === 'string' && symbol.length <= 64) this.symbolsObserved.add(symbol);
    }
    if (timestamp && Number.isFinite(Number(timestamp))) { this.lastServerTimestamp = Number(timestamp); this.clockSkewMs = Date.now() - Number(timestamp); }
    const proofPayload = JSON.stringify({ source: this.source, service, timestamp: Number(timestamp) || null, count: n, observedAt: t });
    const proof = crypto.createHash('sha256').update(proofPayload).digest('hex');
    if (!this.firstDataProof) this.firstDataProof = { observedAt: t, sha256: proof, service, count: n };
    this.lastDataProof = { observedAt: t, sha256: proof, service, count: n };
  }
  snapshot({ heartbeatStaleMs = 45000, dataStaleMs = 90000 } = {}) {
    const hbAge = age(this.lastHeartbeatAt), dataAge = age(this.lastDataAt); let effective = this.mode;
    if (this.mode === 'LIVE') { if (hbAge !== null && hbAge > heartbeatStaleMs) effective = 'DEGRADED'; if (dataAge !== null && dataAge > dataStaleMs) effective = 'STALE'; }
    return { source:this.source, provider:this.provider, adapter_version:this.adapterVersion, mode:effective, raw_mode:this.mode, auth:this.auth, subscription:this.subscription, socket:this.socket, last_heartbeat_at:this.lastHeartbeatAt, heartbeat_age_ms:hbAge, last_data_at:this.lastDataAt, data_age_ms:dataAge, last_event_at:this.lastEventAt, events_received:this.eventsReceived, data_messages:this.dataMessages, heartbeats:this.heartbeats, responses_received:this.responsesReceived, reconnects:this.reconnects, parse_errors:this.parseErrors, sequence_gaps:this.sequenceGaps, clock_skew_ms:this.clockSkewMs, symbols_configured:this.symbolsConfigured, symbols_observed:[...this.symbolsObserved].sort(), services_configured:this.servicesConfigured, last_error_code:this.lastErrorCode, last_error_at:this.lastErrorAt, trading_authority:this.tradingAuthority, production_mutation:this.productionMutation, started_at:this.startedAt, proof_available:Boolean(this.firstDataProof) };
  }
  proof() { return { source:this.source, first_data:this.firstDataProof, last_data:this.lastDataProof, events_received:this.eventsReceived, symbols_observed:[...this.symbolsObserved].sort(), trading_authority:this.tradingAuthority }; }
}
