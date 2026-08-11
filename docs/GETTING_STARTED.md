# Getting Started

This path introduces the normal SpeakerLab workflow. It deliberately leaves measurement diagnostics and specialist analysis for later.

## 1. Launch SpeakerLab

From a prepared checkout, run `npm run dev` and open the loopback URL printed in the terminal. The footer must say **Local development · simulated DSP**. Complete the first-run setup and choose a matching preset, or **Other Speaker** for a blank four-output design.

## 2. Configure and route outputs

Open **Speaker Design → Design**. Select an output, expand **Output & routing**, enable it, give the driver a useful label, choose its role and side, and select the routed input. Repeat for each physical driver path.

## 3. Build the design

Work through one selected output at a time:

1. **Crossover** — set the required high-pass or low-pass. The graph is an electrical preview.
2. **Level & timing** — adjust Level, Delay and Polarity only when the design requires them.
3. **Parametric EQ** — add deliberate bands; leave it empty when no correction is justified.
4. **Driver Protection** — enter only sourced driver and amplifier limits. Important limitations remain visible; detailed assumptions are under **Advanced**.

Collapsed sections summarize current values, and only one section is open at a time.

## 4. Save and review

Choose **Save design** when validation has no errors. **Saved** means stored and read back from configuration; it does not mean deployed to a DSP.

Open **Review** to check configured/routed outputs, crossover, Level & timing, EQ, protection, measurements and unresolved issues. **Deployment Preview** remains simulated and physical deployment remains blocked.

## 5. Add measurements when useful

Open **Measurements**, choose **Import measurement**, inspect the detected response and assign it to an output. An assigned measurement can take you contextually to **Use for Crossover**, **Use for Driver alignment** or **Use for Parametric EQ**. These actions open assistance; they do not change the design until you explicitly apply a suggestion and later save.

Before important work, use **General → System Tools → Configuration Backup & Restore** to download a portable backup.

Continue with [Designing a Speaker](DESIGN_WORKFLOW.md) or the complete [User Guide](USER_GUIDE.md).
