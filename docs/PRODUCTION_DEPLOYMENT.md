# Production Deployment Guide

This guide walks you through deploying the Democratic Deliberation Platform to your own infrastructure. We've designed it to be straightforward and reliable for production use.

## What You'll Need

Before you begin, make sure you have:
- **Node.js 18+** or Docker installed
- A **Supabase project** (either hosted or self-hosted)
- An **SSL certificate** for your production domain
- Basic familiarity with web server configuration

## Getting Started

The platform has been thoroughly prepared for production deployment with:
- ✅ All development credentials removed
- ✅ Environment-based configuration implemented
- ✅ Production-ready security settings configured
- ✅ Development dependencies cleaned up

## Deployment Options

### Option 1: Docker Deployment (Recommended)

This is the easiest way to get started. Docker handles all the dependencies and configuration for you.

```bash
# Build the production image
docker build -t deliberation-platform .

# Run with your environment variables
docker run -d \
  --name deliberation-app \
  -p 8080:8080 \
  -e VITE_SUPABASE_URL="https://your-project.supabase.co" \
  -e VITE_SUPABASE_PUBLISHABLE_KEY="your-key" \
  -e NODE_ENV="production" \
  deliberation-platform
```

### Option 2: Traditional Server Deployment

If you prefer a more traditional approach:

```bash
# Install production dependencies
npm ci --only=production

# Build the application
npm run build

# Serve the built files (using your preferred web server)
# Example with a simple HTTP server:
npx serve -s dist -p 8080
```

### Option 3: Platform Deployment (Vercel, Netlify, etc.)

For managed hosting platforms:

1. Connect your git repository
2. Set environment variables in the platform dashboard
3. Deploy automatically on push

## Environment Configuration

You'll need to set these environment variables:

```bash
# Core Configuration (Required)
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
NODE_ENV="production"

# Optional
VITE_SUPABASE_PROJECT_ID="your-project-id"
```

## Database Setup

### Using Supabase Hosted

1. Create a new Supabase project
2. Run the provided migrations:
   ```bash
   # If using Supabase CLI
   supabase db push
   
   # Or manually run SQL files from supabase/migrations/
   ```
3. Set up Row Level Security policies (included in migrations)

### Self-Hosted Supabase

Follow the [Supabase self-hosting guide](https://supabase.com/docs/guides/self-hosting), then:
1. Update `VITE_SUPABASE_URL` to your instance
2. Run database migrations
3. Configure edge functions

## Security Configuration

### SSL/TLS Certificate

Make sure your domain has a valid SSL certificate. For production:
- Use a reverse proxy (Nginx, Apache, Cloudflare)
- Enable HTTPS redirect
- Set proper security headers

### Content Security Policy

The application includes production-ready CSP settings. To customise:

1. Edit `src/config/security.ts`
2. Update `connect-src` directive for your domain
3. Rebuild the application

### Database Security

- Enable Row Level Security (RLS) on all tables
- Review and test all RLS policies
- Use least-privilege principle for service roles
- Regular security audits

## Performance Optimisation

### Build Optimisation

```bash
# Production build with optimisations
npm run build

# Analyse bundle size
npm run build -- --analyze
```

### Server Configuration

Here's an example Nginx configuration:

```nginx
# Example Nginx configuration
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    
    # Static files
    location / {
        root /path/to/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

## Monitoring & Maintenance

### Health Checks

The application includes startup validation. Monitor:
- Application startup logs
- Environment configuration validation
- Database connectivity

### Logging

In production, the application:
- Suppresses debug logs
- Maintains error logging
- Includes performance metrics

### Backup Strategy

1. **Database**: Regular Supabase backups
2. **Files**: User uploads in Supabase Storage
3. **Configuration**: Environment variables backup

## Scaling Considerations

### Horizontal Scaling

- Application is stateless and can be scaled horizontally
- Use load balancer for multiple instances
- Shared database (Supabase) handles concurrency

### Database Scaling

- Supabase handles database scaling automatically
- Consider read replicas for high-traffic deployments
- Monitor connection pool usage

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**
   ```bash
   # Check environment in container/server
   printenv | grep SUPABASE
   ```

2. **Database Connection Errors**
   - Verify Supabase URL is accessible
   - Check firewall rules
   - Validate API keys

3. **Build Failures**
   - Clear node_modules and package-lock.json
   - Use Node.js 18+
   - Check for missing environment variables

### Debug Mode

For production debugging (temporarily):

```bash
# Enable additional logging
NODE_ENV=development npm start
```

**Important**: Revert to production mode after debugging.

## Support & Updates

### Keeping Updated

1. Monitor repository for updates
2. Test updates in staging environment first
3. Plan maintenance windows for major updates

### Security Updates

- Subscribe to Supabase security announcements
- Monitor dependency vulnerabilities
- Regular security audits

### Performance Monitoring

Consider integrating:
- Application monitoring (Sentry, LogRocket)
- Infrastructure monitoring (Datadog, New Relic)
- User analytics (PostHog, Google Analytics)

## Production Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificate installed
- [ ] Security headers configured
- [ ] Error monitoring setup
- [ ] Backup strategy implemented
- [ ] Performance monitoring configured
- [ ] Health checks configured
- [ ] Load testing completed
- [ ] Security audit completed
