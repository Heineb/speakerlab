# ADR 0010: Safe DSP Design Compilation Foundation

- Status: Accepted
- Date: 2026-07-29
- Milestone: M4 – Safe DSP Deployment

## Context

SpeakerLab has a versioned saved design for current-Beocreate routing, crossover, gain, delay and polarity, but saved intent is deliberately separate from live DSP state. The legacy extensions expose evidence-backed mappings while coupling calculation, transport and immediate hardware writes. A physical deployment path cannot be added safely before identity, ordering, readback and mismatch behavior are explicit.

## Decision

Add `org.speakerlab.dsp-compilation`, version 1, as a deterministic derived plan. It contains the source revision/hash, exact current-Beocreate capability and program identity, ordered human-readable/encoded operations, expected readback, tolerances, warnings, errors, unsupported elements and safety state. It is never the authoritative design and is not included in configuration backup.

Compilation trusts only Beocreate Universal v10 identity backed by program ID, profile version and checksum. Unknown, incompatible or unavailable identity blocks preparation. The parameter map is fixed to the shipped current-Beocreate metadata and is not a generic hardware abstraction.

Operations enter safe state, then cover routing, all 16 IIR sections per output, gain, delay and polarity. Leaving safe state is deferred until complete matching readback. Positive gain and a tweeter without high-pass protection block simulator application. Any stale revision, invalid/non-finite encoding, missing mapping, unsupported route, unstable coefficient or capacity error also blocks.

The local simulator executes the same ordered plan in process memory, supports partial failure and constrained mismatch scenarios, and exposes normalized readback. Its applied state survives browser refresh but is cleared by local-server restart. Comparison statuses are `matched`, `different`, `unavailable`, `invalid` and aggregate `unknown`; `unsupported` describes compilation. Simulator verification never implies physical deployment.

Production-like runtime remains preview-only and has no Apply action. No real DSP module, SigmaTCP framing, read queue, reconnect limit, GPIO, DSPToolkit, EEPROM or flash path is called.

## Future physical-deployment safety contract

A future implementation must prove GPIO mute entry before the first write, retain mute through complete ordered application, require target identity immediately before change, read back every safety-required value within defined tolerance, and never unmute after partial write, mismatch, unavailable readback, stale identity or connection loss. It requires a verified last-known-good compiled plan and rollback application/readback while still muted. Physical unmute is permitted only after complete verification.

## Consequences

Users can inspect representability, quantization and simulated differences without risking audio hardware. Physical deployment remains blocked by the unknowns in `CURRENT_BEOCREATE_DSP_MAPPING.md`.

The plan currently fills unused IIR slots with flat coefficients to make target state deterministic. The simulator models logical operations, not SigmaTCP timing or physical atomicity.

## Rejected alternatives

- Reusing legacy immediate-apply handlers: rejected because they do not provide one validated, inspectable transaction.
- Trusting metadata names or guessed registers: rejected because a wrong DSP program can make writes unsafe.
- Persisting compiled operations as configuration: rejected because they are derived, program-specific data.
- A generic DSP backend: rejected because only current Beocreate is in scope.
- Adding physical apply now: rejected because mute confirmation, physical readback and rollback are not yet proven.
