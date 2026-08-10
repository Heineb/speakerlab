# Current Status

## Current milestone

**M11A — Measurement-Assisted EQ Suggestions**

Current working branch: `develop`.

## Latest completed slice

Measurement-Assisted EQ Suggestions v1 adds a contextual `Suggest EQ` workflow inside each output's existing Parametric EQ region. It analyses one eligible assigned imported or derived magnitude response against an explicit Flat or Gentle downward tilt target and returns a deliberately small human-reviewed list of peaking-EQ corrections. It is assisted EQ, not automatic room correction, and never claims guaranteed audible improvement.

Algorithm `speakerlab-assisted-eq-v1` interpolates without extrapolation onto a deterministic 121-point logarithmic grid. Analysis uses 1/6-octave raised-cosine smoothing by default; none, 1/12, 1/6 and 1/3 octave are available under `Advanced`, while raw measurement points remain unchanged. The target reference defaults to median current estimated level, and Gentle downward tilt defaults to −1 dB/octave referenced to 1 kHz.

The active optimisation range is always visible and is conservatively intersected with measurement coverage, output role and configured crossover. Candidate centres avoid a derived nearfield/farfield merge transition. The engine detects broad significant error, prefers cuts, proposes peaking filters only, defaults to at most five filters and +3 dB boost, bounds Q to 0.35–4.5 and cut to −6 dB, and retains candidates only for a meaningful objective improvement. The objective combines mean squared target error with filter-count, high-Q and squared positive-boost penalties. Deep narrow cancellations are identified and not filled aggressively.

Existing enabled PEQ is considered by default and is never deleted or rewritten. `Advanced` can analyse without it and can narrow the range, set reference/tilt and choose bounded smoothing, filter-count and boost limits. Numerical objective and algorithm details stay out of the primary workflow.

Every suggestion explains frequency, gain, reason, confidence, expected local improvement and headroom consequence. Positive boost, existing boost, high Q and configured Driver Protection produce textual voltage-demand/headroom warnings without changing channel gain, crossover, limiter or protection. The prediction distinctly labels Measured, Target, Current estimated response and Predicted with suggestions; prediction is simulated magnitude plus electrical PEQ, not a measurement.

Suggestions are transient drafts. Reject changes nothing. Accepting selected items creates ordinary standard-ID Parametric EQ bands only after source-hash, unchanged-draft and saved-revision checks; normal validation and band capacity apply. The complete accepted set can be undone before Save, and ordinary Discard remains available. Normal Save is required for persistence, after which existing atomic readback, backup and restore apply. Measurements and rejected suggestions are never modified or persisted.

The default UI adds no navigation, dashboard or permanent optimiser panel. The compact primary flow contains reference measurement, target, active range, Suggest EQ, prediction and a short selectable list. Eleven real-browser journeys cover basic accept/save/refresh, reject and measurement immutability, existing EQ, null restraint, protection/headroom, crossover awareness, stale/recomputed merge, Advanced disclosure, keyboard-only use, semantic status and desktop/tablet/mobile layouts. Labels, selected state, warning text, graph summary and explicit expanded state do not depend on colour.

## Verification

```sh
npm run test:eq-suggestions
npm run test:eq-suggestion-ui
npm run test:eq-suggestion-acceptance
npm run test:local-server
npm run verify
npm run check:syntax
git diff --check
```

Focused numerical, smoothing, target, eligibility, candidate/objective, validation, noisy-response, acceptance, service/API, UI-state, simplicity, headroom/protection and local-server suites pass. All 11 new Assisted EQ Chromium journeys pass. The final complete `npm run verify` passes every Node suite, the 233-file JavaScript syntax sweep and all 61 hardware-free Chromium journeys in 10.8 minutes.

Chromium and loopback server checks require execution outside the restricted macOS sandbox on this machine. A separate manual in-app-browser pass was unavailable because the session exposed no browser backend; equivalent states are covered by the monitored real-browser journeys with trace, screenshot, video and logs on failure.

The latest remote `develop` GitHub Actions run before this local slice (`31424756380`) passes verification on Ubuntu and macOS. These new local commits have not been pushed or run in CI.

## Active work

No implementation work is active. The verified local slice is ready for review and push by the user.

## Known blockers and risks

Results depend on measurement calibration, conditions, gating, placement, source type and the assumption that measured magnitude can be combined with simulated electrical PEQ. V1 does not model phase/time, impulse response, directivity, room behavior, enclosure behavior, excursion, thermal state or audibility. A flat numerical target is not automatically the right acoustic target.

Only peaking filters are suggested. Source eligibility and simple noise/null heuristics are conservative but cannot identify every invalid acoustic condition. Derived merge transitions are avoided as candidate centres, but a merged magnitude remains phase-free. Positive correction consumes estimated headroom despite its bounded penalty and warnings.

Physical DSP apply remains blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback/tolerances, connection-loss invalidation, verified last-known-good rollback and unknown limiter mapping/readback. Assisted EQ adds no physical Apply action and performs no DSP write.

## Next recommended slice

**Measurement Phase/Time Alignment Foundation.** Establish trustworthy relative timing and phase context before measurement-assisted acoustic crossover integration.

## Deferred work

Automatic room correction, arbitrary target editing, shelves, all-pass/FIR suggestions, crossover or limiter changes, multi-measurement optimisation and automatic gain compensation remain excluded. Assisted Crossover Design should wait for the recommended phase/time foundation. Hardware-backed limiter mapping and write-side safety remain deferred until dedicated current-Beocreate test hardware and safe evidence are available.
