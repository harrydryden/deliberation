# Democratic Deliberation Platform

A web application that facilitates structured conversations and democratic deliberations using AI agents.

## What is this?

This platform helps groups have better discussions by:
- Providing AI agents that guide conversations
- Organizing ideas using structured formats
- Tracking participant contributions
- Supporting real-time voice and text chat

## Key Features

- **AI-Powered Conversations**: Three specialized AI agents (Bill, Flo, and Pia) help facilitate discussions
- **IBIS Structure**: Ideas are organized using Issue-Based Information System format
- **Real-time Chat**: Voice and text messaging with live updates
- **Admin Dashboard**: Manage users, agents, and deliberations
- **User Analytics**: Track participation and helpfulness scores

## Technology Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- Radix UI components
- React Router for navigation
- Supabase for backend services

### Backend
- Supabase (PostgreSQL database)
- Edge Functions for AI processing
- Row Level Security for data protection
- Real-time subscriptions

## Getting Started

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone [repository-url]
cd democratic-deliberation-platform
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables

Copy the example environment file and configure it with your Supabase project details:

```bash
cp .env.example .env
# Edit .env with your Supabase project URL and keys
```

**Required environment variables:**
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Your Supabase anon/publishable key

See [Environment Setup Guide](docs/ENVIRONMENT_SETUP.md) for detailed configuration instructions.

4. Start the development server
```bash
npm run dev
```

The application will be available at `http://localhost:8080`.

### Production Deployment

This application is ready for production deployment and self-hosting. See our comprehensive guides:

- **[Environment Setup Guide](docs/ENVIRONMENT_SETUP.md)** - Configure environment variables
- **[Production Deployment Guide](docs/PRODUCTION_DEPLOYMENT.md)** - Complete deployment instructions
- **[Self-Hosting Guide](docs/PRODUCTION_DEPLOYMENT.md#self-hosting)** - Deploy on your own infrastructure

### Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the database migrations from the `supabase/migrations/` folder
3. Configure your environment variables with the Supabase URL and keys
4. The application includes Row Level Security (RLS) policies for data protection

## Project Structure

```
src/
├── components/          # React components
│   ├── admin/          # Admin dashboard components
│   ├── chat/           # Chat and messaging components
│   ├── common/         # Shared components
│   └── ui/             # Basic UI components
├── hooks/              # Custom React hooks
├── pages/              # Main page components
├── services/           # Business logic and API calls
├── utils/              # Helper functions
└── types/              # TypeScript type definitions

supabase/
├── functions/          # Edge functions for AI processing
└── migrations/         # Database schema and migrations
```

## User Roles

- **Admin**: Can create deliberations, manage users, and access all features
- **User**: Can participate in deliberations and view their own statistics

## How Deliberations Work

1. **Create**: Admins create new deliberation topics
2. **Join**: Users join deliberations using access codes
3. **Discuss**: Participants chat with AI agents that help structure the conversation
4. **Organize**: Ideas are automatically organized into issues, positions, and arguments
5. **Track**: The system tracks contributions and provides analytics

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run tests
- `npm run lint` - Check code quality

### Key Concepts

- **Agents**: AI helpers that facilitate different aspects of discussion
- **IBIS Nodes**: Structured elements (Issues, Positions, Arguments) that organize ideas
- **Message Queue**: System for handling AI responses reliably
- **Realtime**: Live updates using Supabase subscriptions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions or issues, please check the documentation or create an issue in the repository.
