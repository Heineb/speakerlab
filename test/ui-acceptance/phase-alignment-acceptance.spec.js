'use strict';

const crypto = require('crypto');
const routing = require('../../Beocreate2/beo-extensions/signal-flow/routing-model');
const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension} = require('./helpers');

function measurement(id, outputId, delayMs, options) {
  options = options || {};
  const points = [];
  for (let index = 0; index < 121; index++) {
    const frequencyHz = 500 * Math.pow(8, index / 120);
    const raw = (options.phaseOffset || 15) - 360 * frequencyHz * delayMs / 1000;
    const phaseDegrees = ((raw + 180) % 360 + 360) % 360 - 180;
    const point = {frequencyHz, magnitudeDb: options.magnitudeDb === undefined ? -3 : options.magnitudeDb};
    if (!options.noPhase) point.phaseDegrees = phaseDegrees;
    points.push(point);
  }
  return {id, name: options.name || id, description: '', type: options.type || 'gated', sourceFormat: options.sourceFormat || 'frd', sourceFilename: id + '.frd', importedAt: '2026-08-10T00:00:00.000Z',
    units: {frequency: 'Hz', magnitude: 'dB', phase: options.noPhase ? null : 'degrees'}, points, assignedOutputId: outputId, driverRole: outputId === 'output-a' ? 'woofer' : 'tweeter',
    conditions: {timingReference: options.reference || {kind: 'shared', group: 'capture-1'}}, validation: {state: 'valid', warnings: []}, provenance: {kind: 'imported'},
    integrity: {algorithm: 'sha256', hash: crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex')}, modelVersion: 1};
}

function design(options) {
  options = options || {};
  const configuration = routing.defaultConfiguration();
  Object.assign(configuration.outputs[0], {enabled: true, role: 'woofer', side: 'left', label: 'Left woofer'});
  Object.assign(configuration.outputs[1], {enabled: true, role: 'tweeter', side: 'left', label: 'Left tweeter'});
  configuration.connections = [{source: 'left', destination: 'output-a', enabled: true}, {source: 'left', destination: 'output-b', enabled: true}];
  configuration.crossover.outputs[0].lowPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  configuration.crossover.outputs[1].highPass = {enabled: true, family: 'linkwitz-riley', slopeDbPerOctave: 24, cutoffHz: 2000};
  configuration.channelProcessing.outputs[0].delay.valueMs = options.currentDelay || 0;
  if (options.withEQ) configuration.parametricEQ.outputs[0].bands.push({id: 'eq-a-1', enabled: true, type: 'peaking', frequencyHz: 1800, gainDb: -2, shape: 1, label: 'Crossover shaping'});
  const first = measurement('woofer-phase', 'output-a', 0, options.first || {name: 'Woofer phase'});
  const second = measurement('tweeter-phase', 'output-b', options.delay === undefined ? 0.4 : options.delay, Object.assign({name: 'Tweeter phase'}, options.second || {}));
  configuration.measurements.measurements = [first, second];
  if (options.staleDerived) {
    const mergeHigh = measurement('merge-high-source', null, 0, {name: 'Farfield source', type: 'gated', noPhase: true});
    mergeHigh.assignedOutputId = null;
    second.sourceFormat = 'derived-merge'; second.type = 'derived-merged-response'; second.units.phase = null;
    second.points = second.points.map(point => ({frequencyHz: point.frequencyHz, magnitudeDb: point.magnitudeDb}));
    second.integrity.hash = crypto.createHash('sha256').update(JSON.stringify(second.points)).digest('hex');
    second.mergeRecipe = {format: 'org.speakerlab.measurement-merge', version: 1, id: 'stale-merge', lowSourceId: first.id, highSourceId: mergeHigh.id,
      lowSourceHash: 'stale-low-hash', highSourceHash: 'stale-high-hash', mergeFrequencyHz: 2000, transitionWidthOctaves: 0.5, magnitudeOffsetDb: 0,
      phaseHandling: 'magnitude-only', interpolationPolicy: 'linear-log-frequency-v1', blendPolicy: 'raised-cosine-log-frequency-v1',
      resultMeasurementId: second.id, name: second.name, notes: ''};
    configuration.measurements.measurements.push(mergeHigh);
  }
  return configuration;
}

async function openDesign(page, speakerlab, configuration) {
  speakerlab.writeState('signal-flow.json', configuration);
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  return page.locator('.signal-flow-output[data-output-id="output-a"]');
}

async function openAlignment(card) {
  await card.getByRole('button', {name: 'Align drivers'}).click();
  const region = card.getByRole('region', {name: /Driver phase and time alignment/});
  await expect(region.getByLabel('First driver measurement')).toBeVisible();
  return region;
}

async function analyse(region) {
  await region.getByRole('button', {name: 'Analyse alignment'}).click();
  const results = region.getByRole('region', {name: 'Driver alignment suggestion'});
  await expect(results).toBeVisible();
  return results;
}

test('1 basic two-driver alignment accepts ordinary delay and persists after refresh', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design());
  const region = await openAlignment(card), results = await analyse(region);
  await expect(results).toContainText(/Delay:.*resulting delay.*Polarity:/i);
  await expect(results.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Predicted acoustic sum/);
  await results.getByRole('button', {name: /Apply suggestion to/}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/ordinary delay and polarity/);
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  const saved = await page.evaluate(() => signalFlow.getState().draft.channelProcessing.outputs.map(item => item.delay.valueMs));
  expect(saved.some(value => value > 0)).toBe(true);
  await page.reload({waitUntil: 'domcontentloaded'}); await openExtension(page, 'signal-flow');
  expect(await page.evaluate(() => signalFlow.getState().draft.channelProcessing.outputs.some(item => item.delay.valueMs > 0))).toBe(true);
});

