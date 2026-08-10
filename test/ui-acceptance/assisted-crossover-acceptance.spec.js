'use strict';

const crypto = require('crypto');
const routing = require('../../Beocreate2/beo-extensions/signal-flow/routing-model');
const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension} = require('./helpers');

function measurement(id, outputId, role, options) {
  options = options || {};
  const minimum = options.minimum || 400, maximum = options.maximum || 8000, points = [];
  for (let index = 0; index < 121; index++) {
    const frequencyHz = minimum * Math.pow(maximum / minimum, index / 120);
    const rolloff = role === 'woofer' ? -Math.max(0, Math.log2(frequencyHz / 2700)) * 8 : -Math.max(0, Math.log2(1450 / frequencyHz)) * 8;
    const point = {frequencyHz, magnitudeDb: rolloff + (options.offsetDb || 0) + Math.sin(index / 12) * 0.2};
    if (!options.noPhase) {
      const raw = (options.phaseOffset === undefined ? 12 : options.phaseOffset) - 360 * frequencyHz * (options.delayMs || 0) / 1000;
      point.phaseDegrees = ((raw + 180) % 360 + 360) % 360 - 180;
    }
    points.push(point);
  }
  return {id, name: options.name || id, description: '', type: options.type || 'gated', sourceFormat: options.sourceFormat || 'frd', sourceFilename: id + '.frd', importedAt: '2026-08-10T00:00:00.000Z',
    units: {frequency: 'Hz', magnitude: 'dB', phase: options.noPhase ? null : 'degrees'}, points, assignedOutputId: outputId, driverRole: role,
    conditions: {timingReference: options.reference || {kind: 'shared', group: 'crossover-capture'}}, validation: {state: 'valid', warnings: []}, provenance: {kind: 'imported'},
    integrity: {algorithm: 'sha256', hash: crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex')}, modelVersion: 1};
}

function design(options) {
  options = options || {};
  const configuration = routing.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Left woofer'});
  Object.assign(configuration.outputs[1], {enabled: true, role: 'tweeter', side: 'left', label: 'Left tweeter'});
  configuration.connections = [{source: 'left', destination: 'output-a', enabled: true}, {source: 'left', destination: 'output-b', enabled: true}];
  configuration.crossover.outputs[0].lowPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2200};
  configuration.crossover.outputs[1].highPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2200};
  configuration.channelProcessing.outputs[0].delay.valueMs = options.currentDelay || 0;
  configuration.channelProcessing.outputs[0].polarity.inverted = !!options.currentPolarity;
  if (options.withEQ) configuration.parametricEQ.outputs[0].bands.push({id: 'eq-existing', enabled: true, type: 'peaking', frequencyHz: 1800, gainDb: -2, shape: 1, label: 'Existing EQ'});
  if (options.withProtection) {
    configuration.driverProtection.outputs[1].limiter.enabled = true;
    configuration.driverProtection.outputs[1].limiter.thresholdPeakVoltage = 10;
    configuration.driverProtection.outputs[1].driver.continuousPowerWatts = 30;
  }
  const low = measurement('woofer-response', 'output-a', 'woofer', Object.assign({name: 'Woofer response'}, options.low || {}));
  const high = measurement('tweeter-response', 'output-b', 'tweeter', Object.assign({name: 'Tweeter response', delayMs: 0.2}, options.high || {}));
  configuration.measurements.measurements = [low, high];
  return configuration;
}

async function openDesign(page, speakerlab, configuration) {
  speakerlab.writeState('signal-flow.json', configuration);
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  return page.locator('.signal-flow-output[data-output-id="output-a"]');
}

async function openAssistance(card) {
  await card.getByRole('button', {name: 'Suggest setup'}).click();
  const region = card.getByRole('region', {name: /Assisted crossover design/});
  await expect(region.getByLabel('First driver measurement')).toBeVisible();
  return region;
}

