'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension} = require('./helpers');

async function openMeasurements(page, speakerlab, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await openApplication(page, speakerlab); await completeSetup(page, 'Other Speaker'); await openExtension(page, 'signal-flow');
}
async function importMeasurement(page, filename, name, type) {
  await page.locator('#signal-flow-measurement-file').setInputFiles(path.join(__dirname, '../fixtures', filename));
  await page.getByRole('button', {name: 'Confirm import'}).click();
  await page.locator('#signal-flow-measurement-type').selectOption(type);
  await page.locator('#signal-flow-measurement-name').fill(name);
  await page.getByRole('button', {name: 'Update measurement'}).click();
  await expect(page.locator('#signal-flow-measurement-list').getByRole('option', {name: new RegExp(name)})).toBeVisible();
}
async function prepareSources(page, options) {
  options = options || {};
  await page.evaluate(function() {
    window.__measurementMergeOverlayResponses = 0;
    $(document).on('signal-flow.measurement-merge-test', function(event, data) {
      if (data.header === 'measurementOverlay') window.__measurementMergeOverlayResponses++;
    });
  });
  await importMeasurement(page, options.lowFile || 'measurement-nearfield.frd', 'Woofer nearfield', 'nearfield');
  await importMeasurement(page, options.highFile || 'measurement-farfield.frd', 'Woofer farfield', 'farfield');
  await page.waitForFunction(function() { return window.__measurementMergeOverlayResponses >= 2; });
}
async function previewMerge(page, options) {
  options = options || {};
  await page.getByRole('button', {name: 'Merge measurements'}).click();
  const workflow = page.locator('#signal-flow-measurement-merge');
  const lowValue = await workflow.getByLabel('Nearfield source').locator('option', {hasText: 'Woofer nearfield'}).getAttribute('value');
  const highValue = await workflow.getByLabel('Farfield source').locator('option', {hasText: 'Woofer farfield'}).getAttribute('value');
  await workflow.getByLabel('Nearfield source').selectOption(lowValue);
  await workflow.getByLabel('Farfield source').selectOption(highValue);
  await workflow.getByLabel('Level alignment').fill(String(options.offset === undefined ? 6 : options.offset));
  await workflow.getByLabel('Merge frequency').fill(String(options.frequency || 640));
  await workflow.getByLabel('Transition width').fill(String(options.width || 1));
  await workflow.getByLabel('Merged response name').fill(options.name || 'Woofer merged reference');
  await workflow.getByRole('button', {name: 'Preview merge'}).click();
  return workflow;
}
async function downloadBackup(page) {
  await openExtension(page, 'hifiberry-system-tools');
  const pending = page.waitForEvent('download'); await page.locator('#backup-download-button').click();
  const download = await pending; const backupPath = await download.path(); expect(fs.statSync(backupPath).size).toBeGreaterThan(0); return backupPath;
}

