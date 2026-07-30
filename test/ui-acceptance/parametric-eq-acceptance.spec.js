'use strict';

const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension, configureTwoWayStereo} = require('./helpers');

async function openEQ(page, speakerlab, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await configureTwoWayStereo(page);
  return page.locator('.signal-flow-output[data-output-id="output-a"]');
}

async function addBand(card) {
  await card.getByRole('button', {name: 'Add EQ band'}).click();
  await expect(card.locator('.signal-flow-eq-band')).toHaveCount(1);
}

test('peaking EQ saves across refresh and restart with a combined electrical preview', async function ({monitoredPage: page, speakerlab}) {
  const card = await openEQ(page, speakerlab);
  await addBand(card);
  await card.getByLabel('Optional band label').fill('Cone resonance');
  await card.getByLabel('Optional band label').blur();
  await card.getByLabel('Center or corner frequency (Hz)').fill('1000');
  await card.getByLabel('Center or corner frequency (Hz)').blur();
  await card.getByLabel('Gain (dB)').fill('-3');
  await card.getByLabel('Gain (dB)').blur();
  await card.getByRole('spinbutton', {name: 'Q', exact: true}).fill('1.2');
  await card.getByRole('spinbutton', {name: 'Q', exact: true}).blur();
  await expect(card.locator('.signal-flow-eq .signal-flow-response')).toContainText('Estimated maximum EQ boost');
  await expect(card.locator('.signal-flow-eq svg')).toHaveAttribute('aria-label', /Electrical response graph/);
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');

  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-eq-output-a-eq-a-1-gain')).toHaveValue('-3');
  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('.signal-flow-output[data-output-id="output-a"] .signal-flow-eq-band')).toHaveAttribute('aria-label', /Cone resonance.*enabled/i);
});

test('shelves, warnings, bypass, duplicate, remove and copy work at narrow width', async function ({monitoredPage: page, speakerlab}) {
  const card = await openEQ(page, speakerlab, {width: 390, height: 844});
  await addBand(card);
  await card.getByLabel('Filter type').selectOption('low-shelf');
  await card.getByLabel('Center or corner frequency (Hz)').fill('120');
  await card.getByLabel('Center or corner frequency (Hz)').blur();
  await card.getByLabel('Gain (dB)').fill('8');
  await card.getByLabel('Gain (dB)').blur();
  await card.getByRole('spinbutton', {name: 'Shelf slope (S)', exact: true}).fill('1');
  await card.getByRole('spinbutton', {name: 'Shelf slope (S)', exact: true}).blur();
  await card.getByRole('button', {name: /Duplicate Low shelf/i}).click();
  await expect(card.locator('.signal-flow-eq-band')).toHaveCount(2);
  await card.getByLabel('Filter type').selectOption('high-shelf');
  await card.getByLabel('Center or corner frequency (Hz)').fill('150');
  await card.getByLabel('Center or corner frequency (Hz)').blur();
  await card.getByLabel('Gain (dB)').fill('7');
  await card.getByLabel('Gain (dB)').blur();
  await expect(page.locator('#signal-flow-validation')).toContainText(/overlapping|positive EQ gain/i);
  await expect(page.locator('#signal-flow-validation')).toContainText(/not a clipping or driver-safety guarantee/i);
  await expect(page.locator('#signal-flow-save')).not.toHaveClass(/disabled/);
  await card.getByLabel('Enabled (clear to bypass)').uncheck();
  await card.getByRole('button', {name: /Remove High shelf/i}).click();
  await expect(card.locator('.signal-flow-eq-band')).toHaveCount(1);
  await card.locator('#signal-flow-eq-copy-output-a').selectOption('output-c');
  await card.getByRole('button', {name: 'Copy EQ'}).click();
  await expect(page.locator('.signal-flow-output[data-output-id="output-c"] .signal-flow-eq-band')).toHaveCount(1);
  await expect(page.locator('.signal-flow-output[data-output-id="output-c"] .signal-flow-eq-band')).toHaveAttribute('aria-label', /Low shelf/);
});

test('EQ validation, keyboard semantics and simulator-only deployment remain explicit', async function ({monitoredPage: page, speakerlab}) {
  const card = await openEQ(page, speakerlab, {width: 834, height: 1112});
  const add = card.getByRole('button', {name: 'Add EQ band'});
  await add.focus();
  await add.press('Enter');
  const band = card.locator('.signal-flow-eq-band');
  await expect(band).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.signal-flow-eq')).toHaveAttribute('aria-label', 'Parametric EQ for Left woofer');
  const frequency = card.getByLabel('Center or corner frequency (Hz)');
  await frequency.fill('24000');
  await frequency.blur();
  await expect(page.locator('#signal-flow-validation')).toContainText(/20,000|Nyquist/);
  await expect(page.locator('#signal-flow-save')).toBeDisabled();
  await frequency.fill('1000');
  await frequency.blur();
  await card.getByLabel('Gain (dB)').fill('-3');
  await card.getByLabel('Gain (dB)').blur();
  for (const outputID of ['output-b', 'output-d']) {
    const tweeter = page.locator('.signal-flow-output[data-output-id="' + outputID + '"]');
    await tweeter.getByRole('group', {name: 'High-pass'}).getByRole('checkbox').check();
    await tweeter.locator('#signal-flow-highPass-' + outputID + '-family').selectOption('linkwitz-riley');
    await tweeter.locator('#signal-flow-highPass-' + outputID + '-slope').selectOption('24');
    await tweeter.locator('#signal-flow-highPass-' + outputID + '-frequency').fill('2000');
    await tweeter.locator('#signal-flow-highPass-' + outputID + '-frequency').blur();
  }
  await page.locator('#signal-flow-save').click();
  await page.locator('#signal-flow-compile').click();
  await expect(page.locator('#signal-flow-deployment-status')).toContainText(/Prepared|physical/i);
  await expect(page.getByRole('button', {name: /physical apply/i})).toHaveCount(0);
  await page.locator('#signal-flow-simulate-apply').click();
  await page.locator('#signal-flow-simulate-read').click();
  await page.locator('#signal-flow-simulate-compare').click();
  await expect(page.locator('#signal-flow-message')).toContainText(/Verified in simulator/);
});
