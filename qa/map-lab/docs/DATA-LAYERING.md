# Physical layers and vertical placement

The resolver in [physical-level.js](../pipeline/physical-level.js) is shared by source merging, structure association, ground observations, approaches, tree placement and geometry diagnostics. Source tags remain unchanged. The resolver's classification and reason are recorded in `merge.attributes.physicalLevel` for features requiring vertical resolution; unresolved placement produces `missing-structure-elevation` in the generation log.

## Tag meanings

- [`layer`](https://wiki.openstreetmap.org/wiki/Key:layer) orders overlapping features. A negative value does not establish underground placement, and a positive value does not measure height. A bridge can have a negative layer.
- [`level`](https://wiki.openstreetmap.org/wiki/Key:level) identifies a floor. It is distinct from `building:levels`, which is a count used by our documented building-height estimate. We do not multiply `level` or `layer` by a floor height.
- [`location`](https://wiki.openstreetmap.org/wiki/Key:location) describes placement such as underground, roof or overhead. It supplies no usable height by itself.
- [`tunnel=building_passage`](https://wiki.openstreetmap.org/wiki/Tag:tunnel%3Dbuilding_passage) describes a passage through a building, usually at ground level. It is not automatically an underground tunnel.

## Current decisions

| Evidence | Treatment |
| --- | --- |
| No vertical tags, or neutral layer/level without contrary tags | Ground placement eligible; terrain and offsets remain separately attributed estimates or measurements |
| `bridge=*` other than `no`, including negative layers | May associate with one compatible measured deck; layer sign does not select an elevation |
| `location=bridge` | Same support requirement as an explicit bridge role |
| Nonzero layer without a supported physical role | Outline/marker; no guessed ground, bridge or tunnel height |
| `location=underground/underwater`, or a tunnel other than building passage | Outline/marker; no above-ground deck association |
| Nonzero floor, indoor object, roof/overhead/unsupported location | Outline/marker until a compatible vertical model exists |
| Malformed numbers, layer/level lists or ranges | Outline/marker with unresolved-placement log; no numeric coercion to ground |
| `tunnel=building_passage` with otherwise ground-compatible tags | Ground geometry; building clearance/portal carving is not implemented |
| Contradictory bridge and tunnel, subsurface, floor or explicit surface placement | No deck association; preserved evidence and a placement diagnostic |

These rules apply with **Merge sources** enabled or disabled. Unresolved buildings cannot suppress surface footprints, replace their above-ground parent with a basement part, extrude at ground level or create walking walls/roofs. Their footprints remain inspectable in both views. Unknown road levels cannot consume roadbed coverage, supply ground observations, anchor a bridge approach or trigger a ground-clearance diagnostic.

NYC feature codes and elevation subtypes retain separate source-specific rules. LION layer/node-level fields are network classifications, not OSM layers or heights. Ground, bridge and roof observations are not interchangeable. An NYC bridge profile needs supported measurements; ordinary railroad lines cannot borrow an elevated deck solely through overlap.

## Limits and verification

This is a conservative placement policy, not a complete 3D constraint solver. Missing tags do not prove a surveyed ground elevation. Multiple overlapping structures still require unambiguous support; no global stacking distance comes from layer numbers. Full tunnel geometry, indoor levels, portal/building clearance, water depths and unknown heights remain [rendering gaps](RENDERING-GAPS.md). Reference lines/markers are drawn for inspection at reference height and are excluded from physical walking surfaces.

[physical-level-test.mjs](../tests/physical-level-test.mjs) checks negative bridges, unresolved tag combinations, merge identity, building parts, raw-data retention, emitted references, collisions and clearance. Ground-evidence and ramp checks are in [infrastructure-test.mjs](../tests/infrastructure-test.mjs) and [road-approaches-test.mjs](../tests/road-approaches-test.mjs). The [browser check](../tests/infrastructure-browser-test.mjs) verifies actual generation/logs and can replay the saved Shell Road source capture under Xvfb.
