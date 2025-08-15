import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('should display sign in form by default', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should switch to sign up form', async ({ page }) => {
    await page.getByText(/don't have an account/i).click();
    
    await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible();
    await expect(page.getByLabel(/access code/i)).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });

  test('should validate password length', async ({ page }) => {
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('123');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page.getByText(/password must be at least 6 characters/i)).toBeVisible();
  });

  test('should show access code field in sign up mode', async ({ page }) => {
    await page.getByText(/don't have an account/i).click();
    
    await expect(page.getByLabel(/access code/i)).toBeVisible();
    
    // Fill out form with missing access code
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign up/i }).click();
    
    await expect(page.getByText(/access code is required/i)).toBeVisible();
  });

  test('should navigate back to sign in from sign up', async ({ page }) => {
    await page.getByText(/don't have an account/i).click();
    await page.getByText(/already have an account/i).click();
    
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });
});