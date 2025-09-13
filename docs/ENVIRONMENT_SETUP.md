# Environment Configuration Guide

This guide explains how to configure the Democratic Deliberation Platform for production deployment and self-hosting. We'll walk you through everything you need to know about setting up your environment variables properly.

## Required Environment Variables

### Core Supabase Configuration

The application needs these environment variables to function properly:

```bash
# Supabase Database Configuration (REQUIRED)
VITE_SUPABASE_URL="https://iowsxuxkgvpgrvvklwyt.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-anon-key"

# Alternative naming for production environments
SUPABASE_URL="https://iowsxuxkgvpgrvvklwyt.supabase.co" 
SUPABASE_ANON_KEY="your-publishable-anon-key"
```

### Optional Configuration

```bash
# Project identification (optional)
VITE_SUPABASE_PROJECT_ID="iowsxuxkgvpgrvvklwyt"

# Build environment
NODE_ENV="production"  # or "development"
```

## Environment Setup by Deployment Method

### 1. Development Setup

Getting started locally is straightforward:

1. Create a `.env` file in your project root:
   ```bash
   touch .env
   ```

2. Add your Supabase project values to `.env`:
   ```bash
   VITE_SUPABASE_URL="https://iowsxuxkgvpgrvvklwyt.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="your-actual-publishable-key"
   VITE_SUPABASE_PROJECT_ID="iowsxuxkgvpgrvvklwyt"
   NODE_ENV="development"
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

### 2. Production Deployment

#### Vercel/Netlify/Similar Platforms

Add environment variables in your deployment platform:


#### Docker Deployment

```dockerfile
# Set environment variables in your Dockerfile or docker-compose.yml
ENV VITE_SUPABASE_URL=https://iowsxuxkgvpgrvvklwyt.supabase.co
ENV VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
ENV VITE_SUPABASE_PROJECT_ID=iowsxuxkgvpgrvvklwyt
ENV NODE_ENV=production
```

#### Traditional Server Deployment

```bash
# Set environment variables on your server
export SUPABASE_URL="https://iowsxuxkgvpgrvvklwyt.supabase.co"
export SUPABASE_ANON_KEY="your-publishable-key"
export SUPABASE_PROJECT_ID="iowsxuxkgvpgrvvklwyt"
export NODE_ENV="production"
```

### 3. Self-Hosted Supabase

If you're running your own Supabase instance:

```bash
# Point to your self-hosted instance
VITE_SUPABASE_URL="https://your-domain.com"
VITE_SUPABASE_PUBLISHABLE_KEY="your-self-hosted-anon-key"
VITE_SUPABASE_PROJECT_ID="your-project-id"
```

## Getting Your Supabase Keys

### 1. Access Your Supabase Dashboard

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sign in to your account
3. Select your project: **iowsxuxkgvpgrvvklwyt**

### 2. Get Your API Keys

1. In your project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL**: `https://iowsxuxkgvpgrvvklwyt.supabase.co`
   - **anon/public key**: This is your `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Project ID**: `iowsxuxkgvpgrvvklwyt`

### 3. Service Role Key (Optional)

- **service_role key**: Only needed for admin operations
- **Never expose this in frontend code**
- Only use in secure backend environments

## Security Considerations

### ✅ Safe to Expose
- `VITE_SUPABASE_URL` - Public API endpoint
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Public anon key (Row Level Security protects data)
- `VITE_SUPABASE_PROJECT_ID` - Public project identifier
- `NODE_ENV` - Build environment

### ❌ Never Expose
- Supabase Service Role Key
- Database direct connection strings
- Any `_SECRET_` or `_PRIVATE_` keys

## Validation

The application will validate your environment configuration at startup:

✅ **Success**: Application starts normally
❌ **Failure**: Clear error message indicating missing variables

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Ensure all required variables are set
   - Check variable names match exactly (case-sensitive)
   - Verify `.env` file is in project root (for development)

2. **"Cannot connect to Supabase"**
   - Verify Supabase URL is correct and accessible
   - Check that your anon key is valid
   - Ensure Row Level Security policies allow access

3. **"Build fails with environment errors"**
   - Some platforms require `VITE_` prefix for build-time variables
   - Check your deployment platform's environment variable documentation

### Testing Configuration

Run this command to test your environment setup:

```bash
npm run build
```

If the build succeeds, your environment is configured correctly.

## Support

For deployment-specific questions:
- Check your hosting platform's documentation
- Verify Supabase project settings
- Test with a minimal configuration first
  
