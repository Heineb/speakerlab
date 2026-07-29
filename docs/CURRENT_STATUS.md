# Current Status

## Current milestone

**M7 — Signal-flow and channel-routing editor**

Current working branch: `develop`.

## Latest completed slice

Signal Flow and Channel Routing Editor v1 adds a responsive design screen under Sound adjustments for the current Beocreate platform.

The `org.speakerlab.signal-flow` version 1 model exposes Left, Right and Mono logical inputs and four outputs, A through D. Each output has a custom driver label, role, side/position, enabled state and at most one input. The conservative default leaves every output disabled, unrouted and unassigned.

Validation blocks malformed versions, identifiers, roles, availability and connections. Warnings cover unrouted/unassigned outputs, side mismatches, repeated roles, enabled tweeters without future protection and all outputs disabled. These checks do not provide crossover, limiter or acoustic safety.

The server owns capabilities, validation, persistence and SHA-256 content revisions. Saves reject stale revisions, atomically replace `signal-flow.json`, read back and revalidate before success, and attempt rollback after verification failure. The UI keeps unsaved drafts in memory through disconnection or conflict.

The saved design is included in configuration backup, preview, last-known-good capture, restore and rollback. Invalid or unsupported routing is rejected before export/restore. Connected/disconnected simulation is visible, but the design is always labelled **Not deployed to DSP**.

## Verification

```sh
npm run test:signal-flow
npm run test:channel-routing
npm run test:routing-contract
npm run test:routing-ui
npm run test:configuration-backup
npm run test:configuration-restore
npm run test:local-server
npm run verify
```

Automated tests cover model examples and failures, deterministic serialization, atomic/readback persistence, rollback, revision conflicts, WebSocket messages, UI state, narrow card layout, backup/restore and real isolated-server save/reload in both DSP simulation states.

The local server and assembled page were verified. Interactive browser click-through and visual viewport inspection were not available in this session; responsive and workflow behavior is covered by the current state/markup/CSS contracts.

## Known limitations

* Saving does not alter live `channels.json`, apply a speaker preset or deploy routing to the DSP.
* There is no crossover, limiter, gain, delay, polarity, summing, free-form graph or multi-device coordination.
* Mono reflects the existing Beocreate mono role; v1 does not expose stereo-to-mono summing controls.
* Other restored legacy extension settings may still require restart even though Signal Flow rereads its own restored file on the next state request.
* Production HiFiBerryOS runtime and physical hardware behavior remain unverified.

## Next recommended slice

**Crossover Editor Foundation**: add a versioned filter-stage design to each routed output, remain simulator-first, and preserve the explicit distinction between saved design and deployed DSP state.

## Deferred

Safe DSP routing deployment, SigmaTCP transport changes, hardware readback, Electron, future hardware and unrestricted routing remain separate work.
