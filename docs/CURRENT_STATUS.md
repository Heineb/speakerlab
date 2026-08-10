# Current Status

## Current milestone

**M9 — Measurement Import Foundation**

Current working branch: `develop`.

## Latest completed slice

Measurement Import Foundation v1 adds preview-first, server-authoritative REW text and generic FRD import with frequency in hertz, magnitude in decibels and optional phase in degrees. Parsing handles comments and headings, BOM, LF/CRLF, whitespace, tab or unambiguous comma delimiters, scientific notation, descending rows and exact duplicate frequencies. Normalization only sorts ascending and normalizes negative zero; it never smooths, interpolates, unwraps, resamples, calibrates or removes source points.

The versioned model stores bounded normalized points, stable content-derived IDs, names, notes, explicit measurement type, safe source basename, import date, units, output/driver-role association, provenance, warnings and SHA-256 integrity. Limits are 2 MiB per upload, 20,000 rows, 24 measurements and 50,000 total points. Measurements remain in the complete atomic and revisioned `signal-flow.json`, so backup/restore includes metadata and points with measurement and backup integrity verification, preview, rollback and stale-draft conflict protection.

The accessible Measurements section imports without drag-and-drop, exposes textual detection, errors, warnings and phase availability, supports multiple assigned or unassigned measurements, metadata editing and confirmed removal, and provides responsive measured/electrical overlays. Electrical crossover, EQ and combined-processing curves use a separate relative scale and are not added to measured magnitude or presented as an acoustic prediction. Focused model, storage, client-contract and real-browser REW, no-phase FRD, malformed-file and narrow-layout journeys monitor browser errors.

## Remaining risks and limitations

CSV column mapping, impedance, microphone calibration, impulses, display smoothing, gating edits, nearfield/farfield merge, directivity, automatic EQ or optimisation and room correction are absent. Absolute acoustic and electrical reference alignment is undefined, so overlays are visual evidence only.

Physical DSP apply remains blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback and tolerances, connection-loss invalidation and verified last-known-good rollback. Physical hardware and audible behaviour were not tested.

## Verification

```sh
npm run test:measurement-import
npm run test:measurement-storage
npm run test:measurement-ui
npm run test:measurement-acceptance
npm test
npm run verify
npm run check:syntax
git diff --check
```

## Next recommended slice

**Measurement Alignment and Nearfield/Farfield Merge Foundation.** Define explicit reference, phase/time alignment and controlled merge rules before any measurement-assisted optimisation.
