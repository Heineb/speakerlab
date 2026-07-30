# Current Status

## Current milestone

**M8 — Crossover and Parametric Equalisation Editors**

Current working branch: `develop`.

## Latest completed slice

Parametric EQ Editor v1 extends every Signal Flow output with peaking EQ, low-shelf and high-shelf bands. The versioned design stores stable band IDs, enabled/bypassed state, type, frequency, gain, Q or explicitly labelled RBJ shelf slope S, and an optional label. It does not migrate or overwrite legacy `equaliser.json` or speaker-preset EQ.

Capabilities are 48 kHz, 10–20,000 Hz, −12 to +12 dB, peaking Q 0.1–10, shelf S 0.1–1 and at most 12 bands per output. The conservative limit reserves four sections of the repository-evidenced 16-section current-Beocreate bank for crossover filters. Pure RBJ calculations produce normalized finite/stable biquads; the compiler converts enabled bands to the legacy `[b2,b1,b0,-a2,-a1]` ordering and signed 5.23 target words.

The UI supports add, select, edit, bypass, duplicate, remove, reorder, reset, copy and responsive keyboard-accessible editing. Its logarithmic graph shows EQ contribution and combined crossover + EQ electrical response. Text reports an estimated maximum EQ boost plus channel gain and explicitly excludes driver, enclosure, room, acoustic summation and clipping/driver-protection guarantees.

EQ is part of complete atomic `signal-flow.json` persistence, optimistic revision conflicts, backup/restore, rollback and readback verification. Deployment Preview compiles tagged EQ operations, applies only to the simulator and compares quantized readback by stable band ID. No physical Apply control or SigmaTCP write path was added.

Automated coverage includes filter mathematics, ranges, model operations, validation/warnings, UI state and semantics, compiler quantization, persistence through the existing complete-design boundary, and real-browser desktop/tablet/mobile journeys with console/page-error monitoring.

## Remaining risks and limitations

Current-Beocreate EQ addresses, coefficient order and capacity remain **strongly evidenced, not physically verified**. Physical Apply is blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback/tolerances, safe connection-loss invalidation and verified last-known-good rollback. No automated test predicts acoustics, clipping, excursion or driver safety.

The v1 editor has no FIR, all-pass, graphic/dynamic EQ, limiter, measurement import or automatic optimization. Legacy preset EQ remains a separate live-hardware subsystem. Physical hardware, audible behavior, EEPROM persistence and restart recovery were not tested.

## Verification

```sh
npm run test:parametric-eq
npm run test:eq-response
npm run test:eq-ui
npm run test:eq-acceptance
npm test
npm run verify
npm run check:syntax
git diff --check
```

## Next recommended slice

**Measurement Import Foundation.** Continue simulator-first product development; do not recommend Safe Physical DSP Apply until every write-side blocker is verified on suitable non-critical current-Beocreate hardware.