test('2 polarity recommendation remains preview-only until explicitly applied', async function ({monitoredPage: page, speakerlab}) {
  const configuration = design({second: {phaseOffset: 195}});
  const card = await openDesign(page, speakerlab, configuration), region = await openAlignment(card), results = await analyse(region);
  const before = await page.locator('#signal-flow-polarity-output-a').inputValue();
  await expect(results).toContainText(/Polarity: (Normal|Inverted)/);
  await expect(results.locator('.signal-flow-alignment-advanced')).toContainText('Alternative polarity');
  expect(await page.locator('#signal-flow-polarity-output-a').inputValue()).toBe(before);
  await results.getByRole('button', {name: /Apply suggestion to/}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/ordinary delay and polarity/);
});

test('3 incompatible timing references block alignment without fabricated delay', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design({second: {reference: {kind: 'shared', group: 'other-capture'}}}));
  const region = await openAlignment(card);
  await expect(region).toContainText(/do not share the same timing-reference|compatible timing-reference/i);
  await expect(region.getByRole('button', {name: 'Analyse alignment'})).toBeDisabled();
  await expect(region).not.toContainText('resulting delay');
  await expect(page.locator('#signal-flow-measurement-detail')).toBeVisible();
});

test('4 missing phase disables alignment and complex summation', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design({second: {noPhase: true}})), region = await openAlignment(card);
  await expect(region).toContainText(/no usable phase data/i);
  await expect(region.getByRole('button', {name: 'Analyse alignment'})).toBeDisabled();
  await expect(region.locator('.signal-flow-alignment-graph')).toHaveCount(0);
});

test('5 existing delay is included and acceptance does not double-apply it', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design({currentDelay: 0.2})), region = await openAlignment(card), results = await analyse(region);
  await expect(results.locator('.signal-flow-alignment-advanced')).toContainText('current delay');
  const suggestion = await page.evaluate(() => signalFlow.getState().alignmentAnalyses['output-a'].suggestion);
  expect(suggestion.resultingDelayMs).toBeCloseTo(0.2 + suggestion.delayAdjustmentMs, 6);
  await results.getByRole('button', {name: /Apply suggestion to/}).click();
  await expect(page.locator('#signal-flow-message')).toContainText(/ordinary delay and polarity/);
  const delays = await page.evaluate(() => signalFlow.getState().draft.channelProcessing.outputs.map(item => item.delay.valueMs));
  expect(delays.some(value => Math.abs(value - suggestion.resultingDelayMs) < 0.000001)).toBe(true);
});

