# Current Status

## Current milestone

**M9 — Measurement Alignment and Nearfield/Farfield Merge Foundation**

Current working branch: `develop`.

## Latest completed slice

Measurement Alignment and Nearfield/Farfield Merge Foundation v1 creates a new derived magnitude response from one low-frequency source, normally nearfield, and one high-frequency source, normally farfield or gated. Imported source measurements remain unchanged and are referenced by stable IDs and integrity hashes.

The visible workflow reports source compatibility, overlap, point count, phase availability, median suggested level offset and overlap variation. The suggestion is never applied invisibly. Manual alignment is bounded to ±30 dB. Merge centre must lie inside the source overlap, and the complete 0.1–2-octave transition must remain covered by both sources.

Magnitude uses deterministic linear interpolation in log frequency without extrapolation. Exact duplicates use their median. A complementary raised-cosine crossfade in log frequency supplies smooth weights that always sum to one; the result grid is the sorted union of source frequencies over valid coverage. Wrapped phase is never interpolated or averaged. Exact common phase samples receive a shortest-wrapped-difference compatibility summary, while every v1 derived result remains explicitly magnitude-only.

The versioned recipe, source hashes, algorithms, offset, transition, derived points, provenance and derived integrity hash persist together in atomic revisioned `signal-flow.json`. A source rename remains valid; a changed source hash marks the merge stale; source removal is blocked until dependent merges are removed. Backup/restore carries source relationships, recipe and derived result and validates the complete dependency graph.

The responsive keyboard-accessible UI distinguishes source observations, adjusted preview, derived response and electrical overlays. Real-browser journeys cover creation, suggested/manual alignment, preview, save, refresh/restart, edit, source integrity, missing-phase policy, dependent-source removal, invalid transition, large-offset warning and narrow layout with console/page-error monitoring.

## Remaining risks and limitations

V1 does not perform automatic baffle-step correction, port/woofer summation, phase/time or impulse alignment, calibration, diffraction simulation, smoothing, room averaging, directivity processing, automatic EQ, crossover optimisation or FIR generation. A merged response is not automatically anechoic or objectively correct. Sparse, irregular or poorly referenced sources can still produce a technically valid but unreliable result, so warnings and provenance remain essential.

Physical DSP apply remains blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback and tolerances, connection-loss invalidation and verified last-known-good rollback. Measurement merge data is ignored by DSP compilation.

## Verification

```sh
npm run test:measurement-alignment
npm run test:measurement-merge
npm run test:measurement-merge-ui
npm run test:measurement-merge-acceptance
npm test
npm run verify
npm run check:syntax
git diff --check
```

## Next recommended slice

**Limiter and Driver Protection Foundation.** Strengthen driver-safety controls before introducing measurement-assisted automatic optimisation.
