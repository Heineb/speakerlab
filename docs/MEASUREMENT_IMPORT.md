# Measurement Import Foundation v1

SpeakerLab imports REW frequency-response text and generic FRD-style frequency/magnitude text with optional phase. Supported authoritative units are hertz, decibels and degrees.

Import is preview-first in **Speaker Design → Measurements**. Detection reports format, confidence, columns, point count, range, phase availability and warnings. Confirmation adds normalized data to the unsaved Speaker Design draft; Save uses the design revision and atomic readback boundary.

Normalization removes a UTF-8 BOM, accepts LF/CRLF, parses locale-independent decimal/scientific notation, normalizes negative zero and sorts ascending. Duplicate points are preserved. No smoothing, interpolation, phase unwrapping, resampling, calibration, truncation or outlier removal occurs.

Limits are 2 MiB input, 20,000 points per file, 24 measurements and 50,000 total points. Binary, ambiguous, partial and non-finite data is rejected. Source paths are never retained.

The Measurements section supports name, notes, explicit type, output association, provenance, phase availability and measured/electrical overlays. Electrical curves use a separate relative scale and are not combined with measured magnitude there. Explicit downstream Assisted EQ, Phase/Time Alignment and Assisted Crossover workflows may reference immutable imported points; none changes the source or deploys to DSP.

Imported measurements may be referenced immutably by a derived merge recipe. Merge operations never replace their normalized points, metadata or integrity hash. See `docs/MEASUREMENT_MERGE.md`.
