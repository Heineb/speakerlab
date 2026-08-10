# Assisted Crossover Design Foundation v1

SpeakerLab can compare measurements for two supported neighbouring acoustic ways and propose up to three crossover setups. Open **Suggest setup** inside either output's existing **Crossover** section. This is a review aid: generating, selecting or closing suggestions does not change the design.

## Inputs and eligibility

Each measurement must have a valid integrity hash, at least 12 points, a known output assignment and useful overlapping frequency coverage. Supported pairs are subwoofer/woofer, woofer/midrange, woofer/tweeter and midrange/tweeter. Same-output, unrelated-way, corrupt, invalid, stale derived and poorly overlapping sources are blocked.

The candidate region is the intersection of both measurements, current output roles and conservative audio limits. A configured crossover inside that region is retained as the visible baseline and one candidate centre. Current crossover, Parametric EQ, gain, delay and polarity all contribute to the prediction; they are not reset.

## Predictions and ranking

Algorithm `speakerlab-assisted-crossover-v1` evaluates only filter families and slopes already supported by the Crossover Editor: 12 or 24 dB/octave Linkwitz–Riley and 12 dB/octave Butterworth. It uses a deterministic logarithmic grid and ranks candidates by transition smoothness, cancellation, gap, excessive overlap, phase/timing evidence, delay, level mismatch and filter complexity. Near-duplicate candidates are removed and no more than three are shown.

With compatible phase-bearing measurements, the preview uses complex summation and may include a conservative polarity and delay proposal. Timing-reference compatibility is user-declared and cannot be acoustically verified by SpeakerLab, so confidence remains qualified. With missing, derived or incompatible phase/timing information, the feature falls back to magnitude-only power summation. That fallback never claims a complex acoustic sum and never invents polarity or delay.

Driver Protection assumptions add a warning, not a safety conclusion. Crossover attenuation is not guaranteed thermal or excursion protection. The feature never changes EQ, gain, limiter or protection values.

## Accept, undo and Save

Choose one alternative and use **Apply suggestion to _drivers_**. After source-integrity, unchanged-draft and saved-revision checks, the selected low-pass/high-pass and any explicitly shown polarity/delay proposal become ordinary unsaved Crossover and Channel Processing fields. You can edit them normally, undo before Save, discard them or save through the existing atomic configuration path.

Suggestions and analyses are transient and are never backed up or deployed. There is no automatic Save, physical DSP write or physical Apply action. A saved result remains a simulated design until the separate physical deployment blockers are closed.

## Known limits

V1 handles exactly two acoustic ways at a time. It does not perform multi-way or multi-position optimisation, arbitrary target fitting, automatic EQ, gain matching, all-pass/FIR correction, limiter design, excursion modelling or audible verification. Results remain dependent on measurement calibration, gating, placement, timing metadata, phase quality and overlap.
