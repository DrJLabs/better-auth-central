# Test Design: Epic 1 - Central MCP Compatibility Alignment

**Date:** 2025-10-24
**Author:** drj
**Status:** Draft

---

## Executive Summary

**Scope:** full test design for Epic 1

**Risk Summary:**

- Total risks identified: 9
- High-priority risks (≥6): 4
- Critical categories: SEC, DATA, TECH

**Coverage Summary:**

- P0 scenarios: 5 (10.0 hours)
- P1 scenarios: 6 (6.0 hours)
- P2/P3 scenarios: 6 (2.5 hours)
- **Total effort**: 18.5 hours (~2.3 days)

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | Token response omits `client_id`/`resource`, causing ChatGPT MCP clients to reject OAuth flows | 2 | 3 | 6 | Enforce Zod contract in shared response builder and add API contract test that diff-checks against MCP spec payload | Auth Platform | 2025-10-28 |
| R-002 | DATA | Introspection payload returns partial fields (`issued_token_type`, `resource`, `active`) leading to stale authorization state | 2 | 3 | 6 | Add Supertest-based contract test plus schema guard to assert mandatory fields and TTL math | QA Engineering | 2025-10-28 |
| R-003 | TECH | Session endpoint returns non-MCP-compliant shape or omits expiry windows, breaking downstream scope validation | 2 | 3 | 6 | Create integration test that exercises bearer token session lookup and validates JSON shape against shared schema util; document regression expectations | QA Engineering | 2025-10-29 |
| R-004 | SEC | Handshake endpoint fails to enforce Origin/registry match, enabling untrusted MCP clients to obtain OAuth metadata | 2 | 3 | 6 | Build security-focused API test exercising both registered and mismatched origins; wire structured denial logging and ensure registry lookups are strict | Auth Platform | 2025-10-29 |

### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-005 | OPS | `pnpm mcp:compliance` script not updated for new schema, masking regressions in CI | 2 | 2 | 4 | Expand compliance script fixtures and run in CI burn-in loop; add test asserting new fields are asserted | Release Eng |
| R-006 | BUS | Structured logging missing for denied origins/scope mismatches, reducing incident triage quality | 2 | 2 | 4 | Unit-test logger wrapper to assert JSON shape and field presence; add log sampling verification in integration test | Observability |
| R-007 | PERF | Additional schema parsing increases response latency for token/introspection endpoints beyond budget | 2 | 2 | 4 | Add micro-benchmark regression guard and monitor latency via CI perf smoke; optimize schema composition if >10% overhead | Platform Perf |

### Low-Priority Risks (Score ≤2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-008 | OPS | Documentation drift between integration checklist and new endpoint fields | 1 | 2 | 2 | Monitor during release notes refresh |
| R-009 | PERF | Excessive trace artifact retention from new tests bloats CI storage | 1 | 1 | 1 | Document retention policy and prune weekly |

### Risk Category Legend

- **TECH**: Technical architecture or implementation integrity
- **SEC**: Security exposure, authZ/authN enforcement
- **PERF**: Latency, throughput, scalability
- **DATA**: Data correctness, integrity, expiry
- **BUS**: Business / UX impact
- **OPS**: Operational readiness, monitoring, documentation

---

## Test Coverage Plan

### P0 (Critical) - Run on every commit

**Criteria**: Blocks core journey + High risk (≥6) + No workaround

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC1: Token endpoint emits MCP-compliant payload | API (Supertest) | R-001 | 1 | QA | Validates happy path plus schema diff against ChatGPT MCP spec and OAuth 2.0 token response (RFC 6749 §5.1); single test covers JSON structure and numeric TTL accuracy |
| AC2: Introspection payload carries `client_id`, `resource`, `issued_token_type`, `active` | API (Supertest) | R-002 | 1 | QA | Confirms active token introspection matches Zod schema and timestamps; asserts caching headers |
| AC3: Session endpoint returns `{ userId, clientId, scopes, issuedAt, expiresAt, resource }` | API (Supertest) | R-003 | 1 | QA | Uses Better Auth API to mint session and verifies response envelope plus ordering; cross-checks JSON with schema utility |
| AC4: Handshake validates registered origin and returns OAuth metadata | API (Supertest) | R-004 | 2 | QA | First assertion: registered origin + client ID returns endpoints; second assertion: mismatched Origin header returns 403 with structured error body |

**Total P0**: 5 tests, 10.0 hours

