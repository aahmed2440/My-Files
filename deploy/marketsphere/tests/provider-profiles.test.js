'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const profiles = path.join(root, 'profiles');
const schemas = path.join(root, 'schemas');
const readProfile = (name) => JSON.parse(fs.readFileSync(path.join(profiles, name), 'utf8'));
const readSchema = (name) => JSON.parse(fs.readFileSync(path.join(schemas, name), 'utf8'));

test('Schwab profile fails closed on continuity and automatic promotion', () => {
  const p = readProfile('schwab-source-profile.json');
  assert.equal(p.certification_mode, 'EMPIRICAL_ONLY');
  assert.equal(p.continuity.current_method, 'UNVERIFIED');
  assert.equal(p.continuity.sequence_gaps_default_to_zero, false);
  assert.equal(p.promotion.automatic_live_promotion, false);
  assert.equal(p.governance.t0, 'LOCKED');
  assert.equal(p.governance.capital_authority, 'NONE');
  assert.equal(p.requirements.delayed_must_be, false);
  assert.equal(p.requirements.entitlement_verified_required, true);
  assert.equal(p.requirements.timestamp_integrity_required, true);
});

test('Schwab adapter candidate contract is versioned, strict and fail-closed', () => {
  const p = readProfile('schwab-source-profile.json');
  const c = p.adapter_candidate_contract;
  assert.equal(c.supported_schema_version, 1);
  assert.equal(c.schema, 'schemas/schwab-adapter-candidate-v1.schema.json');
  assert.equal(c.normalizer, 'lib/schwab-proof-normalizer.js');
  assert.equal(c.unknown_versions_fail_closed, true);

  const schema = readSchema('schwab-adapter-candidate-v1.schema.json');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.candidate_schema_version.const, c.supported_schema_version);
  assert.equal(schema.properties.classification.const, 'EMPIRICAL_MARKET_SOURCE_EVIDENCE_CANDIDATE');
  assert.equal(schema.properties.source.const, 'SCHWAB_TOS');
  assert.equal(schema.properties.provider.const, 'Charles Schwab Trader API');
  assert.equal(schema.properties.automatic_live_promotion.const, false);
  assert.equal(schema.properties.trading_authority.const, 'NONE');
  assert.equal(schema.$defs.frameProof.additionalProperties, false);
});

test('CME profile separates single-source continuity from MS-L3 quorum', () => {
  const p = readProfile('cme-source-profile.json');
  assert.equal(p.certification_mode, 'EMPIRICAL_ONLY');
  assert.equal(p.cross_source_quorum.required_for_ms_l2_single_source_certification, false);
  assert.equal(p.cross_source_quorum.required_for_ms_l3_multi_source_intelligence, true);
  assert.equal(p.promotion.automatic_live_promotion, false);
  assert.equal(p.governance.t0, 'LOCKED');
  assert.equal(p.governance.capital_authority, 'NONE');
});

test('CME direct-MDP profile requires redundancy/recovery evidence when applicable', () => {
  const p = readProfile('cme-source-profile.json');
  const d = p.access_profiles.DIRECT_MDP_3_0;
  assert.equal(d.dual_feed_observation_required, true);
  assert.equal(d.recovery_feed_behavior_required, true);
  assert.equal(d.packet_or_message_continuity_required, true);
});
