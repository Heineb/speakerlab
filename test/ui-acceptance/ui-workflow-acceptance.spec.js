'use strict';

const {test, expect} = require('./fixtures');
const {
  openApplication,
  completeSetup,
  openExtension,
  openWorkspace,
  selectOutput,
  openDesignSection,
  configureOutput
} = require('./helpers');

async function openSpeakerDesign(page, speakerlab) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
}

async function configureTwoOutputs(page) {
  await configureOutput(page, 'output-a', {label: 'Woofer', role: 'woofer', side: 'left', source: 'left'});
  await configureOutput(page, 'output-b', {label: 'Tweeter', role: 'tweeter', side: 'left', source: 'left'});
}

function responseFile(role) {
  const lines = ['# Synthetic SpeakerLab workflow response'];
  for (let index = 0; index < 121; index++) {
    const frequency = 400 * Math.pow(20, index / 120);
    let magnitude;
    if (role === 'nearfield') magnitude = 78 + Math.log2(frequency / 400) * 0.7;
    else if (role === 'woofer') magnitude = 82 - Math.max(0, Math.log2(frequency / 2700)) * 8 + 8 * Math.exp(-Math.pow(Math.log2(frequency / 1000), 2) / 0.32);
    else magnitude = 82 - Math.max(0, Math.log2(1450 / frequency)) * 8;
    const delayMs = role === 'tweeter' ? 0.2 : 0;
    const phase = 12 - 360 * frequency * delayMs / 1000;
    lines.push(frequency.toFixed(3) + ' ' + magnitude.toFixed(3) + ' ' + phase.toFixed(3));
  }
  return lines.join('\n');
}

async function importResponse(page, name, role, output, timingGroup) {
  await openWorkspace(page, 'Measurements');
  await page.locator('#signal-flow-measurement-file').setInputFiles({
    name: name.toLowerCase().replace(/ /g, '-') + '.frd',
    mimeType: 'text/plain',
    buffer: Buffer.from(responseFile(role))
  });
  await page.getByRole('button', {name: 'Confirm import'}).click();
  if (timingGroup) {
    const advanced = page.locator('#signal-flow-measurement-detail details.signal-flow-advanced');
    await advanced.getByText('Advanced', {exact: true}).click();
    await page.locator('#signal-flow-measurement-timing-kind').selectOption('shared');
    await page.locator('#signal-flow-measurement-timing-group').fill(timingGroup);
  }
  await page.locator('#signal-flow-measurement-name').fill(name);
  await page.locator('#signal-flow-measurement-type').selectOption(role === 'nearfield' ? 'nearfield' : 'gated');
  await page.locator('#signal-flow-measurement-output').selectOption(output);
  await page.getByRole('button', {name: 'Update measurement'}).click();
  await expect(page.getByRole('option', {name: new RegExp(name)})).toBeVisible();
}

test('core design moves through two outputs, review, save and restart as one workflow', async function ({monitoredPage: page, speakerlab}) {
  await openSpeakerDesign(page, speakerlab);
  await configureTwoOutputs(page);

  let card = await selectOutput(page, 'output-a');
  await openDesignSection(card, 'Crossover');
  await card.getByRole('group', {name: 'Low-pass'}).getByLabel('Enabled').check();
  await card.locator('#signal-flow-lowPass-output-a-family').selectOption('linkwitz-riley');
  await card.locator('#signal-flow-lowPass-output-a-slope').selectOption('24');
  await card.locator('#signal-flow-lowPass-output-a-frequency').fill('2200');
  await card.locator('#signal-flow-lowPass-output-a-frequency').blur();
  await openDesignSection(card, 'Level & timing');
  await card.getByLabel('Level', {exact: true}).fill('-2');
  await card.getByLabel('Level', {exact: true}).blur();
  await card.getByLabel('Delay', {exact: true}).fill('0.2');
  await card.getByLabel('Delay', {exact: true}).blur();
  await card.getByLabel('Polarity', {exact: true}).selectOption('normal');
  await openDesignSection(card, 'Parametric EQ');
  await card.getByRole('button', {name: 'Add EQ band'}).click();
  await card.getByLabel('Gain (dB)').fill('-2');
  await card.getByLabel('Gain (dB)').blur();
  await openDesignSection(card, 'Driver Protection');
  const protection = card.locator('#signal-flow-protection-output-a');
  await protection.locator('summary').click();
  await protection.getByLabel('Nominal impedance').fill('8');
  await protection.getByLabel('Nominal impedance').blur();
  await protection.getByLabel('Continuous power rating').fill('50');
  await protection.getByLabel('Continuous power rating').blur();

  card = await selectOutput(page, 'output-b');
  await openDesignSection(card, 'Crossover');
  await card.getByRole('group', {name: 'High-pass'}).getByLabel('Enabled').check();
  await card.locator('#signal-flow-highPass-output-b-family').selectOption('linkwitz-riley');
  await card.locator('#signal-flow-highPass-output-b-slope').selectOption('24');
  await card.locator('#signal-flow-highPass-output-b-frequency').fill('2200');
  await card.locator('#signal-flow-highPass-output-b-frequency').blur();

  await openWorkspace(page, 'Review');
  await expect(page.locator('#signal-flow-design-review')).toContainText(/2\/2 configured.*2 routed/s);
  await expect(page.locator('#signal-flow-design-review')).toContainText(/Crossover.*2 enabled outputs/s);
  await expect(page.locator('#signal-flow-design-review')).toContainText(/Parametric EQ.*1 enabled band/s);
  await expect(page.locator('#signal-flow-design-review')).toContainText(/Driver Protection.*1\/2/s);
  await page.getByRole('button', {name: 'Save design'}).click();
  await expect(page.locator('#signal-flow-runtime-status')).toContainText('Design: Saved');

  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await openWorkspace(page, 'Review');
  await expect(page.locator('#signal-flow-design-review')).toContainText(/2\/2 configured.*2 routed/s);
  await expect(page.locator('#signal-flow-runtime-status')).toContainText(/Saved.*Blocked.*Simulated/);
});