### P1 (High) - Run on PR to main

**Criteria**: Important features + Medium risk (3-4) + Common workflows

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Token endpoint handles denied scope / invalid client gracefully | API (Supertest) | R-001 | 2 | QA | Verifies deterministic error payloads and log hooks for scope mismatch + invalid client credentials |
| Introspection returns `active: false` and omits MCP fields for revoked token | API (Supertest) | R-002 | 2 | QA | Uses revoked access token to assert `active: false`, no `client_id`, and consistent challenge headers |
| Session endpoint returns WWW-Authenticate challenge on missing/expired token | API (Supertest) | R-003 | 1 | QA | Ensures `WWW-Authenticate` matches RFC 6750 resource metadata challenge |
| Compliance script captures new fields in summary output | CLI (Node test runner) | R-005 | 1 | Release Eng | Executes `scripts/mcp-compliance.mjs --register` and snapshots new JSON fields to prevent regressions |

**Total P1**: 6 tests, 6.0 hours

### P2 (Medium) - Run nightly/weekly

**Criteria**: Secondary features + Low-to-medium risk + Edge cases

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Structured security logging emitted for denied handshake/session attempts | Unit (Node test runner) | R-006 | 2 | Observability | Validates log formatter includes `event`, `clientId`, `origin`, `decision`; snapshot to guard JSON casing |
| Latency budget regression guard for schema validation | Benchmark (Node perf hooks) | R-007 | 2 | Platform Perf | Adds micro-benchmark comparing previous vs current schema cost; fails if >10% regression or >10ms per request |

**Total P2**: 4 tests, 2.0 hours

### P3 (Low) - Run on-demand

**Criteria**: Nice-to-have + Exploratory + Documentation upkeep

| Requirement | Test Level | Test Count | Owner | Notes |
| ----------- | ---------- | ---------- | ----- | ----- |
| Documentation snippet validation for MCP payload examples | Doc lint | 1 | Docs | mdx/markdown lint to ensure sample payloads stay current with schema |
| Schema validator benchmark stored for historical tracking | Benchmark | 1 | Platform Perf | Track baseline numbers for future regression analysis |

**Total P3**: 2 tests, 0.5 hours

---

## Execution Order

### Smoke Tests (<5 min)

- [ ] Token endpoint MCP payload smoke (Supertest fast path)
- [ ] Handshake registered origin pathway

**Total**: 2 scenarios

### P0 Tests (<10 min)

- [ ] Token MCP contract + TTL math (API)
- [ ] Introspection MCP contract (API)
- [ ] Session payload contract (API)
- [ ] Handshake allowed vs denied origin (API)

### P1 Tests (<30 min)

- [ ] Token error semantics (invalid client & scope)
- [ ] Introspection revoked token behaviour
- [ ] Session challenge formatting on expired token
- [ ] Compliance script snapshot regeneration

### P2/P3 Tests (<60 min)

- [ ] Structured logging formatter snapshot
- [ ] Schema validation latency guard
- [ ] Documentation lint + benchmarks archive

Execution order prioritises MCP contract coverage first, followed by observability/perf checks.

---

## Traceability Matrix (Acceptance Criteria → Tests)

| Acceptance Criterion | Risk ID | Priority | Test Level | Planned Tests |
| -------------------- | ------- | -------- | ---------- | ------------- |
| AC1: `/api/auth/oauth2/token` returns MCP payload | R-001 | P0 | API | Token MCP contract, invalid scope/invalid client |
| AC2: `/api/auth/oauth2/introspect` MCP schema | R-002 | P0 | API | Introspection contract, revoked token response |
| AC3: `/api/auth/mcp/session` MCP payload | R-003 | P0 | API | Session contract, expired token challenge |
| AC4: `/api/auth/mcp/handshake` origin validation | R-004 | P0 | API | Registered origin success, mismatched origin denial |

---

## Resource Estimates

| Priority | Test Count | Avg Hours/Test | Total Hours | Notes |
| -------- | ---------- | -------------- | ----------- | ----- |
| P0 | 5 | 2.0 | 10.0 | Security & contract tests require fixture refactors |
| P1 | 6 | 1.0 | 6.0 | Reuse P0 harness with alternate fixtures |
| P2 | 4 | 0.5 | 2.0 | Logging + perf guardrails |
| P3 | 2 | 0.25 | 0.5 | Documentation + benchmark capture |
| **Total** | **17** | **-** | **18.5** | **~2.3 days** |

