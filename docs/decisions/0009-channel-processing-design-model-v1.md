# ADR 0009: Channel Processing Design Model v1

- Status: Accepted
- Date: 2026-07-29
- Milestone: M8 – Channel Gain, Delay and Polarity

## Context

The legacy `channels` extension stores `level`, delay in milliseconds and `invert`, then immediately translates them to DSP gain, delay samples and polarity registers. Reusing that live path would couple a design editor to physical audio behavior before safe deployment and read-back contracts exist.

The shipped `beocreate-universal-10.xml` declares 48,000 Hz and 2,000-sample delay blocks for outputs A–D. It does not establish a safe positive-gain product limit, so v1 uses a conservative explicit design range.

## Decision

The existing `org.speakerlab.signal-flow` version 1 document gains nested `org.speakerlab.channel-processing`, version 1 data for outputs A–D:

- gain: −60 to +6 dB;
- delay: 0 to 2,000 samples at 48 kHz, persisted as 0–41.666667 ms; and
- polarity: normal or inverted, persisted as a boolean.

The server owns limits, normalization, conversion, validation, warnings and canonical serialization. Samples use nearest-integer rounding. Distance is a UI convenience using 343 m/s at 20 °C; milliseconds remain authoritative so changing display units cannot change stored meaning.

Neutral defaults are 0 dB, 0 ms and normal polarity. Missing nested data in an existing routing-v1 file is accepted as neutral in memory and is written only on deliberate save. Copy and reset affect drafts. Routing, crossover and processing share one revision and atomic save.

Warnings identify positive gain/headroom risk, very low level, long or sample-rounded delay, polarity/gain/delay mismatches between stereo peers, disabled or unrouted outputs, and the fact that saved values are not deployed. Structural, type, range and version errors block Save.

## Consequences

Configuration backup, restore, last-known-good capture and reconnect conflict handling include the values through `signal-flow.json` without changing backup schema v1. The browser provides labelled native controls, explicit units/equivalents, responsive layout and live validation.

This decision changes design and simulator-facing state only. It does not read or write `channels.json`, speaker/sound presets, DSP registers or the DSP program, and it makes no claim about audible output. Positive gain is permitted only as a warned design value; physical deployment needs separate headroom and protection evidence.

## Rejected alternatives

- Reusing the legacy `channels` storage and handlers: rejected because they can affect live hardware and presets.
- Persisting samples or distance as additional authorities: rejected because multiple authorities can drift.
- Inferring range from arbitrary DSP multiplier capacity: rejected because representable values are not evidence of product-safe headroom.
- Adding a generic channel-processing or future-hardware abstraction: rejected because only current Beocreate evidence is in scope.
