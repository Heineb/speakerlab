# SpeakerLab

SpeakerLab is a modern open-source loudspeaker DSP design environment derived from the original Bang & Olufsen Beocreate codebase. It is independently developed, is not an official Bang & Olufsen project, and is not developed, endorsed or supported by Bang & Olufsen.

SpeakerLab currently targets the existing Beocreate 4-Channel Amplifier and inherited software platform. The project is under active development and is not yet a production-ready replacement image.

## What works today

The hardware-free workflow can:

- configure four outputs, driver roles and signal routing;
- design crossover filters and adjust level, delay and polarity;
- create ordinary Parametric EQ bands;
- import and inspect REW text and FRD measurements;
- derive magnitude-only nearfield/farfield merged responses;
- review phase/time alignment, assisted crossover and bounded assisted EQ suggestions;
- record Driver Protection assumptions and run a normalized limiter simulation;
- save, back up, preview and restore the complete design; and
- compile a current-Beocreate DSP plan, apply it to the local simulator and compare simulated readback.

Physical DSP deployment is deliberately blocked. Saved, predicted and simulated state must not be interpreted as audible or physically deployed behavior.

## Quick start

Prerequisites: Node.js 24 and npm. The server lockfile was generated with npm 11.6.2.

```sh
npm ci --prefix Beocreate2/beo-system
npm run dev
```

Open the loopback URL printed by the command (normally `http://127.0.0.1:3000/`). The local runtime uses isolated state and a simulated current-Beocreate DSP; it does not write to real `/opt` or `/etc`, require root or contact physical hardware.

Run all documented hardware-free verification with:

```sh
npm run verify
```

## Typical workflow

1. Complete setup, then open **Speaker Design**.
2. In **Design**, select each output and work through **Output & routing**, **Crossover**, **Level & timing**, **Parametric EQ** and **Driver Protection**.
3. In **Measurements**, import, inspect and assign responses. Merge suitable nearfield/farfield observations when useful.
4. Use contextual **Align drivers**, **Suggest setup** and **Suggest EQ** actions when measurement evidence supports them.
5. In **Review**, resolve issues, save the design and inspect **Deployment Preview**.
6. Use System Tools to download a backup before important changes.

Start with [Getting Started](docs/GETTING_STARTED.md), then use the task-oriented [Design Workflow](docs/DESIGN_WORKFLOW.md) and [User Guide](docs/USER_GUIDE.md).

## Current limitations

- Physical DSP deployment and physical Apply controls remain blocked.
- Timing references can be user-declared; that metadata is not acoustic verification.
- Driver Protection has no thermal or excursion model and is not a safety guarantee.
- Predictions depend on measurement calibration, gating, placement, phase quality, overlap and source integrity.
- Assisted crossover, alignment and EQ are conservative suggestions, not automatic optimization or guarantees of audible improvement.
- Simulator readback is not hardware evidence.

## Documentation

- [Getting Started](docs/GETTING_STARTED.md)
- [Designing a Speaker](docs/DESIGN_WORKFLOW.md)
- [User Guide](docs/USER_GUIDE.md)
- [Measurement Import](docs/MEASUREMENT_IMPORT.md) and [Measurement Merge](docs/MEASUREMENT_MERGE.md)
- [Phase/Time Alignment](docs/PHASE_ALIGNMENT.md)
- [Assisted Crossover](docs/ASSISTED_CROSSOVER.md) and [Assisted EQ](docs/ASSISTED_EQ.md)
- [Driver Protection](docs/DRIVER_PROTECTION.md)
- [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md) and [Current Status](docs/CURRENT_STATUS.md)
- [UI Principles](docs/UI_PRINCIPLES.md), [Branding](docs/BRANDING.md) and [Upstream Relationship](docs/UPSTREAM.md)

## Development and upstream

Routine work is performed on `develop`; `master` is the stable integration and release branch. See [AGENTS.md](AGENTS.md) and the [Project Charter](docs/PROJECT_CHARTER.md) before contributing.

The repository is distributed under the [MIT License](LICENSE). It retains applicable source history, copyright, licence notices and attribution from the original Beocreate project. SpeakerLab development belongs to `Heineb/speakerlab`; `bang-olufsen/create` is historical source material only.
