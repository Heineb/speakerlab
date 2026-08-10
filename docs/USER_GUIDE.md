# SpeakerLab User Guide

SpeakerLab keeps the normal loudspeaker-design workflow in **Signal Flow**. Changes remain drafts until **Save**. Saved means stored and verified in configuration; it does not mean physically deployed.

## Create a speaker design

1. Complete setup with a matching speaker preset or **Other Speaker**.
2. Open **Signal Flow**.
3. Enable an output, give it a useful driver name, choose its role and side, and route an input.
4. Repeat for the remaining drivers, then save when validation has no errors.

## Configure processing

- Set each driver’s high-pass and low-pass in **Crossover**. The graph is an electrical preview, not measured acoustic output.
- Set channel gain, delay in milliseconds and Normal/Inverted polarity in **Channel Processing**.
- Add ordinary peaking or shelf bands in **Parametric EQ**. Watch textual headroom warnings and use reset only deliberately.

## Work with measurements

1. In **Measurements**, select an REW text or FRD file and inspect the detected columns, units, range and phase availability.
2. Add a name, measurement type and output assignment, then import it into the draft.
3. Save to persist it. Imported source points are never smoothed or corrected automatically.

For nearfield/farfield work, choose **Merge Measurements**, inspect overlap and the suggested level offset, deliberately adopt or edit it, preview the transition, and save the derived magnitude response. Merged responses contain no derived phase and cannot support phase/time alignment.

## Align drivers around a crossover

1. Import phase-bearing measurements for two different outputs and assign an honest **Timing reference** and shared **Reference group** to each.
2. Configure their crossover, then open **Align drivers** directly below Crossover on either output.
3. Confirm both sources and the automatic crossover region, then choose **Analyse alignment**.
4. Review the proposed resulting delay, polarity, confidence, cautions and predicted complex sum. Use **Advanced** only when you need fit diagnostics or a narrower analysis range.
5. Choose **Apply suggestion to _output_** to create ordinary unsaved delay/polarity values, or close the suggestion to change nothing. Undo remains available before Save.

Unknown, independent or mismatched timing references, missing phase, magnitude-only/stale merges, weak fits and excessive delay are blocked. The result includes current crossover, EQ, gain, delay and polarity, but it is still a prediction rather than a new acoustic measurement. See [Phase/Time Alignment](PHASE_ALIGNMENT.md).

## Review assisted crossover setups

1. Assign valid measurements to two supported driver ways with useful overlap.
2. Open **Suggest setup** inside either driver's Crossover section and confirm the named sources and candidate region.
3. Generate and compare up to three alternatives against the visible current crossover baseline.
4. Check whether the result is **Phase-aware** or **Magnitude-based**, read confidence and warnings, and use **Advanced** only for scores and timing diagnostics.
5. Apply one alternative to create ordinary unsaved low-pass/high-pass and any explicitly shown polarity/delay values, or close it to change nothing. Review normally and choose **Save** separately.

Magnitude-only suggestions use power summation and make no complex-sum, polarity or delay claim. Existing EQ, gain and protection settings are not changed; protection warnings are not safety guarantees. See [Assisted Crossover](ASSISTED_CROSSOVER.md).

## Use assisted EQ

Open **Suggest EQ from measurement** inside an output’s Parametric EQ section. Choose an assigned response and target, review the measured/target/current/predicted curves and select only suitable suggestions. **Accept** creates ordinary unsaved EQ bands; **Reject** changes nothing. Save normally after manual review. This is bounded magnitude assistance, not automatic room correction.

## Configure driver protection

Open **Driver Protection**, enter only sourced driver/amplifier limits, inspect raw and margin-adjusted electrical estimates, and optionally run the normalized simulator. These values do not guarantee thermal, excursion or damage protection and are not mapped to a physical DSP limiter.

## Inspect deployment and protect the design

After saving, use **Deployment Preview** to compile and inspect the current-Beocreate plan. Simulator apply/readback is explicitly simulated; no physical Apply action exists. Use **Configuration Backup & Restore** to export a portable backup, preview restore changes and confirm only after reviewing the plan.

Advanced diagnostics are documented in the focused guides linked from [Current Status](CURRENT_STATUS.md) and [Testing](TESTING.md).
