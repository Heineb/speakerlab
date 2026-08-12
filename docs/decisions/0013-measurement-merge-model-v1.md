# ADR 0013: Measurement Merge Model v1

- Status: Accepted
- Date: 2026-08-10
- Milestone: M9 – Measurement Alignment and Nearfield/Farfield Merge

## Context

Imported measurements need controlled alignment and merging without mutating observations or implying automatic acoustic correction. Different frequency grids and wrapped phase make direct row splicing or phase averaging unsafe.

## Decision

A derived measurement owns an `org.speakerlab.measurement-merge` version 1 recipe. The recipe references two stable source IDs and hashes and records manual magnitude offset, merge centre, octave transition width, magnitude-only phase policy, log-frequency interpolation policy and raised-cosine blend policy.

Alignment suggestion uses the median magnitude difference through the overlap. Magnitude interpolation is linear in log frequency and never extrapolates. The transition uses complementary raised-cosine weights that sum to one. Derived phase is unavailable. Exact common phase samples may be compared with shortest wrapped differences but are never blended.

Source removal is blocked while a dependent derived response exists. Source hash changes mark the result stale without making the complete saved design unreadable. Regeneration atomically replaces recipe and derived points together.

## Consequences

Merges are deterministic, portable, editable and reversible. They are analysis evidence, not anechoic truth, baffle-step correction, phase/time alignment, EQ, crossover optimisation or deployable DSP data.
