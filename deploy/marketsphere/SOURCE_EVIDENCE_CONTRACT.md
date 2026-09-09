# MarketSphere Empirical Market-Source Evidence Contract

## Purpose

Define the minimum evidence an exchange/provider adapter must produce before a real source can become eligible for MarketSphere governed source-certification review.

This contract does **not** itself promote a source to LIVE and does not grant capital authority.

## Required classification

`EMPIRICAL_MARKET_SOURCE_EVIDENCE`

Synthetic/simulated evidence is categorically ineligible.

## Required fields

- `source_id`
- `provider`
- `service`
- `instrument`
- `authentication = VERIFIED`
- `subscription = ACK`
- `connection = CONNECTED`
- `first_data_at`
- `source_ts`
- `recv_ts`
- `heartbeat_at`
- `messages_received >= 1`
- `freshness_ms` within the configured policy threshold
- `heartbeat_age_ms` within the configured policy threshold
- `timestamp_integrity = true`
- `sequence_integrity = true`
- `sequence_gaps = 0` for the certification proof window
- `provenance`
- `proof_window_start`
- `proof_window_end`

## Default validation policy

- maximum freshness: 15,000 ms
- maximum heartbeat age: 45,000 ms

These are certification-harness defaults, not universal exchange-service guarantees. The governed adapter profile may set stricter source-specific thresholds.

## Forbidden evidence material

The proof artifact must not include secrets or credentials, including:

- passwords
- client/API secrets
- API keys
- access/refresh tokens
- Authorization headers
- cookies
- private keys
- account credentials

A secret-like field invalidates the evidence artifact.

## Decision semantics

A complete valid proof yields:

`ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW`

It does **not** yield automatic LIVE promotion.

A failed proof yields:

`NOT_ELIGIBLE`

with explicit failure reasons.

## Governance invariants

- `automatic_live_promotion = false`
- `capital_authority = NONE`
- `T0 = LOCKED`
- source certification is distinct from funded trading authorization
- configuration declarations are not empirical proof
- simulated evidence can never certify a real source

## Adapter implementation

The deterministic validator is implemented in:

`lib/source-proof.js`

Its contract tests are in:

`tests/source-proof.test.js`

Adapters for Schwab, CME, or future providers should emit normalized evidence compatible with this contract, while keeping provider credentials entirely outside the evidence object.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
