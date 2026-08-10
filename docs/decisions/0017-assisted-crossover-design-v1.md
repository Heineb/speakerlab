# ADR 0017: Assisted Crossover Design Foundation v1

- Status: Accepted
- Date: 2026-08-10
- Milestone: M11C — Assisted Crossover Design Foundation

## Context

SpeakerLab has immutable measurements, deterministic electrical crossover filters, ordinary delay/polarity fields and phase-aware summation, but no bounded bridge from those foundations to crossover choices. A global optimiser or new persistent suggestion format would obscure normal editing and imply more measurement certainty than the current model supports.

## Decision

Add pure algorithm `speakerlab-assisted-crossover-v1` for two supported neighbouring acoustic ways. Derive a conservative candidate range from measurement overlap, roles and the current crossover. Evaluate only existing Linkwitz–Riley and Butterworth filter capabilities, include current crossover, PEQ, gain, delay and polarity, and rank deterministically using smoothness, cancellation, gap, overlap, phase/timing, delay, level mismatch and complexity. Deduplicate small variants and return at most three.

Use complex summation only for phase-bearing sources with compatible user-declared timing references. Otherwise expose a distinct magnitude-only power-sum fallback with no polarity or delay claim. Reuse the phase-alignment unwrap, interpolation and robust timing fit rather than creating a second estimator.

Keep the workflow inside each output's existing Crossover section with diagnostics under collapsed `Advanced`. Analyses remain transient. Explicit acceptance writes only ordinary unsaved low-pass/high-pass and any displayed polarity/delay fields after source-hash, unchanged-draft and saved-revision checks. EQ, gain, limiter, protection, measurements, physical deployment and navigation remain unchanged.

## Consequences

Suggestions are deterministic, bounded and reviewable through existing Save, Discard, undo, backup and validation semantics. Magnitude-only data remains useful without fabricated phase certainty. User-declared timing, measurement quality and two-way local optimisation limit the result; it is neither an audible guarantee nor driver protection. Multi-way optimisation, physical Apply and automatic correction remain excluded.
