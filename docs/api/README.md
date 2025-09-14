# API Documentation

This document provides comprehensive documentation for the Democratic Deliberation Platform API. We've designed it to be straightforward and well-documented for developers.

## Base URL

- Development: `http://localhost:3000/api`
- Production: `https://your-domain.com/api`

## Authentication

All protected endpoints require a JWT token in the Authorization header:


## Core Endpoints

### Authentication

#### POST /auth/login
Authenticate a user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user",
    "profile": {
      "displayName": "John Doe",
      "avatarUrl": "https://...",
      "bio": "User bio"
    }
  },
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "expires_at": 1234567890
  }
}
```

#### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "accessCode": "optional-access-code"
}
```

#### POST /auth/logout
Sign out the current user.

**Headers:** `Authorization: Bearer <token>`

### Messages

#### GET /messages
Retrieve messages for a deliberation.

**Query Parameters:**
- `deliberationId` (optional): Filter by deliberation ID
- `limit` (optional): Number of messages to return (default: 50)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "content": "Message content",
      "message_type": "user|bill_agent|peer_agent",
      "user_id": "uuid",
      "deliberation_id": "uuid",
      "created_at": "2023-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

#### POST /messages
Send a new message.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "content": "Message content",
  "messageType": "user",
  "deliberationId": "uuid",
  "mode": "chat"
}
```

### Deliberations

#### GET /deliberations
Retrieve deliberations.

**Query Parameters:**
- `status` (optional): Filter by status
- `public` (optional): Show only public deliberations

#### POST /deliberations
Create a new deliberation.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Deliberation Title",
  "description": "Deliberation description",
  "status": "active",
  "is_public": true
}
```

### Agents

#### GET /agents
Retrieve available agents.

**Query Parameters:**
- `type` (optional): Filter by agent type
- `deliberationId` (optional): Filter by deliberation

#### POST /agents
Create a new agent (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Agent Name",
  "description": "Agent description",
  "type": "bill_agent",
  "config": {
    "temperature": 0.7,
    "max_tokens": 1000
  }
}
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Invalid request parameters",
  "details": {
    "field": "email",
    "issue": "Invalid email format"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Authentication endpoints**: 5 requests per minute per IP
- **Message sending**: 30 requests per minute per user
- **General API**: 100 requests per minute per user

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Window reset time (Unix timestamp)

## WebSocket Events

### Connection
Connect to: `ws://localhost:3000/ws`

### Events

#### message:new
Triggered when a new message is posted.

```json
{
  "type": "message:new",
  "data": {
    "id": "uuid",
    "content": "Message content",
    "message_type": "user",
    "user_id": "uuid",
    "deliberation_id": "uuid",
    "created_at": "2023-01-01T00:00:00Z"
  }
}
```

#### deliberation:updated
Triggered when a deliberation is updated.

```json
{
  "type": "deliberation:updated",
  "data": {
    "id": "uuid",
    "status": "active",
    "updated_at": "2023-01-01T00:00:00Z"
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { ApiClient } from './lib/api-client';

const api = new ApiClient('http://localhost:3000/api');

// Authenticate
const { user, session } = await api.auth.login('user@example.com', 'password');

// Send message
const message = await api.messages.send({
  content: 'Hello world',
  deliberationId: 'uuid'
});

// Get deliberations
const deliberations = await api.deliberations.list({ public: true });
```

### cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Send message (with token)
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello world","deliberationId":"uuid"}'
```

## Edge Functions

The platform also includes Supabase Edge Functions for advanced functionality:

### classify_message
Classifies user messages and assigns stance scores.

### knowledge_query
Queries the knowledge base using RAG (Retrieval Augmented Generation).

### agent_orchestration_stream
Orchestrates AI agents for intelligent conversation management.

### generate_issue_recommendations
Generates issue recommendations based on conversation context.

### calculate_user_stance
Calculates aggregated user stance scores.

### ibis_embeddings
Computes embeddings for IBIS (Issue-Based Information System) nodes.

### relationship_evaluator
Evaluates relationships between IBIS nodes.

### link_similar_ibis_issues
Links similar IBIS issues for better organisation.

### generate_notion_statement
Generates notion statements for deliberations.

### generate_proactive_prompt
Generates proactive prompts to guide conversations.

### admin_get_users_v2
Admin function for user management.

### realtime_session
Manages real-time session functionality.

### voice_to_text
Converts voice input to text.

### pdf_processor
Processes PDF documents for knowledge extraction.

## Support

For API-related questions or issues:
- Check the error responses above
- Review the WebSocket events documentation
- Test with the provided SDK examples
- Contact the development team for assistance
