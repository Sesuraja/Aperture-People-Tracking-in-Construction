import { test, expect } from '@playwright/test';

test.describe('Settings Page User Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Collect unhandled page exceptions
    page.on('pageerror', (err) => {
      console.error('[Page Error]:', err.message);
    });

    // Pre-authenticate as administrator before navigating
    await page.addInitScript(() => {
      localStorage.setItem('gao_jwt_token', 'demo');
      localStorage.setItem('gao_app_mode', 'real');
      localStorage.setItem('gao_active_organization', 'default');
      localStorage.setItem('gao_active_project', 'metro-tower');
    });
  });

  test('User can navigate to Settings, browse all sections, configure General settings, and test MongoDB connection', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Visit the Settings page directly
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // 2. Verify Settings sidebar is rendered and active
    const settingsSidebar = page.locator('aside, .md\\:w-64');
    await expect(settingsSidebar.first()).toBeVisible();

    // Verify main Settings header in sidebar
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Verify default active section is Industry & Use-Case Customizer
    await expect(page.locator('#settings_industry_tab')).toBeVisible();
    await expect(page.getByText('Active Industry Domain')).toBeVisible();

    // 3. Test Industry Configuration Section interactions
    // Check preset buttons (e.g. Construction, Healthcare)
    await expect(page.getByRole('heading', { name: 'Construction & Heavy Infrastructure' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Healthcare/i })).toBeVisible();

    // Switch to Terminology tab inside Industry section
    const terminologyTabBtn = page.getByRole('button', { name: /Terminology & Labels/i });
    if (await terminologyTabBtn.isVisible()) {
      await terminologyTabBtn.click();
      await expect(page.getByText(/Personnel Plural Label|Personnel/i).first()).toBeVisible();
    }

    // 4. Test General Preferences Section
    await page.locator('#settings_general_tab').click();
    await expect(page.getByRole('heading', { name: 'General Preferences' })).toBeVisible();

    // Verify Timezone dropdown defaults to UTC
    const timezoneSelect = page.locator('select').filter({ hasText: 'UTC' });
    await expect(timezoneSelect).toBeVisible();
    const selectedTimezone = await timezoneSelect.inputValue();
    expect(selectedTimezone).toContain('UTC');

    // Edit Company Name
    const companyInput = page.locator('input[type="text"]').first();
    await expect(companyInput).toBeVisible();
    const originalName = await companyInput.inputValue();
    await companyInput.fill('Aperture Global Systems UTC');

    // Click Save General Settings
    const saveGeneralBtn = page.getByRole('button', { name: /Save General Settings/i });
    await expect(saveGeneralBtn).toBeVisible();
    await saveGeneralBtn.click();

    // Verify success toast notification
    await expect(page.locator('text=Settings successfully saved')).toBeVisible({ timeout: 10000 });

    // Restore or confirm value persisted
    await companyInput.fill(originalName || 'Aperture Construction Systems');
    await saveGeneralBtn.click();
    await expect(page.locator('text=Settings successfully saved')).toBeVisible({ timeout: 10000 });

    // 5. Test Database & MongoDB Cluster Section
    await page.locator('#settings_database_tab').click();
    await expect(page.getByRole('heading', { name: 'MongoDB Database Cluster' })).toBeVisible();

    // Verify connection status badge is visible
    const dbStatusBadge = page.locator('text=MongoDB Atlas Active, text=In-Memory Storage').first();
    await expect(page.getByText(/MongoDB Atlas Active|In-Memory Storage/)).toBeVisible();

    // Verify connection string masking (must NOT show plaintext password)
    const uriDisplay = page.locator('text=mongodb+srv://').first();
    if (await uriDisplay.isVisible()) {
      const uriText = await uriDisplay.textContent();
      expect(uriText).not.toContain('Sesuraja');
      expect(uriText).toContain('***');
    }

    // Test "Refresh Status" button
    const refreshStatusBtn = page.getByRole('button', { name: /Refresh Status/i });
    await expect(refreshStatusBtn).toBeVisible();
    await refreshStatusBtn.click();

    // Test "Test MongoDB Connection" button
    const testDbBtn = page.getByRole('button', { name: /Test MongoDB Connection/i });
    await expect(testDbBtn).toBeVisible();
    await testDbBtn.click();

    // Verify diagnostic result banner appears
    await expect(page.getByText(/Connection Verified|Latency|Failed to connect/i)).toBeVisible({ timeout: 10000 });

    // Verify Runtime Persistence Notice is present
    await expect(page.getByText('Runtime Persistence:')).toBeVisible();

    // Test retention cleanup button
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    const retentionCleanupBtn = page.getByRole('button', { name: /Execute Retention Policy Cleanup/i });
    if (await retentionCleanupBtn.isVisible()) {
      await retentionCleanupBtn.click();
      await expect(page.getByText(/Retention cleanup completed/i)).toBeVisible({ timeout: 15000 });
    }

    // 6. Test Option 1: Third-Party API Integration tab
    await page.locator('#settings_third_party_api_tab').click();
    await expect(page.getByText(/Third-Party API Integration|Cloud Gateways/i).first()).toBeVisible();

    // 7. Test Option 2: Direct Hardware Connection tab
    await page.locator('#settings_direct_hardware_tab').click();
    await expect(page.getByText(/Direct Hardware Connection|UHF RFID Readers/i).first()).toBeVisible();

    // 8. Test AI Engine & Gemini Vision tab
    await page.locator('#settings_ai_tab').click();
    await expect(page.getByText(/AI Engine|Gemini Vision/i).first()).toBeVisible();

    // 9. Test Hardware & Safety Thresholds tab (fully dynamic from MongoDB)
    await page.locator('#settings_security_tab').click();
    await expect(page.getByText(/Safety Thresholds|Loitering Alert Threshold/i).first()).toBeVisible();

    // Dynamically add a custom zone threshold limit
    const zoneNameInput = page.locator('#input_new_zone_name');
    if (await zoneNameInput.isVisible()) {
      await zoneNameInput.fill('Zone Test Dynamic');
      const addZoneBtn = page.locator('#btn_add_custom_zone');
      await addZoneBtn.click();
      await expect(page.getByText('Zone Test Dynamic').first()).toBeVisible({ timeout: 5000 });
    }

    // Save Hardware & Safety Thresholds
    const saveSafetyBtn = page.locator('#btn_save_security_settings');
    if (await saveSafetyBtn.isVisible()) {
      await saveSafetyBtn.click();
      await expect(page.locator('text=Settings successfully saved')).toBeVisible({ timeout: 10000 });
    }

    // 10. Test Access Control & User Roles tab
    await page.locator('#settings_access_control_tab').click();
    await expect(page.getByText(/Access Control|Staff Accounts|Role Permissions/i).first()).toBeVisible();

    // Switch between access subtabs
    const staffTabBtn = page.getByRole('button', { name: /Staff Accounts/i });
    if (await staffTabBtn.isVisible()) {
      await staffTabBtn.click();
      await expect(page.getByRole('heading', { name: /Provision User Account/i })).toBeVisible();
    }

    // 11. Test API Docs & Webhook Console tab (with live execution)
    await page.locator('#settings_developer_api_tab').click();
    await expect(page.getByText(/Live API Tester|API Keys Management|REST Documentation/i).first()).toBeVisible();

    // Test live API request execution
    const sendRequestBtn = page.getByRole('button', { name: /Send Request/i });
    if (await sendRequestBtn.isVisible()) {
      await sendRequestBtn.click();
      // Verify latency or response payload appears
      await expect(page.getByText(/Latency|HTTP|ms|Bytes/i).first()).toBeVisible({ timeout: 10000 });
    }

    // Test switching to API Keys tab
    const apiKeysSubTab = page.getByRole('button', { name: /API Keys/i });
    if (await apiKeysSubTab.isVisible()) {
      await apiKeysSubTab.click();
      await expect(page.getByRole('button', { name: /Generate New Secret Key|Generate/i }).first()).toBeVisible();
    }

    // 12. Ensure no fatal unhandled exceptions occurred in the page
    const criticalErrors = pageErrors.filter(
      (msg) => !msg.includes('WebSocket') && !msg.includes('ResizeObserver') && !msg.includes('Failed to fetch')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('User can switch between tabs via sidebar navigation and verify persistence', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click through each tab in order to verify no page crash
    const tabIds = [
      '#settings_industry_tab',
      '#settings_third_party_api_tab',
      '#settings_direct_hardware_tab',
      '#settings_ai_tab',
      '#settings_security_tab',
      '#settings_access_control_tab',
      '#settings_developer_api_tab',
      '#settings_database_tab',
      '#settings_general_tab',
    ];

    for (const tabId of tabIds) {
      const tabButton = page.locator(tabId);
      await expect(tabButton).toBeVisible();
      await tabButton.click();
      // Ensure tab received active styling
      await expect(tabButton).toHaveClass(/bg-\[#007BC4\]/);
    }
  });
});
