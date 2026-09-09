# TransitSphere Global Mobility Registry Schema v0.1

This schema is the empirical ingestion contract for worldwide mobility research.

## Registry row fields

- Registry ID
- Country
- Authority
- Operator / Provider
- Domain
- Mode
- Geographic Coverage
- Feed / API
- Standard
- Authentication
- License / Terms
- Realtime availability
- Historical availability
- Reliability evidence
- Safety classification
- Control capability
- TP Adapter
- Adapter Readiness
- Source Authority score
- Freshness score
- Uptime score
- Completeness score
- Provenance score
- Licensing score
- Confidence score
- Evidence Score
- Permitted TP Authority
- Unresolved Gaps
- Source URL
- Last Verified
- Research Wave
- Status
- Notes

## Adapter readiness enum

1. `COTS adapter available`
2. `Straightforward adapter`
3. `Semantic transformation needed`
4. `Proprietary integration`
5. `Regulatory barrier`
6. `Control-authority restricted`

## Evidence score

`EvidenceScore = (Authority×0.20 + Freshness×0.15 + Uptime×0.15 + Completeness×0.15 + Provenance×0.15 + Licensing×0.10 + Confidence×0.10) / 5 × 100`

Scores are evidence-quality indicators only. They do not grant operational authority.

## Safety classes

- S0 informational
- S1 operational support
- S2 safety-relevant
- S3 safety-critical
- S4 direct safety actuation

Default posture becomes more restrictive as safety criticality increases.

## Knowledge-graph spine

`Country → Authority → Operator → Domain/Network → Feed/API → Standard → Adapter → TP Authority`

Future graph expansion may add Asset, Node, Trip/Mission, Event, Capacity, Energy, Cargo, Policy and Evidence nodes without changing the frozen Phase-1 ontology.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
