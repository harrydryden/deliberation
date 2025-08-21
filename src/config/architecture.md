# Simplified Architecture

## Overview
The application now uses a clean, single-backend architecture with Supabase only, implementing Repository pattern and dependency injection for better maintainability and testability.

## Architecture Layers

### 1. Domain Services Layer (`src/services/domain/`)
- **Interfaces**: Define contracts for all business operations
- **Implementations**: Business logic implementations using repositories
- **Container**: Dependency injection container managing all service instances

### 2. Repository Layer (`src/repositories/`)
- **Interfaces**: Define data access contracts
- **Implementations**: Supabase-specific data access implementations
- **Base Repository**: Common CRUD operations

### 3. Configuration (`src/config/`)
- **supabase.ts**: Supabase-only configuration
- **Removed**: Dual backend configuration complexity

## Benefits Achieved

✅ **Eliminated Code Duplication**: Single Supabase backend only
✅ **Consistent Feature Parity**: All features use same backend
✅ **Simplified Deployment**: No more dual backend complexity
✅ **Repository Pattern**: Clean data access abstraction
✅ **Dependency Injection**: Better testability and modularity
✅ **Unified API Contract**: Consistent interfaces across all services

## Migration Guide

Replace old backend service usage:
```typescript
// Old (deprecated)
import { backendServiceFactory } from '@/services/backend/factory';
const authService = backendServiceFactory.getAuthService();

// New
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
const { user, signIn, signOut } = useSupabaseAuth();
```

## Testing
Services can now be easily mocked by injecting test repositories into the service container, making unit testing much more straightforward.