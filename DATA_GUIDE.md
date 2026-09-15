# Data guide

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

The active release is recorded in `current-release.json`. Always run:

```sh
node tools/mosaic-release.mjs status --json
```

before querying scenario evidence. Its `database` and `dataPath` values point
to the current cumulative release under `released/`.

## Evidence families

- AIS vessel observations
- Communications metadata
- ELINT and emitter observations
- Narrative source reports and an artifact index
- Weather forecasts
- Canonical entities, facilities, leadership, military commands, units,
  platforms, capabilities, naval hulls, emitters, and source registries

The H120 outcome update adds the complete participant-safe raw corpus for the
final application refresh. It remains encrypted until the facilitator
authorizes that update. It does not contain facilitator ground truth.

## Time fields

- `observation_hour`: when the underlying event or signal occurred.
- `collection_hour`: when a collector acquired it.
- `report_hour`: when a report was created.
- `ingest_hour`: when it became available to participants.

## Reference library

The plaintext `data/reference/` directory is available before the scenario
starts. It includes the base map, GIS-ready geography, fictional-world
publications, leadership and order-of-battle references, dataset guides,
schemas, and import templates. Reference material describes standing context;
it does not establish current activity.

Open `data/reference/maps/kordan_reference_map.html` for the self-contained
offline reference map. Use `data/reference/maps/kordan_base_map.geojson` or
`geography.json` in participant-built applications.
