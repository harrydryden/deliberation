# Environment Configuration Guide

This guide explains how to configure the Democratic Deliberation Platform for production deployment and self-hosting.

## Required Environment Variables

### Core Supabase Configuration

The application requires these environment variables to function:

```bash
# Supabase Database Configuration (REQUIRED)
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-anon-key"

# Alternative naming for production environments
SUPABASE_URL="https://your-project-id.supabase.co" 
SUPABASE_ANON_KEY="your-publishable-anon-key"
```

### Optional Configuration

```bash
# Project identification (optional)
VITE_SUPABASE_PROJECT_ID="your-project-id"

# Build environment
NODE_ENV="production"  # or "development"
```

## Environment Setup by Deployment Method

### 1. Development Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Supabase project values:
   ```bash
   VITE_SUPABASE_URL="https://your-project-id.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="your-actual-publishable-key"
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

### 2. Production Deployment

#### Vercel/Netlify/Similar Platforms

Add environment variables in your deployment platform:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NODE_ENV=production
```

#### Docker Deployment

```dockerfile
# Set environment variables in your Dockerfile or docker-compose.yml
ENV VITE_SUPABASE_URL=https://your-project-id.supabase.co
ENV VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
ENV NODE_ENV=production
```

#### Traditional Server Deployment

```bash
# Set environment variables on your server
export SUPABASE_URL="https://your-project-id.supabase.co"
export SUPABASE_ANON_KEY="your-publishable-key"
export NODE_ENV="production"
```

### 3. Self-Hosted Supabase

If you're running your own Supabase instance:

```bash
# Point to your self-hosted instance
VITE_SUPABASE_URL="https://your-domain.com"
VITE_SUPABASE_PUBLISHABLE_KEY="your-self-hosted-anon-key"
```

## Security Considerations

### ✅ Safe to Expose
- `VITE_SUPABASE_URL` - Public API endpoint
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Public anon key (Row Level Security protects data)
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

If build succeeds, your environment is configured correctly.

## Migration from Lovable

If migrating from Lovable development environment:

1. Remove any hard-coded fallback values
2. Set up proper environment variables
3. Test in production-like environment
4. Verify all functionality works without development dependencies

## Support

For deployment-specific questions:
- Check your hosting platform's documentation
- Verify Supabase project settings
- Test with a minimal configuration first