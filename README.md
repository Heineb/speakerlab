# SpeakerLab

SpeakerLab is an independent open-source continuation of the Bang & Olufsen Beocreate software. It currently targets the existing Beocreate 4-Channel Amplifier and software platform.

The project is under active development. It is not a production-ready replacement image and is not developed, endorsed or supported by Bang & Olufsen.

## Local development

The supported development runtime is Node.js 24. The server lockfile was generated with npm 11.6.2.

Install the server-owned dependencies:

```sh
npm ci --prefix Beocreate2/beo-system
```

Start the isolated local server:

```sh
npm run dev
```

The command prints a loopback URL. Local mode uses temporary or workspace-local state, a restricted hardware-free extension set and a current-Beocreate DSP simulator. It does not write to real `/opt` or `/etc`, require root, or communicate with physical hardware.

Run the automated repository verification:

```sh
npm run verify
```

The normal suite is hardware-free. Simulation does not validate SigmaTCP framing, DSP deployment, audible output, GPIO mute behavior or physical driver safety.

## Documentation

- [Project charter](docs/PROJECT_CHARTER.md)
- [Current status](docs/CURRENT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Upstream relationship](docs/UPSTREAM.md)

The original Beocreate source and its copyright/licence notices remain attributed to their respective authors.
