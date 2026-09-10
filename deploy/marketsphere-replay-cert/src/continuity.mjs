function nullableSequence(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function validMillis(value) {
  const n = Date.parse(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

function emptyState() {
  return {
    observations: 0,
    last_sequence: null,
    last_source_ts_ms: null,
    sequence_gaps: 0,
    sequence_duplicates: 0,
    sequence_regressions: 0,
    timestamp_regressions: 0
  };
}

export class ContinuityTracker {
  constructor() { this.streams = new Map(); }

  hydrate(streamTails = {}) {
    for (const [key, tail] of Object.entries(streamTails ?? {})) {
      const ts = validMillis(tail?.source_ts);
      if (!key || ts === null) throw new Error('CONTINUITY_REHYDRATION_INVALID');
      this.streams.set(key, {
        observations: Number.isSafeInteger(tail?.observations) && tail.observations >= 0 ? tail.observations : 0,
        last_sequence: nullableSequence(tail?.sequence),
        last_source_ts_ms: ts,
        sequence_gaps: Number(tail?.sequence_gaps) || 0,
        sequence_duplicates: Number(tail?.sequence_duplicates) || 0,
        sequence_regressions: Number(tail?.sequence_regressions) || 0,
        timestamp_regressions: Number(tail?.timestamp_regressions) || 0
      });
    }
  }

  observe({ stream_key, sequence, source_ts }) {
    const key = String(stream_key ?? '').trim();
    if (!key) throw new Error('CONTINUITY_STREAM_KEY_REQUIRED');
    const seq = nullableSequence(sequence);
    const ts = validMillis(source_ts);
    if (ts === null) throw new Error('CONTINUITY_SOURCE_TIMESTAMP_REQUIRED');

    const prior = this.streams.get(key) ?? emptyState();
    let observation = 'FIRST_OBSERVATION';
    let continuity = 'UNKNOWN_SEQUENCE_NOT_PROVIDED';

    if (prior.last_source_ts_ms !== null && ts < prior.last_source_ts_ms) {
      prior.timestamp_regressions += 1;
      observation = 'TIMESTAMP_REGRESSION';
    }

    if (seq !== null) {
      if (prior.last_sequence === null) {
        observation = observation === 'TIMESTAMP_REGRESSION' ? observation : 'SEQUENCE_BASELINE_OBSERVED';
      } else if (seq === prior.last_sequence) {
        prior.sequence_duplicates += 1;
        observation = 'SEQUENCE_DUPLICATE';
      } else if (seq < prior.last_sequence) {
        prior.sequence_regressions += 1;
        observation = 'SEQUENCE_REGRESSION';
      } else if (seq > prior.last_sequence + 1) {
        prior.sequence_gaps += seq - prior.last_sequence - 1;
        observation = 'SEQUENCE_GAP';
      } else if (observation !== 'TIMESTAMP_REGRESSION') {
        observation = 'SEQUENCE_CONTIGUOUS';
      }
      prior.last_sequence = seq;
    }

    prior.observations += 1;
    prior.last_source_ts_ms = prior.last_source_ts_ms === null ? ts : Math.max(prior.last_source_ts_ms, ts);

    if (prior.timestamp_regressions > 0) continuity = 'FAILED_TIMESTAMP_REGRESSION';
    else if (prior.sequence_regressions > 0) continuity = 'FAILED_SEQUENCE_REGRESSION';
    else if (prior.sequence_gaps > 0) continuity = 'FAILED_SEQUENCE_GAP';
    else if (seq === null && prior.last_sequence === null) continuity = 'UNKNOWN_SEQUENCE_NOT_PROVIDED';
    else if (prior.sequence_duplicates > 0) continuity = 'SEQUENCE_DUPLICATE_OBSERVED';
    else continuity = prior.observations >= 2 ? 'CONTIGUOUS_OBSERVED_NOT_PROVIDER_VERIFIED' : 'SEQUENCE_OBSERVED_AWAITING_MORE_EVIDENCE';

    this.streams.set(key, prior);
    return {
      stream_key: key,
      observation,
      continuity,
      sequence: seq,
      sequence_gaps: prior.sequence_gaps,
      sequence_duplicates: prior.sequence_duplicates,
      sequence_regressions: prior.sequence_regressions,
      timestamp_regressions: prior.timestamp_regressions,
      observations: prior.observations,
      provider_continuity_verified: false
    };
  }

  snapshot() {
    return [...this.streams.entries()].map(([stream_key, value]) => ({ stream_key, ...value }));
  }
}
