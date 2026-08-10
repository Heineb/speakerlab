const {test, expect} = require('./fixtures');
const path = require('path');
const {openApplication, completeSetup, openExtension} = require('./helpers');

async function openMeasurements(page, speakerlab) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
}

test('imports REW, associates metadata, persists, and remains accessible on narrow screens', async function({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 390, height: 844});
  await openMeasurements(page, speakerlab);
  const region = page.getByRole('region', {name: 'Measurements'});
  await expect(region).toBeVisible();
  await page.locator('#signal-flow-measurement-file').setInputFiles(path.join(__dirname, '../fixtures/measurement-rew.txt'));
  await expect(page.getByText(/Detected rew-text/)).toBeVisible();
  await expect(page.getByText(/10 points/)).toBeVisible();
  await page.getByRole('button', {name: 'Confirm import'}).click();
  await expect(page.getByRole('option', {name: /measurement-rew.txt/})).toBeVisible();
  await expect(page.getByRole('img', {name: /Measured magnitude response/})).toBeVisible();
  await page.locator('#signal-flow-measurement-name').fill('Woofer gated');
  await page.locator('#signal-flow-measurement-type').selectOption('gated');
  await page.locator('#signal-flow-measurement-output').selectOption('output-a');
  await page.getByRole('button', {name: 'Update measurement'}).click();
  await page.getByRole('button', {name: 'Save design'}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/saved/i);
  await page.reload();
  await openExtension(page, 'signal-flow');
  await expect(page.getByRole('option', {name: /Woofer gated/})).toBeVisible();
  await expect(page.getByText(/not an acoustic prediction/i)).toBeVisible();
});

test('imports FRD without phase and exposes warning text', async function({monitoredPage: page, speakerlab}) {
  await openMeasurements(page, speakerlab);
  await page.locator('#signal-flow-measurement-file').setInputFiles(path.join(__dirname, '../fixtures/measurement-magnitude.frd'));
  await expect(page.getByText('The source contains no phase information.')).toBeVisible();
  await page.getByRole('button', {name: 'Confirm import'}).click();
  await expect(page.getByRole('option', {name: /Phase not available/})).toBeVisible();
});

test('rejects malformed input without leaving a partial measurement', async function({monitoredPage: page, speakerlab}) {
  await openMeasurements(page, speakerlab);
  await page.locator('#signal-flow-measurement-file').setInputFiles({name: 'malformed.frd', mimeType: 'text/plain', buffer: Buffer.from('10 20\n20 broken')});
  await expect(page.locator('#signal-flow-message')).toContainText(/malformed/i);
  await expect(page.locator('#signal-flow-measurement-list').getByRole('option')).toHaveCount(0);
});
