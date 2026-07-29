'use strict';

const {test, expect} = require('./fixtures');
const {
  openApplication,
  completeSetup,
  openExtension,
  configureTwoWayStereo
} = require('./helpers');

async function openConfiguredSignalFlow(page, speakerlab) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await expect(page.locator('.signal-flow-output')).toHaveCount(4);
}

test('two-way stereo routing saves across refresh and server restart', async function ({monitoredPage: page, speakerlab}) {
  await openConfiguredSignalFlow(page, speakerlab);
  await configureTwoWayStereo(page);
  await expect(page.locator('#signal-flow-summary')).toContainText('4 routed');
  await expect(page.locator('#signal-flow-summary')).toContainText('Unsaved changes');
  const save = page.locator('#signal-flow-save');
  await expect(save).not.toHaveClass(/disabled/);
  await save.click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  await expect(page.locator('#signal-flow-summary')).toContainText('Saved design');

  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-label-output-a')).toHaveValue('Left woofer');
  await expect(page.locator('#signal-flow-role-output-d')).toHaveValue('tweeter');

  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-label-output-c')).toHaveValue('Right woofer');
  await expect(page.locator('#signal-flow-source-output-d')).toHaveValue('right');
});

test('validation blocks an incomplete routing and keeps textual errors visible', async function ({monitoredPage: page, speakerlab}) {
  await openConfiguredSignalFlow(page, speakerlab);
  const card = page.locator('.signal-flow-output[data-output-id="output-a"]');
  await card.locator('.signal-flow-output-header input[type="checkbox"]').check();
  await card.locator('#signal-flow-role-output-a').selectOption('woofer');
  await card.locator('#signal-flow-source-output-a').selectOption('left');
  await card.locator('#signal-flow-label-output-a').fill('');
  await card.locator('#signal-flow-label-output-a').blur();
  await expect(page.locator('#signal-flow-validation')).toContainText(/label|required/i);
  await expect(page.locator('#signal-flow-save')).toHaveClass(/disabled/);
});

test('crossover editing, preview, copying and persistence work at narrow width', async function ({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 390, height: 844});
  await openConfiguredSignalFlow(page, speakerlab);
  await configureTwoWayStereo(page);

  const woofer = page.locator('.signal-flow-output[data-output-id="output-a"]');
  await woofer.getByRole('group', {name: 'Low-pass'}).getByRole('checkbox').check();
  await woofer.locator('#signal-flow-lowPass-output-a-family').selectOption('linkwitz-riley');
  await woofer.locator('#signal-flow-lowPass-output-a-slope').selectOption('24');
  await woofer.locator('#signal-flow-lowPass-output-a-frequency').fill('2000');
  await woofer.locator('#signal-flow-lowPass-output-a-frequency').blur();
  await expect(woofer.locator('.signal-flow-response')).toContainText('Electrical filter response');
  await expect(woofer.locator('.signal-flow-response')).toContainText('Simulated');

  const tweeter = page.locator('.signal-flow-output[data-output-id="output-b"]');
  await tweeter.getByRole('group', {name: 'High-pass'}).getByRole('checkbox').check();
  await tweeter.locator('#signal-flow-highPass-output-b-family').selectOption('linkwitz-riley');
  await tweeter.locator('#signal-flow-highPass-output-b-slope').selectOption('24');
  await tweeter.locator('#signal-flow-highPass-output-b-frequency').fill('2000');
  await tweeter.locator('#signal-flow-highPass-output-b-frequency').blur();
  await expect(tweeter.locator('.signal-flow-response svg')).toBeVisible();

  await woofer.locator('#signal-flow-copy-output-a').selectOption('output-c');
  await woofer.getByRole('button', {name: 'Copy', exact: true}).click();
  await expect(page.locator('#signal-flow-lowPass-output-c-frequency')).toHaveValue('2000');
  await tweeter.locator('#signal-flow-copy-output-b').selectOption('output-d');
  await tweeter.getByRole('button', {name: 'Copy', exact: true}).click();
  await expect(page.locator('#signal-flow-highPass-output-d-frequency')).toHaveValue('2000');

  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-lowPass-output-a-frequency')).toHaveValue('2000');

  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-highPass-output-b-frequency')).toHaveValue('2000');
});

test('invalid crossover and disconnected simulator remain explicit', async function ({monitoredPage: page, speakerlab}) {
  await openConfiguredSignalFlow(page, speakerlab);
  await configureTwoWayStereo(page);
  const woofer = page.locator('.signal-flow-output[data-output-id="output-a"]');
  await woofer.getByRole('group', {name: 'Low-pass'}).getByRole('checkbox').check();
  await woofer.locator('#signal-flow-lowPass-output-a-frequency').fill('25000');
  await woofer.locator('#signal-flow-lowPass-output-a-frequency').blur();
  await expect(page.locator('#signal-flow-validation')).toContainText(/20,000|Nyquist|range/i);
  await expect(page.locator('#signal-flow-save')).toHaveClass(/disabled/);

  await speakerlab.restart('disconnected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-runtime-status')).toContainText('Disconnected');
  await expect(page.locator('#signal-flow-summary')).toContainText('Saved design');
  await expect(page.locator('#signal-flow-save')).toHaveClass(/disabled/);
});