test('measurement assistance stays contextual and produces only ordinary design state', async function ({monitoredPage: page, speakerlab}) {
  await openSpeakerDesign(page, speakerlab);
  await configureTwoOutputs(page);
  let card = await selectOutput(page, 'output-a');
  await openDesignSection(card, 'Crossover');
  await card.getByRole('group', {name: 'Low-pass'}).getByLabel('Enabled').check();
  await card.locator('#signal-flow-lowPass-output-a-frequency').fill('2200');
  await card.locator('#signal-flow-lowPass-output-a-frequency').blur();
  card = await selectOutput(page, 'output-b');
  await openDesignSection(card, 'Crossover');
  await card.getByRole('group', {name: 'High-pass'}).getByLabel('Enabled').check();
  await card.locator('#signal-flow-highPass-output-b-frequency').fill('2200');
  await card.locator('#signal-flow-highPass-output-b-frequency').blur();

  await importResponse(page, 'Woofer nearfield', 'nearfield', 'output-a');
  await importResponse(page, 'Woofer response', 'woofer', 'output-a', 'workflow-capture');
  await importResponse(page, 'Tweeter response', 'tweeter', 'output-b', 'workflow-capture');

  await page.getByRole('button', {name: 'Merge measurements'}).click();
  const merge = page.locator('#signal-flow-measurement-merge');
  const low = await merge.getByLabel('Nearfield source').locator('option', {hasText: 'Woofer nearfield'}).getAttribute('value');
  const high = await merge.getByLabel('Farfield source').locator('option', {hasText: 'Woofer response'}).getAttribute('value');
  await merge.getByLabel('Nearfield source').selectOption(low);
  await merge.getByLabel('Farfield source').selectOption(high);
  await merge.getByLabel('Merge frequency').fill('900');
  await merge.getByLabel('Merged response name').fill('Woofer merged response');
  await merge.getByRole('button', {name: 'Preview merge'}).click();
  await merge.getByRole('button', {name: 'Save merged response to draft'}).click();
  await expect(page.getByRole('option', {name: /Woofer merged response.*Derived response/})).toBeVisible();

  await page.getByRole('option', {name: /Woofer response/}).click();
  await page.getByRole('button', {name: 'Use for Driver alignment'}).click();
  let assistance = page.getByRole('region', {name: /Driver phase and time alignment/});
  const alignedWoofer = await assistance.getByLabel('First driver measurement').locator('option', {hasText: 'Woofer response'}).getAttribute('value');
  await assistance.getByLabel('First driver measurement').selectOption(alignedWoofer);
  await assistance.getByRole('button', {name: 'Analyse alignment'}).click();
  await assistance.getByRole('region', {name: 'Driver alignment suggestion'}).getByRole('button', {name: /Apply suggestion to/}).click();

  await openWorkspace(page, 'Measurements');
  await page.getByRole('option', {name: /Woofer response/}).click();
  await page.getByRole('button', {name: 'Use for Crossover'}).click();
  assistance = page.getByRole('region', {name: /Assisted crossover design/});
  await assistance.getByRole('button', {name: 'Generate suggestions'}).click();
  await assistance.getByRole('region', {name: 'Assisted crossover suggestions'}).getByRole('button', {name: /Apply suggestion to/}).click();

  await openWorkspace(page, 'Measurements');
  await page.getByRole('option', {name: /Woofer response/}).click();
  await page.getByRole('button', {name: 'Use for Parametric EQ'}).click();
  assistance = page.getByRole('region', {name: /Assisted EQ suggestions/});
  await assistance.getByRole('button', {name: 'Suggest EQ', exact: true}).click();
  const results = assistance.getByRole('region', {name: 'EQ suggestion results'});
  const suggestions = results.locator('input[type="checkbox"]');
  await expect(results).toBeVisible();
  await expect(suggestions).toHaveCount(1);
  await suggestions.first().check();
  await results.getByRole('button', {name: 'Accept selected suggestions'}).click();
  await page.waitForFunction(function () {
    return signalFlow.getState().draft.parametricEQ.outputs.reduce(function (total, output) { return total + output.bands.length; }, 0) > 0;
  });

  expect(await page.evaluate(function () {
    const current = signalFlow.getState();
    return {
      persistedAssistance: Object.keys(current.draft).filter(function (key) { return /suggest|assist|alignment/i.test(key); }),
      measurements: current.draft.measurements.measurements.length,
      eqBands: current.draft.parametricEQ.outputs.reduce(function (total, output) { return total + output.bands.length; }, 0)
    };
  })).toEqual({persistedAssistance: [], measurements: 4, eqBands: 1});
  await openWorkspace(page, 'Review');
  await expect(page.locator('#signal-flow-design-review')).toContainText(/Measurements.*4 available/s);
  await page.getByRole('button', {name: 'Save design'}).click();
  await expect(page.locator('#signal-flow-runtime-status')).toContainText('Design: Saved');
});

