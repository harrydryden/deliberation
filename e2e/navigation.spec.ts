import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate to auth page from landing page', async ({ page }) => {
    await page.goto('/');
    
    // Should see the landing page
    await expect(page.getByRole('heading', { name: /democratic deliberation platform/i })).toBeVisible();
    
    // Click sign in button
    await page.getByRole('link', { name: /sign in/i }).click();
    
    // Should navigate to auth page
    await expect(page.url()).toContain('/auth');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('should handle 404 pages', async ({ page }) => {
    await page.goto('/non-existent-page');
    
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /go home/i })).toBeVisible();
  });

  test('should navigate back to home from 404', async ({ page }) => {
    await page.goto('/non-existent-page');
    
    await page.getByRole('link', { name: /go home/i }).click();
    
    await expect(page.url()).toBe(page.url().replace('/non-existent-page', '/'));
    await expect(page.getByRole('heading', { name: /democratic deliberation platform/i })).toBeVisible();
  });

  test('should have responsive navigation', async ({ page }) => {
    await page.goto('/');
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Navigation should still be visible and functional
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
    
    await page.getByRole('link', { name: /sign in/i }).click();
    await expect(page.url()).toContain('/auth');
  });

  test('should maintain theme preference across navigation', async ({ page }) => {
    await page.goto('/');
    
    // Get initial theme
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark');
    });
    
    // Navigate to auth page
    await page.getByRole('link', { name: /sign in/i }).click();
    
    // Theme should be maintained
    const authTheme = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark');
    });
    
    expect(authTheme).toBe(initialTheme);
  });
});