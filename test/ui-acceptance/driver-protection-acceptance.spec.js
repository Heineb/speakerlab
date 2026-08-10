'use strict';

const fs = require('fs');
const {test, expect} = require('./fixtures');
const {openApplication, completeSetup, openExtension, configureOutput} = require('./helpers');

async function openProtection(page, speakerlab, role) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await configureOutput(page, 'output-a', {label: role === 'tweeter' ? 'Test tweeter' : 'Test woofer', role: role || 'woofer', side: 'left', source: 'left'});
  const region = page.locator('#signal-flow-protection-output-a');
  await region.locator('summary').click();
  await expect(region).toHaveAttribute('open', '');
  return region;
}

async function setField(region, label, value) {
  const field = region.getByLabel(label, {exact: true});
  await field.fill(String(value));
  await field.blur();
}

async function ensureProtectionOpen(region) {
  if ((await region.getAttribute('open')) === null) await region.locator('summary').click();
  await expect(region).toHaveAttribute('open', '');
}

async function configureProtection(region) {
  await setField(region, 'Manufacturer (optional)', 'Example Audio');
  await setField(region, 'Model (optional)', 'Driver Eight');
  await setField(region, 'Nominal impedance', 8);
  await setField(region, 'Continuous power rating', 50);
  await setField(region, 'Short-term power rating (optional)', 100);
  await setField(region, 'Maximum output voltage', 25);
  await setField(region, 'Maximum peak or clipping voltage', 35.3553);
  await setField(region, 'Amplifier gain (optional)', 26);
  await region.getByLabel('Enable peak-voltage limiter design').check();
  await setField(region, 'Raw threshold', 28.2843);
  await setField(region, 'Configured average limit (optional)', 20);
  await setField(region, 'Safety margin', -3);
  await setField(region, 'Attack', 5);
  await setField(region, 'Release', 250);
  await expect(region.getByRole('region', {name: 'Calculated electrical limits'})).toContainText('20 V RMS');
}

async function save(page) {
  await expect(page.locator('#signal-flow-save')).toBeEnabled();
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
}

test('1 configure driver protection and persist across refresh and restart', async function ({monitoredPage: page, speakerlab}) {
  let region = await openProtection(page, speakerlab);
  await configureProtection(region);
  await save(page);
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  region = page.locator('#signal-flow-protection-output-a');
  await region.locator('summary').click();
  await expect(region.getByLabel('Nominal impedance')).toHaveValue('8');
  await expect(region.getByLabel('Safety margin')).toHaveValue('-3');
  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  region = page.locator('#signal-flow-protection-output-a');
  await region.locator('summary').click();
  await expect(region.getByLabel('Raw threshold')).toHaveValue('28.2843');
  await expect(region.getByLabel('Release')).toHaveValue('250');
});

test('2 EQ and channel gain appear in the conservative headroom summary without automatic gain changes', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  const card = page.locator('.signal-flow-output[data-output-id="output-a"]');
  await card.getByRole('button', {name: 'Add EQ band'}).click();
  await card.getByLabel('Gain (dB)').fill('8');
  await card.getByLabel('Gain (dB)').blur();
  await page.locator('#signal-flow-gain-output-a').fill('-1');
  await page.locator('#signal-flow-gain-output-a').blur();
  await expect(region.getByRole('region', {name: 'Calculated electrical limits'})).toContainText(/Channel gain[\s\S]*-1 dB/);
  await expect(region.getByRole('region', {name: 'Calculated electrical limits'})).toContainText(/Maximum positive EQ contribution[\s\S]*7\.99 dB/);
  await expect(region.getByRole('region', {name: 'Driver Protection warnings'})).toContainText(/potential gain and EQ boost/i);
  await expect(page.locator('#signal-flow-gain-output-a')).toHaveValue('-1');
});

test('3 amplifier conflict becomes the limiting factor and remains a deliberate warning', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  await setField(region, 'Maximum output voltage', 7);
  await setField(region, 'Maximum peak or clipping voltage', 10);
  await expect(region.getByRole('region', {name: 'Calculated electrical limits'})).toContainText('amplifier rms limit');
  await expect(region.getByRole('region', {name: 'Driver Protection warnings'})).toContainText(/exceeds the entered amplifier maximum/i);
  await expect(page.locator('#signal-flow-save')).toBeEnabled();
  await expect(region).toContainText(/Physical mapping.*Unsupported and unverified/i);
});

