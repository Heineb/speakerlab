# Current Status

## Current milestone

**M4 — Safe DSP Deployment: Design Compilation Foundation**

Current working branch: `develop`.

## Latest completed slice

SpeakerLab can compile a saved routing/crossover/gain/delay/polarity design into deterministic `org.speakerlab.dsp-compilation` version 1 operations for the repository-shipped Beocreate Universal v10 program. Identity requires the verified program ID, profile version and checksum; unknown, incompatible or unavailable metadata fails closed.

Mappings now cover A–D route selectors, 16 signed-5.23 biquads per output, attenuation/unity/zero gain, 0–2,000 whole-sample delay and dedicated polarity parameters. Positive gain, missing tweeter protection, unknown mappings and stale revisions block preparation. Unused filter slots compile flat.

Deployment Preview shows target identity, errors/warnings, proposed operations, per-output requested/compiled/readback values and `matched`, `different`, `unsupported` or `unknown` state. Simulator application starts muted, supports readback/mismatch/partial-state testing and unmutes only after complete matching comparison. Browser refresh retains process-local simulator state; server restart clears it.

This is **prepared and simulated only**. No SigmaTCP, DSPToolkit, GPIO, EEPROM, flash or physical DSP write occurs.

## Verification

```sh
npm run test:dsp-compilation
npm run test:dsp-readback
npm run test:dsp-deployment-preview
npm run test:dsp-compilation-acceptance
npm run test:dsp-deployment-accessibility
npm run verify
```

Real-browser journeys cover complete compilation, unsupported mapping, simulator apply/readback/match, injected mismatch, stale compilation, reconnect/restart policy, narrow responsive layout, keyboard order and semantic target/status/per-output groups.

## Remaining risks

Physical GPIO mute confirmation, physical program-identity timing, SigmaTCP readback reliability/tolerances, connection-loss rollback, safe positive gain, quantized physical response, EEPROM persistence and restart recovery remain unknown. These safety-critical gaps block physical deployment.

Manual interactive-browser verification remains pending when an attached browser session is unavailable; automated Chromium covers the complete workflow.

## Next recommended slice

**Complete Remaining Current-Beocreate Mapping**: characterize SigmaTCP framing/read queues/reconnect limits, GPIO mute confirmation, physical identity freshness, readback tolerances and rollback prerequisites. Do not begin Safe Physical DSP Apply until every safety-critical mapping is verified.
