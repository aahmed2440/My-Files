# TransitSphere Phase-1 Global Mobility Ontology — FROZEN

Version: `TP-ONT-1.0`
Status: `FROZEN_PHASE1`

## Canonical entities

1. Asset
2. Operator
3. Trip/Mission
4. Network
5. Node
6. Event
7. Capacity
8. Energy
9. Cargo
10. Policy
11. Evidence
12. Authority

Worldwide research may add instances, specializations, evidence, mappings, and adapters. It must not silently rename, remove, or redefine these canonical entities. Material ontology changes require a new major ontology version and explicit review.

## Frozen rules

- Native standards remain intact at the boundary.
- Adapters map native semantics into the canonical ontology; they do not erase domain semantics.
- Capability does not imply evidence, validation, or authority.
- Default operational authority is `NONE` unless explicitly granted and governed.
- Hard safety/regulatory constraints are feasibility gates, not utility penalties.
- Evidence records must retain source, timestamp, provenance, freshness, confidence, and licensing context.

## Cross-domain invariant

`Country → Authority → Operator → Network → Asset → Service/Trip/Mission → Feed → Standard → Event → Evidence → Adapter → Capability`

> Increase intelligence. Increase evidence. Increase autonomy carefully. Never silently increase authority.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
