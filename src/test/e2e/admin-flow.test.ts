import { test, expect } from '@playwright/test';

test.describe('Admin Flow End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth state for admin user
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        currentSession: {
          access_token: 'mock-admin-token',
          user: { id: 'admin-user', email: 'admin@deliberation.local' },
        },
      }));
    });
  });

  test('admin can access dashboard', async ({ page }) => {
    await page.goto('/admin');
    
    // Should see admin dashboard elements
    await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible();
    await expect(page.locator('text=System Statistics')).toBeVisible();
    await expect(page.locator('text=User Management')).toBeVisible();
  });

  test('admin can view system stats', async ({ page }) => {
    await page.goto('/admin');
    
    // Check for system statistics section
    await expect(page.locator('text=Total Users')).toBeVisible();
    await expect(page.locator('text=Active Deliberations')).toBeVisible();
    await expect(page.locator('text=Global Agents')).toBeVisible();
  });

  test('admin can navigate between tabs', async ({ page }) => {
    await page.goto('/admin');

    await page.click('text=Agent Management');
    await expect(page.locator('text=Global Agents')).toBeVisible();
    
    await page.click('text=User Management');
    await expect(page.locator('text=Create Bulk Users')).toBeVisible();
    
    await page.click('text=Deliberation Management');
    await expect(page.locator('text=Active Deliberations')).toBeVisible();
  });

  test('admin can create bulk users', async ({ page }) => {
    await page.goto('/admin');
    await page.click('text=User Management');
    
    // Click create bulk users button
    await page.click('text=Create Bulk Users');
    
    // Fill in the form
    await page.fill('input[placeholder="Number of users"]', '3');
    await page.selectOption('select', 'user');
    
    // Submit form (this would be mocked in real tests)
    await page.click('button:has-text("Create Users")');
    
    // Should show success message or users list
    await expect(page.locator('text=Users created successfully')).toBeVisible({ timeout: 10000 });
  });
});