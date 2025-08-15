import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Note: In a real test, you'd need to authenticate as an admin user first
    // For now, we'll just test the UI components
    await page.goto('/admin');
  });

  test('should redirect to auth when not authenticated', async ({ page }) => {
    // Should redirect to auth page if not logged in
    await expect(page.url()).toContain('/auth');
  });

  test('should display loading state', async ({ page }) => {
    // Mock admin access for testing
    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-id',
          email: 'admin@example.com',
          role: 'admin',
        }),
      });
    });

    await page.goto('/admin');
    
    // Should show loading spinner initially
    await expect(page.getByTestId('loading-spinner')).toBeVisible();
  });

  test('should restrict access to non-admin users', async ({ page }) => {
    // Mock regular user access
    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-id',
          email: 'user@example.com',
          role: 'user',
        }),
      });
    });

    await page.goto('/admin');
    
    // Should show access denied message
    await expect(page.getByText(/access denied/i)).toBeVisible();
  });
});

test.describe('Admin Dashboard - Authenticated Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Mock admin authentication
    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-id',
          email: 'admin@example.com',
          role: 'admin',
        }),
      });
    });

    // Mock admin API endpoints
    await page.route('**/rest/v1/profiles', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'user-1',
            email: 'user1@example.com',
            display_name: 'User One',
            role: 'user',
          },
          {
            id: 'user-2',
            email: 'user2@example.com',
            display_name: 'User Two',
            role: 'moderator',
          },
        ]),
      });
    });

    await page.goto('/admin');
  });

  test('should display admin dashboard tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /users/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /agents/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /deliberations/i })).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Click users tab
    await page.getByRole('tab', { name: /users/i }).click();
    await expect(page.getByRole('tabpanel')).toContainText(/user management/i);

    // Click agents tab
    await page.getByRole('tab', { name: /agents/i }).click();
    await expect(page.getByRole('tabpanel')).toContainText(/agent management/i);

    // Click deliberations tab
    await page.getByRole('tab', { name: /deliberations/i }).click();
    await expect(page.getByRole('tabpanel')).toContainText(/deliberation overview/i);
  });

  test('should display system statistics', async ({ page }) => {
    // Mock system stats API
    await page.route('**/functions/v1/admin-stats', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalUsers: 150,
          totalDeliberations: 25,
          totalMessages: 1200,
          activeDeliberations: 8,
        }),
      });
    });

    await page.reload();

    // Should display stats cards
    await expect(page.getByText('150').first()).toBeVisible(); // Total users
    await expect(page.getByText('25').first()).toBeVisible(); // Total deliberations
  });
});