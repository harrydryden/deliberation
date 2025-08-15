# ADR-004: Testing Strategy

## Status
Accepted

## Context
To ensure code quality and reliability, we needed a comprehensive testing strategy covering:
- Unit tests for individual components and services
- Integration tests for API endpoints
- End-to-end tests for user workflows
- Mocking external dependencies

## Decision
Implement a multi-layer testing approach with:
- **Vitest** for unit and integration tests
- **React Testing Library** for component testing
- **Playwright** for end-to-end testing
- **MSW (Mock Service Worker)** for API mocking

## Consequences

### Positive
- **Quality Assurance**: Comprehensive test coverage prevents regressions
- **Developer Confidence**: Safe refactoring with test safety net
- **Documentation**: Tests serve as living documentation
- **Faster Development**: Quick feedback on changes

### Negative
- **Initial Overhead**: Time investment to write comprehensive tests
- **Maintenance**: Tests need updates when implementation changes

## Implementation

### Test Structure
```
src/
├── test/
│   ├── setup.ts          # Test configuration
│   ├── utils.tsx         # Test utilities and wrappers
│   └── mocks/
│       └── server.ts     # MSW mock server
├── components/
│   └── __tests__/        # Component unit tests
├── hooks/
│   └── __tests__/        # Hook unit tests
├── services/
│   └── __tests__/        # Service unit tests
└── e2e/                  # End-to-end tests
```

### Unit Testing
- **Component Tests**: Render, interaction, and state testing
- **Hook Tests**: Custom hook behavior and state management
- **Service Tests**: Business logic and error handling

### Integration Testing
- **API Integration**: Full request/response cycle testing
- **Database Integration**: Real database operations testing
- **Authentication Flow**: Complete auth workflow testing

### E2E Testing
- **User Journeys**: Complete user workflows
- **Cross-browser Testing**: Ensure compatibility
- **Performance Testing**: Page load and interaction timing

### Test Utilities
```typescript
// Custom render with providers
export const render = (ui: ReactElement, options?: RenderOptions) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );

  return originalRender(ui, { wrapper: Wrapper, ...options });
};
```

### Mock Strategy
- **External APIs**: MSW for HTTP request mocking
- **Services**: Interface-based mocking for unit tests
- **Database**: In-memory database for integration tests

## Testing Guidelines
1. **Test Behavior, Not Implementation**: Focus on what the code does, not how
2. **Arrange-Act-Assert**: Clear test structure
3. **Descriptive Names**: Test names should describe the scenario
4. **Independent Tests**: Each test should be isolated
5. **Fast Feedback**: Unit tests should run quickly

## Related ADRs
- ADR-001: Single Backend Architecture
- ADR-002: Repository Pattern Implementation
- ADR-003: Dependency Injection Container