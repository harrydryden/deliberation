import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock API responses
export const handlers = [
  // Mock Supabase auth endpoints
  http.post('*/auth/v1/token', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      user: {
        id: 'mock-user-id',
        email: 'test@example.com',
        role: 'authenticated',
      },
    });
  }),

  // Mock Supabase REST API
  http.get('*/rest/v1/profiles', () => {
    return HttpResponse.json([
      {
        id: 'mock-user-id',
        email: 'test@example.com',
        display_name: 'Test User',
        role: 'user',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]);
  }),

  http.get('*/rest/v1/deliberations', () => {
    return HttpResponse.json([
      {
        id: 'mock-deliberation-id',
        title: 'Test Deliberation',
        description: 'A test deliberation',
        status: 'active',
        facilitator_id: 'mock-user-id',
        is_public: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]);
  }),

  http.get('*/rest/v1/agent_configurations', () => {
    return HttpResponse.json([
      {
        id: 'mock-agent-id',
        name: 'Test Agent',
        description: 'A test agent',
        agent_type: 'facilitator',
        system_prompt: 'You are a helpful facilitator',
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]);
  }),

  http.get('*/rest/v1/messages', () => {
    return HttpResponse.json([
      {
        id: 'mock-message-id',
        content: 'Hello, world!',
        message_type: 'user',
        user_id: 'mock-user-id',
        deliberation_id: 'mock-deliberation-id',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]);
  }),
];

// This configures a request mocking server with the given request handlers
export const server = setupServer(...handlers);