'use strict';

const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension, configureTwoWayStereo} = require('./helpers');

async function prepareDesign(page, speakerlab) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await configureTwoWayStereo(page);
  for (const output of ['output-a', 'output-c']) {
    await page.locator('#signal-flow-lowPass-' + output + '-family').selectOption('linkwitz-riley');
    await page.locator('#signal-flow-lowPass-' + output + '-slope').selectOption('24');
    await page.locator('.signal-flow-output[data-output-id="' + output + '"] .signal-flow-crossover-filter').nth(1).getByLabel('Enabled').check();
    await page.locator('#signal-flow-lowPass-' + output + '-frequency').fill('2000');
    await page.locator('#signal-flow-lowPass-' + output + '-frequency').blur();
  }
  for (const output of ['output-b', 'output-d']) {
    await page.locator('#signal-flow-highPass-' + output + '-family').selectOption('linkwitz-riley');
    await page.locator('#signal-flow-highPass-' + output + '-slope').selectOption('24');
    await page.locator('.signal-flow-output[data-output-id="' + output + '"] .signal-flow-crossover-filter').first().getByLabel('Enabled').check();
    await page.locator('#signal-flow-highPass-' + output + '-frequency').fill('2000');
    await page.locator('#signal-flow-highPass-' + output + '-frequency').blur();
  }
  await page.locator('#signal-flow-gain-output-a').fill('-2.5');
  await page.locator('#signal-flow-gain-output-a').blur();
  await page.locator('#signal-flow-delay-output-a').fill('0.42');
  await page.locator('#signal-flow-delay-output-a').blur();
  await page.locator('#signal-flow-polarity-output-b').selectOption('inverted');
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
}

test('complete design compiles into a current-Beocreate preview without physical deployment', async function ({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 1440, height: 1000});
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await expect(page.locator('#signal-flow-deployment-target')).toContainText('Beocreate Universal v10');
  await expect(page.locator('#signal-flow-deployment-target')).toContainText('48000 Hz');
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('Prepared only');
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('Not deployed to physical DSP');
  await expect(page.locator('.signal-flow-deployment-output')).toHaveCount(4);
  await expect(page.locator('#signal-flow-deployment-operations')).toContainText('Technical proposed operations');
});

test('unsupported positive gain is identified and simulator application is blocked', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-gain-output-a').fill('3');
  await page.locator('#signal-flow-gain-output-a').blur();
  await page.locator('#signal-flow-save').click();
  await page.locator('#signal-flow-compile').click();
  await expect(page.locator('#signal-flow-deployment-issues')).toContainText(/positive gain.*not proven safe/i);
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('unsupported');
  await expect(page.locator('#signal-flow-simulate-apply')).toBeDisabled();
  await expect(page.locator('#signal-flow-gain-output-a')).toBeEditable();
});

test('simulator apply, readback, comparison and mismatch remain explicit across refresh', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await page.locator('#signal-flow-simulate-apply').click();
  await expect(page.locator('#signal-flow-message')).toContainText('simulator while muted');
  await page.locator('#signal-flow-simulate-read').click();
  await page.locator('#signal-flow-simulate-compare').click();
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('matched');
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('Not deployed to physical DSP');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('matched');

  await page.evaluate(function () {
    var compilation = signalFlow.getState().deployment.compilation;
    var gain = compilation.operations.find(function (item) { return item.group === 'gain'; });
    beo.send({target: 'signal-flow', header: 'setSimulationScenario', content: {
      scenario: {type: 'mismatch', operationIndex: gain.index, delta: 0.1}
    }});
  });
  await page.locator('#signal-flow-simulate-read').click();
  await page.locator('#signal-flow-simulate-compare').click();
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('different');
  await expect(page.locator('.signal-flow-deployment-output').first()).toContainText('different');
  await expect(page.locator('#signal-flow-simulate-clear')).toBeEnabled();
});

test('design edits make compilation stale and reconnect never preserves a false verified state', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await page.locator('#signal-flow-simulate-apply').click();
  await page.locator('#signal-flow-simulate-read').click();
  await page.locator('#signal-flow-simulate-compare').click();
  await page.locator('#signal-flow-delay-output-a').fill('1');
  await page.locator('#signal-flow-delay-output-a').blur();
  await expect(page.locator('#signal-flow-deployment-status')).toContainText(/stale/i);
  await expect(page.locator('#signal-flow-simulate-apply')).toBeDisabled();
  await page.locator('#signal-flow-save').click();
  await page.locator('#signal-flow-compile').click();
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('prepared');

  await speakerlab.stop();
  await expect(page.locator('body')).toHaveClass(/connecting/);
  await expect(page.locator('#signal-flow-deployment-status')).not.toContainText('matched');
  await speakerlab.start('connected');
  await expect(page.locator('body')).not.toHaveClass(/connecting|disconnected/, {timeout: 10000});
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('Not compiled');
});

test('deployment preview is responsive, keyboard reachable and semantically labelled', async function ({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 390, height: 844});
  await prepareDesign(page, speakerlab);
  const compile = page.getByRole('button', {name: 'Compile for current Beocreate DSP'});
  await compile.focus();
  await compile.press('Enter');
  await expect(page.getByRole('region', {name: 'Current Beocreate DSP target'})).toContainText('Current Beocreate DSP');
  await expect(page.getByRole('region', {name: 'Deployment errors and warnings'})).toContainText('Compilation summary');
  await expect(page.getByRole('group', {name: 'Left woofer deployment comparison'})).toContainText('Requested');
  await compile.press('Tab');
  await expect(page.locator('#signal-flow-simulate-apply')).toBeFocused();
  await page.locator('#signal-flow-simulate-apply').press('Enter');
  await page.locator('#signal-flow-simulate-apply').press('Tab');
  await expect(page.locator('#signal-flow-simulate-read')).toBeFocused();
  await page.locator('#signal-flow-simulate-read').press('Enter');
  await page.locator('#signal-flow-simulate-read').press('Tab');
  await expect(page.locator('#signal-flow-simulate-compare')).toBeFocused();
  await expect(page.locator('#signal-flow-deployment-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#signal-flow-simulate-clear')).toBeEnabled();
  await expect(page.locator('.signal-flow-deployment-output').first()).toHaveCSS('display', 'block');
});
