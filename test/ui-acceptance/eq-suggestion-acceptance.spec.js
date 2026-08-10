'use strict';

const path = require('path');
const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension, configureOutput} = require('./helpers');

const fixtureRoot = path.join(__dirname, '..', 'fixtures');

async function openOutput(page, speakerlab, role) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await configureOutput(page, 'output-a', {label: role === 'tweeter' ? 'Reference tweeter' : 'Reference woofer', role: role || 'woofer', side: 'left', source: 'left'});
  return page.locator('.signal-flow-output[data-output-id="output-a"]');
}

async function importMeasurement(page, filename, type) {
  await page.locator('#signal-flow-measurement-file').setInputFiles(path.join(fixtureRoot, filename));
  await expect(page.locator('#signal-flow-measurement-preview')).toContainText(/Detected frd/i);
  await page.getByRole('button', {name: 'Confirm import'}).click();
  await expect(page.locator('#signal-flow-measurement-detail')).toBeVisible();
  await page.locator('#signal-flow-measurement-type').selectOption(type || 'farfield');
  await page.locator('#signal-flow-measurement-output').selectOption('output-a');
  await page.getByRole('button', {name: 'Update measurement'}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/Measurement updated/i);
}

async function openSuggestions(card) {
  await card.getByRole('button', {name: 'Suggest EQ from measurement'}).click();
  const region = card.getByRole('region', {name: /Assisted EQ suggestions/});
  await expect(region.getByLabel('Reference measurement')).toBeVisible();
  return region;
}

async function generate(region, target) {
  if (target) await region.getByLabel('Target', {exact: true}).selectOption(target);
  await region.getByRole('button', {name: 'Suggest EQ', exact: true}).click();
  await expect(region.getByRole('region', {name: 'EQ suggestion results'})).toBeVisible();
  return region.getByRole('region', {name: 'EQ suggestion results'});
}

async function selectFirst(results, count) {
  const checkboxes = results.locator('.signal-flow-eq-suggestion-list input[type="checkbox"]');
  const available = await checkboxes.count();
  expect(available).toBeGreaterThanOrEqual(count);
  for (let index = 0; index < count; index++) await checkboxes.nth(index).check();
}

test('1 basic assisted EQ suggestions become normal editable bands only after review and save', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  const region = await openSuggestions(card);
  const results = await generate(region, 'flat');
  await expect(results).toContainText(/bounded peaking EQ|Predicted with suggestions/i);
  await expect(results.locator('.signal-flow-eq-suggestion-list li')).toHaveCount(2);
  await selectFirst(results, 2);
  await results.getByRole('button', {name: 'Accept selected suggestions'}).click();
  await expect(card.locator('.signal-flow-eq-band')).toHaveCount(2);
  await expect(card.locator('.signal-flow-eq-band').first()).toContainText('Assisted EQ');
  await card.locator('.signal-flow-eq-band').first().click();
  await expect(card.getByLabel('Gain (dB)')).toBeEditable();
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('.signal-flow-output[data-output-id="output-a"] .signal-flow-eq-band')).toHaveCount(2);
});

test('2 rejecting suggestions leaves EQ, design persistence and source measurement unchanged', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  const before = await page.evaluate(function () { return JSON.stringify(signalFlow.getState().draft.measurements); });
  const region = await openSuggestions(card);
  const results = await generate(region, 'flat');
  await selectFirst(results, 1);
  await results.getByRole('button', {name: 'Reject all suggestions'}).click();
  await expect(card.locator('.signal-flow-eq-band')).toHaveCount(0);
  expect(await page.evaluate(function () { return JSON.stringify(signalFlow.getState().draft.measurements); })).toBe(before);
  await expect(page.locator('#signal-flow-message')).toContainText('unchanged');
});

test('3 existing EQ is considered, preserved and accepted suggestions are additive', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  await card.getByRole('button', {name: 'Add EQ band'}).click();
  await card.getByLabel('Optional band label').fill('Existing correction');
  await card.getByLabel('Optional band label').blur();
  await card.getByLabel('Center or corner frequency (Hz)').fill('500');
  await card.getByLabel('Center or corner frequency (Hz)').blur();
  await card.getByLabel('Gain (dB)').fill('-2');
  await card.getByLabel('Gain (dB)').blur();
  const region = await openSuggestions(card);
  const results = await generate(region, 'flat');
  await selectFirst(results, 1);
  await results.getByRole('button', {name: 'Accept selected suggestions'}).click();
  await expect(card.locator('.signal-flow-eq-band')).toHaveCount(2);
  await expect(card.locator('.signal-flow-eq-band').first()).toContainText('Existing correction');
  await expect(card.locator('.signal-flow-eq-band').nth(1)).toContainText('Assisted EQ');
});

