'use strict';

const {expect} = require('./fixtures');

async function openApplication(page, speakerlab) {
  await page.goto(speakerlab.url, {waitUntil: 'domcontentloaded'});
  await expect(page.locator('body')).toHaveCSS('opacity', '1');
  await expect(page.locator('body')).not.toHaveClass(/disconnected/);
}

async function completeSetup(page, presetName) {
  await expect(page.locator('#setup h1:visible').first()).toContainText('Welcome');
  const next = page.locator('#assistant-button');
  await expect(next).toBeVisible();
  await expect(next).not.toHaveClass(/disabled/);
  await next.click();
  await expect(page.locator('.menu-screen#speaker-preset')).toBeVisible();
  const profile = page.locator('.speaker-preset-item', {hasText: presetName}).first();
  await expect(profile).toBeVisible();
  await profile.click();
  await expect(page.locator('#speaker-preset-preview-popup')).toBeVisible();
  await expect(page.locator('#speaker-preset-preview-popup .speaker-preset-information h1')).toHaveText(presetName);
  await page.getByText('Use This Speaker Preset', {exact: true}).click();
  await expect(page.locator('#speaker-preset-preview-popup')).toBeHidden();
  await expect(next).not.toHaveClass(/disabled/);
  await next.click();
  await expect(page.locator('#setup-finish h1:visible').first()).toHaveText('All done');
  await next.click();
  await expect(page.locator('body')).not.toHaveClass(/setup/);
  await waitForNavigation(page);
}

async function openExtension(page, extension) {
  await waitForNavigation(page);
  await page.evaluate(function (name) {
    if (!window.beo || !window.beo.showExtension(name)) {
      throw new Error('Could not open extension ' + name);
    }
  }, extension);
  await expect(page.locator('.menu-screen#' + extension)).toBeVisible();
  await waitForNavigation(page);
}

async function waitForNavigation(page) {
  await expect(page.locator('.menu-screen.new')).toHaveCount(0);
}

async function configureOutput(page, output, values) {
  const card = page.locator('.signal-flow-output[data-output-id="' + output + '"]');
  await expect(card).toBeVisible();
  const enabled = card.locator('.signal-flow-output-header input[type="checkbox"]');
  if (!(await enabled.isChecked())) await enabled.check();
  await card.locator('#signal-flow-label-' + output).fill(values.label);
  await card.locator('#signal-flow-label-' + output).blur();
  await card.locator('#signal-flow-role-' + output).selectOption(values.role);
  await card.locator('#signal-flow-side-' + output).selectOption(values.side);
  await card.locator('#signal-flow-source-' + output).selectOption(values.source);
}

async function configureTwoWayStereo(page) {
  const values = {
    'output-a': {label: 'Left woofer', role: 'woofer', side: 'left', source: 'left'},
    'output-b': {label: 'Left tweeter', role: 'tweeter', side: 'left', source: 'left'},
    'output-c': {label: 'Right woofer', role: 'woofer', side: 'right', source: 'right'},
    'output-d': {label: 'Right tweeter', role: 'tweeter', side: 'right', source: 'right'}
  };
  for (const output of Object.keys(values)) {
    await configureOutput(page, output, values[output]);
  }
}

module.exports = {
  openApplication,
  completeSetup,
  openExtension,
  configureOutput,
  configureTwoWayStereo
};
