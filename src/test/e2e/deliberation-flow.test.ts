import { test, expect } from '@playwright/test';

test.describe('Deliberation Flow End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth state for regular user
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        currentSession: {
          access_token: 'mock-user-token',
          user: { id: 'regular-user', email: 'user@deliberation.local' },
        },
      }));
    });
  });

  test('user can view deliberations list', async ({ page }) => {
    await page.goto('/deliberations');
    
    // Should see deliberations page
    await expect(page.locator('h1:has-text("Deliberations")')).toBeVisible();
    await expect(page.locator('text=Create New Deliberation')).toBeVisible();
  });

  test('user can create a new deliberation', async ({ page }) => {
    await page.goto('/deliberations');
    
    // Click create button
    await page.click('text=Create New Deliberation');
    
    // Fill out the form
    await page.fill('input[placeholder*="Title"]', 'Test Deliberation');
    await page.fill('textarea[placeholder*="Description"]', 'This is a test deliberation');
    
    // Set as public
    await page.check('input[type="checkbox"]');
    
    // Submit form
    await page.click('button:has-text("Create")');
    
    // Should navigate to the new deliberation or show success
    await expect(page.locator('text=Deliberation created successfully')).toBeVisible({ timeout: 10000 });
  });

  test('user can join a public deliberation', async ({ page }) => {
    await page.goto('/deliberations');
    
    // Look for join button on first deliberation
    const joinButton = page.locator('button:has-text("Join")').first();
    if (await joinButton.isVisible()) {
      await joinButton.click();
      
      // Should navigate to chat page
      await expect(page.url()).toContain('/deliberation-chat/');
    }
  });

  test('deliberation chat interface works', async ({ page }) => {
    // Navigate directly to a deliberation chat (assuming one exists)
    await page.goto('/deliberation-chat/test-deliberation-id');
    
    // Should see chat interface
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-list"]')).toBeVisible();

    await page.fill('[data-testid="message-input"]', 'Hello, this is a test message');
    await page.press('[data-testid="message-input"]', 'Enter');
    
    // Should see the message appear
    await expect(page.locator('text=Hello, this is a test message')).toBeVisible();
  });
});