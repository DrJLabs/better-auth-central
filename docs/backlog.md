# Engineering Backlog

This backlog collects cross-cutting or future action items that emerge from reviews and planning.

Routing guidance:

- Use this file for non-urgent optimizations, refactors, or follow-ups that span multiple stories/epics.
- Must-fix items to ship a story belong in that story’s `Tasks / Subtasks`.
- Same-epic improvements may also be captured under the epic Tech Spec `Post-Review Follow-ups` section.

| Date | Story | Epic | Type | Severity | Owner | Status | Notes |
| ---- | ----- | ---- | ---- | -------- | ----- | ------ | ----- |
| 2025-10-28 | 1.2 | 1 | Bug | High | Auth Platform | Done | Sanitized forwarded scope parameter before calling Better Auth so unauthorized scopes can't be minted (`src/routes/oauthRouter.ts`). |
| 2025-10-28 | - | 1 | Enhancement | Medium | Platform DevOps | Open | Wire the MCP compliance CLI into CI (staging + main) so regressions block deploys; reuse `pnpm mcp:compliance` with staging base URL. |
| 2025-10-28 | - | 1 | Process | Medium | Auth Ops | Open | Draft an MCP onboarding runbook (env vars, compliance steps, rollback guidance) for operators ahead of the next epic rollout. |
