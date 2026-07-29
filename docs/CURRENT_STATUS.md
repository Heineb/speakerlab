# Current Status

## Current milestone

**M2 — incremental server runtime and dependency modernisation**

Current working branch: `develop`.

## Latest completed slice

The Beocreate server-owned dependency foundation now has a reproducible npm 11.6.2 lockfile and a verified Node.js 24 isolated-development baseline.

The first controlled pure-JavaScript wave upgrades EventEmitter3 to 5.0.4, Express within major 4 to 4.22.2 and Underscore to 1.13.8. `aplay` and all platform-, discovery-, DSP- and Electron-sensitive packages remain unchanged. Production source and runtime behavior did not require a compatibility patch.

On Apple Silicon, clean `npm ci` installs 71 packages without native compilation or lifecycle install scripts. The server-owned audit changed from eight findings to zero. This is not a security claim for the complete application or HiFiBerryOS image.

## Verification

```sh
npm ci --prefix Beocreate2/beo-system
npm run verify
npm audit --prefix Beocreate2/beo-system
git diff --check
```

The complete isolated suite covers UI loading, WebSocket connection/routing/initial state, extension loading, settings and atomic persistence, configuration backup/restore, connected and disconnected current-Beocreate DSP simulation, repeated startup and graceful shutdown. CI performs the clean install and suite on Node.js 24 across Ubuntu and macOS.

## Known gaps and risks

* The production HiFiBerryOS `/usr/bin/node` version remains unknown; Node.js 24 is a supported development runtime, not an appliance claim.
* Production still relies on globally supplied legacy `websocket` and `dnssd2` modules.
* `aplay`, hardware-dependent extensions, Linux services, GPIO and networking packages remain outside this wave.
* SigmaTCP framing, real DSP read queues/reconnect limits, GPIO mute safety, deployment rollback and audible behavior remain unverified without protocol-peer or physical-hardware work.
* Beocreate Connect and Electron installation remain separate and blocked by obsolete native dependencies on Apple Silicon.

## Next recommended slice

Characterize the real SigmaTCP framing, read queue and reconnect limit with golden fixtures before changing that transport. Keep it current-Beocreate-specific and separate from server package upgrades.

## Deferred

Express 5, production-global dependency modernization, `aplay`, Electron, future hardware and the root `README.md` update remain separate tasks.
