import { SchwabTosAdapter } from './adapter.mjs';
import { MarketHistorian } from './historian.mjs';

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nullableSequence(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export class HistorianSchwabTosAdapter extends SchwabTosAdapter {
  constructor({ historian } = {}) {
    super();
    this.historian = historian ?? new MarketHistorian();
  }

  onMessage(raw, info) {
    super.onMessage(raw, info);
    if (!this.historian.enabled) return;

    const text = String(raw);
    if (Buffer.byteLength(text, 'utf8') > this.maxFrameBytes) return;

    let msg;
    try { msg = JSON.parse(text); }
    catch { return; }

    if (!Array.isArray(msg.data)) return;
    for (const d of msg.data) {
      const record = {
        source: this.state.source,
        provider: this.state.provider,
        service: d?.service ?? 'UNKNOWN',
        source_timestamp_ms: nullableNumber(d?.timestamp),
        sequence: nullableSequence(d?.sequence ?? d?.seq),
        received_at: new Date().toISOString(),
        payload: Array.isArray(d?.content) ? d.content : []
      };
      this.historian.append(record).catch(() => this.state.recordError('HISTORIAN_APPEND_FAILED'));
    }
  }

  async flushHistorian() {
    await this.historian.flush();
  }
}
