# Democratic Deliberation Platform

A modern web application for facilitating democratic deliberations and structured conversations using AI agents.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)

## Overview

The Democratic Deliberation Platform is a comprehensive web application designed to facilitate structured conversations and democratic deliberations using AI agents. Built with modern web technologies, it provides real-time collaboration, intelligent agent interactions, and comprehensive administrative controls.

## Architecture

The application follows **Clean Architecture** principles with a **Supabase-only backend**:

### Frontend Stack
- **React 18** with TypeScript for type safety
- **Tailwind CSS** with custom design system
- **Radix UI** components for accessibility
- **React Router** for client-side routing
- **React Query** for state management and caching

### Backend Architecture
- **Supabase** for authentication, database, and real-time features
- **PostgreSQL** with vector extensions for semantic search
- **Row Level Security (RLS)** for data protection
- **Edge Functions** for serverless compute
- **Real-time subscriptions** for live updates

### Code Architecture
- **Repository Pattern** for data access abstraction
- **Dependency Injection** for service management
- **Domain Services** for business logic
- **Clean separation** of concerns across layers

### Key Design Principles
- **Single Responsibility**: Each module has one clear purpose
- **Dependency Inversion**: High-level modules don't depend on low-level modules
- **Interface Segregation**: Clients depend only on interfaces they use
- **Testability**: Easy mocking and unit testing throughout

## Features

### Core Functionality
- **Multi-agent AI System**: Bill Agent, Peer Agent, and Orchestration service
- **Real-time Chat**: Live messaging with intelligent AI responses
- **Democratic Deliberation**: Structured conversation flows
- **Content Safety**: AI-powered content moderation and filtering
- **Knowledge Management**: Vector-based semantic search
- **IBIS Integration**: Issue-Based Information System support
- **Admin Dashboard**: Agent configuration and system monitoring

### Technical Features
- **Real-time Updates**: WebSocket and Server-Sent Events for live updates
- **Performance Optimization**: Intelligent caching, rate limiting, connection pooling
- **Security**: Multi-layer content safety, authentication, and authorization
- **Monitoring**: Structured logging, comprehensive health checks
- **Scalability**: Designed for horizontal scaling and high availability

## Project URL

**Lovable Project**: https://lovable.dev/projects/95847591-350e-48fd-8530-0c2bb5de6650

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Git for version control

### Installation
```bash
# Clone the repository
git clone <your-repository-url>
cd democratic-deliberation-platform

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Setup
The application is configured to work with Supabase out of the box. For custom configurations:

1. **Supabase Setup**: Create a new Supabase project
2. **Database Schema**: Run the migrations in `supabase/migrations/`
3. **Environment Variables**: Configure in your Supabase dashboard
4. **Authentication**: Set up authentication providers as needed

### Development Commands
```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run E2E tests
npm run test:e2e

# Build for production
npm run build

# Preview production build
npm run preview
```

## Development

### Project Structure
```
src/
├── components/           # React components
│   ├── ui/              # Reusable UI components
│   ├── admin/           # Admin-specific components
│   ├── auth/            # Authentication components
│   └── chat/            # Chat-related components
├── hooks/               # Custom React hooks
├── services/            # Business logic services
│   └── domain/          # Domain services and interfaces
├── repositories/        # Data access layer
├── types/               # TypeScript type definitions
├── utils/               # Utility functions
└── integrations/        # External service integrations
```

### Key Concepts

#### Services and Repositories
The application uses a clean architecture with:
- **Domain Services**: Business logic implementation
- **Repositories**: Data access abstraction
- **Dependency Injection**: Service container for managing dependencies

#### State Management
- **React Query**: Server state management and caching
- **React Context**: Authentication and global state
- **Local State**: Component-specific state with hooks

#### Testing Strategy
- **Unit Tests**: Component and service testing with Vitest
- **Integration Tests**: API and database testing
- **E2E Tests**: User workflow testing with Playwright

## How to Edit This Code

### Use Lovable (Recommended)
Visit the [Lovable Project](https://lovable.dev/projects/95847591-350e-48fd-8530-0c2bb5de6650) and start prompting. Changes are automatically committed.

### Local Development
```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development with Node.js backend
docker-compose -f docker-compose.dev.yml up
```

## Technology Stack

### Frontend
- **Vite** - Build tool and development server
- **TypeScript** - Type-safe JavaScript
- **React 18** - UI framework with hooks and context
- **Tailwind CSS** - Utility-first styling with custom design system
- **Radix UI** - Accessible UI primitives (shadcn-ui)
- **React Router** - Client-side routing

### Backend (Supabase)
- **PostgreSQL** - Primary database with vector extensions
- **Row Level Security** - Built-in data protection
- **Real-time** - Live subscriptions and updates
- **Edge Functions** - Serverless compute with Deno
- **Authentication** - Built-in auth with multiple providers
- **Storage** - File storage with CDN
- **API** - Auto-generated REST and GraphQL APIs

### Development Tools
- **Vite** - Fast build tool and dev server
- **ESLint** - Code linting and formatting
- **Prettier** - Code formatting
- **Vitest** - Unit and integration testing
- **Playwright** - End-to-end testing
- **TypeScript** - Type safety across the stack

## Testing

The project includes comprehensive testing at multiple levels:

### Unit Tests
```bash
# Run all unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Integration Tests
Integration tests verify the interaction between services and repositories:
```bash
# Run integration tests
npm run test:integration
```

### E2E Tests
End-to-end tests verify complete user workflows:
```bash
# Run E2E tests
npm run test:e2e

# Run E2E tests in headed mode
npm run test:e2e:headed
```

### Test Structure
- **Component Tests**: In `src/components/**/__tests__/`
- **Hook Tests**: In `src/hooks/**/__tests__/`
- **Service Tests**: In `src/services/**/__tests__/`
- **E2E Tests**: In `e2e/`

## Deployment

### Lovable Platform
Simply open [Lovable](https://lovable.dev/projects/95847591-350e-48fd-8530-0c2bb5de6650) and click on Share -> Publish.

### Custom Deployment
The application can be deployed to any static hosting provider:

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Deploy the `dist` folder** to your hosting provider

3. **Configure environment variables** in your hosting platform

### Custom Domain
To connect a custom domain:
1. Navigate to Project > Settings > Domains in Lovable
2. Click Connect Domain
3. Follow the DNS configuration steps

Read more: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## API Documentation

Comprehensive API documentation is available in the `docs/api/` directory:
- [API Overview](docs/api/README.md)
- [Authentication](docs/api/README.md#authentication)
- [Core Endpoints](docs/api/README.md#core-endpoints)
- [Error Handling](docs/api/README.md#error-responses)
- [Rate Limiting](docs/api/README.md#rate-limiting)

## Architecture Decision Records

Important architectural decisions are documented in the `docs/architecture/` directory:
- [ADR-001: Single Backend Architecture](docs/architecture/ADR-001-single-backend-architecture.md)
- [ADR-002: Repository Pattern](docs/architecture/ADR-002-repository-pattern.md)
- [ADR-003: Dependency Injection](docs/architecture/ADR-003-dependency-injection.md)
- [ADR-004: Testing Strategy](docs/architecture/ADR-004-testing-strategy.md)

## Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Write tests** for your changes
4. **Ensure tests pass**: `npm test`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Code Style
- Follow existing TypeScript and React patterns
- Use JSDoc comments for public functions
- Write comprehensive tests for new features
- Follow the repository pattern for data access
- Use the service container for dependency injection

### Testing Requirements
- Unit tests for all new components and services
- Integration tests for complex workflows
- E2E tests for critical user journeys
- Maintain test coverage above 80%
