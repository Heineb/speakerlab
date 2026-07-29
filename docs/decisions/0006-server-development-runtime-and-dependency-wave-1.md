# ADR 0006: Node.js 24 Server Development Runtime and Dependency Wave 1

- Status: Accepted
- Date: 2026-07-29
- Milestone: M2 – Incremental Runtime and Dependency Modernisation

## Context

The Beocreate server package had an npm v1 lockfile and four direct dependencies last locked as `aplay` 1.2.0, EventEmitter3 3.1.2, Express 4.17.1 and Underscore 1.9.1. A clean install required old-lockfile metadata repair and npm audit reported eight findings, including direct high and critical findings. The repository does not record the Node.js version in the deployed HiFiBerryOS image.

The isolated local runtime and current-Beocreate DSP/WebSocket/configuration tests provide coverage for HTTP/UI assembly, extension loading, settings, backup/restore, message routing, connected/disconnected DSP simulation and graceful shutdown without loading production hardware integrations.

## Decision

Node.js 24 is the supported development runtime for the repository and isolated Beocreate server. npm 11.6.2 is recorded in the server manifest and generates its version 3 lockfile. CI performs a clean server `npm ci` on current Ubuntu and macOS runners before the repository suite.

The first dependency wave upgrades:

- EventEmitter3 from 3.1.2 to 5.0.4;
- Express from 4.17.1 to 4.22.2, deliberately remaining on major 4; and
- Underscore from 1.9.1 to 1.13.8.

`aplay` remains at 1.2.0. No production source compatibility patch is required. The server package is marked private and its repository metadata points to the SpeakerLab subdirectory while upstream authorship and licence metadata remain intact.

Node.js 24 is not declared as the production appliance runtime. That remains unknown until the deployed image or a physical Beocreate system provides evidence.

## Consequences

Apple Silicon and CI can reproduce the 71-package server-owned tree without native compilation or install scripts. The npm audit result for that tree changes from eight findings to zero as of this decision. This is a point-in-time registry assessment, not a claim that the application or production image is secure. The unauthenticated local-network service, globally supplied modules and platform integrations require separate assessment.

The application envelope, extension identifiers/lifecycle, JSON formats and paths, backup format, local simulator selection, production DSP selection, production binding and audio behavior are unchanged.

The lockfile gains current Express transitive packages, including the `side-channel` family and supporting call/prototype helpers. No direct dependency is added or removed.

## Deferred

- Express 5 and any routing migration.
- `aplay` and audible startup behavior.
- Production-global `websocket` and `dnssd2`.
- Optional extension, Linux service, discovery, GPIO and networking packages.
- DSPToolkit, SigmaTCP framing, read queues and reconnect limits.
- Beocreate Connect, Electron and its native dependencies.
- Confirmation of the production HiFiBerryOS Node.js runtime.

## Rejected alternatives

- Broad `npm audit fix` or upgrading every package: rejected because it would combine unrelated compatibility and platform risks.
- Express 5 in this wave: rejected because changed routing semantics need dedicated characterization.
- Adding server packages for production-global modules: rejected because that would change the deployed dependency model.
- Declaring Node.js 24 as the appliance runtime: rejected because repository evidence does not support it.
