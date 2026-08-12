# Current-Beocreate Read-Only Evidence Format

## Format

The JSON format is `org.speakerlab.beocreate-readonly-evidence`, schema version 1. It records:

- SpeakerLab commit, capture-tool version and UTC timestamp;
- source type and declared current-Beocreate platform;
- the exact planned allowlisted operations;
- every outgoing read frame, decoded intent and SHA-256 hash;
- raw response bytes and SHA-256 hashes;
- decoded observations, warnings and unexpected responses;
- evidence confidence and redaction status;
- an integrity hash over outgoing frames and observations; and
- transcript counts for reads, responses, writes and unknown frames.

Raw observations and decoded interpretations are separate. A capture is evidence, not a mapping promotion. `beocreate-evidence-review.js` produces a separate review conclusion.

## Read-only command policy

The only allowed outgoing commands are:

| Command | Code | Repository proof |
| --- | ---: | --- |
| DSP program checksum request | `0xf1` | `beocreate_essentials/dsp.js` `getChecksum` and `createHifiberryRequest` |
| Exact mapped parameter read | `0x0a` | `beocreate_essentials/dsp.js` `createSigmaReadRequest` and current mapping metadata |

The capture path exposes no generic frame-send or write API. It rejects unknown operations, ambiguous operations, command mismatches, payload-bearing requests and any frame other than an exact 14-byte read header. It limits capture to 64 requests, responses to 1,024 payload bytes, one positional request at a time and a 100–10,000 ms explicit timeout. Each normal observation is repeated twice. Trailing, unsolicited, malformed or mismatched responses stop the capture.

Commands `0x09` and every GPIO, mute, preset, DSPToolkit install/store/reset, EEPROM, flash, service and discovery operation are forbidden.

## Review and promotion

A review checks format/schema, response and whole-observation integrity, zero write/unknown counts, exact identity, repeat agreement and private-data patterns. Repository-backed evidence may validate tooling and decoding but cannot promote physical confidence.

A future physical mapping promotion additionally requires compatible hardware, freshly known identity, deterministic framing/decoding, repeatable observations, repository or metadata corroboration, documented units and tolerances, and no contradiction. The reviewer must record this conclusion separately. Writable-but-unreadable fields remain blocked. Safe-state observation alone cannot prove safe control.

## Redaction

Host/IP addresses are never written to a capture. Hostnames, serial numbers, device identifiers, user-defined product names, credentials, Wi-Fi data and local paths are excluded. Captures containing these values are rejected for committed fixture use. Commit only the smallest sanitized fixture and provenance note needed to reproduce a reviewed conclusion.
