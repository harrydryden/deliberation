# ADR-002: Repository Pattern Implementation

## Status
Accepted

## Context
To maintain clean separation between business logic and data access, we needed a consistent pattern for:
- Data access abstraction
- Easy testing with mocked data
- Future backend flexibility
- Consistent CRUD operations

## Decision
Implement the Repository pattern with:
- Abstract interfaces defining data access contracts
- Supabase-specific implementations
- Base repository class for common CRUD operations
- Specialised repositories for complex queries

## Consequences

### Positive
- **Testability**: Easy to mock repositories for unit testing
- **Abstraction**: Business logic decoupled from data access implementation
- **Consistency**: Uniform interface across all data operations
- **Flexibility**: Can swap implementations without changing business logic

### Negative
- **Complexity**: Additional abstraction layer
- **Boilerplate**: More code required for simple operations

## Implementation

### Base Repository Interface
```typescript
export interface IRepository<T> {
  findAll(filter?: Record<string, any>): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

### Specialised Repositories
- **UserRepository**: User-specific queries (findByEmail, updateRole)
- **MessageRepository**: Message queries (findByDeliberation, findByUser)
- **AgentRepository**: Agent queries (findByDeliberation, findLocalAgents)
- **DeliberationRepository**: Deliberation queries (findByStatus, findPublic)

### Benefits Realized
1. **Clean Testing**: Services can be tested with mock repositories
2. **Consistent API**: All data access follows same patterns
3. **Error Handling**: Centralized error handling in repositories
4. **Performance**: Optimised queries specific to each entity type

## Related ADRs
- ADR-001: Single Backend Architecture
- ADR-003: Dependency Injection Container