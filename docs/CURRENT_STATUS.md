# Current Status

## Current milestone

**M4 — Safe DSP Deployment: Complete Remaining Current-Beocreate Mapping**

Current working branch: `develop`.

## Latest completed slice

The exact Safe Physical DSP Apply v1 blockers were reviewed under a documented non-invasive policy. A guarded capture utility can now issue only the repository-proven current-Beocreate checksum request (`0xf1`) and exact mapped parameter reads (`0x0a`). It requires an explicit host, an acknowledgement for live use and an empty output directory; it performs no discovery. Every read is repeated twice and bounded by request, payload and timeout limits. The path has no generic send API and rejects write, unknown, ambiguous, payload-bearing or mismatched frames before transmission.

The versioned capture stores separate raw and decoded observations, outgoing hashes, response hashes, whole-observation integrity, source/review status, redaction status and transcript counts. The committed fixture is sanitized **repository-backed** evidence only. Its review validates the contract and known identity representation but makes no physical observation and promotes no mapping confidence.

Blocker outcomes:

- `PA-01` fresh identity: narrowed to a repeated compatible-hardware checksum capture plus reconnect recheck.
- `PA-02` routing/crossover/gain/delay/polarity readback: narrowed to reviewed physical values, repeatability, semantic corroboration and per-field tolerances.
- `PA-03` GPIO mute/safe state: retained; no repository-proven read command can confirm physical amplifier state.
- `PA-04` connection-loss invalidation: retained; the capture stops safely but does not prove future deployment integration.
- `PA-05` last-known-good rollback: retained; read-only evidence cannot prove write-side rollback.

Mapping confidence remains **strongly evidenced**, not verified. Readback capture is now constrained and reviewable, but physical readability and tolerances remain unknown. GPIO mute command evidence remains separate from safe-state confirmation. No physical capture was performed.

Deployment Preview adds a keyboard-accessible, semantically labelled provenance disclosure. It states that the reviewed source is repository-backed, physical values/tolerances and write behavior remain unverified, no device identifiers are included and physical Apply remains unavailable.

This slice performed no SigmaTCP connection, write, GPIO command, mute change, DSPToolkit command, preset application, service restart, EEPROM/flash access or audio change.

## Verification

```sh
npm run test:dsp-compilation
npm run test:dsp-readback
npm run test:dsp-deployment-preview
npm run test:sigmatcp-framing
npm run test:dsp-read-queue
npm run test:dsp-reconnect
npm run test:readonly-capture
npm run test:hardware-evidence
npm run test:evidence-review
npm run test:beocreate-mapping
npm run test:dsp-recovery
npm run test:dsp-readiness-acceptance
npm run test:dsp-deployment-accessibility
npm run verify
```

Real-browser journeys cover mapping readiness, named blockers, unavailable readback, identity mismatch, timeout/malformed/stale transport state, recovery guidance, evidence provenance, simulator continuity, absence of physical Apply, keyboard semantics and desktop/tablet/mobile layouts. Automated tests monitor console and page errors.

## Remaining risks

Safe Physical DSP Apply v1 is **not justified**. It remains blocked by physical identity freshness, GPIO mute confirmation, per-operation physical readback/tolerances, safe connection-loss invalidation and a verified last-known-good rollback plan. Safe positive gain, quantized acoustic response, EEPROM persistence and restart recovery also remain unknown.

Sanitized-fixture tests inspect known identity representation, readback decoding, retained safe-state blocker and unchanged mapping confidence. Automated Chromium verifies readiness/provenance text, narrow layout and keyboard disclosure. Manual in-app browser inspection could not run because no browser session was available; no physical hardware verification occurred.

## Next recommended slice

**Parametric EQ Editor v1**. Physical apply remains materially blocked and no dedicated compatible hardware evidence was available. Keep it design/simulator-only and do not weaken the physical-readiness blockers.
