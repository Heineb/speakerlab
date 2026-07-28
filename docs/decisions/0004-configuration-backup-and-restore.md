# ADR 0004: Versioned Configuration Backup and Best-Effort Restore

- Status: Accepted
- Date: 2026-07-29
- Milestone: M3 – Configuration Export, Import and Recovery

## Context

Beocreate configuration is spread across central JSON settings, user presets, service files and operating-system state. The former System Tools workflow delegated an opaque `.tar.gz` archive to `/opt/hifiberry/bin/backup-config`. The application could not inspect its contents, validate compatibility, preview changes, constrain sensitive data or roll back a partial restore.

The characterized central settings and resource-discovery boundaries now permit a safer first portable format. Atomic file persistence protects one replacement at a time, but POSIX filesystems do not provide a transaction spanning all configuration files.

## Decision

SpeakerLab configuration backup v1 is a single UTF-8 JSON document identified by:

```json
{
  "format": "org.speakerlab.configuration-backup",
  "schemaVersion": 1
}
```

It contains creation and source-platform metadata, required/included/excluded categories, three configuration sections, per-item and per-section SHA-256 checksums, and an overall SHA-256 integrity checksum. The required sections are:

- `settings`
- `speakerPresets`
- `listeningModes`

Existing live JSON payloads are wrapped as opaque values. The backup schema validates the wrapper and integrity metadata without imposing new schemas on legacy settings or preset contents. Canonical key ordering is used for checksums; the exported document remains human-inspectable formatted JSON. Creation time intentionally changes between real exports, while collection and item ordering are deterministic.

### Included scope

- safe top-level central settings JSON, including `system.json`, `ui.json`, sound, channel, equaliser and other extension settings that pass the sensitivity policy;
- user speaker-preset JSON under `beo-speaker-presets`;
- user listening-mode JSON under `beo-listening-modes`; and
- format, system-version and current Beocreate card-type metadata.

### Sensitive-data and exclusion policy

Files associated with authentication, network/device identity, DSP program deployment, external services, first-run/update state or operating-system state are excluded explicitly. Files containing keys matching password, passphrase, credential, secret, token, private-key or API-key patterns are excluded as a whole rather than partially redacted. `system.json` is excluded when it contains `runAtStart`, because restoring it could introduce a machine-specific command.

Wi-Fi credentials, passwords, private keys, logs, caches, uploads, temporary files, product identity, DSP binaries, packages, systemd/GPIO state and Beocreate Connect state are never in scope. Every static or dynamically discovered exclusion is listed in the backup metadata. An unreadable or malformed in-scope file fails export; the server does not silently emit an unknown partial backup.

### Validation and compatibility

Restore separates parsing, size enforcement, format/version checks, required metadata and section validation, item/section/overall integrity verification, compatibility warnings, preview and explicit confirmation. Input is limited to 5 MiB. Unsupported required sections and future schema versions are rejected. Unknown optional sections are reported and ignored. A differing Beocreate card type produces a warning because legacy payloads remain opaque.

### Restore transaction

Before applying a confirmed restore, the server:

1. flushes pending settings, cancels their timer and rejects ordinary saves during restore;
2. collects and validates the current complete in-scope configuration;
3. atomically stores and readback-verifies it as `.speakerlab-last-known-good.json`;
4. builds every target path from fixed section directories and validated basenames;
5. stages all parsed outputs and rollback data in memory;
6. atomically writes and readback-verifies each changed item; and
7. rolls every attempted item back in reverse order after any failure.

A new concurrent restore is rejected. A preview token is single-use. Ordinary delayed-save behavior resumes after the synchronous transaction. Items absent from the selected backup are reported but left unchanged; v1 never performs implicit deletion. New files are removed during rollback, and directories created by the transaction are removed when empty.

The result reports the original failure and whether rollback verification succeeded. A failed rollback is a critical state. The last-known-good file retains the immediate verified pre-restore configuration, but v1 does not provide a history browser.

## Consequences

Users can inspect a plan and explicitly confirm before active files change. Central settings, speaker presets and listening modes retain their existing live JSON formats and paths. Restoring files does not apply presets to the DSP or reload extension state; a product restart is required before the restored settings become active.

Each replacement is atomic, but the multi-file operation is not a true filesystem transaction. Process or power loss between files can still leave a mixture that requires the retained last-known-good snapshot or manual recovery. Rollback deletion of a newly created file is not itself atomic. Cross-process writers outside the central broker are not locked.

The REST API operates inside the existing unauthenticated local Beocreate trust model. It accepts backup content, never browser-supplied filesystem paths, validates basenames, enforces a 5 MiB limit and exposes no arbitrary file-write operation. Authentication and CSRF protection remain broader platform gaps.

## Rejected alternatives

- Reusing the opaque HiFiBerryOS `.tar.gz`: rejected because contents, secrets, compatibility and rollback cannot be validated by SpeakerLab.
- Exporting every `/etc` file: rejected because it would include credentials, device identity and machine-specific service state.
- Partially redacting sensitive JSON files: rejected because restore could silently delete omitted fields or create semantically incomplete live configuration.
- Deleting active items absent from a backup: rejected for v1 because non-destructive restore is safer and easier to explain.
- A generic storage or migration framework: rejected because v1 wraps current Beocreate JSON and does not justify speculative architecture.
