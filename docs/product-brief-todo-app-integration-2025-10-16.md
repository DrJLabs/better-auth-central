# Product Brief: todo-app integration

**Date:** 2025-10-16
**Author:** drj
**Status:** Draft for PM Review

---

## Executive Summary

The todo-app integration project productionizes the Better Auth central server as the OAuth authority for the ChatGPT Todo MCP client. The immediate goal is to prove the integration in a controlled setting (drj as first operator) while establishing hardened, reusable patterns—CORS, cross-origin session support, discovery metadata, and consent UX—that future MCP servers and ChatGPT apps can adopt with minimal friction.

---

## Problem Statement

Today the ChatGPT Todo MCP client cannot rely on a stable OAuth authority within the Better Auth ecosystem. Without a central, trusted auth server:

- Session validation requires ad-hoc solutions, risking inconsistent security across environments.
- Cross-origin access (local dev, staging, production domains) breaks without carefully configured CORS and cookie policies.
- Discovery metadata may drift, forcing manual reconfiguration for every client.
- Placeholder login and consent flows delay real-world adoption and SSO validation.

The lack of a canonical integration path slows down new MCP experiences and increases operational risk as each new app reimplements the same auth scaffolding.

---

## Proposed Solution

Deliver a hardened Better Auth central server configuration that the ChatGPT Todo MCP client can depend on for OAuth discovery, session introspection, and consent flows. Key solution elements:

- Configure Express + Better Auth to respect trusted origins (`localhost` dev hosts and `todo.onemainarmy.com`/`auth.onemainarmy.com`).
- Enable secure cross-origin cookies so the ChatGPT client maintains sessions across domains.
- Keep discovery endpoints (`/.well-known/...`) stable and add smoke tests to detect drift.
- Replace placeholder login/consent HTML with production-ready flows that can launch Google SSO and post consent decisions back to the auth server.
- Document environment contracts and reverse-proxy expectations, ensuring cookie security behind Traefik/HTTPS.

Successful delivery establishes a repeatable pattern for future MCP integrations.

---

## Target Users

### Primary User Segment

- **Early Integrator (drj)**: Responsible for proving the integration, validating server behavior, and documenting the baseline. Needs predictable auth behavior to iterate quickly on the ChatGPT Todo client.

### Secondary User Segment

- **Future MCP Service Owners**: Will reuse the hardened server configuration when attaching new MCP endpoints to chat-based clients. They depend on clear documentation, environment contracts, and example flows to avoid guesswork.

---

## Goals and Success Metrics

### Business Objectives

- Establish Better Auth central server as the authoritative OAuth provider for current and future MCP clients.
- Reduce time-to-integrate for subsequent MCP experiences by delivering a reusable template.

### User Success Metrics

- Todo MCP client authenticates successfully against the central server in local and production environments.
- Cross-origin session durability validated across dev and production domains.

### Key Performance Indicators (KPIs)

- ✅ Successful login + consent + session introspection flows for the todo client.
- ✅ CORS and cookie configuration confirmed via automated smoke tests.
- ✅ Deployment checklist (trusted origins, environment variables) documented and reusable.

---

## Strategic Alignment and Financial Impact

### Financial Impact

Near-term financial impact is minimal (internal project). Long-term, a reusable MCP integration path reduces engineering effort for future partner-facing experiences, accelerating time-to-market and lowering integration costs.

### Company Objectives Alignment

- Supports the Better Auth roadmap of enabling third-party apps through secure, centralized authentication.
- Lays groundwork for scaling the product to broader developer communities.

### Strategic Initiatives

- “Platformization” of Better Auth—centralizing auth for multiple services.
- First production-ready MCP client integration, enabling future monetization or partnerships.

---

## MVP Scope

### Core Features (Must Have)

1. Trusted origin and CORS configuration covering local dev and production domains.
2. Cross-origin cookie support with secure defaults for Traefik/HTTPS deployments.
3. Stable discovery metadata endpoints with smoke tests.
4. Production-ready login and consent pages supporting Google SSO and manual consent submission.
5. Documented environment variables and proxy expectations.

### Out of Scope for MVP

- Packaging helper SDKs for external services (not required for the first integration).
- Public changelog automation for discovery metadata (manual updates acceptable initially).

### MVP Success Criteria

- Todo client completes OAuth flow end-to-end using the central server.
- Deployment checklist executed successfully in production (`auth.onemainarmy.com`).
- Documentation consumed by another developer without additional guidance.

---

## Post-MVP Vision

### Phase 2 Features

- Export helper package wrapping `auth.api.getMcpSession` for external consumers.
- Automate smoke tests targeting production endpoints (CI integration).
- Harden consent UI with multi-provider support and brand guidelines.

### Long-term Vision

- Support multiple MCP clients with a single auth server configuration.
- Extend login/consent flows to support enterprise SSO and custom branding.
- Provide a shared library or CLI to bootstrap new MCP integrations quickly.

### Expansion Opportunities

- Offer integration guides/templates for third-party developers using Better Auth.
- Monetize premium features (advanced analytics, audit trails) once multiple apps depend on the platform.

---

## Technical Considerations

### Platform Requirements

- Node.js runtime hosting Express + Better Auth.
- Traefik (or equivalent) reverse proxy terminating TLS, forwarding X-Forwarded headers.
- SQLite storage (embedded) with optional driver overrides for different environments.

### Technology Preferences

- Maintain Express + Better Auth stack for consistency with existing codebase.
- Favor TypeScript-first workflows for maintainability.

### Architecture Considerations

- Ensure trust proxy is enabled so secure cookies work behind Traefik.
- Maintain separation between auth server and MCP client repos while sharing environment contracts.
- Keep discovery metadata stable; any schema changes require coordination with client teams.

---

## Constraints and Assumptions

### Constraints

- Limited to current infrastructure (Traefik, onemainarmy.com domains) for launch.
- Single developer initial rollout; documentation must compensate for limited personnel.

### Key Assumptions

- Google social provider remains the primary SSO path for the Todo app.
- Future MCP clients will share similar domain patterns and can reuse the same CORS/cookie settings.

---

## Risks and Open Questions

### Key Risks

- Misconfigured cookies could break session persistence in production.
- Drift between discovery metadata and client expectations may cause runtime failures.
- Placeholder consent UI might linger if not prioritized before launch.

### Open Questions

- Do we need additional identity providers beyond Google for early adopters?
- Should we bundle SDK utilities before exposing to external developers?
- How will we version and communicate discovery metadata changes?

### Areas Needing Further Research

- Evaluate monitoring/alerting for discovery endpoints (production health).
- Investigate best practices for multi-domain cookie management under Traefik.
- Assess demand for partner integrations to prioritize SDK work.

---

## Appendices

### A. Research Summary

- Integration checklist from `docs/chatgpt-todo-auth-alignment.md` covering CORS, cookies, discovery, login/consent UX, environment contracts, and future enhancements.

### B. Stakeholder Input

- Primary stakeholder: drj (internal product integrator) — driving initial implementation and documentation.

### C. References

- `docs/chatgpt-todo-auth-alignment.md`
- Better Auth central server source (`src/server.ts`, `src/auth.ts`)
- Deployment scripts and environment configuration notes.

---

_This Product Brief serves as the foundational input for Product Requirements Document (PRD) creation._

_Next Steps: Handoff to Product Manager for PRD development using the `workflow prd` command._
