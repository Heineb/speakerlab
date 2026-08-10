# Measurement Phase/Time Alignment Foundation v1

SpeakerLab can compare two phase-bearing measurements assigned to different outputs around their configured crossover. Open **Align drivers** directly below Crossover on either output. The feature proposes one bounded delay and polarity change; it never changes the draft until **Apply suggestion**, never saves automatically and has no physical DSP write path.

## Measurement requirements

Both measurements need at least 12 valid magnitude-and-phase points, usable overlap around an enabled crossover, known output assignments and unchanged source integrity. Imported REW text or FRD observations are supported. Magnitude-only derived merges cannot be aligned. An intact but stale merge is also blocked.

Timing references are explicit metadata, not inferred from filenames or phase shape:

- **Shared absolute reference** requires the same non-empty reference group on both measurements.
- **Shared relative phase reference** requires the same non-empty group and supports only a relative phase-derived result; it is not an acoustic-centre or absolute-flight-time claim.
- **Independent** or **Unknown** references, and mismatched groups, block analysis.

SpeakerLab cannot verify a user-entered reference label. Measurements should come from a capture method whose timing relationship is known and preserved. In-room data, narrow overlap, discontinuous phase and strong high-Q crossover-region EQ produce visible caution rather than hidden assumptions.

## Analysis and prediction

Algorithm `speakerlab-phase-alignment-v1` uses a deterministic 81-point logarithmic grid within the measurement overlap and normally within 1.5 octaves around the crossover centre. Advanced controls may only narrow that range.

Wrapped source phase is copied and unwrapped with shortest continuous ±180° steps; stored source points remain unchanged. A robust median pairwise phase-slope fit estimates relative delay from multiple frequencies. Inconsistent fits are blocked below the quality threshold. The result includes residual phase, confidence and a 48 kHz sample equivalent under **Advanced**.

Complex summation includes current crossover, Parametric EQ, gain, delay and polarity for both outputs. The preview names both sources, current predicted sum and predicted sum after the suggestion. Normal and inverted target polarity are compared; the stronger mean crossover-region prediction becomes the one recommendation. Near-equal alternatives are labelled ambiguous. This is a mathematical prediction from measurements and electrical processing, not a new measurement, audible guarantee or driver-safety conclusion.

The recommendation delays the currently earlier output and never creates negative delay. The resulting ordinary output delay must fit the current 2,000-sample capability. Existing delay is included once, so acceptance writes the shown resulting value rather than adding it again.

## Accept, undo and persistence

**Apply suggestion to _output_** converts the result to that output's ordinary `channelProcessing.delay.valueMs` and `polarity.inverted` draft fields. Source hashes, saved revision and the complete draft must still match the analysis. Any open Assisted EQ result is cleared because its processing context changed.

Apply remains unsaved. **Undo accepted alignment** restores the previous draft before Save; ordinary **Discard** also remains available. After Save, refresh/restart, atomic readback and backup/restore use the existing design path. No alignment analysis or suggestion object is persisted.

Physical DSP deployment remains blocked by the documented write-side safety prerequisites. Simulator results and saved configuration are not evidence that a physical loudspeaker changed.