test('creates, persists and edits a derived nearfield/farfield merge without changing sources', async function({monitoredPage: page, speakerlab}) {
  await openMeasurements(page, speakerlab); await prepareSources(page);
  await page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer nearfield/}).click();
  const nearBefore = await page.locator('#signal-flow-measurement-detail').getByText(/Integrity/).textContent();
  const workflow = await previewMerge(page);
  await expect(workflow.getByText(/Overlap 160–2560 Hz/)).toBeVisible();
  await expect(workflow.locator('#signal-flow-measurement-merge-preview p', {hasText: 'Suggested level offset'})).toContainText('6');
  await expect(workflow.getByRole('img', {name: /merged magnitude preview/i})).toBeVisible();
  await workflow.getByRole('button', {name: 'Save merged response to draft'}).click();
  await expect(page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer merged reference.*Derived merged response/})).toBeVisible();
  await page.locator('#signal-flow-measurement-output').selectOption('output-a');
  await page.getByRole('button', {name: 'Update assignment'}).click();
  await expect(page.locator('#signal-flow-measurement-detail .signal-flow-electrical-response-line')).toHaveCount(3);
  await expect(page.locator('#signal-flow-measurement-detail')).toContainText(/Derived response.*Crossover electrical response.*EQ electrical response.*Combined electrical processing response/s);
  await page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer nearfield/}).click();
  await expect(page.locator('#signal-flow-measurement-detail').getByText(/Integrity/)).toHaveText(nearBefore);
  await page.getByRole('button', {name: 'Save design'}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/saved/i);
  const sourceSnapshot = JSON.stringify(JSON.parse(fs.readFileSync(speakerlab.statePath('signal-flow.json'), 'utf8')).measurements.measurements.filter(function(item) { return item.sourceFormat !== 'derived-merge'; }));
  const backupPath = await downloadBackup(page);
  await page.reload(); await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer merged reference.*Derived merged response/})).toBeVisible();
  await speakerlab.restart('connected'); await page.reload(); await openExtension(page, 'signal-flow');
  await page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer merged reference/}).click();
  await expect(page.locator('#signal-flow-measurement-detail').getByRole('status')).toContainText(/current for its saved source hashes/);
  await page.getByRole('button', {name: 'Edit merge recipe'}).click();
  await page.getByLabel('Level alignment').fill('5');
  await page.getByLabel('Merge frequency').fill('720');
  await page.getByLabel('Transition width').fill('0.8');
  await page.getByRole('button', {name: 'Preview merge'}).click();
  await page.getByRole('button', {name: 'Save merged response to draft'}).click();
  await page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer nearfield/}).click();
  await expect(page.locator('#signal-flow-measurement-detail').getByText(/Integrity/)).toHaveText(nearBefore);
  await page.getByRole('button', {name: 'Save design'}).click();
  expect(JSON.stringify(JSON.parse(fs.readFileSync(speakerlab.statePath('signal-flow.json'), 'utf8')).measurements.measurements.filter(function(item) { return item.sourceFormat !== 'derived-merge'; }))).toBe(sourceSnapshot);
  await openExtension(page, 'hifiberry-system-tools');
  await page.locator('#configuration-backup-file').setInputFiles(backupPath);
  await expect(page.locator('#configuration-restore-title')).toHaveText('Ready to restore');
  await expect(page.locator('#configuration-backup-changes')).not.toHaveText('0 changes');
  await page.locator('#configuration-restore-confirm').click();
  await expect(page.locator('#configuration-restore-title')).toHaveText('Configuration restored');
  await speakerlab.restart('connected'); await page.reload(); await openExtension(page, 'signal-flow');
  await page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer merged reference/}).click();
  await page.getByRole('button', {name: 'Edit merge recipe'}).click();
  await expect(page.getByLabel('Level alignment')).toHaveValue('6');
  await expect(page.getByLabel('Merge frequency')).toHaveValue('640');
  await expect(page.getByLabel('Transition width')).toHaveValue('1');
});

test('keeps magnitude-only phase policy and blocks removal of a depended-on source', async function({monitoredPage: page, speakerlab}) {
  await openMeasurements(page, speakerlab); await prepareSources(page, {lowFile: 'measurement-rew.txt'});
  const workflow = await previewMerge(page);
  await expect(workflow.getByText(/Derived phase unavailable/)).toBeVisible();
  await expect(workflow.locator('#signal-flow-measurement-merge-preview p', {hasText: /phase available.*phase unavailable/s})).toBeVisible();
  await expect(workflow.getByText(/does not correct baffle step/)).toBeVisible();
  await workflow.getByRole('button', {name: 'Save merged response to draft'}).click();
  await page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer nearfield/}).click();
  await page.getByRole('button', {name: 'Remove', exact: true}).click();
  await page.getByRole('button', {name: 'Remove measurement'}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/dependent merged response/i);
  await expect(page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer nearfield/})).toBeVisible();
});

test('exposes validation, warnings and native controls at narrow width', async function({monitoredPage: page, speakerlab}) {
  await openMeasurements(page, speakerlab, {width: 390, height: 844}); await prepareSources(page, {lowFile: 'measurement-narrow-nearfield.frd', highFile: 'measurement-narrow-farfield.frd'});
  const workflow = await previewMerge(page, {offset: 15, frequency: 400, width: 0.2, name: 'Unreliable preview'});
  await expect(workflow.getByText(/The chosen level alignment exceeds 10 dB/)).toBeVisible();
  await expect(workflow.getByText(/narrower than one octave/)).toBeVisible();
  await expect(workflow.getByRole('button', {name: 'Save merged response to draft'})).toBeEnabled();
  await workflow.getByRole('button', {name: 'Save merged response to draft'}).click();
  await expect(page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Unreliable preview.*Derived merged response/})).toBeVisible();
  const warningCodes = await page.evaluate(function() { return signalFlow.getState().draft.measurements.measurements.find(function(item) { return item.sourceFormat === 'derived-merge'; }).validation.warnings.map(function(item) { return item.code; }); });
  expect(warningCodes).toEqual(expect.arrayContaining(['NARROW_OVERLAP', 'LARGE_ALIGNMENT_OFFSET']));
  await page.getByRole('button', {name: 'Edit merge recipe'}).click();
  await page.getByLabel('Merge frequency').fill('600');
  await page.getByRole('button', {name: 'Preview merge'}).click();
  await expect(workflow.getByText(/complete transition region must remain inside/)).toBeVisible();
  await expect(workflow.getByRole('button', {name: 'Save merged response to draft'})).toBeDisabled();
  await expect(workflow.getByLabel('Nearfield source')).toBeVisible();
  await expect(workflow.getByLabel('Farfield source')).toBeVisible();
  await expect(workflow.getByLabel('Level alignment')).toBeVisible();
  await expect(workflow.getByLabel('Merge frequency')).toBeVisible();
  await expect(workflow.getByLabel('Transition width')).toBeVisible();
  await page.setViewportSize({width: 768, height: 1024});
  await expect(workflow.getByLabel('Nearfield source')).toBeVisible();
  await page.setViewportSize({width: 390, height: 844});
  await expect(workflow.getByRole('button', {name: 'Preview merge'})).toBeVisible();
});

