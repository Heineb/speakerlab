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

function changeSavedProcessing(speakerlab, gain) {
  const statePath = speakerlab.statePath('signal-flow.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.channelProcessing.outputs[0].gain.valueDb = gain;
  fs.writeFileSync(statePath, JSON.stringify(state));
}

test('reconnect retains an unsaved draft and reports changed server state', async function ({monitoredPage: page, speakerlab}) {
  await prepareSavedRouting(page, speakerlab);
  const gain = page.locator('#signal-flow-gain-output-a');
  await gain.fill('-2.5');
  await gain.blur();
  await expect(page.locator('#signal-flow-summary')).toContainText('Unsaved changes');

  await speakerlab.stop();
  await expect(page.locator('body')).toHaveClass(/connecting/);
  await expect(gain).toHaveValue('-2.5');
  await expect(page.locator('#signal-flow-save')).toHaveClass(/disabled/);
  changeSavedProcessing(speakerlab, -6);
  await speakerlab.start('connected');

  await expect(page.locator('body')).not.toHaveClass(/connecting|disconnected/, {timeout: 10000});
  await expect(gain).toHaveValue('-2.5');
  await expect(page.locator('#signal-flow-message')).toContainText(/changed while you were editing|draft has been kept/i);
});

test('clean reconnect loads state changed while the server was unavailable', async function ({monitoredPage: page, speakerlab}) {
  await prepareSavedRouting(page, speakerlab);
  await speakerlab.stop();
  await expect(page.locator('body')).toHaveClass(/connecting/);
  changeSavedProcessing(speakerlab, -4);
  await speakerlab.start('connected');
  await expect(page.locator('body')).not.toHaveClass(/connecting|disconnected/, {timeout: 10000});
  await expect(page.locator('#signal-flow-gain-output-a')).toHaveValue('-4');
  await expect(page.locator('#signal-flow-summary')).toContainText('Saved design');
});
