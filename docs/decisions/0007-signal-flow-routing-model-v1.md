# ADR 0007: Signal Flow and Channel Routing Model v1

- Status: Accepted
- Date: 2026-07-29
- Milestone: M7 – Signal-flow and Channel-routing Editor

## Context

The legacy `channels` extension directly applies roles, mute, gain, delay and polarity to DSP metadata parameters. Its settings identify four outputs as `a` through `d` and use `left`, `right` and `mono` source roles. Speaker presets store the same channel letters and roles. Those structures mix current hardware control with loudspeaker design and do not provide versioning, optimistic concurrency or a distinction between a saved design and deployed DSP state.

SpeakerLab needs an approachable design boundary before crossover or safe DSP deployment work. Version 1 must be useful locally without changing the real transport, current preset formats or audible behavior.

## Decision

The `signal-flow` extension owns a separate versioned configuration at `<beo.dataDirectory>/signal-flow.json`. Production resolves this to `/etc/beocreate/signal-flow.json`; isolated development keeps it below the selected runtime state directory.

The format identifier is `org.speakerlab.signal-flow`, version 1. It contains:

- the four current Beocreate outputs, with stable `output-a` through `output-d` identifiers and DSP channel letters `a` through `d`;
- user labels, driver roles, side/position and enabled state; and
- zero or one enabled Left, Right or Mono input connection per output.

Driver roles are `unassigned`, `full-range`, `woofer`, `midrange`, `tweeter` and `subwoofer`. Unknown optional properties are accepted during validation but omitted from canonical persistence. Serialization order is fixed and the SHA-256 content revision is derived from that canonical representation.

The default shows all four outputs but disables, unroutes and leaves them unassigned. Existing `channels.json`, speaker presets and live DSP state are not imported or overwritten.

The server validates every complete draft, checks the revision edited by the client, atomically writes, reads back and revalidates before reporting success. A failed write or verification attempts to restore the previous file. Revision conflicts never overwrite the saved configuration.

The existing `{target, header, content?}` WebSocket envelope carries state, capability, validation, save and reset messages. The server remains authoritative. Browser drafts exist only in memory.

Saving never applies the design to production or simulated DSP. Responses and UI status say `not-deployed`; simulated connected/disconnected state is contextual only.

## Consequences

The editor can safely establish loudspeaker intent without changing audio. The normal configuration backup automatically includes `signal-flow.json` as a safe central-settings file, so existing preview, last-known-good capture, atomic restore and rollback cover it.

The v1 model cannot express summing, arbitrary graphs, filters, gain, delay, polarity, limiters or multi-device coordination. A tweeter role produces a warning because v1 provides no protective filter. Validation is structural and advisory; it does not establish acoustic or driver safety.

The service reads the authoritative file for each state request, so reopening or explicitly reloading the screen after restore shows the restored routing. Other restored legacy extension settings can still require application restart.

## Rejected alternatives

- Reusing `channels.json`: rejected because that file drives existing hardware behavior and has no versioned design/deployment distinction.
- A free-form node graph: rejected because four structured output cards express the current v1 need with better narrow-screen and keyboard behavior.
- Multiple sources per output: rejected because safe summing and headroom policy are not established.
- Immediate DSP activation: rejected because real transport verification and rollback are outside this feature.
- A generic hardware capability model: rejected because the current product has four known Beocreate outputs.