test('6 current crossover and EQ define the visible analysis context without automatic changes', async function ({monitoredPage: page, speakerlab}) {
  const configuration = design({withEQ: true}), snapshot = JSON.stringify(configuration.parametricEQ);
  const card = await openDesign(page, speakerlab, configuration), region = await openAlignment(card), results = await analyse(region);
  await expect(region.locator('.signal-flow-alignment-range')).toContainText(/Crossover analysis region.*Hz/);
  await expect(results.locator('.signal-flow-alignment-advanced')).toContainText(/current crossover, current Parametric EQ/);
  expect(await page.evaluate(() => JSON.stringify(signalFlow.getState().draft.parametricEQ))).toBe(snapshot);
});

test('7 stale derived magnitude source remains blocked', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design({staleDerived: true})), region = await openAlignment(card);
  await expect(region).toContainText(/Merged magnitude-only responses|stale and must be recomputed/i);
  await expect(region.getByRole('button', {name: 'Analyse alignment'})).toBeDisabled();
});

test('8 Advanced keeps phase fit and sample diagnostics hidden by default', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), region = await openAlignment(card);
  const advanced = region.locator('.signal-flow-alignment-options');
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(region.getByLabel('Minimum analysis frequency (Hz)')).not.toBeVisible();
  await advanced.locator('summary').click();
  await expect(region.getByLabel('Minimum analysis frequency (Hz)')).toBeVisible();
  await expect(advanced).toContainText(/robust multi-point phase-slope fit/);
});

test('9 keyboard-only workflow reaches analysis, Advanced, acceptance and Save', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design());
  const opener = card.getByRole('button', {name: 'Align drivers'}); await opener.focus(); await opener.press('Enter');
  const region = card.getByRole('region', {name: /Driver phase and time alignment/});
  const first = region.getByLabel('First driver measurement'); await first.focus(); await first.press('Tab');
  await expect(region.getByLabel('Second driver measurement')).toBeFocused(); await region.getByLabel('Second driver measurement').press('Tab');
  const button = region.getByRole('button', {name: 'Analyse alignment'}); await expect(button).toBeFocused(); await button.press('Enter');
  const results = region.getByRole('region', {name: 'Driver alignment suggestion'}); await expect(results).toBeVisible();
  const advanced = results.locator('.signal-flow-alignment-advanced summary'); await advanced.focus(); await advanced.press('Enter'); await expect(advanced).toHaveAttribute('aria-expanded', 'true');
  const apply = results.getByRole('button', {name: /Apply suggestion to/}); await apply.focus(); await apply.press('Enter');
  await page.locator('#signal-flow-save').focus(); await page.locator('#signal-flow-save').press('Enter');
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
});

test('10 semantic accessibility exposes sources, milliseconds, polarity, confidence and graph summary', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design()), region = await openAlignment(card), results = await analyse(region);
  await expect(region).toHaveAttribute('aria-label', /Driver phase and time alignment/);
  await expect(region.getByLabel('First driver measurement')).toBeVisible();
  await expect(region.getByLabel('Second driver measurement')).toBeVisible();
  await expect(results).toContainText(/ms.*Polarity:.*Confidence/i);
  await expect(results.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Source A, Source B, current sum and sum after suggested alignment/);
  await expect(results.locator('.signal-flow-alignment-advanced summary')).toHaveAttribute('aria-expanded', 'false');
  await expect(results.getByRole('button', {name: /Apply suggestion to (Left woofer|Left tweeter)/})).toBeVisible();
});

test('11 desktop tablet and mobile keep the simple workflow and Apply reachable', async function ({monitoredPage: page, speakerlab}) {
  const card = await openDesign(page, speakerlab, design());
  for (const viewport of [{width: 1440, height: 900}, {width: 834, height: 1112}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    if (!(await card.getByRole('button', {name: 'Close'}).count())) await card.getByRole('button', {name: 'Align drivers'}).click();
    const region = card.getByRole('region', {name: /Driver phase and time alignment/});
    if (!(await region.getByRole('region', {name: 'Driver alignment suggestion'}).count())) await analyse(region);
    await expect(region.getByRole('button', {name: /Apply suggestion to/})).toBeVisible();
    await expect(region.locator('.signal-flow-alignment-options')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
});