async function generate(region) {
  await region.getByRole('button', {name: 'Generate suggestions'}).click();
  const results = region.getByRole('region', {name: 'Assisted crossover suggestions'});
  await expect(results).toBeVisible();
  return results;
}

test('1 basic suggestion accepts an ordinary draft and persists only after Save and refresh', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), region = await openAssistance(card), results = await generate(region);
  expect(await page.evaluate(() => signalFlow.getState().dirty)).toBe(false);
  await results.getByRole('button', {name: /Apply suggestion to Left woofer and Left tweeter/}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/ordinary crossover/i);
  expect(await page.evaluate(() => signalFlow.getState().dirty)).toBe(true);
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  const savedFrequency = await page.evaluate(() => signalFlow.getState().draft.crossover.outputs[0].lowPass.cutoffHz);
  await page.reload({waitUntil: 'domcontentloaded'}); await openExtension(page, 'signal-flow');
  expect(await page.evaluate(() => signalFlow.getState().draft.crossover.outputs[0].lowPass.cutoffHz)).toBe(savedFrequency);
});

test('2 at most three alternatives change preview selection without mutating the draft', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), region = await openAssistance(card);
  const before = await page.evaluate(() => JSON.stringify(signalFlow.getState().draft));
  const results = await generate(region), alternatives = results.getByRole('radio');
  expect(await alternatives.count()).toBeLessThanOrEqual(3);
  if (await alternatives.count() > 1) await alternatives.nth(1).check();
  expect(await page.evaluate(() => JSON.stringify(signalFlow.getState().draft))).toBe(before);
  await expect(results.locator('svg[role="img"]')).toBeVisible();
});

test('3 magnitude-only fallback labels power summation and omits polarity and delay claims', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design({low: {noPhase: true}, high: {noPhase: true}})), results = await generate(await openAssistance(card));
  await expect(results).toContainText(/Magnitude-based crossover suggestion/i);
  await expect(results).toContainText(/no complex acoustic sum/i);
  await expect(results).toContainText(/polarity unchanged/i);
  await expect(results).not.toContainText(/Delay [0-9]/i);
  await expect(results.locator('svg[role="img"]')).toHaveAttribute('aria-label', /magnitude-only power summation.*No complex acoustic sum/i);
});

test('4 phase-aware mode exposes complex summation and explicit polarity or delay context', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design({high: {phaseOffset: 190, delayMs: 0.2}})), results = await generate(await openAssistance(card));
  await expect(results).toContainText(/Phase-aware crossover suggestion/i);
  await expect(results).toContainText(/(normal|inverted) polarity/i);
  await expect(results.locator('svg[role="img"]')).toHaveAttribute('aria-label', /predicted complex acoustic sum/i);
});

test('5 user-declared timing is visible and never presented as acoustically verified', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), results = await generate(await openAssistance(card));
  await expect(results).toContainText(/user-declared compatible/i);
  await expect(results).toContainText(/cannot be acoustically verified/i);
  await expect(results).not.toContainText(/verified timing|acoustically verified timing/i);
});

test('6 poor measurement overlap blocks generation with an actionable explanation', async function ({monitoredPage: page, speakerlab}) {
  const configuration = design({low: {minimum: 100, maximum: 900}, high: {minimum: 1200, maximum: 8000}});
  const card = await openDesign(page, speakerlab, configuration), region = await openAssistance(card);
  await expect(region).toContainText(/do not have enough reliable overlap/i);
  await expect(region.getByRole('button', {name: 'Generate suggestions'})).toBeDisabled();
});

test('7 current crossover remains a visible baseline until explicit acceptance', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), results = await generate(await openAssistance(card));
  await expect(results).toContainText('Current crossover baseline: 2200 Hz');
  expect(await page.evaluate(() => signalFlow.getState().draft.crossover.outputs[0].lowPass.cutoffHz)).toBe(2200);
  await expect(results.locator('svg[role="img"]')).toHaveAttribute('aria-label', /current crossover result and selected suggested result/i);
});

