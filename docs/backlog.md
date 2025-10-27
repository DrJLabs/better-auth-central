# Engineering Backlog

This backlog collects cross-cutting or future action items that emerge from reviews and planning.

Routing guidance:

- Use this file for non-urgent optimizations, refactors, or follow-ups that span multiple stories/epics.
- Must-fix items to ship a story belong in that story’s `Tasks / Subtasks`.
- Same-epic improvements may also be captured under the epic Tech Spec `Post-Review Follow-ups` section.

| Date | Story | Epic | Type | Severity | Owner | Status | Notes |
| ---- | ----- | ---- | ---- | -------- | ----- | ------ | ----- |
| 2025-10-28 | 1.2 | 1 | Bug | High | Auth Platform | Done | Sanitized forwarded scope parameter before calling Better Auth so unauthorized scopes can't be minted (`src/routes/oauthRouter.ts`). |
| 2025-10-28 | - | 1 | Enhancement | Medium | Platform DevOps | Done | MCP compliance CLI job added via Story 1.4; CI now blocks regressions across staging + main. |
| 2025-10-28 | - | 1 | Process | Medium | Auth Ops | Done | MCP onboarding runbook published via Story 1.5 with rollback guidance for solo operations. |
| 2025-10-26 | - | 1 | Tooling | Medium | Platform DevOps | Done | Added automated README ↔ runbook parity lint (`pnpm lint:docs`) to prevent documentation drift (AI-4). |
| 2025-10-26 | 1.4 | 1 | Bug | Medium | Platform DevOps | Done | Restored session challenge assertion and added tests covering grant omission in `scripts/mcp-compliance.mjs` + related suites. |