test('4 invalid electrical and timing values block save without partial persistence', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await setField(region, 'Nominal impedance', 0);
  await setField(region, 'Continuous power rating', -1);
  await setField(region, 'Attack', 0);
  await setField(region, 'Release', 1);
  await setField(region, 'Safety margin', 1);
  await page.evaluate(function () { signalFlow.updateProtection('output-a', 'amplifier', 'maximumPeakVoltage', 'Infinity', false); });
  await expect(page.locator('#signal-flow-validation')).toContainText(/impedance.*at least 1|Nominal impedance/i);
  await expect(page.locator('#signal-flow-validation')).toContainText(/Continuous power/i);
  await expect(page.locator('#signal-flow-validation')).toContainText(/Attack.*0.1/i);
  await expect(page.locator('#signal-flow-validation')).toContainText(/Release.*10/i);
  await expect(page.locator('#signal-flow-validation')).toContainText(/Safety margin/i);
  await expect(page.locator('#signal-flow-validation')).toContainText(/peak voltage.*finite/i);
  await expect(page.locator('#signal-flow-save')).toBeDisabled();
  expect(fs.existsSync(speakerlab.statePath('signal-flow.json'))).toBe(false);
});

test('5 tweeter without high-pass presents a design-risk warning without a protection claim', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab, 'tweeter');
  await expect(region.getByRole('region', {name: 'Driver Protection warnings'})).toContainText(/tweeter without a high-pass/i);
  await expect(region.getByRole('region', {name: 'Driver Protection warnings'})).toContainText(/design-risk indication, not automatic protection/i);
});

test('6 normalized simulator exposes threshold crossing, attack, release and gain reduction without audio', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  await region.getByRole('button', {name: 'Run synthetic level sequence'}).click();
  const simulator = region.getByRole('region', {name: 'Limiter simulator summary'});
  await expect(simulator).toContainText('No audio is generated');
  await expect(simulator).toContainText('gain reduction');
  await expect(simulator).toContainText('Input -20 dBFS');
  await expect(simulator).toContainText('Input 0 dBFS');
  await expect(page.locator('#signal-flow-message')).toContainText('No audio was generated');
});

test('7 backup preview and restore return protection limits without a stale-draft overwrite', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  await save(page);
  await openExtension(page, 'hifiberry-system-tools');
  const pending = page.waitForEvent('download');
  await page.locator('#backup-download-button').click();
  const backupPath = await (await pending).path();
  await openExtension(page, 'signal-flow');
  const reopened = page.locator('#signal-flow-protection-output-a');
  await ensureProtectionOpen(reopened);
  await setField(reopened, 'Raw threshold', 32);
  await save(page);
  await setField(reopened, 'Raw threshold', 40);
  await openExtension(page, 'hifiberry-system-tools');
  await page.locator('#configuration-backup-file').setInputFiles(backupPath);
  await expect(page.locator('#configuration-restore-preview')).toBeVisible();
  await expect(page.locator('#configuration-backup-changes')).not.toHaveText('0 changes');
  await page.locator('#configuration-restore-confirm').click();
  await expect(page.locator('#configuration-restore-title')).toHaveText('Configuration restored');
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-message')).toContainText(/changed while you were editing|draft has been kept/i);
  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  const restored = page.locator('#signal-flow-protection-output-a');
  await ensureProtectionOpen(restored);
  await expect(restored.getByLabel('Raw threshold')).toHaveValue('28.2843');
});

test('8 deployment preview identifies unsupported mapping and simulator readback mismatch', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  await save(page);
  await page.locator('#signal-flow-compile').click();
  await expect(page.locator('#signal-flow-mapping-readiness')).toContainText(/Driver-protection|Driver protection/i);
  await expect(page.locator('#signal-flow-deployment-outputs')).toContainText(/physical mapping unknown/i);
  await expect(page.getByRole('button', {name: /physical apply/i})).toHaveCount(0);
  await page.locator('#signal-flow-simulate-apply').click();
  await page.locator('#signal-flow-simulate-read').click();
  await page.locator('#signal-flow-simulate-compare').click();
  await expect(page.locator('#signal-flow-message')).toContainText('Verified in simulator');
  const operationIndex = await page.evaluate(function () {
    return signalFlow.getState().deployment.compilation.operations.find(function (item) { return item.group === 'simulator-protection'; }).index;
  });
  await page.evaluate(function (index) { beo.send({target: 'signal-flow', header: 'setSimulationScenario', content: {scenario: {type: 'mismatch', operationIndex: index, delta: 0.5}}}); }, operationIndex);
  await page.locator('#signal-flow-simulate-read').click();
  await page.locator('#signal-flow-simulate-compare').click();
  await expect(page.locator('#signal-flow-deployment-outputs')).toContainText('different');
});

