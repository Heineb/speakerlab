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

async function setScenario(page, type) {
  await page.evaluate(function (scenarioType) {
    beo.send({target: 'signal-flow', header: 'setSimulationScenario', content: {
      scenario: scenarioType ? {type: scenarioType} : null
    }});
  }, type);
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
  const apply = page.getByRole('button', {name: 'Apply to simulator'});
  const readback = page.getByRole('button', {name: 'Read back from simulator'});
  const compare = page.getByRole('button', {name: 'Compare', exact: true});
  await page.evaluate(function () {
    var originalSend = beo.send;
    window.__speakerlabHeldDeploymentMessages = [];
    window.__speakerlabReleaseDeploymentMessage = function () {
      var message = window.__speakerlabHeldDeploymentMessages.shift();
      if (message) originalSend.call(beo, message);
    };
    beo.send = function (message) {
      if (message && message.target === 'signal-flow' &&
        (message.header === 'applyToSimulator' || message.header === 'readSimulator')) {
        window.__speakerlabHeldDeploymentMessages.push(message);
      } else {
        originalSend.call(beo, message);
      }
    };
  });
  await compile.press('Tab');
  await expect(apply).toBeFocused();
  await apply.press('Enter');
  await apply.press('Tab');
  await expect(readback).toBeDisabled();
  await expect(apply).toBeFocused();
  await apply.press('Shift+Tab');
  await expect(compile).toBeFocused();
  await page.evaluate(function () { window.__speakerlabReleaseDeploymentMessage(); });
  await expect(compile).toBeFocused();
  await compile.press('Tab');
  await apply.press('Tab');
  await expect(readback).toBeFocused();
  await readback.press('Enter');
  await readback.press('Tab');
  await expect(compare).toBeDisabled();
  await expect(readback).toBeFocused();
  await page.evaluate(function () { window.__speakerlabReleaseDeploymentMessage(); });
  await expect(compare).toBeFocused();
  await expect(page.locator('#signal-flow-deployment-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#signal-flow-simulate-clear')).toBeEnabled();
  await expect(page.locator('.signal-flow-deployment-output').first()).toHaveCSS('display', 'block');
});

test('mapping readiness exposes confidence for every major current-Beocreate feature', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  const mapping = page.getByRole('region', {name: 'Mapping confidence summary'});
  for (const field of ['Routing', 'Crossover', 'Gain', 'Delay', 'Polarity']) {
    await expect(mapping.getByRole('group', {name: new RegExp(field + ' mapping status', 'i')})).toContainText('Strong evidence');
  }
  await expect(mapping).toContainText('Preview only');
  await expect(page.getByRole('region', {name: 'Physical transport readiness'})).toContainText('Physical apply blocked');
  await expect(page.getByRole('button', {name: /physical apply/i})).toHaveCount(0);
});

test('unknown safety-critical mapping visibly blocks readiness while design and simulator remain available', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await setScenario(page, 'unknown-mapping');
  await expect(page.getByRole('group', {name: 'routing mapping status'})).toContainText('Unknown');
  await expect(page.getByRole('region', {name: 'Physical transport readiness'})).toContainText('output-a routing: Mapping evidence is unavailable');
  await expect(page.locator('#signal-flow-simulate-apply')).toBeEnabled();
  await expect(page.locator('#signal-flow-gain-output-a')).toBeEditable();
  await expect(page.getByRole('button', {name: /physical apply/i})).toHaveCount(0);
});

test('unavailable readback is announced and never presented as matched', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await page.locator('#signal-flow-simulate-apply').click();
  await setScenario(page, 'readback-unavailable');
  await page.locator('#signal-flow-simulate-read').click();
  await page.locator('#signal-flow-simulate-compare').click();
  await expect(page.getByRole('group', {name: 'gain mapping status'})).toContainText('Readback unavailable');
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('readback-unavailable');
  await expect(page.locator('#signal-flow-deployment-status')).not.toContainText('matched');
  await expect(page.getByRole('region', {name: 'Physical transport readiness'})).toContainText('Readback unavailable');
});

test('program identity mismatch invalidates the preview and asks for recompilation', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await setScenario(page, 'identity-mismatch');
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('Program identity mismatch');
  await expect(page.locator('#signal-flow-deployment-status')).toContainText('recompile required');
  await expect(page.getByRole('region', {name: 'Current Beocreate DSP target'})).toContainText('known-incompatible');
  await expect(page.locator('#signal-flow-simulate-apply')).toBeDisabled();
  await expect(page.getByRole('button', {name: /physical apply/i})).toHaveCount(0);
});

test('transport timeout malformed response disconnect and stale response never produce false verification', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await page.locator('#signal-flow-simulate-apply').click();
  for (const scenario of ['timeout', 'malformed-response', 'stale-response']) {
    await setScenario(page, scenario);
    await page.locator('#signal-flow-simulate-read').click();
    await page.locator('#signal-flow-simulate-compare').click();
    await expect(page.locator('#signal-flow-deployment-status')).toContainText(scenario);
    await expect(page.locator('#signal-flow-deployment-status')).not.toContainText('matched');
  }
  await setScenario(page, 'disconnect');
  await expect(page.getByRole('region', {name: 'Physical transport readiness'})).toContainText('Reconnect does not invalidate pending reads');
  await setScenario(page, null);
  await page.locator('#signal-flow-simulate-read').click();
  await expect(page.locator('#signal-flow-deployment-status')).not.toContainText('matched');
});

test('recovery summary explains mute readback rollback unknown state and manual intervention', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').click();
  await page.locator('#signal-flow-recovery-details').getByText('Safety and recovery summary').click();
  const recovery = page.getByRole('region', {name: 'Safety and recovery prerequisites'});
  await expect(recovery).toContainText('physical state cannot be confirmed');
  await expect(recovery).toContainText('verification is not physically proven');
  await expect(recovery).toContainText('Rollback capability: not implemented');
  await expect(recovery).toContainText('remain muted');
  await expect(recovery).toContainText('manual intervention may be required');
});

test('readiness summaries remain keyboard reachable and readable at desktop tablet and mobile widths', async function ({monitoredPage: page, speakerlab}) {
  await prepareDesign(page, speakerlab);
  await page.locator('#signal-flow-compile').focus();
  await page.locator('#signal-flow-compile').press('Enter');
  for (const viewport of [{width: 1440, height: 1000}, {width: 768, height: 900}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('region', {name: 'Mapping confidence summary'})).toBeVisible();
    await expect(page.getByRole('region', {name: 'Physical transport readiness'})).toBeVisible();
  }
  await page.locator('#signal-flow-recovery-details').getByText('Safety and recovery summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', {name: 'Safety and recovery prerequisites'})).toBeVisible();
  await expect(page.getByRole('button', {name: /physical apply/i})).toHaveCount(0);
});

test('read-only evidence provenance remains accessible without implying physical readiness', async function ({monitoredPage: page, speakerlab}) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  const summary = page.getByText('Read-only evidence summary', {exact: true});
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press('Enter');
  const provenance = page.getByRole('region', {name: 'Read-only hardware evidence provenance'});
  await expect(provenance).toContainText('accepted-repository-evidence');
  await expect(provenance).toContainText('Repository-backed; no physical capture performed');
  await expect(provenance).toContainText('physical values and tolerances unverified');
  await expect(provenance).toContainText('Write side');
  await expect(provenance).toContainText('not observed and not verified');
  await expect(provenance).toContainText('No hostname, network address, serial number, device identifier or user-defined product name');
  await expect(page.getByRole('button', {name: /physical apply/i})).toHaveCount(0);
});
