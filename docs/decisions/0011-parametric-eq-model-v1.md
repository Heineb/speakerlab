# ADR 0011: Parametric EQ Model v1

- Status: Accepted
- Date: 2026-07-31
- Milestone: M8 – Crossover and Parametric Equalisation Editors

## Context

The legacy `equaliser` extension owns live `equaliser.json` and speaker-preset filter behavior. It calculates peaking and shelf biquads in the browser and immediately safeloads coefficient words into metadata-defined banks. Reusing that mutable format would couple a new design editor to physical writes and risk silently migrating established presets.

The current Beocreate XML provides 16 biquad sections per output at 48 kHz. The Signal Flow crossover can consume at most four. The physical addresses and signed 5.23 convention are strongly evidenced by repository metadata and legacy code, but physical write/readback behavior remains unverified.

## Decision

Signal Flow v1 gains `parametricEQ`, format `org.speakerlab.parametric-eq`, version 1. It stores one ordered band array per current output. Each band stores a stable ID, enabled state, type, frequency, gain, authoritative shape parameter and optional label. It never stores coefficients, response points, selection or absolute paths.

Version 1 supports:

- peaking EQ with Q 0.1–10;
- low shelf with RBJ shelf slope S 0.1–1; and
- high shelf with RBJ shelf slope S 0.1–1.

Frequency is 10–20,000 Hz, gain is −12 to +12 dB and the sample rate is 48 kHz. A maximum of 12 EQ bands per output reserves four of the evidenced 16 sections for the maximum supported crossover. Bypassed and zero-gain bands calculate as identity. Formulas are the normalized Audio EQ Cookbook/RBJ biquads, represented as `{b0,b1,b2,a1,a2}` with denominator `1 + a1 z^-1 + a2 z^-2`. Compiler words remain the legacy order `[b2,b1,b0,-a2,-a1]`.

Validation, coefficients, combined electrical response and headroom estimate are server-authoritative. The estimate samples the displayed logarithmic grid and adds channel gain; it is not a clipping or driver-protection guarantee.

EQ persists inside the complete revisioned `signal-flow.json`, so existing atomic write, readback, backup, restore, rollback and optimistic-conflict behavior applies. Existing `equaliser.json` and speaker presets are not read, migrated or overwritten.

Compilation targets the current Beocreate IIR bank and simulator only. It quantizes signed 5.23 coefficient words and retains the band ID in operations/readback. Strong repository evidence does not authorize physical deployment; the physical Apply action remains absent.

## Consequences

Users can edit, bypass, duplicate, remove, reorder, copy, save, restore, compile and simulate the bounded EQ design. Cascaded ideal biquads commute, but order remains persisted because fixed-point implementation order can matter.

Shelf S is deliberately named separately from peaking Q. Arbitrary coefficients, extra crossover filters, all-pass, FIR, graphic/dynamic EQ, limiters, measurement optimization and physical deployment remain out of scope.

## Rejected alternatives

- Reusing legacy `equaliser.json`: rejected because it is coupled to live hardware behavior and presets.
- Treating shelf S as Q: rejected because the mathematical meaning and valid range differ.
- Persisting coefficients: rejected because they are derived, sample-rate-specific state.
- Allowing all 16 bands: rejected because it would leave no capacity for the current crossover.
- Claiming repository mappings are physically verified: rejected because no safe physical write/readback evidence exists.