test('9 disconnect retains protection draft and reconnect reports a revision conflict', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  await save(page);
  await setField(region, 'Raw threshold', 30);
  await speakerlab.stop();
  await expect(page.locator('#signal-flow-save')).toBeDisabled();
  await expect(region.getByLabel('Raw threshold')).toHaveValue('30');
  const state = JSON.parse(fs.readFileSync(speakerlab.statePath('signal-flow.json')));
  state.driverProtection.outputs[0].limiter.thresholdPeakVoltage = 24;
  fs.writeFileSync(speakerlab.statePath('signal-flow.json'), JSON.stringify(state));
  await speakerlab.start('connected');
  await expect(page.locator('body')).not.toHaveClass(/connecting|disconnected/, {timeout: 10000});
  await expect(region.getByLabel('Raw threshold')).toHaveValue('30');
  await expect(page.locator('#signal-flow-message')).toContainText(/changed while you were editing|draft has been kept/i);
});

test('10 keyboard-only protection workflow reaches save and simulator summary', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  const impedance = region.getByLabel('Nominal impedance');
  await impedance.focus(); await page.keyboard.type('8');
  await region.getByLabel('Continuous power rating').focus(); await page.keyboard.type('50');
  await region.getByLabel('Maximum peak or clipping voltage').focus(); await page.keyboard.type('35.3553');
  await region.getByLabel('Safety margin').focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('-3');
  const enabled = region.getByLabel('Enable peak-voltage limiter design'); await enabled.focus(); await page.keyboard.press('Space');
  await region.getByLabel('Raw threshold').focus(); await page.keyboard.type('28.2843');
  await region.getByLabel('Attack').focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('5');
  await region.getByLabel('Release').focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('250'); await page.keyboard.press('Tab');
  const saveButton = page.locator('#signal-flow-save'); await saveButton.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  await region.getByRole('button', {name: 'Run synthetic level sequence'}).focus(); await page.keyboard.press('Enter');
  await expect(region.getByRole('region', {name: 'Limiter simulator summary'})).toContainText('gain reduction');
});

test('11 semantic regions expose units, enabled state, warnings, limiting factor and simulator alternative', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  await expect(region).toHaveAccessibleName('Driver Protection for Test woofer');
  await expect(region.getByLabel('Enable peak-voltage limiter design')).toBeChecked();
  await expect(region).toContainText('V RMS');
  await expect(region).toContainText('V peak');
  await expect(region.getByRole('region', {name: 'Calculated electrical limits'})).toContainText('Limiting factor');
  await expect(region.getByRole('region', {name: 'Driver Protection warnings'})).toContainText(/simulator estimate|simplified simulator/i);
  await expect(region).toContainText('Unsupported and unverified');
  await expect(region).toContainText('not guarantee');
});

test('12 desktop tablet and narrow layouts keep controls, warnings, save and simulator readable', async function ({monitoredPage: page, speakerlab}) {
  const region = await openProtection(page, speakerlab);
  await configureProtection(region);
  for (const viewport of [{width: 1280, height: 900}, {width: 834, height: 1112}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    await expect(region.getByLabel('Nominal impedance')).toBeVisible();
    await expect(region.getByRole('region', {name: 'Calculated electrical limits'})).toBeVisible();
    await expect(region.getByRole('region', {name: 'Driver Protection warnings'})).toBeVisible();
    await expect(page.locator('#signal-flow-save')).toBeVisible();
    await expect(region.getByRole('region', {name: 'Limiter simulator summary'})).toBeVisible();
  }
  const columns = await region.locator('.signal-flow-protection-grid').first().evaluate(function (element) { return getComputedStyle(element).gridTemplateColumns.split(' ').length; });
  expect(columns).toBe(1);
});
