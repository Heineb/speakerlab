# Current Status

## Current milestone

**M4 — Safe DSP Deployment: Complete Remaining Current-Beocreate Mapping**

Current working branch: `develop`.

## Latest completed slice

The current-code SigmaTCP boundary is characterized without physical writes. Requests use TCP `127.0.1.1:8086`, a 14-byte header, commands `0x09/0x0a`, big-endian fields and source-derived golden bytes. The response layout is strongly evidenced by the decoder but has no committed physical capture. The legacy parameter parser does not safely retain split frames or emit coalesced frames.

Reads are positional by address with one effective outstanding request. There are no request IDs, parameter-read/frame/write-acknowledgement timeouts, reconnect invalidation or deployment identity recheck. A missing response stalls the queue. Writes are fire-and-forget socket enqueue attempts; no acknowledgement proves DSP application.

Reconnect waits 2 seconds, retries up to 10 times without backoff and retains ambiguous pending work. XML has a 10-second timeout; DSP Programs owns a separate 5-second checksum timer. The isolated bounded parser/transport simulator adds deterministic split/coalesced/malformed/timeout/disconnect/stale-response behavior for future-contract testing only.

All A–D routing, crossover, attenuation/unity/zero gain, delay and polarity mappings are **strongly evidenced** by XML plus legacy application code, not physically verified. Generic read requests can represent their addresses, but no per-operation physical readback or tolerance is proven. Positive gain remains unsupported.

GPIO 27 mute commands are strongly evidenced, but command success and physical amplifier state cannot be read back. Recovery prerequisites require unknown/partial state to remain muted, prohibit automatic reconnect resume and require a verified prior plan plus complete readback before rollback. Hardware rollback is not implemented.

Deployment Preview now shows mapping confidence, framing/write/readback/mute/recovery readiness, exact blockers and accessible recovery guidance. It handles unknown mapping, unavailable readback, identity mismatch, timeout, malformed response and stale response without a false verified state. No physical Apply control exists.

This slice performs no physical SigmaTCP, GPIO, DSPToolkit, EEPROM, flash or audio change.

## Verification

```sh
npm run test:dsp-compilation
npm run test:dsp-readback
npm run test:dsp-deployment-preview
npm run test:sigmatcp-framing
npm run test:dsp-read-queue
npm run test:dsp-reconnect
npm run test:beocreate-mapping
npm run test:dsp-recovery
npm run test:dsp-readiness-acceptance
npm run test:dsp-deployment-accessibility
npm run verify
```

Real-browser journeys cover mapping readiness, named blockers, unavailable readback, identity mismatch, timeout/malformed/stale transport state, recovery guidance, simulator continuity, absence of physical Apply, keyboard semantics and desktop/tablet/mobile layouts.

## Remaining risks

Safe Physical DSP Apply v1 remains blocked by physical identity freshness, GPIO mute confirmation, per-operation physical readback/tolerances, safe connection-loss invalidation and a verified last-known-good rollback plan. Safe positive gain, quantized acoustic response, EEPROM persistence and restart recovery also remain unknown.

Manual interactive-browser verification remains pending when an attached browser session is unavailable; automated Chromium covers the complete workflow.

## Next recommended slice

**Close Specific Physical-Apply Blockers**: collect non-invasive read-only hardware evidence for fresh identity, GPIO mute confirmation and mapped-parameter readback, then define a verified last-known-good rollback contract. Do not implement physical apply yet.
