# SpeakerLab Architecture Baseline

## Status and scope

This document records the M0 architecture found in the repository at commit `64dc331`. It describes the existing Beocreate implementation; it does not propose future-hardware support or a generic DSP abstraction.

## Repository and deployed layout

The repository contains three JavaScript applications/libraries:

| Area | Repository entry point | Role |
| --- | --- | --- |
| Beocreate 2 server | `Beocreate2/beo-system/beo-server.js` | HTTP/WebSocket server, settings broker, extension loader, assembled browser UI and process lifecycle |
| Beocreate Essentials | `beocreate_essentials/beocreate_essentials.js` | Shared communication, SigmaDSP, networking and Raspberry Pi system helpers |
| Beocreate Connect | `BeocreateConnect/start.js` -> `main.js` | Electron desktop discovery/launcher and unfinished SD-card workflow |

The checked-out layout is not directly runnable as the deployed layout. Server and extension imports expect `beocreate_essentials` at `/opt/beocreate/beocreate_essentials`, adjacent to `beo-system` and `beo-extensions`. In this checkout it is repository-root `beocreate_essentials`, not `Beocreate2/beocreate_essentials`. `beocreate2.service` confirms the deployed root `/opt/beocreate` and starts `/usr/bin/node /opt/beocreate/beo-system/beo-server.js` as root after `sigmatcp.service`.

No repository script constructs that deployed tree. The README delegates system creation to HiFiBerryOS/Buildroot.

## Processes and runtime entry points

### Beocreate 2 server

`beo-server.js`:

1. Adds `/usr/lib/node_modules` to `NODE_PATH`, matching Buildroot global modules.
2. Reads `/etc/beocreate/system.json` and `/etc/beocreate/ui.json`, layered over defaults.
3. Creates a global `beo` service object and shared EventEmitter3 bus.
4. Loads server-side extensions synchronously.
5. Listens on configured HTTP port (default 80), serves static assets, assembles the browser UI, accepts a broad extension REST route and starts WebSocket protocol `beocreate` on the same server.
6. Delivers settings and broadcasts `general/startup`.
7. On SIGINT/SIGTERM, allows registered extensions up to five seconds, flushes queued settings, closes WebSocket/HTTP, and optionally invokes Raspberry Pi reboot/shutdown.

Command-line flags are `v`, `vv`, `vvv` (logging), `d` (daemon restart support), `dev` (disable UI etags), `q` (quiet startup) and `beosounds`.

### Browser client

The default view is `Beocreate2/beo-views/default/index.html`. At request time the server reads its `manifest.json`, discovers extension `menu.html`, client JavaScript and CSS, substitutes them into the view, and injects extension/navigation metadata. Client messages use targeted `{target, header, content}` objects over the WebSocket; server messages are broadcast by `communication.js`.

### Beocreate Connect

Electron 9.4.0 is declared as a development dependency. `npm start` runs `electron .`, which loads `start.js`, then `main.js` in normal Electron mode. It opens a Node-integrated renderer (`nodeIntegration: true`), discovers `_beocreate._tcp` services with `dnssd2`, falls back to HTTP discovery at `10.0.0.1`, and embeds the selected product UI. It also lists drives for an SD-card screen.

`start.js` references a missing `writer.js` when `ELECTRON_RUN_AS_NODE` is set. The image-writing dependencies and UI remain in the manifest, but no current main-process writer implementation exists in the checkout.

## Runtime and package assumptions

- No `engines`, `.nvmrc`, `.node-version`, Volta or toolchain pin exists.
- The server service assumes `/usr/bin/node`, Linux, root privileges, systemd, HiFiBerryOS paths and globally installed modules.
- Both principal lockfiles are npm lockfile version 1, created by an older npm generation.
- The only committed lockfiles cover `Beocreate2/beo-system`, Beocreate Connect, and selected extensions. `beocreate_essentials` and many extensions have manifests but no lockfile.
- Server dependencies can be installed with current npm, but this does not reproduce the global-module/deployed image arrangement.
- Electron 9.4.0 defines the desktop runtime; the repository does not state a compatible host Node version for installation/building.

## Extension architecture

System extensions live in `Beocreate2/beo-extensions`; persistent user extensions are expected in `/etc/beocreate/beo-extensions`. A user extension replaces a same-named system extension only when `system.json` sets `preferUserExtensions`. `enabledExtensions` is an allow-list and `disabledExtensions` a deny-list.

`package.json` metadata may filter an extension by card type or required/rejected card features. Server-side code resolves the extension directory as a Node module (normally `index.js`). UI discovery is independent: an extension can have only markup. The default appearance selects filename patterns in its manifest.

Extensions communicate through the global `beo.bus`, call explicitly exported functions through `beo.extensions`, use global helpers for settings/UI/downloads, and may register Express routes. There is no isolation or permission boundary: an extension can observe or emit any bus channel and runs with the root server's authority.

## Settings and configuration storage

The central settings convention is one unversioned JSON file per extension at `/etc/beocreate/<extension>.json`. `getSettings` returns `null` for missing, empty or invalid files and logs parse errors. Extensions merge their own defaults. Saves are synchronous JSON writes, either immediate or coalesced globally ten seconds after the last request. Pending writes are flushed at graceful shutdown.