test('4 deep narrow cancellation is not filled and restraint is explained', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-deep-null.frd', 'farfield');
  const region = await openSuggestions(card);
  await region.locator('.signal-flow-eq-suggestion-advanced summary').click();
  await region.getByLabel('Analysis smoothing').selectOption('none');
  const results = await generate(region, 'flat');
  await expect(results).toContainText(/deep narrow cancellation.*left uncorrected|likely null/i);
  const gains = await results.locator('.signal-flow-eq-suggestion-list strong').allTextContents();
  expect(gains.some(text => /^\+[4-9]/.test(text))).toBe(false);
});

test('5 positive correction reports headroom and protection concern without changing channel gain', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-broad-dip.frd', 'farfield');
  await page.evaluate(function () {
    signalFlow.updateProtection('output-a', 'driver', 'nominalImpedanceOhms', 8, false);
    signalFlow.updateProtection('output-a', 'driver', 'continuousPowerWatts', 50, false);
    signalFlow.updateProtection('output-a', 'amplifier', 'maximumPeakVoltage', 30, false);
    signalFlow.updateProtection('output-a', 'limiter', 'enabled', true, false);
    signalFlow.updateProtection('output-a', 'limiter', 'thresholdPeakVoltage', 20, false);
  });
  const gainBefore = await page.locator('#signal-flow-gain-output-a').inputValue();
  const region = await openSuggestions(card);
  const results = await generate(region, 'flat');
  await expect(results).toContainText(/voltage demand|headroom/i);
  await expect(results).toContainText(/configured electrical protection limit/i);
  expect(await page.locator('#signal-flow-gain-output-a').inputValue()).toBe(gainBefore);
});

test('6 crossover-aware range excludes irrelevant corrections outside woofer operation', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  await card.getByRole('group', {name: 'Low-pass'}).getByRole('checkbox').check();
  await card.locator('#signal-flow-lowPass-output-a-frequency').fill('2000');
  await card.locator('#signal-flow-lowPass-output-a-frequency').blur();
  const region = await openSuggestions(card);
  const results = await generate(region, 'flat');
  await expect(results).toContainText(/Active range .*1818/i);
  const frequencies = await results.locator('.signal-flow-eq-suggestion-list strong').allTextContents();
  frequencies.forEach(function (text) { const match = text.match(/at ([\d.]+) Hz/); if (match) expect(Number(match[1])).toBeLessThanOrEqual(1818.2); });
});

test('7 stale merged source is blocked and becomes eligible after source hashes are recomputed', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-nearfield.frd', 'nearfield');
  await importMeasurement(page, 'measurement-farfield.frd', 'farfield');
  await page.getByRole('button', {name: 'Merge measurements'}).click();
  const lowValue = await page.locator('#signal-flow-merge-low option', {hasText: 'measurement-nearfield.frd'}).getAttribute('value');
  const highValue = await page.locator('#signal-flow-merge-high option', {hasText: 'measurement-farfield.frd'}).getAttribute('value');
  await page.locator('#signal-flow-merge-low').selectOption(lowValue);
  await page.locator('#signal-flow-merge-high').selectOption(highValue);
  await page.locator('#signal-flow-merge-frequency').fill('640');
  await page.locator('#signal-flow-merge-width').fill('0.5');
  await page.getByRole('button', {name: 'Preview merge'}).click();
  await expect(page.locator('#signal-flow-measurement-merge-preview')).toContainText(/Merge review.*Derived merged response/i);
  await expect(page.getByRole('button', {name: 'Save merged response to draft'})).toBeEnabled();
  await page.getByRole('button', {name: 'Save merged response to draft'}).click();
  await page.locator('#signal-flow-measurement-output').selectOption('output-a');
  await page.getByRole('button', {name: 'Update assignment'}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/Measurement updated/i);
  await page.evaluate(function () {
    var derived = signalFlow.getState().draft.measurements.measurements.find(function (item) { return item.sourceFormat === 'derived-merge'; });
    derived.mergeRecipe.lowSourceHash = 'stale-source-hash';
  });
  let region = await openSuggestions(card);
  await expect(region).toContainText(/Recompute the stale merged response/i);
  await page.evaluate(function () {
    var list = signalFlow.getState().draft.measurements.measurements;
    var derived = list.find(function (item) { return item.sourceFormat === 'derived-merge'; });
    derived.mergeRecipe.lowSourceHash = list.find(function (item) { return item.id === derived.mergeRecipe.lowSourceId; }).integrity.hash;
  });
  await card.getByRole('button', {name: 'Close'}).click();
  region = await openSuggestions(card);
  await expect(region.getByLabel('Reference measurement').locator('option:not([disabled])')).toHaveCount(1);
});

