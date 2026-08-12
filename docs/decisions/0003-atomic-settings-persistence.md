# ADR 0003: Atomic Persistence for Central Settings

- Status: Accepted
- Date: 2026-07-29
- Milestone: M0/M1 – Reproducible Baseline and Characterization Foundation

## Context

The central settings broker stores compact, unversioned JSON at `/etc/beocreate/<extension>.json`. Its former synchronous `writeFileSync` path truncated the active file before the replacement was complete. Serialization errors happened before opening the file, but filesystem errors, process termination or a partial write could leave an empty or malformed active configuration. The settings reader then treats that file as `null`.

The broker also has intentional legacy scheduling behavior: delayed saves retain mutable object references, one global ten-second timer coalesces every extension, immediate saves do not remove queued values, and graceful shutdown synchronously flushes the pending queue. Changing those semantics together with persistence would make compatibility failures harder to isolate.

## Decision

Central settings writes use the dedicated synchronous `atomic-json-file.js` module.

For each write it:

1. validates that the target is a non-empty path, serializes the full value with the existing compact `JSON.stringify` representation and verifies that the containing directory already exists;
2. creates a unique file beside the target with exclusive `wx` creation;
3. loops until all serialized bytes have been written;
4. applies the existing target's mode, or `0666` filtered by the process `umask` for a new file;
5. syncs and closes the temporary file;
6. renames it over the target on the same filesystem; and
7. attempts to sync the containing directory.

Errors retain their native code and gain `atomicWriteStage` and `atomicWriteTarget` properties. Cleanup errors are attached as `atomicWriteCleanupError`. An error before rename leaves the prior target unchanged and removes only the temporary file created by that attempt where possible. An error during directory sync is reported after the valid replacement has become visible; it cannot safely be rolled back. Directory-sync errors that indicate the operation is unsupported (`EINVAL`, `ENOTSUP`, `EBADF` or `EISDIR`) are tolerated.

Temporary names have the form:

`.<target-name>.speakerlab-<process-id>-<counter>.tmp`

Names are unique within the process and opened exclusively. A write cleans only its own temporary file. Stale files from interrupted older writes are ignored and are never restored or treated as authoritative. Automatic stale-file deletion is deferred because another process could still own a matching file.

The writer remains synchronous. This preserves call ordering and means one server process cannot have overlapping settings writes. Delayed/coalesced saves and shutdown flushing retain their characterized behavior and use the same atomic operation. A failed flush retains the full in-memory pending queue for an explicit later retry. Forced termination can still lose pending in-memory changes, and a failure during graceful shutdown still interrupts the existing shutdown callback.

## Consequences

The active central settings file is no longer truncated before a complete replacement is ready. Compact JSON, paths, filenames, property order, delay, coalescing, mutable-reference behavior, logging and synchronous error propagation remain compatible.

`fsync` reduces but cannot eliminate power-loss risk. Filesystem, storage-device and operating-system guarantees differ; known unsupported directory syncing is tolerated. After rename but before durable directory metadata, an abrupt power loss may still expose either filesystem state. No backup, readback, schema validation or last-known-good version is introduced.

Replacing a file uses a new inode. Its permission bits are preserved, but ownership becomes the identity running the server. The deployed service runs as root, so the normal root-owned case remains compatible; preserving unusual third-party ownership would require privileged ownership changes and is outside this slice.

The central writer still constructs filenames from unsanitized extension names. Independent CLI, preset, listening-mode, room-compensation and service-configuration writers remain non-atomic.

## Rejected alternatives

- A third-party atomic-write package: rejected because the required synchronous, compact-JSON contract is small and no new dependency is needed.
- Asynchronous writes or a general storage framework: rejected because they would change ordering and shutdown contracts or introduce speculative architecture.
- Restoring stale temporary files automatically: rejected because a temporary file is not validated, versioned or necessarily newer than a valid target.
- Extending the change to every JSON and service writer: rejected because those paths have different contracts and are not yet characterized.
