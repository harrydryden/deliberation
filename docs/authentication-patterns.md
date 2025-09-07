# Authentication Patterns

This document outlines the standardized authentication patterns used throughout the application.

## Core Principles

1. **Centralized Authentication**: All auth logic flows through the `useSupabaseAuth` hook
2. **No Direct Auth Calls**: Components and services should not call `supabase.auth` directly
3. **Pass Auth Data**: Services receive auth data as parameters rather than calling auth methods internally

## Component Pattern

```typescript
// ✅ CORRECT: Use the centralized hook
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

const MyComponent = () => {
  const { user, isAdmin, signOut } = useSupabaseAuth();
  
  // Check auth status before operations
  if (!user?.id) {
    return <div>Please sign in</div>;
  }
  
  // Pass userId to services
  const result = await myService.doOperation(user.id, otherParams);
};
```

## Service Pattern

```typescript
// ✅ CORRECT: Services receive userId as parameter
export class MyService {
  async doOperation(userId: string, otherParams: any) {
    // Use userId directly - no auth calls needed
    return supabase.from('table').insert({ user_id: userId, ...otherParams });
  }
}
```

## Repository Pattern

```typescript
// ✅ CORRECT: Repositories focus on data access
export class MyRepository extends SupabaseBaseRepository {
  async create(data: any, userId: string) {
    // Receive userId from service/component
    return supabase.from('table').insert({ ...data, user_id: userId });
  }
}
```

## Anti-Patterns to Avoid

```typescript
// ❌ WRONG: Direct auth calls in components
const { data: { user } } = await supabase.auth.getUser();

// ❌ WRONG: Auth calls in services  
class MyService {
  async doOperation() {
    const { data: { user } } = await supabase.auth.getUser();
    // ...
  }
}

// ❌ WRONG: Duplicate admin checking
const isAdmin = await checkIfUserIsAdmin(); // Use useSupabaseAuth().isAdmin instead
```

## Route Protection

```typescript
// ✅ CORRECT: Use the provided guard components
<Route path="/admin" element={
  <AuthGuard>
    <AdminGuard>
      <AdminPage />
    </AdminGuard>
  </AuthGuard>
} />
```

## Benefits of This Pattern

1. **Consistency**: All auth logic flows through one hook
2. **Performance**: No duplicate auth state management
3. **Testability**: Easy to mock auth state in tests
4. **Maintainability**: Changes to auth logic only need to happen in one place
5. **Security**: Centralized auth checking reduces the risk of bypassing auth logic

## Migration Guide

If you find code that doesn't follow these patterns:

1. Replace direct `supabase.auth` calls with `useSupabaseAuth()` 
2. Update services to receive `userId` as a parameter
3. Remove duplicate admin checking logic
4. Use the centralized `isAdmin` state from the hook