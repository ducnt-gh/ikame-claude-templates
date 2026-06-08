---
name: coding-standards
description: Quy chuẩn code cho toàn dự án — naming, architecture, patterns, TypeScript rules
---

# Coding Standards

Áp dụng cho toàn bộ dự án. Tất cả agents phải tuân thủ.

## Nguyên tắc Tổng quan

1. **Readability first**: Ưu tiên rõ ràng hơn clever
2. **Explicit hơn implicit**: Tránh magic, side effects ẩn
3. **Fail fast**: Validate early, throw meaningful errors
4. **DRY**: Single Source of Truth
5. **Boy Scout Rule**: Luôn để code sạch hơn khi bạn rời đi

## Naming Conventions (JavaScript/TypeScript)

```typescript
// Variables & functions: camelCase
const userProfile = {};
function getUserById(id: string) {}

// Classes & Types: PascalCase
class UserService {}
type ApiResponse<T> = { data: T; error?: string };

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;

// Boolean: is/has/can/should prefix
const isLoading = true;
const hasPermission = false;

// Event handlers: handle prefix
function handleSubmit() {}
```

## Cấu trúc Function

- Max 30 lines per function
- Max 3 parameters (nếu nhiều hơn, dùng options object)
- Early return pattern để giảm nesting
- Max nesting depth: 3 levels

## Architecture

### Backend
```
controllers/ → services/ → repositories/ → models/
middlewares/ validators/ utils/ types/
```

### Frontend
```
components/ pages/ hooks/ services/ store/ utils/ types/
```

## TypeScript Rules

- `strict: true` bắt buộc
- Không dùng `any` — dùng `unknown` rồi type guard
- Explicit return types cho public functions
- Interface cho objects, Type cho unions/primitives

## Error Handling

```typescript
try {
  const result = await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new AppError('User-friendly message', { cause: error });
}
// Không bao giờ: catch (e) {} // Empty catch
```

## Comments

- Comment giải thích WHY, không WHAT
- JSDoc cho public APIs
- Không comment code hiển nhiên
