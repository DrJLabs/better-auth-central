# Server Tests

This directory contains unit tests for the Express server routes.

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Test Structure

- `server.test.mjs` - Tests for Express routes including:
  - Well-known OAuth endpoints
  - Login page rendering
  - Consent page with query parameter handling
  - Health check endpoint
  - Error handling and edge cases

## Dependencies

Tests use:
- Node.js built-in test runner (`node:test`)
- `supertest` for HTTP assertions
- `node:assert/strict` for assertions

## Writing New Tests

When adding new routes or functionality:
1. Create descriptive test cases using `describe()` and `it()`
2. Use `before()` and `after()` hooks for setup/teardown
3. Mock external dependencies (like the auth module)
4. Test happy paths, edge cases, and error conditions
5. Ensure tests are isolated and don't depend on external state