### Prerequisites

**Test Data:**

- MCP registry fixture with two clients (allowed + rogue) seeded via `MCP_CLIENTS`
- Access/refresh token factory leveraging Better Auth test utilities

**Tooling:**

- Supertest + Node test runner for API assertions
- Zod schemas (shared) for response validation
- Node perf hooks for micro-benchmarks

**Environment:**

- `BETTER_AUTH_URL` pointing to test server (loopback)
- `MCP_DEFAULT_SCOPES`, `MCP_ENFORCE_SCOPE_ALIGNMENT=true`
- `BETTER_AUTH_TRUSTED_ORIGINS` includes allowed origin only

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (blocker if any fail)
- **P1 pass rate**: ≥95% (waiver required otherwise)
- **P2/P3 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete with owner sign-off

### Coverage Targets

- Critical MCP contract paths: ≥80%
- Security scenarios (SEC category): 100%
- Business logic regressions: ≥70%
- Observability hooks: ≥50%

### Non-Negotiable Requirements

- [ ] All P0 tests green in CI on main branch
- [ ] No open high-risk (≥6) findings without mitigation
- [ ] Security denial logging validated and operational
- [ ] Compliance script snapshot updated alongside code change

---

## Mitigation Plans

### R-001: Token payload missing MCP fields (Score: 6)

**Mitigation Strategy:** Introduce shared `buildTokenResponse()` utility guarded by Zod schema; add Supertest contract test referencing ChatGPT MCP spec (Sept 2024) and RFC 6749 §5.1 examples; enforce schema during CI.

**Owner:** Auth Platform

**Timeline:** 2025-10-28

**Status:** Planned

**Verification:** API test + schema snapshot diff must pass in CI and during burn-in pipeline.

### R-004: Handshake origin bypass (Score: 6)

**Mitigation Strategy:** Refactor handshake router to check both `Origin` header and registry entry; add negative test verifying 403 with structured payload and log entry; ensure CORS middleware denies preflight for rogue origins.

**Owner:** QA Engineering

**Timeline:** 2025-10-29

**Status:** Planned

**Verification:** P0 handshake test passes; structured logging captured in Splunk dev feed.

---

## Assumptions and Dependencies

### Assumptions

1. Better Auth MCP plugin continues to expose `auth.api` helpers used in tests.
2. Test harness can mint OAuth tokens without external identity provider dependencies.
3. MCP spec field names remain stable through Q4 2025 (validated against OpenAI ChatGPT MCP docs).

### Dependencies

1. Zod schemas shared with runtime code must be published before tests execute.
2. CI runners require SQLite access for Better Auth storage.
3. Compliance script updates merged prior to gating tests.

### Risks to Plan

- **Risk:** External MCP spec changes post-lock
  - **Impact:** Contract tests fail unexpectedly
  - **Contingency:** Add spec version tag to fixtures; monitor upstream announcements

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: **________________** Date: **__________**
- [ ] Tech Lead: **________________** Date: **__________**
- [ ] QA Lead: **________________** Date: **__________**

**Comments:**

---

## Appendix

### Knowledge Base References

- `risk-governance.md`
- `probability-impact.md`
- `test-levels-framework.md`
- `test-priorities-matrix.md`

### Related Documents

- PRD: docs/product-brief-todo-app-integration-2025-10-16.md
- Epic: docs/epics.md
- Architecture: docs/architecture.md
- Tech Spec: docs/tech-spec.md

### External References

- OpenAI ChatGPT MCP authentication spec (2024-09) – token, introspection, session payload requirements
- OAuth 2.0 Token Response (RFC 6749 §5.1) – baseline payload fields
- RFC 6750 §3 – Bearer token usage (`WWW-Authenticate` challenge semantics)

---

## Story 3 Addendum: Automate MCP Compliance Verification

**Scope:** targeted test design updates for Story 3 within Epic 1, focused on the MCP compliance CLI and operator workflow.

### Executive Snapshot

- Total new risks analysed: 4 (high priority ≥6: 1)
- Additional scenarios planned: 7 (P0: 4, P1: 2, P2: 1)
- Estimated incremental effort: 12.0 hours (~1.5 days)