test('announces a changed source by name and recomputes the stale derived response', async function({monitoredPage: page, speakerlab}) {
  await openMeasurements(page, speakerlab); await prepareSources(page);
  const workflow = await previewMerge(page);
  await workflow.getByRole('button', {name: 'Save merged response to draft'}).click();
  await page.getByRole('button', {name: 'Save design'}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/saved/i);
  await speakerlab.stop();
  const statePath = speakerlab.statePath('signal-flow.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const low = state.measurements.measurements.find(function(item) { return item.name === 'Woofer nearfield'; });
  low.points[0].magnitudeDb += 1;
  low.integrity.hash = crypto.createHash('sha256').update(JSON.stringify(low.points)).digest('hex');
  fs.writeFileSync(statePath, JSON.stringify(state));
  await speakerlab.start('connected'); await page.reload({waitUntil: 'domcontentloaded'}); await openExtension(page, 'signal-flow');
  await page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Woofer merged reference/}).click();
  await expect(page.locator('#signal-flow-measurement-detail').getByRole('alert')).toContainText(/Nearfield source.*Woofer nearfield.*changed/);
  await expect(page.locator('#signal-flow-measurement-detail').getByRole('status')).toHaveCount(0);
  await page.getByRole('button', {name: 'Edit merge recipe'}).click();
  await page.getByRole('button', {name: 'Preview merge'}).click();
  await page.getByRole('button', {name: 'Save merged response to draft'}).click();
  await expect(page.locator('#signal-flow-measurement-detail').getByRole('status')).toContainText(/current for its saved source hashes/);
});

test('supports a keyboard-only merge preview with semantic status', async function({monitoredPage: page, speakerlab}) {
  await openMeasurements(page, speakerlab); await prepareSources(page);
  const open = page.getByRole('button', {name: 'Merge measurements'}); await open.focus(); await page.keyboard.press('Enter');
  const workflow = page.locator('#signal-flow-measurement-merge');
  const low = workflow.getByLabel('Nearfield source'); await low.focus(); await page.keyboard.type('Woofer nearfield');
  await expect(low).not.toHaveValue('');
  const high = workflow.getByLabel('Farfield source'); await high.focus(); await page.keyboard.type('Woofer farfield');
  await expect(high).not.toHaveValue(''); await expect(high).not.toHaveValue(await low.inputValue());
  const offset = workflow.getByLabel('Level alignment'); await offset.focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await page.keyboard.type('6');
  const frequency = workflow.getByLabel('Merge frequency'); await frequency.focus(); await page.keyboard.type('640');
  const width = workflow.getByLabel('Transition width'); await width.focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await page.keyboard.type('1');
  await expect(page.getByRole('region', {name: 'Merge Measurements'})).toBeVisible();
  await expect(frequency).toHaveAccessibleDescription(/Hz/); await expect(width).toHaveAccessibleDescription(/octaves/);
  const preview = workflow.getByRole('button', {name: 'Preview merge'}); await preview.focus(); await page.keyboard.press('Enter');
  await expect(workflow.getByRole('status')).toContainText(/Merge review/);
  await expect(workflow.getByRole('img', {name: /derived phase unavailable/i})).toBeVisible();
  await expect(workflow.getByRole('status')).toContainText(/Selected sources.*phase unavailable.*Chosen level offset.*Transition/s);
  const save = workflow.getByRole('button', {name: 'Save merged response to draft'}); await save.focus(); await page.keyboard.press('Enter');
  const derived = page.locator('#signal-flow-measurement-list').getByRole('option', {name: /Merged response.*Derived merged response/}); await expect(derived).toBeVisible(); await derived.focus(); await page.keyboard.press('Enter');
  const edit = page.getByRole('button', {name: 'Edit merge recipe'}); await edit.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('region', {name: 'Merge Measurements'})).toBeVisible(); await expect(page.getByLabel('Transition width')).toHaveValue('1');
});
