# ADR 0008: Crossover Design Model v1

- Status: Accepted
- Date: 2026-07-29
- Milestone: M8 – Crossover Editor Foundation

## Context

The legacy `equaliser` extension stores high-pass and low-pass filters in `equaliser.json` and speaker presets as arrays of DSP-bank filters. It recognizes `BW2`, `BW4` and `LR4`, derives Q values in the browser, calculates second-order coefficients with `beocreate_essentials/dsp.js`, and writes them immediately to metadata-defined DSP registers.

That representation is coupled to live filter-bank capacity, UI grouping identifiers and DSP application. Reusing or migrating it would risk changing current audio and speaker-preset behavior. SpeakerLab instead needs a design-only crossover that remains coherent with the versioned signal-flow model, atomic persistence and revision conflicts.

The shipped current-platform DSP program `Beocreate2/beo-dsp-programs/beocreate-universal-10.xml` declares a 48,000 Hz sample rate. The design capability uses that evidence; it does not claim that every historical DSP program has the same rate.

## Decision

`signal-flow.json` retains routing format `org.speakerlab.signal-flow`, version 1, and gains a top-level `crossover` value with format `org.speakerlab.crossover`, version 1.

The crossover value records:

- `sampleRateHz`;
- one entry for each existing `output-a` through `output-d`;
- zero or one enabled high-pass and zero or one enabled low-pass per output; and
- for each filter, family, displayed slope in dB/octave and cutoff in Hz.

No coefficient, graph point or browser state is authoritative persisted data. Missing crossover data in an existing routing-v1 file is accepted as the conservative disabled-filter default and is included only when the design is next deliberately saved. Existing `equaliser.json` and speaker presets are neither read nor rewritten.

The supported alignments are:

- Butterworth orders 1–4: 6, 12, 18 and 24 dB/octave;
- Linkwitz–Riley order 2: 12 dB/octave, constructed as two cascaded first-order Butterworth sections; and
- Linkwitz–Riley order 4: 24 dB/octave, constructed as two cascaded second-order Butterworth sections.

Butterworth sections use bilinear-transform digital first-order sections and normalized RBJ-style second-order sections with Butterworth pole Q values. Linkwitz–Riley responses are therefore −6.0206 dB at cutoff. Matching order-2 low/high responses differ by 180 degrees; matching order-4 responses are in phase. The preview cascades complex section responses and clamps display magnitude only at −120 dB.

The application range is 10–20,000 Hz and every cutoff must also remain below Nyquist. The server validates the complete routing and crossover design, calculates finite coefficients and a finite response before atomic save, then reads back and revalidates. Copy and per-output reset operate on the browser draft; the existing revision check still governs the eventual complete-design save.

The UI uses labelled ordinary controls and a lightweight accessible SVG. It is explicitly an electrical, simulated response and excludes driver, enclosure, directivity, impedance and acoustic summation.

## Consequences

Routing and crossover cannot be persisted inconsistently. Existing backup, preview, last-known-good, restore and rollback behavior includes the crossover because it is nested in the already-covered `signal-flow.json`.

The feature improves design and simulation but does not compile or deploy filters to SigmaDSP, alter the DSP program or provide driver protection. The 48 kHz capability must be revisited before safe deployment against a different DSP program.

Linkwitz–Riley 18 dB/octave is deliberately unsupported. Bessel, arbitrary biquads, parametric filters, all-pass, FIR, limiters and acoustic prediction remain outside v1.

## Rejected alternatives

- Reusing legacy `equaliser.json`: rejected because it is a live hardware-control format with filter-bank and preset compatibility behavior.
- Saving derived coefficients: rejected because coefficients hide design intent and are sample-rate-specific.
- Calculating only in the browser: rejected because validation, persistence and preview authority belong to the server.
- Adding a charting or DSP dependency: rejected because the required deterministic math and accessible SVG are small and covered by numeric tests.
- Treating arbitrary cascaded Butterworth sections as Linkwitz–Riley: rejected; only the defined order-2 and order-4 constructions are exposed.
