# Democratic Deliberation Platform

A sophisticated web application that facilitates structured conversations and democratic deliberations using advanced AI agents and real-time collaboration tools.

## What is this?

This platform transforms how groups engage in meaningful discussions by providing intelligent AI agents that guide conversations, organise ideas using structured formats, and track participant contributions in real-time. It's designed to make democratic deliberation more accessible, productive, and insightful.

## Key Features

### 🤖 Intelligent AI Agents
- **Sophisticated Agent Orchestration**: Advanced AI system that selects the optimal agent based on conversation context and user needs
- **Specialised Agent Types**: Multiple AI agents including facilitators, knowledge experts, and discussion guides
- **Dynamic Agent Selection**: AI automatically chooses the most appropriate agent for each conversation turn
- **Agent Knowledge Base**: Each agent has access to specialised knowledge and can retrieve relevant information

### 🗣️ Real-time Collaboration
- **Live Voice & Text Chat**: Seamless real-time communication with voice-to-text transcription
- **WebSocket Integration**: Instant message delivery and live updates
- **Participant Analytics**: Track user contributions, stance scores, and engagement metrics
- **Message Rating System**: Users can rate message helpfulness for continuous improvement

### 📊 Structured Discussion Framework
- **IBIS (Issue-Based Information System)**: Organises ideas into Issues, Positions, and Arguments
- **Automatic Content Classification**: AI analyses and categorises messages by type and stance
- **Issue Recommendations**: AI suggests relevant discussion topics based on conversation context
- **Relationship Mapping**: Identifies connections between different discussion points

### 🎯 Advanced Knowledge Management
- **RAG (Retrieval-Augmented Generation)**: AI agents can access and reference uploaded documents
- **Document Processing**: Supports PDF uploads with intelligent text extraction
- **Knowledge Chunking**: Breaks down documents into searchable, relevant segments
- **Contextual Information Retrieval**: Agents provide relevant information based on discussion context

### 👥 Administrative Tools
- **Comprehensive Admin Dashboard**: Manage users, agents, deliberations, and system settings
- **User Management**: Create access codes, manage permissions, and track user activity
- **Agent Configuration**: Customise AI agent behaviour, prompts, and knowledge bases
- **Analytics & Reporting**: Detailed insights into deliberation effectiveness and user engagement

## Technology Stack

### Frontend Architecture
- **React 18** with TypeScript for type-safe development
- **Tailwind CSS** for responsive, modern styling
- **Radix UI** for accessible, high-quality components
- **React Router** for seamless navigation
- **Custom Hooks** for state management and API integration
- **Performance Optimisation** with lazy loading and code splitting

### Backend Infrastructure
- **Supabase** as the primary backend service
- **PostgreSQL** database with advanced indexing and full-text search
- **Edge Functions** (14 sophisticated functions) for AI processing and business logic
- **Row Level Security (RLS)** for comprehensive data protection
- **Real-time Subscriptions** for live updates and collaboration

### AI & Machine Learning
- **OpenAI GPT Models** for natural language processing and generation
- **LangChain Framework** for advanced AI workflows and knowledge retrieval
- **Vector Embeddings** for semantic search and content similarity
- **Circuit Breaker Patterns** for reliable AI service integration
- **Sophisticated Error Handling** with fallback mechanisms

### Development & Deployment
- **TypeScript** throughout for type safety and maintainability
- **Vite** for fast development and optimised builds
- **ESLint & Prettier** for code quality and consistency
- **Comprehensive Testing** with unit, integration, and end-to-end tests
- **Production-Ready Logging** with minimal overhead

## Getting Started

### Prerequisites
- **Node.js 18** or higher
- **npm** or **yarn** package manager
- **Supabase account** for backend services

### Installation

1. **Clone the repository**
```bash
git clone [repository-url]
cd democratic-deliberation-platform
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory with your Supabase project details:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Optional: Development settings
VITE_DEBUG_MODE=false
VITE_LOG_LEVEL=error
```

**Required environment variables:**
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Your Supabase anon/publishable key

4. **Set up the database**

Run the database migrations to set up the schema:

```bash
# If using Supabase CLI
supabase db reset

# Or manually run migrations from supabase/migrations/
```

5. **Start the development server**
```bash
npm run dev
```

The application will be available at `http://localhost:8080`.

### Production Deployment

This application is production-ready and optimised for deployment. The system includes:

- **Minimal logging** for production environments
- **Performance optimisations** for scalability
- **Error handling** with graceful degradation
- **Security measures** including RLS policies and input validation

For detailed deployment instructions, see our comprehensive guides in the `docs/` directory.

## System Architecture

### Core Components

