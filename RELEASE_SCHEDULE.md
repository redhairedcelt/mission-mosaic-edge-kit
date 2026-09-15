# Aster Shield offline release schedule

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

| Release | Scenario cutoff | Availability |
|---|---:|---|
| `REL-AST-01` | H0 | Active when the complete kit is opened. It contains fourteen days of history through H0. |
| `REL-AST-02` | H+72 | Unlocked for the primary analysis window. It is cumulative through H+72. Participants brief before the next update. |
| `REL-AST-03` | H+120 | Unlocked for the final application refresh. It is cumulative through H+120 and excludes facilitator ground truth. |

The release utility accepts only the next update in this sequence. Release
words are deliberately absent from this kit.

An observation may occur before its release cutoff because collection,
reporting, and ingest take time. Filter on `ingest_hour` to reconstruct what
was available at a cutoff. Use `observation_hour` to study when the underlying
activity occurred.
