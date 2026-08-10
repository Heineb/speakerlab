# ADR 0012: Measurement Import Model v1

- Status: Accepted
- Date: 2026-08-10
- Milestone: M9 – Measurement Import

## Context

SpeakerLab needs deterministic REW/FRD import without coupling design evidence to legacy room compensation, automatic optimisation or physical DSP state.

## Decision

`signal-flow.json` gains `measurements`, format `org.speakerlab.measurements`, version 1. It stores normalized authoritative frequency/magnitude/optional-phase points, metadata, assignments and a SHA-256 integrity hash. Limits are 2 MiB per source, 20,000 rows, 24 measurements and 50,000 total points per design.

Pure parsing supports UTF-8 REW text and two/three-column FRD text with whitespace, tabs or unambiguous commas, BOM, CRLF, scientific notation, comments and headings. Normalization only normalizes negative zero and sorts ascending. Duplicate frequencies remain. It never smooths, interpolates, unwraps phase, changes magnitude reference, removes outliers or resamples.

Browser file contents use the existing WebSocket envelope for bounded server-authoritative preview. A short-lived integrity token must be confirmed before normalized data enters the draft. Filenames are metadata-only basenames. Absolute paths and raw source text are not persisted.

Measurements share the complete Signal Flow optimistic revision, validation, atomic write/readback and rollback boundary. Existing backup therefore includes points and metadata and verifies both measurement and backup hashes. The graph keeps measured magnitude and relative electrical crossover/EQ curves separate and never calls them an acoustic prediction. Measurements never enter DSP compilation.

## Consequences

The design stays portable and deterministic without a second storage transaction. Conservative total-point limits bound write amplification. CSV mapping, impedance, calibration, impulses, smoothing, merging, automatic EQ, optimisation and physical apply remain out of scope.
