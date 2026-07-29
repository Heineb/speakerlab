'use strict';

const fs = require('fs');
const {test, expect} = require('./fixtures');
const {
  openApplication,
  completeSetup,
  openExtension,
  configureTwoWayStereo
} = require('./helpers');

async function downloadBackup(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#backup-download-button').click();
  const download = await pending;
  return download.path();
}

async function previewBackup(page, backupPath) {
  await page.locator('#configuration-backup-file').setInputFiles(backupPath);
  await expect(page.locator('#configuration-restore-title')).toHaveText('Ready to restore');
  await expect(page.locator('#configuration-restore-preview')).toBeVisible();
  await expect(page.locator('#configuration-restore-confirm')).not.toHaveClass(/disabled/);
}

test('configuration backup downloads, previews and restores through the real UI', async function ({monitoredPage: page, speakerlab}) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'signal-flow');
  await configureTwoWayStereo(page);
  await page.locator('#signal-flow-gain-output-a').fill('-2.5');
  await page.locator('#signal-flow-gain-output-a').blur();
  await page.locator('#signal-flow-delay-output-a').fill('0.42');
  await page.locator('#signal-flow-delay-output-a').blur();
  await page.locator('#signal-flow-polarity-output-a').selectOption('inverted');
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  await openExtension(page, 'hifiberry-system-tools');
  const backupPath = await downloadBackup(page);
  expect(fs.statSync(backupPath).size).toBeGreaterThan(0);

  await openExtension(page, 'signal-flow');
  await page.locator('#signal-flow-label-output-a').fill('Changed after backup');
  await page.locator('#signal-flow-label-output-a').blur();
  await page.locator('#signal-flow-gain-output-a').fill('-6');
  await page.locator('#signal-flow-gain-output-a').blur();
  await page.locator('#signal-flow-delay-output-a').fill('1.25');
  await page.locator('#signal-flow-delay-output-a').blur();
  await page.locator('#signal-flow-polarity-output-a').selectOption('normal');
  await page.locator('#signal-flow-save').click();
  await expect(page.locator('#signal-flow-message')).toContainText('saved');
  await openExtension(page, 'hifiberry-system-tools');
  await previewBackup(page, backupPath);
  await expect(page.locator('#configuration-backup-changes')).not.toHaveText('0 changes');
  await page.locator('#configuration-restore-confirm').click();
  await expect(page.locator('#configuration-restore-title')).toHaveText('Configuration restored');
  await expect(page.locator('#configuration-restore-message')).toContainText(/restart|restored/i);

  await speakerlab.restart('connected');
  await page.reload({waitUntil: 'domcontentloaded'});
  await openExtension(page, 'signal-flow');
  await expect(page.locator('#signal-flow-label-output-a')).toHaveValue('Left woofer');
  await expect(page.locator('#signal-flow-gain-output-a')).toHaveValue('-2.5');
  await expect(page.locator('#signal-flow-delay-output-a')).toHaveValue('0.42');
  await expect(page.locator('#signal-flow-polarity-output-a')).toHaveValue('inverted');
});

test('restore failure and rollback status remain visible and retryable', async function ({monitoredPage: page, speakerlab}) {
  await openApplication(page, speakerlab);
  await completeSetup(page, 'Other Speaker');
  await openExtension(page, 'hifiberry-system-tools');
  const backupPath = await downloadBackup(page);
  await previewBackup(page, backupPath);
  await page.route('**/hifiberry-system-tools/configuration-backup/restore', async function (route) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'failed',
        error: {code: 'WRITE_FAILED', message: 'Injected acceptance-test write failure.'},
        rollback: {attempted: true, succeeded: true}
      })
    });
  });
  await page.locator('#configuration-restore-confirm').click();
  await expect(page.locator('#configuration-restore-title')).toHaveText('Restore failed');
  await expect(page.locator('#configuration-restore-message')).toContainText(/previous configuration was restored successfully/i);
  await expect(page.locator('#restore-button')).not.toHaveClass(/disabled/);
});
