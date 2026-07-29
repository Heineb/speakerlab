# Current Status

## Current milestone

**M8 — Crossover Editor Foundation**

Current working branch: `develop`.

## Latest completed slice

Crossover Editor Foundation v1 extends each existing Signal Flow output with zero or one high-pass and zero or one low-pass filter. The nested persisted model is `org.speakerlab.crossover`, version 1; it retains human-readable family, slope, cutoff Hz and enabled state and never saves coefficients or graph points as authority.

Supported filters are Butterworth at 6, 12, 18 and 24 dB/octave and Linkwitz–Riley at the mathematically defined 12 and 24 dB/octave alignments. The 48 kHz design capability comes from the shipped current Beocreate universal DSP metadata. Cutoffs are limited to 10–20,000 Hz and must remain below Nyquist.

Pure server-side mathematics derives finite digital sections and deterministic logarithmic magnitude responses. The UI presents labelled high-pass/low-pass controls, textual validation, per-output reset/copy, and a responsive SVG labelled **Electrical filter response · Simulated** and **Does not include driver or enclosure response**.

Errors block the complete design save. Warnings cover missing role-appropriate filters, narrow passbands, near-Nyquist cutoffs, configured filters on disabled outputs, unrouted outputs and the not-deployed state. Suggestions never add filters silently and do not guarantee driver safety.

Routing and crossover save together through the existing atomic writer, readback verification and SHA-256 revision conflict protection. Existing routing-v1 files without crossover data remain readable with disabled defaults in memory. Backup, preview, last-known-good, restore and rollback include the nested crossover through `signal-flow.json`.

Local connected/disconnected simulation exposes the 48 kHz capability and server-authoritative preview, but saved filters remain **Not deployed to DSP**. Legacy `equaliser.json`, speaker presets, DSP programs and SigmaTCP are unchanged.

## Verification

```sh
npm run test:crossover-model
npm run test:crossover-response
npm run test:crossover-ui
npm run test:signal-flow
npm run test:channel-routing
npm run test:routing-contract
npm run test:routing-ui
npm run test:configuration-backup
npm run test:configuration-restore
npm run test:websocket-contract
npm run test:local-server
npm test
npm run verify
```

Automated coverage includes filter mathematics with numeric tolerances, validation/warnings, deterministic serialization, atomic save/readback/rollback, revision conflicts, WebSocket preview/copy/reset/save, UI draft states, responsive rendering contracts, backup/restore and isolated-server persistence.

Manual browser click-through, visual wide/narrow viewport inspection, HiFiBerryOS execution and physical hardware behavior remain unverified.

## Known limitations

* The response is electrical only; it excludes driver, enclosure, impedance, directivity and acoustic summation.
* There is no live DSP compilation or deployment, audible output, limiter/protection validation or hardware readback.
* Linkwitz–Riley is limited to valid order 2 and 4 implementations; Bessel, parametric, shelf, notch, all-pass, FIR and arbitrary filter stacks are absent.
* The 48 kHz capability is evidenced by the shipped universal DSP program and must be verified against any deployed program before future activation.
* Existing legacy equaliser and speaker-preset crossover content is not imported or migrated.

## Next recommended slice

**Channel Gain, Delay and Polarity v1**: extend the same saved-design boundary with validated, simulator-first per-output adjustments while keeping real DSP deployment separate.

## Deferred

Safe DSP design compilation/deployment, SigmaTCP changes, hardware readback, measurement import, optimisation, Electron, future hardware and unrestricted graphs remain separate work.
