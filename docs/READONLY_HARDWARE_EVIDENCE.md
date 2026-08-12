# Read-Only Beocreate Evidence Operator Guide

This utility is for an existing compatible Beocreate installation running the known SigmaTCP service. It performs observations only. It does not prove that future DSP writes, amplifier mute control or rollback are safe.

## Before connecting

1. Confirm the product is an existing Beocreate system and no installation, update, preset application or audio-critical maintenance is in progress.
2. Do not change volume, routing, mute, filters or the DSP program for this capture.
3. Choose the target hostname or IP explicitly. The utility performs no Bonjour discovery and no network scan.
4. Inspect the complete plan without opening a connection:

```sh
npm run capture:beocreate-readonly -- --dry-run
```

The plan must list checksum and exact mapped parameter reads only, with expected write and unknown counts of zero. Stop if anything else appears.

## Capture

Use a new empty directory outside committed source:

```sh
npm run capture:beocreate-readonly -- \
  --host <explicit-host> \
  --output <empty-capture-directory> \
  --acknowledge-read-only
```

Press Control-C to stop immediately. The command uses sequential bounded reads, explicit timeouts and no device discovery. It refuses a non-empty output directory and removes an empty newly created directory after failure.

On success, inspect `capture.json`. Its transcript must say:

```text
writeFramesSent: 0
unknownFramesSent: 0
```

Also inspect every outgoing command: only `checksum-read` and `parameter-read` are permitted.

## Privacy and submission

The tool deliberately omits the target host. Before sharing, search for network addresses, hostnames, serial numbers, device IDs, product names, credentials, Wi-Fi information and local paths. Do not submit a capture containing any of them.

Submit only a sanitized capture for explicit review. Do not edit raw values to make them agree. Review status is stored separately; collection never automatically upgrades a mapping.

## What this does not prove

The capture cannot prove GPIO mute control, amplifier state, successful writes, write ordering, atomicity, audible behavior, driver protection, last-known-good rollback, EEPROM persistence or restart recovery. It must not be used to justify physical Apply while those blockers remain.
