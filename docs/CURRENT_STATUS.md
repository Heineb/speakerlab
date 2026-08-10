# Current Status

## Current milestone

**M11 — Limiter and Driver Protection Foundation**

Current working branch: `develop`.

## Latest completed slice

Limiter and Driver Protection Foundation v1 adds a versioned per-output design model for driver ratings, amplifier voltage assumptions and a peak-voltage limiter. It provides deterministic conversions between power, RMS voltage and peak voltage, applies an explicit safety margin, and reports the limiting factor plus conservative EQ, crossover, channel-gain and net-headroom summaries.

The per-output workflow uses progressive disclosure and explicit units for driver, amplifier and limiter settings. It validates electrical and timing ranges before atomic persistence, preserves unsaved drafts across disconnects, detects revision conflicts, participates in backup/restore and exposes warnings for incomplete ratings, amplifier conflicts, boost and unsafe crossover context. The interface does not claim that configured values guarantee driver safety.

A deterministic level-envelope simulator demonstrates threshold crossing, attack, release and gain reduction from synthetic dBFS sequences without producing audio. The compiler includes protection as a simulator-only operation when an amplifier peak-voltage reference is available, and simulated readback can match or expose a mismatch. The existing source `volume-limit` feature is documented as distinct from per-output driver protection.

Repository and current DSP-program evidence does not identify a verified per-output limiter register, voltage-to-DSP conversion, attack/release mapping or readable applied state. Physical limiter writes remain prohibited, the deployment readiness matrix marks this mapping unknown or unavailable, and physical DSP apply remains blocked.

## Verification

```sh
npm run test:driver-protection
npm run test:protection-ui
npm run test:configuration-backup
npm run test:configuration-restore
npm run test:beocreate-mapping
npm run test:dsp-compilation
npm run test:dsp-readback
npm run test:dsp-deployment-preview
npm run test:routing-contract
npm run test:routing-ui
npm run test:protection-acceptance
npm run verify
git diff --check
```

The focused model, integration, UI-state, persistence, mapping, compiler, readback, deployment and routing suites pass. All 12 driver-protection browser journeys pass, including refresh/restart persistence, combined headroom, invalid input, warning states, simulation, backup/restore, stale drafts, disconnect/reconnect, keyboard operation, semantics and responsive layouts.

The final complete `npm run verify` passes all Node suites, the 228-file JavaScript syntax sweep and all 50 hardware-free Chromium journeys. Chromium requires execution outside the restricted macOS sandbox on this development machine. The latest checked remote `develop` GitHub Actions run before these local changes passed both Ubuntu and macOS verification; the new local commits have not yet run in CI.

## Active work

No implementation work is active. The completed local slice is ready for review and push by the user.

## Known blockers and risks

Physical DSP apply remains blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback and tolerances, connection-loss invalidation and verified last-known-good rollback. Driver protection adds the further blockers of unknown limiter mapping, unknown voltage normalization and unavailable applied limiter readback.

V1 calculations assume the entered impedance and power/voltage ratings are suitable engineering inputs. They do not model impedance versus frequency, thermal state, excursion, crest factor, enclosure loading, amplifier clipping, supply variation or driver-specific programme ratings. The simulator is a deterministic first-order level envelope, not an audio processor or proof of physical protection.

## Next recommended slice

**Measurement-Assisted EQ Suggestions v1.** Build bounded, reviewable suggestions on the mature measurement, merge and parametric-EQ models while keeping every proposal explicit, reversible and simulator-only.

## Deferred work

Protection-model refinement, hardware-backed limiter mapping and physical deployment stay deferred until reliable current-Beocreate evidence and safe readback/rollback prerequisites exist. Automatic crossover optimisation, FIR generation, room correction and speculative hardware abstractions also remain outside the next slice.
