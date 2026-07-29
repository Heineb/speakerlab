'use strict';

const {test, expect} = require('./fixtures');
const {
  openApplication,
  completeSetup,
  openExtension
} = require('./helpers');

test('first-run setup completes with Other Speaker and survives restart', async function ({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 390, height: 844});
  await openApplication(page, speakerlab);
  await expect(page.getByText('Next Step', {exact: true})).toBeVisible();
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-runtime-status')).toContainText('Simulated');

  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page.locator('body')).not.toHaveClass(/setup/);
  await openExtension(page, 'speaker-preset');
  await expect(page.locator('.speaker-preset-item[data-preset-id="other-speaker"]')).toHaveClass(/checked/);
  await openExtension(page, 'signal-flow');
});

test('named speaker profile completes setup with repository identity metadata', async function ({monitoredPage: page, speakerlab}) {
  await page.setViewportSize({width: 1024, height: 768});
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Beovox CX 50');
  await openExtension(page, 'speaker-preset');
  await expect(page.locator('.speaker-preset-item[data-preset-id="beovox-cx50"]')).toHaveClass(/checked/);
});

test('responsive setup and local navigation matrix remain operable', async function ({monitoredPage: page, speakerlab}) {
  const viewports = [
    {width: 1440, height: 900},
    {width: 834, height: 1112},
    {width: 390, height: 844}
  ];
  await openApplication(page, speakerlab);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#assistant-button')).toBeVisible();
    await expect(page.locator('#assistant-button')).not.toHaveClass(/disabled/);
  }
  await completeSetup(page, 'Other Speaker');

  const extensions = [
    ['beosonic', 'beosonic'],
    ['channels', 'channels'],
    ['equaliser', 'equaliser'],
    ['feedback', 'feedback'],
    ['general-settings', null],
    ['hifiberry-system-tools', 'hifiberry_system_tools'],
    ['product-information', 'product_information'],
    ['setup', 'setup'],
    ['signal-flow', 'signalFlow'],
    ['speaker-preset', 'speaker_preset'],
    ['volume-limit', null]
  ];
  for (const item of extensions) {
    await openExtension(page, item[0]);
    await expect(page.locator('.menu-screen#' + item[0])).toBeVisible();
    if (item[1]) {
      expect(await page.evaluate(function (name) {
        return typeof window[name] === 'object' && window[name] !== null;
      }, item[1]), item[1] + ' should be initialized').toBe(true);
    }
  }

  expect(await page.evaluate(function () {
    return {
      configuration: typeof window.speakerlabConfigurationUI === 'object',
      signalFlowState: typeof window.signalFlowUIState === 'object',
      productInformation: typeof window.product_information === 'object'
    };
  })).toEqual({
    configuration: true,
    signalFlowState: true,
    productInformation: true
  });
});
