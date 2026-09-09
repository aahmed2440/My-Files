'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const matrix = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'CERTIFICATION_MATRIX.json'), 'utf8'));

test('MS-L2 matrix requires versioned, entitled, realtime, timestamped and secret-free evidence', () => {
  const required = new Set(matrix.levels['MS-L2'].required);
  for (const gate of [
    'versioned_provider_adapter_evidence_contract',
    'strict_provider_proof_normalization',
    'provider_entitlement_verified',
    'realtime_not_delayed',
    'freshness_recomputed_from_source_timestamp',
    'timestamp_integrity',
    'sequence_or_governed_alternative_continuity_integrity',
    'secret_free_evidence'
  ]) assert.equal(required.has(gate), true, `missing MS-L2 gate: ${gate}`);
});

test('Schwab matrix contract agrees with candidate schema v1 and fail-closed normalizer', () => {
  const s = matrix.provider_contracts.SCHWAB;
  assert.equal(s.candidate_schema_version, 1);
  assert.equal(s.candidate_schema, 'schemas/schwab-adapter-candidate-v1.schema.json');
  assert.equal(s.normalizer, 'lib/schwab-proof-normalizer.js');
  assert.equal(s.unknown_candidate_versions_fail_closed, true);
  assert.equal(s.automatic_live_promotion, false);
});

test('volatile provider state is explicitly excluded from static matrix authority', () => {
  assert.equal(matrix.status_authority.static_contract, 'CERTIFICATION_MATRIX.json');
  assert.deepEqual(matrix.status_authority.current_runtime_status, ['/api/readiness', '/api/sources']);
  assert.match(matrix.status_authority.empirical_status_authority, /evidence/i);
  assert.equal(Object.prototype.hasOwnProperty.call(matrix.provider_contracts.SCHWAB, 'current_external_state'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(matrix.provider_contracts.CME, 'current_external_state'), false);
});

test('governance prevents candidate or validator eligibility from auto-promoting LIVE', () => {
  assert.equal(matrix.governance.t0, 'LOCKED');
  assert.equal(matrix.governance.capital_authority, 'NONE');
  assert.equal(matrix.governance.adapter_candidate_eligibility_alone_can_certify_source, false);
  assert.equal(matrix.governance.normalized_validator_eligibility_alone_can_auto_promote_live, false);
});
