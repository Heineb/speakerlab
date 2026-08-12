# ADR 0015: Measurement-Assisted EQ Suggestions v1

- Status: Accepted
- Date: 2026-08-10
- Milestone: M11A — Measurement-Assisted EQ Suggestions

## Context

SpeakerLab now has immutable imported/derived measurements, ordinary revisioned Parametric EQ bands, crossover context and estimated headroom/protection information. A useful next step is human-reviewed correction without creating automatic room correction, a second EQ state or a dense optimisation dashboard.

## Decision

Use deterministic transient server analyses identified as `speakerlab-assisted-eq-v1`. Flat and Gentle downward tilt are the only primary targets. Analysis uses a 121-point log grid, 1/6-octave default smoothing, crossover/role-limited range, existing EQ by default, peaking filters only, five suggestions and +3 dB maximum boost by default. Deep narrow nulls are not filled. The documented objective penalises error, filter count, Q and positive boost.

Suggestions live only in process/browser review state. Acceptance converts selected results into ordinary PEQ draft bands and requires normal Save. Source measurements remain unchanged. The workflow is contextual within Parametric EQ, numerical controls are under `Advanced`, and there is no new navigation or physical DSP path.

## Consequences

The same inputs produce the same suggestions, accepted filters inherit existing validation/persistence/backup behavior, and rejected suggestions leave no design state. Predictions remain magnitude-plus-electrical estimates rather than measured or phase-aware acoustic results. Automatic room correction, arbitrary targets, shelf/FIR/all-pass/crossover/limiter changes and physical deployment stay excluded.
