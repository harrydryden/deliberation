# Democratic Deliberation Platform

A full-stack application for facilitating democratic deliberation with AI assistance, built with React frontend and dual backend support (Supabase + Node.js).

## Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript  
- **Styling**: Tailwind CSS with custom design system
- **State Management**: React Query + Context API
- **UI Components**: Radix UI with custom styling
- **Authentication**: Dual support for Supabase Auth and JWT-based backend auth

### Backend Options

#### Option 1: Supabase (Current Default)
- **Database**: PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime subscriptions
- **Edge Functions**: TypeScript serverless functions
- **AI Integration**: Anthropic Claude via edge functions

#### Option 2: Node.js Backend (New)
- **Framework**: Fastify with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based with bcrypt
- **Real-time**: WebSocket + Server-Sent Events
- **Caching**: Redis for performance optimization
- **AI Integration**: Direct Anthropic SDK integration
- **Rate Limiting**: Token bucket algorithm for API protection
- **Security**: Helmet, CORS, comprehensive input validation

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
- **Dual Backend Support**: Seamlessly toggle between Supabase and Node.js
- **Real-time Updates**: WebSocket and Server-Sent Events for live updates
- **Performance Optimization**: Intelligent caching, rate limiting, connection pooling
- **Security**: Multi-layer content safety, authentication, and authorization
- **Monitoring**: Structured logging, comprehensive health checks
- **Scalability**: Designed for horizontal scaling and high availability

## Project URL

**Lovable Project**: https://lovable.dev/projects/95847591-350e-48fd-8530-0c2bb5de6650

## Quick Start

### Development with Supabase (Current Default)
```bash
npm install
npm run dev
```

### Development with Node.js Backend
```bash
# Option 1: Full stack with Docker
docker-compose -f docker-compose.dev.yml up

# Option 2: Run manually
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend  
npm install
VITE_API_URL=http://localhost:3000 npm run dev
```

### Environment Variables
Create a `.env` file in the backend directory:
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/deliberation
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secure-jwt-secret-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

## Backend Selection

The application supports both backends simultaneously. Toggle between them using the switch in the header:

- **Supabase Mode**: Uses Supabase Auth, Realtime, and Edge Functions (current default)
- **Node.js Mode**: Uses JWT auth, WebSocket/SSE, and direct AI integration (new option)

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

# Start development (Supabase mode)
npm run dev

# Or start with Node.js backend
docker-compose -f docker-compose.dev.yml up
```

## Technology Stack

### Frontend
- **Vite** - Build tool and development server
- **TypeScript** - Type-safe JavaScript
- **React 18** - UI framework with hooks and context
- **Tailwind CSS** - Utility-first styling with custom design system
- **Radix UI** - Accessible UI primitives (shadcn-ui)
- **React Query** - Server state management
- **React Router** - Client-side routing

### Backend (Node.js Option)
- **Fastify** - High-performance web framework
- **TypeScript** - Type-safe server development
- **Prisma** - Type-safe ORM with database migrations
- **PostgreSQL** - Primary database with vector extensions
- **Redis** - Caching and session storage
- **JWT** - Stateless authentication
- **Anthropic SDK** - Direct AI integration
- **Socket.io** - Real-time WebSocket communication

### Database & Infrastructure
- **PostgreSQL** - Primary database with pgvector for semantic search
- **Redis** - High-performance caching layer
- **Docker** - Containerization for development and deployment
- **Supabase** - Backend-as-a-Service (optional mode)

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/95847591-350e-48fd-8530-0c2bb5de6650) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
