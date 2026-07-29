# Current Status

## Current milestone

**M8 — Channel Gain, Delay and Polarity v1**

Current working branch: `develop`.

## Latest completed slice

Signal Flow now includes design-only per-output gain, delay and polarity controls alongside routing and crossover. The versioned model uses −60 to +6 dB gain, 0–2,000 delay samples at 48 kHz (0–41.666667 ms), and normal/inverted polarity. Delay can be entered as milliseconds, centimetres or metres using 343 m/s at 20 °C; milliseconds remain authoritative persisted data.

The server owns capability limits, conversion, validation, warnings, copy/reset behavior, revision checks and atomic persistence. Backup/restore, last-known-good capture, reconnect conflict handling and browser refresh/restart preserve the values. The UI uses labelled native controls, visible units and equivalent values, semantic disabled buttons, live validation, keyboard-focus preservation and responsive output cards.

Saved values remain explicitly **not deployed**. No legacy `channels.json`, preset, DSP program, SigmaTCP or physical output behavior changes.

## Verification

```sh
npm run test:channel-processing
npm run test:gain-delay-polarity-ui
npm run test:channel-processing-acceptance
npm run test:accessibility-smoke
npm test
npm run check:syntax
npm run verify
git diff --check
```

CI runs the focused channel-processing model and browser journey as named steps on Ubuntu and macOS, then runs the complete verification command.

## Remaining risks

Physical-DSP mapping, gain staging/headroom, audible delay and polarity, restart/application behavior on HiFiBerryOS, and hardware failure recovery remain unverified. The design model intentionally cannot claim that saved values are active. Full keyboard traversal of the legacy global navigation, automated screen-reader output, contrast and visual-regression coverage remain open accessibility work.

## Next recommended slice

Define and characterize the smallest current-Beocreate DSP transport contract for applying and reading back the already-saved routing, crossover and channel-processing design. Do not deploy values until register mappings, safe startup/failure behavior and hardware-in-the-loop questions are explicitly resolved.
