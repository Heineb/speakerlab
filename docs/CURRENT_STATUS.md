# Current Status

## Current milestone

**M8 — Crossover Editor Foundation**

Current working branch: `develop`.

## Latest completed slice

The local speaker-profile setup path now includes the existing Product Information extension without invoking its deployed Raspberry Pi/HiFiBerryOS identity behavior. Local mode reports the fixed, truthful identity **SpeakerLab Local Simulator** and reads shipped product identities only for named profile previews. It does not rename the host, advertise Bonjour, change the simulator identity after profile application or claim physical DSP deployment.

`product_information` remains owned by `product-information-client.js`. Its client object initializes before messages, is idempotent, retains valid state across reconnect, tolerates optional fields and diagnoses malformed state once per target/header.

Speaker Preset no longer assumes Product Information has already loaded. Out-of-order or absent optional identity state produces a minimal preview with one diagnostic instead of an uncaught `ReferenceError`; invalid previews produce visible feedback.

Automated browser-like and live server tests cover both message orders, setup state arriving first, reconnect, malformed/missing metadata, `Other Speaker`, a named Beovox profile, preview confirmation, selected-state refresh, setup transition, generated script order and continued Signal Flow/Crossover availability.

## Verification

```sh
npm run test:product-information-client
npm run test:client-initialization
npm run test:setup-navigation
npm run test:signal-flow
npm run test:routing-ui
npm run test:crossover-ui
npm run test:websocket-contract
npm run test:websocket-lifecycle
npm run test:websocket-client
npm run test:local-server
npm test
npm run verify
npm run check:syntax
git diff --check
```

Focused product-information, client-initialization, connected/disconnected local-server and complete repository verification passes.

## Known limitations

* Manual clean-browser click-through remains unverified because no controllable browser session was available. Connected local startup and clean shutdown were verified.
* The browser-like harness does not validate layout, pointer behavior or rendering.
* Local profile application persists simulated configuration but never deploys it to physical DSP hardware.
* Production HiFiBerryOS and physical hardware behavior remain unverified.

## Next recommended slice

Run the documented connected/disconnected clean-browser setup, named/Other Speaker preview, refresh, Signal Flow and Crossover smoke path when a browser session is available. Do not continue feature development until that manual lifecycle gap has been reviewed.