### Risk Assessment (Story 3 Focus)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R3-SEC-1 | SEC | Compliance CLI stops after metadata/401 checks, letting token or introspection regressions escape | 2 | 3 | 6 | Extend CLI + fixtures to exercise token + introspection schemas via Zod validation and fail on drift | QA Engineering | 2025-10-30 |
| R3-TECH-1 | TECH | CLI validates only first registry entry, leaving other MCP clients unchecked | 2 | 2 | 4 | Iterate through every `mcp-servers.json` entry, enforcing Origin header & handshake per client | Platform Dev | 2025-10-30 |
| R3-OPS-1 | OPS | CLI lacks bounded timeouts/retries, allowing network stalls to hang CI | 2 | 2 | 4 | Add per-request timeout + single retry with backoff; assert non-zero exit codes on failure | Release Eng | 2025-10-31 |
| R3-BUS-1 | BUS | README and checklist can drift, confusing operators onboarding new MCP servers | 1 | 3 | 3 | Introduce doc parity lint aligning README anchors with `docs/integration/mcp-auth-checklist.md` | Docs | 2025-10-31 |

### Story-Level Coverage Plan

#### P0 (Critical) – Run on every commit

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| CLI validates handshake → token → introspection → session schemas | Integration (CLI harness) | R3-SEC-1 | 2 | QA Engineering | Expand `scripts/__tests__/mcp-compliance.test.mjs` stub server to drive full MCP flow; assert Zod schemas |
| CLI iterates every registry client enforcing Origin header | Integration (CLI harness) | R3-TECH-1 | 1 | Platform Dev | Multi-client stub ensures both success and rejection paths per Origin |
| CLI surfaces actionable schema-drift error output | Integration (CLI harness) | R3-SEC-1 | 1 | QA Engineering | Snapshot failure messaging so operators see remediation guidance |

**Total P0**: 4 tests, 8.0 hours

#### P1 (High) – Run on PR to main

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| CLI times out predictably and retries once before failing | Integration (CLI harness) | R3-OPS-1 | 1 | Release Eng | Simulate slow endpoints; verify exponential backoff + exit code 1 |
| CLI register mode prints all clients and endpoints for operators | Integration (CLI harness) | R3-TECH-1 | 1 | Platform Dev | Snapshot textual summary for visibility |

**Total P1**: 2 tests, 3.0 hours

#### P2 (Medium) – Run nightly/weekly

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| README references checklist canonical sections | Doc lint | R3-BUS-1 | 1 | Docs | Markdown lint compares anchors between README and `docs/integration/mcp-auth-checklist.md` |

**Total P2**: 1 test, 1.0 hours

### Execution Order (Story 3 Incremental)

1. Smoke: CLI happy-path compliance run (P0)
2. P0 suite: schema drift failure messaging, multi-client iteration
3. P1 suite: timeout/retry behaviour, register summary formatting
4. P2 suite: doc parity lint

### Resource Addendum

| Priority | Test Count | Avg Hours/Test | Total Hours |
| -------- | ---------- | -------------- | ----------- |
| P0 | 4 | 2.0 | 8.0 |
| P1 | 2 | 1.5 | 3.0 |
| P2 | 1 | 1.0 | 1.0 |
| **Total** | **7** | **-** | **12.0** |

**Assumptions:** Server-side contract tests remain authoritative; CLI harness shares Zod schemas to prevent divergence. **Dependencies:** Requires updated fixtures under `scripts/__tests__/helpers` plus CI runner support for new lint script.

---

## Test Design Complete

**Epic**: 1
**Scope**: full

**Risk Assessment**:

- Total risks identified: 13 *(includes Story 3 addendum)*
- High-priority risks (≥6): 5
- Categories: SEC, DATA, TECH, OPS, PERF, BUS

**Coverage Plan**:

- P0 scenarios: 9 (18.0 hours)
- P1 scenarios: 8 (9.0 hours)
- P2/P3 scenarios: 7 (3.5 hours)
- **Total effort**: 30.5 hours (~3.8 days)

**Test Levels**:

- E2E: 0
- API: 10
- Component: 0
- Unit/Benchmarks: 5
- CLI/Doc: 2

**Quality Gate Criteria**:

- P0 pass rate: 100%
- P1 pass rate: ≥95%
- High-risk mitigations: 100%
- Coverage: ≥80% critical paths

**Output File**: docs/test-design-epic-1.md

**Next Steps**:

1. Review risk assessment with Auth Platform + QA Engineering
2. Prioritize mitigation for high-risk items (score ≥6)
3. Run `*atdd` workflow to generate P0 test skeletons
4. Allocate resources per effort estimates
5. Implement fixtures and schema utilities before automation
