import crypto from 'node:crypto';

const nowIso = () => new Date().toISOString();
const age = (iso) => iso ? Math.max(0, Date.now() - Date.parse(iso)) : null;

export class FeedState {
  constructor({ symbols = [], services = [] } = {}) {
    this.startedAt = nowIso();
    this.source = 'SCHWAB_TOS';
    this.provider = 'Charles Schwab Trader API';
    this.adapterVersion = '0.2.0-cert';
    this.candidateSchemaVersion = 1;
    this.tradingAuthority = 'NONE';
    this.productionMutation = false;
    this.symbolsConfigured = [...symbols];
    this.servicesConfigured = [...services];
    this.mode = 'DISABLED';
    this.auth = 'NOT_CONFIGURED';
    this.subscription = 'NOT_SUBSCRIBED';
    this.socket = 'DISCONNECTED';
    this.entitlement = 'UNVERIFIED';
    this.realtimeStatus = 'UNVERIFIED';
    this.timestampIntegrity = 'UNVERIFIED';
    this.continuity = 'UNVERIFIED';
    this.sequenceGaps = null;
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
    this.symbolsObserved = new Set();
    this.lastErrorCode = null;
    this.lastErrorAt = null;
    this.firstDataProof = null;
    this.lastDataProof = null;
    this.realtimeObservations = 0;
    this.delayedObservations = 0;
    this.unknownRealtimeObservations = 0;
  }

  setMode(mode) { this.mode = mode; this.lastEventAt = nowIso(); }
  setAuth(auth) { this.auth = auth; this.lastEventAt = nowIso(); }
  setSubscription(subscription) { this.subscription = subscription; this.lastEventAt = nowIso(); }
  setSocket(socket) { this.socket = socket; this.lastEventAt = nowIso(); }
  setEntitlement(value) { this.entitlement = value; this.lastEventAt = nowIso(); }
  setTimestampIntegrity(value) { this.timestampIntegrity = value; this.lastEventAt = nowIso(); }
  setContinuity(value, { sequenceGaps = null } = {}) { this.continuity = value; this.sequenceGaps = sequenceGaps; this.lastEventAt = nowIso(); }
  recordError(code) { this.lastErrorCode = String(code || 'UNKNOWN').slice(0, 80); this.lastErrorAt = nowIso(); this.lastEventAt = this.lastErrorAt; }

  heartbeat(serverMs) {
    const t = nowIso(); this.lastHeartbeatAt = t; this.lastEventAt = t; this.heartbeats += 1;
    if (serverMs && Number.isFinite(Number(serverMs))) { this.lastServerTimestamp = Number(serverMs); this.clockSkewMs = Date.now() - Number(serverMs); }
  }

  response() { this.responsesReceived += 1; this.lastEventAt = nowIso(); }

  data(service, timestamp, content = []) {
    const t = nowIso(); this.lastDataAt = t; this.lastEventAt = t; this.dataMessages += 1;
    const items = Array.isArray(content) ? content : [content];
    const n = items.length; this.eventsReceived += n;
    let frameRealtime = 0, frameDelayed = 0, frameUnknown = 0;
    const frameSymbols = [];

    for (const item of items) {
      const symbol = item?.key ?? item?.symbol ?? item?.['0'] ?? item?.['1'];
      if (typeof symbol === 'string' && symbol.length <= 64) {
        this.symbolsObserved.add(symbol);
        frameSymbols.push(symbol);
      }
      if (item?.delayed === false) frameRealtime += 1;
      else if (item?.delayed === true) frameDelayed += 1;
      else frameUnknown += 1;
    }

    this.realtimeObservations += frameRealtime;
    this.delayedObservations += frameDelayed;
    this.unknownRealtimeObservations += frameUnknown;

    if (this.delayedObservations > 0) this.realtimeStatus = 'DELAYED_OBSERVED';
    else if (this.realtimeObservations > 0 && this.unknownRealtimeObservations === 0) this.realtimeStatus = 'REALTIME_OBSERVED';
    else if (this.realtimeObservations > 0) this.realtimeStatus = 'PARTIAL_REALTIME_STATUS';
    else this.realtimeStatus = 'UNVERIFIED';

    const sourceTimestampMs = timestamp && Number.isFinite(Number(timestamp)) ? Number(timestamp) : null;
    if (sourceTimestampMs !== null) { this.lastServerTimestamp = sourceTimestampMs; this.clockSkewMs = Date.now() - sourceTimestampMs; }
    const symbols = [...new Set(frameSymbols)].sort();
    const proofPayload = JSON.stringify({ source:this.source, service, sourceTimestampMs, receivedAt:t, count:n, symbols, realtime:frameRealtime, delayed:frameDelayed, unknown:frameUnknown });
    const proof = crypto.createHash('sha256').update(proofPayload).digest('hex');
    const frameProof = { observedAt:t, receivedAt:t, sourceTimestampMs, sha256:proof, service, count:n, symbols, realtime:frameRealtime, delayed:frameDelayed, unknown:frameUnknown };
    if (!this.firstDataProof) this.firstDataProof = frameProof;
    this.lastDataProof = frameProof;
  }

