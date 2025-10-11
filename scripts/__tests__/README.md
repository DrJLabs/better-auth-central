# Discovery Check Tests

This directory contains tests for the discovery smoke check script.

## Running Tests

```bash
# Run all tests
pnpm test

# Run only discovery tests
node --test scripts/__tests__/check-discovery.test.mjs
```

## Test Coverage

Tests cover:
- `fetchJson()` function with various scenarios
- `ensureKeys()` validation logic
- OIDC discovery endpoint validation
- Protected resource metadata validation
- Error handling for network failures and malformed responses
- Environment variable handling
- Edge cases and boundary conditions

## Test Architecture

Tests create a mock HTTP server to simulate the discovery endpoints, ensuring tests:
- Don't depend on external services
- Run quickly and reliably
- Can test error conditions
- Are fully isolated