test('8 existing EQ gain delay and polarity are included and only explicit processing may change', async function ({monitoredPage: page, speakerlab}) {
  const configuration = design({withEQ: true, currentDelay: 0.1, currentPolarity: true});
  const eqBefore = JSON.stringify(configuration.parametricEQ), gainBefore = configuration.channelProcessing.outputs[0].gain.valueDb;
  const card = await openDesign(page, speakerlab, configuration), results = await generate(await openAssistance(card));
  await results.locator('.signal-flow-crossover-assistance-advanced summary').click();
  await expect(results).toContainText(/current Parametric EQ, current gain, current delay, current polarity/);
  await results.getByRole('button', {name: /Apply suggestion to/}).click();
  expect(await page.evaluate(() => JSON.stringify(signalFlow.getState().draft.parametricEQ))).toBe(eqBefore);
  expect(await page.evaluate(() => signalFlow.getState().draft.channelProcessing.outputs[0].gain.valueDb)).toBe(gainBefore);
});

test('9 protection context warns without promising thermal or excursion safety', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design({withProtection: true})), results = await generate(await openAssistance(card));
  await expect(results).toContainText(/not guaranteed thermal or excursion protection/i);
  await expect(results).not.toContainText(/safe from thermal|safe from excursion/i);
});

test('10 Advanced diagnostics stay collapsed and can be opened and closed', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), results = await generate(await openAssistance(card));
  const advanced = results.locator('.signal-flow-crossover-assistance-advanced'), summary = advanced.locator('summary');
  await expect(advanced).not.toHaveAttribute('open', '');
  await summary.click(); await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(advanced).toContainText(/Objective score.*Smoothness.*Cancellation/s);
  await summary.click(); await expect(summary).toHaveAttribute('aria-expanded', 'false');
});

test('11 keyboard flow reaches generation selection acceptance and Save', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), opener = card.getByRole('button', {name: 'Suggest setup'});
  await opener.focus(); await opener.press('Enter');
  const region = card.getByRole('region', {name: /Assisted crossover design/}), generateButton = region.getByRole('button', {name: 'Generate suggestions'});
  await generateButton.focus(); await generateButton.press('Enter');
  const results = region.getByRole('region', {name: 'Assisted crossover suggestions'}), apply = results.getByRole('button', {name: /Apply suggestion to/});
  await results.getByRole('radio').first().focus(); await results.getByRole('radio').first().press('Space');
  await apply.focus(); await apply.press('Enter');
  await page.locator('#signal-flow-save').focus(); await page.locator('#signal-flow-save').press('Enter');
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
});

test('12 semantic status exposes sources alternatives confidence warnings and graph meaning', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), region = await openAssistance(card), results = await generate(region);
  await expect(region).toHaveAttribute('aria-label', /Assisted crossover design/);
  await expect(region.getByLabel('First driver measurement')).toBeVisible();
  await expect(region.getByLabel('Second driver measurement')).toBeVisible();
  await expect(results.getByRole('radiogroup', {name: 'Crossover alternatives'})).toBeVisible();
  await expect(results).toContainText(/Confidence (moderate|reduced)/i);
  await expect(results.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Woofer response and Tweeter response/);
});

test('13 desktop tablet and mobile keep suggestions and Apply reachable without horizontal overflow', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design());
  for (const viewport of [{width: 1440, height: 900}, {width: 834, height: 1112}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    if (!(await card.getByRole('region', {name: /Assisted crossover design/}).count())) await card.getByRole('button', {name: 'Suggest setup'}).click();
    const region = card.getByRole('region', {name: /Assisted crossover design/});
    if (!(await region.getByRole('region', {name: 'Assisted crossover suggestions'}).count())) await generate(region);
    await expect(region.getByRole('button', {name: /Apply suggestion to/})).toBeVisible();
    await expect(region.locator('.signal-flow-crossover-assistance-advanced')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
});
