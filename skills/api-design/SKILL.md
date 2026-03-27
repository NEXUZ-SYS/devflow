---
name: api-design
description: "Use when designing, modifying, or reviewing APIs — REST, GraphQL, RPC, or internal interfaces. Covers contracts, versioning, error handling, and documentation."
---

# API Design

Structured approach to designing APIs that are consistent, well-documented, and easy to consume.

**Announce at start:** "I'm using the devflow:api-design skill to design this API."

## When to Use

- Designing new API endpoints
- Modifying existing API contracts
- Reviewing API design decisions
- Planning API versioning strategy

## Checklist

1. **Gather context** — existing API patterns, conventions, auth model
2. **Define contract** — endpoints, methods, request/response shapes
3. **Error handling** — consistent error format, status codes, error messages
4. **Versioning** — strategy for backwards compatibility
5. **Documentation** — OpenAPI/Swagger spec or equivalent
6. **Review** — validate against REST/GraphQL best practices

## Design Principles

### Consistency
- Follow existing API patterns in the codebase
- Consistent naming: plural nouns for collections (`/users`), singular for actions
- Consistent response shapes: always include `data`, `error`, `meta` fields
- Consistent pagination: cursor-based or offset-based, pick one

### Contracts
```
Endpoint: METHOD /resource
Request:  { required fields, optional fields with defaults }
Response: { data: T, meta?: { pagination } }
Error:    { error: { code: string, message: string, details?: any } }
```

### Status Codes
- `200` — Success (GET, PUT, PATCH)
- `201` — Created (POST)
- `204` — No Content (DELETE)
- `400` — Bad Request (validation error)
- `401` — Unauthorized (missing/invalid auth)
- `403` — Forbidden (valid auth, insufficient permissions)
- `404` — Not Found
- `409` — Conflict (duplicate, version mismatch)
- `422` — Unprocessable Entity (valid syntax, invalid semantics)
- `500` — Internal Server Error

### Versioning
- URL prefix (`/v2/users`) for breaking changes
- Headers (`Accept: application/vnd.api+json;version=2`) for content negotiation
- Never break existing consumers without deprecation period

## Mode Integration

### Full Mode
```
skill({ action: "getContent", skill: "api-design" })
```
Loads project-specific API standards from dotcontext.

### Lite Mode
Read `.context/skills/api-design/SKILL.md` if it exists for project-specific conventions.

### Minimal Mode
Apply the principles above directly.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| Verbs in URLs (`/getUser`) | Use nouns + HTTP methods instead (`GET /users/:id`) |
| Inconsistent error shapes | Every error should follow the same structure |
| No pagination on lists | Unbounded queries kill performance |
| Exposing internal IDs | Use UUIDs or slugs for external APIs |
| Breaking changes without versioning | Breaks all existing consumers |
