# ADR-001: Single Backend Architecture with Supabase

## Status
Accepted

## Context
The application was initially designed with a dual backend architecture (Node.js + Supabase), which created complexity in:
- Code duplication across backend implementations
- Feature parity maintenance
- Deployment complexity
- Development overhead
- Testing complexity

## Decision
We have decided to simplify the architecture to use **Supabase only** as the backend, implementing:
- Repository pattern for data access abstraction
- Dependency injection for service management
- Clean architecture principles with clear separation of concerns

## Consequences

### Positive
- **Reduced Complexity**: Single backend eliminates dual implementation overhead
- **Consistent Feature Parity**: All features use the same backend implementation
- **Simplified Deployment**: No need to manage separate backend services
- **Better Testability**: Repository pattern enables easy mocking and testing
- **Maintainability**: Clear separation of concerns with domain services
- **Scalability**: Supabase provides built-in scaling capabilities

### Negative
- **Vendor Lock-in**: Increased dependency on Supabase platform
- **Limited Custom Logic**: Some complex business logic may be harder to implement
- **Migration Effort**: Required refactoring existing dual backend code

## Implementation Details

### Architecture Layers
1. **Domain Services** (`src/services/domain/`): Business logic implementation
2. **Repositories** (`src/repositories/`): Data access abstraction
3. **Infrastructure** (`src/integrations/supabase/`): Supabase-specific implementations

### Key Components
- **Service Container**: Dependency injection for all services
- **Repository Interfaces**: Abstract data access contracts
- **Domain Services**: Business logic implementations using repositories

### Migration Path
1. ✅ Removed Node.js backend service factories
2. ✅ Implemented repository pattern with Supabase
3. ✅ Created service container with dependency injection
4. ✅ Updated all components to use new service architecture
5. ✅ Maintained feature parity across all functionality

## Related ADRs
- ADR-002: Repository Pattern Implementation
- ADR-003: Dependency Injection Container