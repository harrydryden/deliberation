# Contributing Guide

Thank you for considering contributing to the Democratic Deliberation Platform! This guide will help you get started with contributing to the project. We're excited to have you join our community.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Documentation](#documentation)

## Getting Started

### Prerequisites
- **Node.js 18+** and npm
- **Git** for version control
- Basic understanding of **React**, **TypeScript**, and **Supabase**

### Local Setup
1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Install dependencies: `npm install`
4. Start development server: `npm run dev`

### Understanding the Architecture
Before contributing, familiarise yourself with:
- [Clean Architecture principles](docs/architecture/ADR-001-single-backend-architecture.md)
- [Repository Pattern](docs/architecture/ADR-002-repository-pattern.md)
- [Dependency Injection](docs/architecture/ADR-003-dependency-injection.md)
- [Testing Strategy](docs/architecture/ADR-004-testing-strategy.md)

## Development Workflow

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring


## Code Standards

### TypeScript
- Use strict TypeScript configuration
- Provide explicit return types for functions
- Use interfaces for object shapes
- Avoid `any` type usage

### React Components
```typescript
/**
 * User profile display component
 * 
 * @param user - User object with profile information
 * @param onEdit - Callback when edit button is clicked
 */
interface UserProfileProps {
  user: User;
  onEdit: (userId: string) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ user, onEdit }) => {
  // Component implementation
};
```

### Services and Repositories
```typescript
/**
 * Service for managing user operations
 * 
 * Provides CRUD operations for users with proper error handling
 * and logging. All operations are authenticated and authorised.
 */
export class UserService implements IUserService {
  /**
   * Retrieves users with optional filtering
   * 
   * @param filter - Optional filter criteria
   * @returns Promise resolving to array of users
   * @throws {Error} When database operation fails
   */
  async getUsers(filter?: Record<string, any>): Promise<User[]> {
    // Implementation
  }
}
```

### Styling
- Use Tailwind CSS utility classes
- Follow the design system in `src/index.css`
- Use semantic colour tokens (not direct colours)
- Ensure responsive design for all components

### Error Handling
```typescript
try {
  const result = await service.operation();
  return result;
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new ServiceError('User-friendly error message');
}
```

## Testing Requirements

### Unit Tests
Every new component, hook, and service must have unit tests:
```typescript
describe('UserService', () => {
  it('should retrieve users with filter', async () => {
    // Arrange
    const mockRepository = createMockRepository();
    const service = new UserService(mockRepository);
    
    // Act
    const users = await service.getUsers({ role: 'admin' });
    
    // Assert
    expect(users).toHaveLength(2);
    expect(mockRepository.findAll).toHaveBeenCalledWith({ role: 'admin' });
  });
});
```

### Integration Tests
Test service interactions and data flow:
```typescript
describe('Auth Integration', () => {
  it('should authenticate user and return profile', async () => {
    const { user, session } = await authService.signIn('test@example.com', 'password');
    expect(user).toBeDefined();
    expect(session).toBeDefined();
  });
});
```

### E2E Tests
Test critical user workflows:
```typescript
test('should allow user to create deliberation', async ({ page }) => {
  await page.goto('/deliberations');
  await page.click('[data-testid="create-deliberation"]');
  await page.fill('[data-testid="title-input"]', 'Test Deliberation');
  await page.click('[data-testid="submit-button"]');
  await expect(page.locator('[data-testid="deliberation-title"]')).toContainText('Test Deliberation');
});
```

### Coverage Requirements
- Minimum 80% code coverage
- 100% coverage for critical business logic
- All new features must include tests

## Pull Request Process

### Before Submitting
1. **Run tests**: `npm test`
2. **Check linting**: `npm run lint`
3. **Verify build**: `npm run build`
4. **Update documentation** if needed

### PR Checklist
- [ ] Tests added/updated for new functionality
- [ ] JSDoc comments added for public functions
- [ ] Code follows project style guidelines
- [ ] Documentation updated if needed
- [ ] Breaking changes documented
- [ ] Performance impact considered

### PR Description Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Documentation
- [ ] JSDoc comments added
- [ ] README updated
- [ ] API documentation updated
- [ ] ADR created (if applicable)
```

## Documentation

### JSDoc Requirements
All public functions and classes must have JSDoc comments:
```typescript
/**
 * Validates user input for authentication
 * 
 * @param email - User email address
 * @param password - User password (minimum 8 characters)
 * @returns Validation result with any errors
 * 
 * @example
 * ```typescript
 * const result = validateAuthInput('user@example.com', 'password123');
 * if (!result.isValid) {
 *   console.log(result.errors);
 * }
 * ```
 */
export function validateAuthInput(email: string, password: string): ValidationResult {
  // Implementation
}
```

### API Documentation
Update `docs/api/README.md` when adding new endpoints or changing existing ones.

### Architecture Decisions
Create ADRs for significant architectural decisions in `docs/architecture/`.

## Getting Help

- Check existing issues and discussions
- Read the documentation in `docs/`
- Ask questions in pull requests
- Join our community discussions

## Recognition

Contributors will be recognised in:
- README.md contributors section
- Release notes for significant contributions
- Project documentation

Thank you for contributing to making democratic deliberation more accessible and effective!

### Commit Messages
Follow conventional commits:
