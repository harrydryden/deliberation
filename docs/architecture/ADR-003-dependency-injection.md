# ADR-003: Dependency Injection Container

## Status
Accepted

## Context
To manage service dependencies and enable easy testing, we needed:
- Centralized service instantiation
- Dependency resolution
- Service lifecycle management
- Easy mocking for tests

## Decision
Implement a service container with:
- Singleton service instances
- Dependency injection for service constructors
- React Context Provider for service access
- Individual hooks for service convenience

## Consequences

### Positive
- **Testability**: Easy to inject mock services for testing
- **Modularity**: Services can be developed and tested independently
- **Lifecycle Management**: Services created once and reused
- **Dependency Resolution**: Automatic resolution of service dependencies

### Negative
- **Complexity**: Additional abstraction layer
- **Learning Curve**: Developers need to understand DI concepts

## Implementation

### Service Container
```typescript
class ServiceContainer {
  private userRepository: IUserRepository;
  private messageRepository: IMessageRepository;
  // ... other repositories

  public authService: IAuthService;
  public messageService: IMessageService;
  // ... other services

  constructor() {
    // Initialize repositories
    this.userRepository = new UserRepository();
    this.messageRepository = new MessageRepository();
    
    // Initialize services with dependencies
    this.authService = new AuthService(this.userRepository);
    this.messageService = new MessageService(this.messageRepository);
  }
}
```

### React Integration
```typescript
export const ServiceProvider: React.FC<ServiceProviderProps> = ({ children }) => {
  return (
    <ServiceContext.Provider value={serviceContainer}>
      {children}
    </ServiceContext.Provider>
  );
};

export const useServices = () => useContext(ServiceContext);
export const useAuthService = () => useServices().authService;
```

### Testing Benefits
```typescript
// Easy to mock services for testing
const mockAuthService = {
  signIn: vi.fn(),
  signOut: vi.fn(),
} as IAuthService;

const testContainer = {
  ...serviceContainer,
  authService: mockAuthService,
};
```

## Related ADRs
- ADR-001: Single Backend Architecture
- ADR-002: Repository Pattern Implementation