Writes are not atomic, files are not schema-validated, and there is no backup or last-known-good copy. An interrupted/truncated write therefore becomes `null` on next load. `configure.js` edits the same files directly and has the same non-atomic behaviour.

Additional configuration is spread across `/etc` and HiFiBerryOS helpers, including SigmaTCP, AudioControl, network, service and source configuration. This is outside the central settings broker and is important for future complete configuration backup.

## Presets and identities

There are two distinct preset families:

- Speaker presets: system JSON in `Beocreate2/beo-speaker-presets`; user JSON in `/etc/beocreate/beo-speaker-presets`. The `speaker-preset` extension loads system files first, then user files without replacing an already known ID. It preflights sections by calling each named extension's `checkSettings`, applies them through `applySpeakerPreset`, optionally installs a fallback DSP program, and only then records `selectedSpeakerPreset`. Writes/moves/deletes are synchronous and unversioned.
- Beosonic listening modes: system JSON in `Beocreate2/beo-listening-modes`; user JSON in `/etc/beocreate/beo-listening-modes`. The `beosonic` extension combines both lists and lets user files be renamed/deleted.

Product identities similarly combine system data and `/etc/beocreate/beo-product-identities`, and may be embedded in speaker presets. Room-compensation measurements/presets have their own `/etc/beocreate/beo-room-compensation` tree.

Preset application can change routing, gain, delay, polarity and filters. It has compatibility checks but no transaction, readback, all-or-nothing rollback or last-known-good snapshot. A partial exception or DSP disconnect can therefore leave mixed state.

## DSP communication path

The current path is:

`browser control -> WebSocket/REST -> extension bus handler -> extension -> beocreate_essentials/dsp.js -> SigmaTCP server at 127.0.1.1:8086 -> Beocreate SigmaDSP hardware`

DSP-aware extensions (`dsp-programs`, `equaliser`, `channels`, `sound`, `beosonic`, `toslink`, `volume-limit` and others) import the same cached `dsp.js` module directly. `dsp.js` owns a `net.Socket`, creates 14-byte SigmaTCP read/write messages, converts 8.24 fixed-point values, queues reads and retries a closed connection up to ten times. Disconnected writes return `false`; many callers do not inspect that result.

Program management is split across the socket and command-line tools. `dsp.js` invokes `dsptoolkit` for install/store/check/reset. `dsp-programs` invokes `dsptoolkit get-xml`, reads/writes `/etc/sigmatcp.conf`, restarts `sigmatcp.service`, controls amplifier mute through `pigs` GPIO commands, and can run `/opt/hifiberry/bin/reconfigure-players`.

At startup, `dsp-programs` mutes the amplifier while obtaining checksum/metadata. It can use stored metadata when XML is unavailable and optionally keep unknown programs muted. Connection errors and a five-second checksum timeout are logged and sent to the UI. There is no general write acknowledgement/readback contract, deployment transaction or automatic rollback.

## Smallest simulated-hardware boundary

The smallest useful boundary is the existing transport operations consumed by current extensions: connect/disconnect/state, register read/write, safeload batches, checksum/XML, EEPROM/profile install, store, reset and their success/disconnect/timeout/error outcomes. The first implementation should allow the current `dsp.js` dependency to be substituted or have its socket/command execution injected while preserving its exported API and current Beocreate protocol semantics.

It must model only the existing Beocreate SigmaTCP/DSPToolkit behaviour. GPIO mute and systemd/service operations should be separate fakes because they are OS integration, not the DSP register transport.

## Hardware- and OS-dependent modules

Beyond DSP, direct dependencies include Raspberry Pi `/proc/cpuinfo`, `raspi-config`, hostname/hosts files, wireless-tools and `wpa_cli`, fixed `wlan0`/`eth0`, systemd services, ALSA tools, AudioControl, Bluetooth, serial ports, GPIO, MPD, Shairport, room-measurement helpers and various `/opt/hifiberry/bin` programs. These prevent whole-server execution on a development Mac unless extensions and filesystem/process dependencies are controlled.

## Errors, recovery and logging

Logging is unstructured `console.log/error/warn`; the systemd unit routes stdout/stderr to syslog under `beocreate2`. Verbosity is global but extensions apply it inconsistently. There is no correlation ID, persistent application log managed by the app, or redaction policy.

The server catches individual extension-load failures and continues. Invalid settings/presets are skipped or become `null`. HTTP port collision triggers graceful shutdown; other HTTP errors are only logged. Settings are flushed on handled signals, but there is no `uncaughtException`/`unhandledRejection` recovery. Hardware helpers vary between returning false, callbacks, logging and throwing. Recovery is therefore local and inconsistent.

## Security and compatibility observations

- The server normally runs as root and exposes unauthenticated HTTP, WebSocket and extension REST routes on port 80.
- Upload routing accepts client-provided filenames and an optional path header; this needs security characterization before reuse.
- Electron enables renderer Node integration and uses the obsolete `new-window` event model.
- Global variables are created extensively by omitted declarations, making modules order- and concurrency-sensitive.
- Current code uses callbacks, synchronous filesystem/process operations and deprecated packages/APIs, but these are modernization inputs, not reasons for a rewrite.
