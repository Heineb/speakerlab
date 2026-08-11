'use strict';

const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension, configureTwoWayStereo, selectOutput, openDesignSection} = require('./helpers');

async function openProcessingDesign(page, speakerlab) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  const card = await configureTwoWayStereo(page);
  await openDesignSection(card, 'Level & timing');
}

test('gain delay and polarity save across refresh and server restart', async function ({monitoredPage: page, speakerlab}) {
  await openProcessingDesign(page, speakerlab);
  const card = page.locator('.signal-flow-output[data-output-id="output-a"]');
  await card.locator('#signal-flow-gain-output-a').fill('-2.5');
  await card.locator('#signal-flow-gain-output-a').blur();
  await card.locator('#signal-flow-delay-output-a').fill('0.42');
  await card.locator('#signal-flow-delay-output-a').blur();
  await card.locator('#signal-flow-polarity-output-a').selectOption('inverted');
  await expect(card.locator('.signal-flow-processing-summary')).toContainText('-2.5 dB');
  await expect(card.locator('.signal-flow-processing-summary')).toContainText('0.42 ms');
  await expect(card.locator('.signal-flow-processing-summary')).toContainText('Polarity inverted');
  await expect(card.locator('.signal-flow-processing-detail')).toContainText('14.41 cm');
  await expect(card.locator('.signal-flow-processing-detail')).toContainText('20 samples');
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');

  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await openDesignSection(await selectOutput(page, 'output-a'), 'Level & timing');
  await expect(page.locator('#signal-flow-gain-output-a')).toHaveValue('-2.5');
  await expect(page.locator('#signal-flow-delay-output-a')).toHaveValue('0.42');
  await expect(page.locator('#signal-flow-polarity-output-a')).toHaveValue('inverted');

  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await openDesignSection(await selectOutput(page, 'output-a'), 'Level & timing');
  await expect(page.locator('#signal-flow-gain-output-a')).toHaveValue('-2.5');
  await expect(page.locator('#signal-flow-delay-output-a')).toHaveValue('0.42');
  await expect(page.locator('#signal-flow-polarity-output-a')).toHaveValue('inverted');
});

test('unit conversion, validation, warnings, reset and processing copy are visible', async function ({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 390, height: 844});
  await openProcessingDesign(page, speakerlab);
  const left = page.locator('.signal-flow-output[data-output-id="output-a"]');
  await left.locator('#signal-flow-delay-output-a').fill('1');
  await left.locator('#signal-flow-delay-output-a').blur();
  await left.locator('#signal-flow-delay-unit-output-a').selectOption('cm');
  await expect(left.locator('#signal-flow-delay-output-a')).toHaveValue('34.3');
  await left.locator('#signal-flow-delay-unit-output-a').selectOption('m');
  await expect(left.locator('#signal-flow-delay-output-a')).toHaveValue('0.343');
  await left.locator('#signal-flow-gain-output-a').fill('2');
  await left.locator('#signal-flow-gain-output-a').blur();
  await left.locator('#signal-flow-polarity-output-a').selectOption('inverted');
  await expect(page.locator('#signal-flow-validation')).toContainText(/positive gain|polarity settings differ/i);

  await left.locator('#signal-flow-processing-copy-output-a').selectOption('output-c');
  await left.getByRole('button', {name: 'Copy processing'}).click();
  const right = await selectOutput(page, 'output-c');
  await openDesignSection(right, 'Level & timing');
  await expect(right.locator('#signal-flow-gain-output-c')).toHaveValue('2');
  await expect(right.locator('#signal-flow-polarity-output-c')).toHaveValue('inverted');
  await selectOutput(page, 'output-a');
  await openDesignSection(left, 'Level & timing');

  await left.locator('#signal-flow-gain-output-a').fill('7');
  await left.locator('#signal-flow-gain-output-a').blur();
  await expect(page.locator('#signal-flow-validation')).toContainText(/between -60 dB and \+6 dB/);
  await expect(page.locator('#signal-flow-save')).toHaveClass(/disabled/);
  await left.getByRole('button', {name: 'Reset processing'}).click();
  await expect(page.locator('#signal-flow-gain-output-a')).toHaveValue('0');
  await expect(page.locator('#signal-flow-delay-output-a')).toHaveValue('0');
  await expect(page.locator('#signal-flow-polarity-output-a')).toHaveValue('normal');
});

test('processing controls support keyboard editing and semantic inspection', async function ({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 834, height: 1112});
  await openProcessingDesign(page, speakerlab);
  const gain = page.getByLabel('Level', {exact: true});
  const delay = page.getByLabel('Delay', {exact: true}).first();
  const unit = page.getByLabel('Delay unit for Left woofer');
  const polarity = page.getByLabel('Polarity', {exact: true}).first();
  await gain.focus();
  await gain.fill('-1.5');
  await gain.press('Tab');
  await expect(delay).toBeFocused();
  await delay.fill('0.5');
  await delay.press('Tab');
  await expect(unit).toBeFocused();
  await unit.selectOption('cm');
  await unit.press('Tab');
  await expect(polarity).toBeFocused();
  await polarity.selectOption('inverted');
  await expect(gain).toHaveAttribute('aria-describedby', /signal-flow-validation/);
  await expect(delay).toHaveAttribute('aria-describedby', /signal-flow-delay-details-output-a/);
  await expect(page.locator('.signal-flow-output[data-output-id="output-a"]')).toHaveAttribute('aria-label', 'Left woofer output channel');
  await expect(page.locator('#signal-flow-validation')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#signal-flow-summary')).toContainText('Unsaved changes');
});
