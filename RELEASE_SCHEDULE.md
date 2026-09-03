# Aster Shield offline release schedule

> **FOR TRAINING PURPOSES ONLY — SYNTHETIC DATA**

| Release | Scenario cutoff | Availability |
|---|---:|---|
| `REL-AST-01` | H0 | Unlocked when the facilitator starts the scenario. It contains fourteen days of history through H0. |
| `REL-AST-02` | H+48 | Unlocked at the first facilitated data transition. It is cumulative through H+48. |
| `REL-AST-03` | H+72 | Unlocked at the final participant decision window. It is cumulative through H+72. |
| `H120` | H+120 | Unlocked only at facilitator direction after the protected outbrief. It supports continued participant analysis. |

The release utility accepts only the next release in this sequence. Release
words are deliberately absent from this kit.

An observation may occur before its release cutoff because collection,
reporting, and ingest take time. Filter on `ingest_hour` to reconstruct what
was available at a cutoff. Use `observation_hour` to study when the underlying
activity occurred.