  derivedMode({ heartbeatStaleMs = 45000, dataStaleMs = 90000 } = {}) {
    if (this.auth === 'NOT_CONFIGURED') return 'DISABLED';
    if (this.auth === 'MISSING_ACCESS_TOKEN' || this.auth === 'STREAM_HOST_ALLOWLIST_REQUIRED') return 'AUTH_REQUIRED';
    if (this.auth === 'TOKEN_REJECTED' || this.auth === 'LOGIN_REJECTED') return 'AUTH_FAILED';
    if (this.socket !== 'CONNECTED') return this.auth === 'VERIFIED' ? 'DISCONNECTED' : this.mode;
    if (this.auth !== 'VERIFIED') return 'AUTHENTICATING';
    if (this.subscription !== 'ACK') return this.subscription === 'SUBS_SENT' ? 'SUBSCRIBING' : 'CONNECTED_NOT_SUBSCRIBED';
    if (!this.firstDataProof) return 'SUBSCRIBED_AWAITING_DATA';

    const hbAge = age(this.lastHeartbeatAt);
    const dataAge = age(this.lastDataAt);
    if (dataAge !== null && dataAge > dataStaleMs) return 'STALE';
    if (!this.lastHeartbeatAt) return 'DATA_OBSERVED_AWAITING_HEARTBEAT';
    if (hbAge !== null && hbAge > heartbeatStaleMs) return 'DEGRADED';
    if (this.realtimeStatus === 'DELAYED_OBSERVED') return 'DELAYED_DATA';
    if (this.realtimeStatus !== 'REALTIME_OBSERVED') return 'REALTIME_STATUS_UNVERIFIED';
    if (this.entitlement !== 'VERIFIED') return 'ENTITLEMENT_PENDING';
    if (this.timestampIntegrity !== 'VERIFIED') return 'TIMESTAMP_INTEGRITY_PENDING';
    if (this.continuity !== 'VERIFIED') return 'CONTINUITY_PENDING';
    return 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW';
  }

  snapshot({ heartbeatStaleMs = 45000, dataStaleMs = 90000 } = {}) {
    const hbAge = age(this.lastHeartbeatAt), dataAge = age(this.lastDataAt);
    const effective = this.derivedMode({ heartbeatStaleMs, dataStaleMs });
    return {
      candidate_schema_version:this.candidateSchemaVersion,
      source:this.source, provider:this.provider, adapter_version:this.adapterVersion, mode:effective, raw_mode:this.mode,
      auth:this.auth, subscription:this.subscription, socket:this.socket, entitlement:this.entitlement,
      realtime_status:this.realtimeStatus, timestamp_integrity:this.timestampIntegrity, continuity:this.continuity,
      last_heartbeat_at:this.lastHeartbeatAt, heartbeat_age_ms:hbAge, last_data_at:this.lastDataAt, data_age_ms:dataAge,
      last_source_timestamp_ms:this.lastDataProof?.sourceTimestampMs ?? null,
      last_receive_at:this.lastDataProof?.receivedAt ?? null,
      last_event_at:this.lastEventAt, events_received:this.eventsReceived, data_messages:this.dataMessages, heartbeats:this.heartbeats,
      responses_received:this.responsesReceived, reconnects:this.reconnects, parse_errors:this.parseErrors,
      sequence_gaps:this.sequenceGaps, clock_skew_ms:this.clockSkewMs,
      realtime_observations:this.realtimeObservations, delayed_observations:this.delayedObservations,
      unknown_realtime_observations:this.unknownRealtimeObservations,
      symbols_configured:this.symbolsConfigured, symbols_observed:[...this.symbolsObserved].sort(), services_configured:this.servicesConfigured,
      last_error_code:this.lastErrorCode, last_error_at:this.lastErrorAt, trading_authority:this.tradingAuthority,
      production_mutation:this.productionMutation, started_at:this.startedAt, proof_available:Boolean(this.firstDataProof),
      automatic_live_promotion:false
    };
  }

  proof({ heartbeatStaleMs = 45000, dataStaleMs = 90000 } = {}) {
    const snap = this.snapshot({ heartbeatStaleMs, dataStaleMs });
    return {
      candidate_schema_version:this.candidateSchemaVersion,
      classification:'EMPIRICAL_MARKET_SOURCE_EVIDENCE_CANDIDATE',
      source:this.source, provider:this.provider, adapter_version:this.adapterVersion,
      authentication:this.auth, subscription:this.subscription, connection:this.socket,
      first_data:this.firstDataProof, last_data:this.lastDataProof,
      last_heartbeat_at:this.lastHeartbeatAt,
      last_source_timestamp_ms:this.lastDataProof?.sourceTimestampMs ?? null,
      last_receive_at:this.lastDataProof?.receivedAt ?? null,
      clock_skew_ms:this.clockSkewMs,
      events_received:this.eventsReceived, data_messages:this.dataMessages, heartbeats:this.heartbeats,
      symbols_observed:[...this.symbolsObserved].sort(), realtime_status:this.realtimeStatus,
      entitlement:this.entitlement, timestamp_integrity:this.timestampIntegrity,
      continuity:this.continuity, sequence_gaps:this.sequenceGaps,
      heartbeat_age_ms:snap.heartbeat_age_ms, data_age_ms:snap.data_age_ms,
      state:snap.mode, eligible_for_governed_review:snap.mode === 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW',
      automatic_live_promotion:false, trading_authority:this.tradingAuthority
    };
  }
}
