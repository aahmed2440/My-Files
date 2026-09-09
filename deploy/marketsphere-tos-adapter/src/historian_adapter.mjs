import { SchwabTosAdapter } from './adapter.mjs';
import { MarketHistorian } from './historian.mjs';

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
      const timestamp = Number(d?.timestamp);
      const sequence = Number(d?.sequence ?? d?.seq);
      const record = {
        source: this.state.source,
        provider: this.state.provider,
        service: d?.service ?? 'UNKNOWN',
        source_timestamp_ms: Number.isFinite(timestamp) ? timestamp : null,
        sequence: Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null,
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
