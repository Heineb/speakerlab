# ADR 0016: Measurement Phase/Time Alignment Foundation v1

- Status: Accepted
- Date: 2026-08-10
- Milestone: M11B — Measurement Phase/Time Alignment Foundation

## Context

SpeakerLab has immutable phase-bearing measurements, crossover and ordinary delay/polarity processing, but no responsible bridge between them. A single-frequency phase comparison is too fragile, timing compatibility cannot be guessed, and a second persistent alignment state would conflict with normal editing, backup and deployment semantics.

## Decision

Use deterministic transient server analyses identified as `speakerlab-phase-alignment-v1`. Require two measurements on different known outputs, explicit compatible timing-reference metadata, adequate phase-bearing overlap and a configured crossover. Unwrap copies of phase with shortest continuous steps and fit relative delay with a robust multi-point slope estimator. Block low-quality or out-of-capability results.

Predict complex summation with current crossover, PEQ, gain, delay and polarity. Compare normal and inverted target polarity, return exactly one conservative bounded delay/polarity suggestion and disclose ambiguity. Keep detailed fit diagnostics under `Advanced`.

Analyses remain process/browser review state. Acceptance converts the result into ordinary unsaved channel delay and polarity fields after source-hash, draft-revision and saved-revision checks. Measurements remain immutable, normal Save/Discard/undo apply, and no physical DSP operation is introduced.

## Consequences

The same measurements, reference declarations and design produce the same result. Existing persistence, validation and backup own accepted values, while stale analyses cannot be applied. User-declared timing groups remain an unverified prerequisite. The preview is a modelled acoustic sum, not a new measurement or safety/audibility claim. Absolute acoustic centre, all-pass/FIR correction, multi-way optimisation and physical deployment remain excluded.
