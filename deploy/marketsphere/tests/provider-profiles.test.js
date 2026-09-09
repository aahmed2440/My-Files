'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const profiles = path.resolve(__dirname, '..', 'profiles');
const read = (name) => JSON.parse(fs.readFileSync(path.join(profiles, name), 'utf8'));

test('Schwab profile fails closed on continuity and automatic promotion', () => {
  const p = read('schwab-source-profile.json');
  assert.equal(p.certification_mode, 'EMPIRICAL_ONLY');
  assert.equal(p.continuity.current_method, 'UNVERIFIED');
  assert.equal(p.continuity.sequence_gaps_default_to_zero, false);
  assert.equal(p.promotion.automatic_live_promotion, false);
  assert.equal(p.governance.t0, 'LOCKED');
  assert.equal(p.governance.capital_authority, 'NONE');
  assert.equal(p.requirements.delayed_must_be, false);
  assert.equal(p.requirements.entitlement_verified_required, true);
});

test('CME profile separates single-source continuity from MS-L3 quorum', () => {
  const p = read('cme-source-profile.json');
  assert.equal(p.certification_mode, 'EMPIRICAL_ONLY');
  assert.equal(p.cross_source_quorum.required_for_ms_l2_single_source_certification, false);
  assert.equal(p.cross_source_quorum.required_for_ms_l3_multi_source_intelligence, true);
  assert.equal(p.promotion.automatic_live_promotion, false);
  assert.equal(p.governance.t0, 'LOCKED');
  assert.equal(p.governance.capital_authority, 'NONE');
});

test('CME direct-MDP profile requires redundancy/recovery evidence when applicable', () => {
  const p = read('cme-source-profile.json');
  const d = p.access_profiles.DIRECT_MDP_3_0;
  assert.equal(d.dual_feed_observation_required, true);
  assert.equal(d.recovery_feed_behavior_required, true);
  assert.equal(d.packet_or_message_continuity_required, true);
});