test('8 Advanced disclosure keeps numerical optimisation controls out of the primary flow', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  const region = await openSuggestions(card);
  const advanced = region.locator('.signal-flow-eq-suggestion-advanced');
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(region.getByLabel('Analysis smoothing')).not.toBeVisible();
  await advanced.locator('summary').click();
  await expect(advanced).toHaveAttribute('open', '');
  await expect(region.getByLabel('Analysis smoothing')).toBeVisible();
  await expect(region.getByLabel('Suggestion limit')).toBeVisible();
  await advanced.locator('summary').click();
  await expect(region.getByLabel('Analysis smoothing')).not.toBeVisible();
});

test('9 keyboard-only workflow selects, accepts and saves a suggestion', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  const opener = card.getByRole('button', {name: 'Suggest EQ from measurement'});
  await opener.focus(); await opener.press('Enter');
  const region = card.getByRole('region', {name: /Assisted EQ suggestions/});
  const measurement = region.getByLabel('Reference measurement');
  await measurement.focus(); await measurement.press('Tab');
  await expect(region.getByLabel('Target', {exact: true})).toBeFocused();
  await region.getByLabel('Target', {exact: true}).press('Tab');
  const suggest = region.getByRole('button', {name: 'Suggest EQ', exact: true});
  await expect(suggest).toBeFocused(); await suggest.press('Enter');
  const checkbox = region.locator('.signal-flow-eq-suggestion-list input').first();
  await checkbox.focus(); await checkbox.press('Space');
  const accept = region.getByRole('button', {name: 'Accept selected suggestions'});
  await accept.focus(); await accept.press('Enter');
  await page.locator('#signal-flow-save').focus(); await page.locator('#signal-flow-save').press('Enter');
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
});

test('10 semantic accessibility exposes names, selected state, textual warnings and graph summary', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  const region = await openSuggestions(card);
  const results = await generate(region, 'gentle-downward-tilt');
  await expect(region.getByLabel('Reference measurement')).toBeVisible();
  await expect(region.getByLabel('Target', {exact: true})).toHaveValue('gentle-downward-tilt');
  await expect(results.locator('[role="status"]')).toContainText(/suggestion.*Active range/i);
  const checkbox = results.locator('input[type="checkbox"]').first();
  await expect(checkbox).toHaveAttribute('aria-describedby', /reason/);
  await checkbox.check(); await expect(checkbox).toBeChecked();
  await expect(results.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Measured, Target, Current estimated response and Predicted with suggestions/);
  await expect(results).toContainText('Headroom consequence');
  await expect(region.locator('.signal-flow-eq-suggestion-advanced summary')).toHaveAttribute('aria-expanded', 'false');
});

test('11 desktop tablet and narrow layouts keep the primary workflow compact and reachable', async function ({monitoredPage: page, speakerlab}) {
  const card = await openOutput(page, speakerlab, 'woofer');
  await importMeasurement(page, 'measurement-eq-suggestions.frd', 'farfield');
  for (const viewport of [{width: 1440, height: 900}, {width: 834, height: 1112}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    if (!(await card.getByRole('button', {name: 'Close'}).count())) await card.getByRole('button', {name: 'Suggest EQ from measurement'}).click();
    const region = card.getByRole('region', {name: /Assisted EQ suggestions/});
    await expect(region.getByLabel('Reference measurement')).toBeVisible();
    await expect(region.getByRole('button', {name: 'Suggest EQ', exact: true})).toBeVisible();
    await expect(region.locator('.signal-flow-eq-suggestion-advanced')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(function () { return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1; })).toBe(true);
  }
});
