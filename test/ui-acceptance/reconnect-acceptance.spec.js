'use strict';

const fs = require('fs');
const {test, expect} = require('./fixtures');
const {
  openApplication,
  completeSetup,
  openExtension,
  configureTwoWayStereo
} = require('./helpers');

async function prepareSavedRouting(page, speakerlab) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await configureTwoWayStereo(page);
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
}

function changeSavedLabel(speakerlab, label) {
  const statePath = speakerlab.statePath('signal-flow.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.outputs[0].label = label;
  fs.writeFileSync(statePath, JSON.stringify(state));
}

test('reconnect retains an unsaved draft and reports changed server state', async function ({monitoredPage: page, speakerlab}) {
  await prepareSavedRouting(page, speakerlab);
  const label = page.locator('#signal-flow-label-output-a');
  await label.fill('Unsaved local woofer');
  await label.blur();
  await expect(page.locator('#signal-flow-summary')).toContainText('Unsaved changes');

  await speakerlab.stop();
  await expect(page.locator('body')).toHaveClass(/connecting/);
  await expect(label).toHaveValue('Unsaved local woofer');
  await expect(page.locator('#signal-flow-save')).toHaveClass(/disabled/);
  changeSavedLabel(speakerlab, 'Server-side woofer');
  await speakerlab.start('connected');

  await expect(page.locator('body')).not.toHaveClass(/connecting|disconnected/, {timeout: 10000});
  await expect(label).toHaveValue('Unsaved local woofer');
  await expect(page.locator('#signal-flow-message')).toContainText(/changed while you were editing|draft has been kept/i);
});

test('clean reconnect loads state changed while the server was unavailable', async function ({monitoredPage: page, speakerlab}) {
  await prepareSavedRouting(page, speakerlab);
  await speakerlab.stop();
  await expect(page.locator('body')).toHaveClass(/connecting/);
  changeSavedLabel(speakerlab, 'Updated while offline');
  await speakerlab.start('connected');
  await expect(page.locator('body')).not.toHaveClass(/connecting|disconnected/, {timeout: 10000});
  await expect(page.locator('#signal-flow-label-output-a')).toHaveValue('Updated while offline');
  await expect(page.locator('#signal-flow-summary')).toContainText('Saved design');
});
