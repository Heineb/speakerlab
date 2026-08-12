#!/usr/bin/env node
'use strict';
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const serviceModule = require('../Beocreate2/beo-extensions/signal-flow/routing-service');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakerlab-measurement-'));
try {
  const service = serviceModule.createService({dataDirectory: root, clock: function() { return new Date('2026-08-10T10:00:00.000Z'); }});
  let configuration = service.state({}).configuration;
  const preview = service.measurementPreview('# REW\nFrequency SPL Phase\n20 70 0\n100 80 -10\n1000 82 -20', '../unsafe name.txt');
  const imported = service.measurementDraft(configuration, 'import', {token: preview.token}); configuration = imported.configuration;
  assert.strictEqual(configuration.measurements.measurements[0].sourceFilename, 'unsafe name.txt');
  assert.strictEqual(service.save(configuration, null).verified, true);
  assert.strictEqual(service.state({}).configuration.measurements.measurements[0].integrity.hash, configuration.measurements.measurements[0].integrity.hash);
  assert.strictEqual(service.measurementOverlay(configuration, imported.measurementId).acousticPrediction, false);
  const updated = service.measurementDraft(configuration, 'update', {measurementId: imported.measurementId, name: 'Woofer nearfield', type: 'nearfield', outputId: 'output-a'});
  assert.strictEqual(updated.configuration.measurements.measurements[0].assignedOutputId, 'output-a');
  assert.strictEqual(service.measurementDraft(updated.configuration, 'remove', {measurementId: imported.measurementId}).configuration.measurements.measurements.length, 0);
  console.log('ok - preview, import, persistence, association, overlay and removal');
} finally { fs.rmSync(root, {recursive: true, force: true}); }