test('clean default keeps specialist diagnostics hidden and exposes one selected output', async function ({monitoredPage: page, speakerlab}) {
  await openSpeakerDesign(page, speakerlab);
  await expect(page.getByRole('tab', {name: 'Design'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.signal-flow-output-choice')).toHaveCount(4);
  await expect(page.locator('.signal-flow-output')).toHaveCount(1);
  await expect(page.locator('.signal-flow-workflow-panel:not([hidden])')).toHaveCount(1);
  await expect(page.locator('#signal-flow-deployment-advanced')).toBeHidden();
  await expect(page.getByRole('region', {name: 'Mapping confidence summary'})).toBeHidden();
  await expect(page.getByText(/optimiser score|phase fit metric/i)).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Save design'})).toBeVisible();
  await expect(page.locator('#signal-flow-runtime-status')).toContainText(/Saved.*Blocked.*Simulated/);
});

test('Advanced is accessible, mutation-free and keeps safety status outside disclosure', async function ({monitoredPage: page, speakerlab}) {
  await openSpeakerDesign(page, speakerlab);
  await openWorkspace(page, 'Review');
  const before = await page.evaluate(function () { return JSON.stringify(signalFlow.getState().draft); });
  const disclosure = page.locator('#signal-flow-deployment-advanced');
  const summary = disclosure.getByText('Advanced', {exact: true});
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Simulated · Physical deployment blocked')).toBeVisible();
  await summary.focus();
  await summary.press('Enter');
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', {name: 'Mapping confidence summary'})).toBeVisible();
  await summary.press('Enter');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(function () { return JSON.stringify(signalFlow.getState().draft); })).toBe(before);
});

test('keyboard navigation exposes canonical sections, status and Review', async function ({monitoredPage: page, speakerlab}) {
  await openSpeakerDesign(page, speakerlab);
  const outputB = page.locator('#signal-flow-output-select-output-b');
  await outputB.focus();
  await outputB.press('Enter');
  await expect(outputB).toHaveAttribute('aria-selected', 'true');
  const crossover = page.getByRole('button', {name: /^Crossover/});
  await crossover.focus();
  await crossover.press('Enter');
  await expect(crossover).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.signal-flow-output')).toHaveAttribute('aria-label', /Output B output channel/);
  const review = page.getByRole('tab', {name: 'Review'});
  await review.focus();
  await review.press('Enter');
  await expect(review).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#signal-flow-design-review [role="status"]')).toContainText(/Saved.*Deployment Blocked/);
});

for (const viewport of [
  {name: 'desktop', width: 1440, height: 1000},
  {name: 'tablet', width: 768, height: 900},
  {name: 'mobile', width: 390, height: 844}
]) {
  test('consolidated shell remains usable at ' + viewport.name + ' width', async function ({monitoredPage: page, speakerlab}) {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await openSpeakerDesign(page, speakerlab);
    await expect(page.getByRole('tablist', {name: 'Speaker Design workspace'})).toBeVisible();
    await expect(page.locator('#signal-flow-output-selector')).toBeVisible();
    await expect(page.locator('#signal-flow-save')).toBeVisible();
    const widths = await page.evaluate(function () {
      return {document: document.documentElement.scrollWidth, viewport: window.innerWidth};
    });
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    await openWorkspace(page, 'Measurements');
    await expect(page.getByText('Import a measurement to compare the driver response with your design.')).toBeVisible();
    await openWorkspace(page, 'Review');
    await expect(page.locator('#signal-flow-design-review')).toBeVisible();
  });
}