```
src/
├── components/              # React components
│   ├── admin/              # Administrative interface
│   ├── chat/               # Real-time messaging
│   ├── ibis/               # IBIS structure management
│   ├── knowledge/          # Knowledge base interface
│   └── ui/                 # Reusable UI components
├── hooks/                  # Custom React hooks
├── services/               # Business logic layer
│   ├── domain/            # Domain services
│   └── repositories/      # Data access layer
├── utils/                  # Utility functions
└── types/                  # TypeScript definitions

supabase/
├── functions/              # Edge functions (14 functions)
│   ├── agent_orchestration_stream/
│   ├── classify_message/
│   ├── knowledge_query/
│   └── [11 more functions]
└── migrations/             # Database schema
```

### AI Agent System

The platform features a sophisticated AI agent orchestration system:

1. **Message Analysis**: AI analyses incoming messages for intent, complexity, and context
2. **Agent Selection**: Optimal agent is selected based on conversation state and requirements
3. **Response Generation**: Selected agent generates contextually appropriate responses
4. **Knowledge Integration**: Agents can access and reference relevant knowledge from the database
5. **Continuous Learning**: System tracks effectiveness and adapts over time

### Data Flow

1. **User Input** → Message classification and analysis
2. **Agent Selection** → AI determines optimal response agent
3. **Knowledge Retrieval** → Relevant information is gathered from knowledge base
4. **Response Generation** → AI generates contextual response
5. **Real-time Delivery** → Response is delivered via WebSocket
6. **Analytics Update** → User engagement and system metrics are updated

## User Roles & Permissions

### Administrator
- Create and manage deliberations
- Configure AI agents and knowledge bases
- Monitor user activity and system performance
- Access comprehensive analytics and reporting
- Manage user permissions and access codes

### Participant
- Join deliberations using access codes
- Engage in real-time discussions with AI agents
- Upload and share relevant documents
- Rate message helpfulness and quality
- View personal analytics and contribution history

## How Deliberations Work

### 1. **Setup Phase**
- Administrator creates a new deliberation topic
- AI agents are configured with relevant knowledge
- Access codes are generated for participants

### 2. **Participation Phase**
- Users join using access codes
- AI agents facilitate structured discussions
- Ideas are automatically organised using IBIS framework
- Real-time collaboration through voice and text

### 3. **Analysis Phase**
- System tracks participant contributions and stance scores
- AI identifies key issues and relationships
- Comprehensive analytics are generated
- Insights inform future deliberation improvements

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build optimised production bundle
- `npm run test` - Run comprehensive test suite
- `npm run lint` - Check code quality and style
- `npm run type-check` - Validate TypeScript types

### Key Development Concepts

- **Repository Pattern**: Clean separation between data access and business logic
- **Dependency Injection**: Modular, testable architecture
- **Error Boundaries**: Graceful error handling throughout the application
- **Performance Monitoring**: Built-in performance tracking and optimisation
- **Type Safety**: Comprehensive TypeScript coverage for reliability

### Testing Strategy

- **Unit Tests**: Individual component and function testing
- **Integration Tests**: API and service integration testing
- **End-to-End Tests**: Complete user workflow testing
- **Performance Tests**: Load and stress testing for scalability

## Contributing

We welcome contributions to improve the platform. Please follow these guidelines:

1. **Fork the repository** and create a feature branch
2. **Follow the coding standards** (ESLint configuration included)
3. **Add tests** for new functionality
4. **Update documentation** as needed
5. **Submit a pull request** with a clear description of changes

### Development Guidelines

- Use TypeScript for all new code
- Follow the established component patterns
- Ensure accessibility compliance
- Optimise for performance
- Include comprehensive error handling

## Performance & Scalability

The platform is designed for scalability and performance:

- **Edge Functions**: Serverless architecture for AI processing
- **Database Optimisation**: Efficient queries with proper indexing
- **Caching Strategy**: Intelligent caching for frequently accessed data
- **Memory Management**: Optimised memory usage and garbage collection
- **Real-time Optimisation**: Efficient WebSocket connections and updates

## Security & Privacy

- **Data Protection**: Comprehensive RLS policies protect user data
- **Input Validation**: All user inputs are validated and sanitised
- **Authentication**: Secure JWT-based authentication system
- **API Security**: CORS and rate limiting protect against abuse
- **Privacy Compliance**: User data is handled according to privacy best practices

## Support & Documentation

- **Comprehensive Documentation**: Detailed guides in the `docs/` directory
- **API Documentation**: Complete API reference for developers
- **Troubleshooting Guide**: Common issues and solutions
- **Community Support**: GitHub issues and discussions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with modern web technologies and AI frameworks to create a platform that makes democratic deliberation more accessible and effective. The system combines the power of artificial intelligence with intuitive user experience design to facilitate meaningful conversations and informed decision-making.

---

*Ready for production deployment and real-world use. The platform has been thoroughly tested, optimised, and prepared for beta users to begin deliberating.*