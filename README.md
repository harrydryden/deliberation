# Democratic Deliberation Platform

A modern web application for facilitating democratic deliberations and structured conversations using AI agents.

## Architecture

This application uses a **Node.js backend** architecture with:
- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Fastify + PostgreSQL + Redis
- **Authentication**: JWT-based authentication system
- **Real-time**: Server-Sent Events (SSE) and WebSocket support

### Backend Services (Node.js)
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
- **Real-time Updates**: WebSocket and Server-Sent Events for live updates
- **Performance Optimization**: Intelligent caching, rate limiting, connection pooling
- **Security**: Multi-layer content safety, authentication, and authorization
- **Monitoring**: Structured logging, comprehensive health checks
- **Scalability**: Designed for horizontal scaling and high availability

## Project URL

**Lovable Project**: https://lovable.dev/projects/95847591-350e-48fd-8530-0c2bb5de6650

## Quick Start

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

## Backend Architecture

The application uses a Node.js backend with:
- **JWT-based Authentication**: Secure user authentication and session management
- **Real-time Communication**: WebSocket and Server-Sent Events for live updates
- **AI Integration**: Direct Anthropic SDK integration for chat functionality

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

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/95847591-350e-48fd-8530-0c2bb5de6650) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
