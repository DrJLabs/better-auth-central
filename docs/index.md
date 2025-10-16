# Project Documentation Index

## Project Overview

- **Type:** monolith
- **Primary Language:** TypeScript
- **Architecture:** Express backend with Better Auth

## Quick Reference

- **Tech Stack:** Express 5 · Better Auth · SQLite · TypeScript
- **Entry Point:** src/server.ts
- **Architecture Pattern:** Monolithic authentication service

## Generated Documentation

- [Project Overview](./project-overview.md)
- [Architecture](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Component Inventory](./component-inventory.md)
- [Development Guide](./development-guide.md)
- [API Contracts](./api-contracts.md)
- [Data Models](./data-models.md)

## Existing Documentation

- [Project README](../README.md) - Top-level repository overview
- [Workflow Status](./bmm-workflow-status.md) - Current BMAD workflow plan
- [Auth Alignment Notes](./chatgpt-todo-auth-alignment.md) - Historical analysis notes

## Getting Started

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and set `BETTER_AUTH_SECRET` plus optional OAuth credentials.
3. Run `pnpm auth:migrate` to prepare the SQLite database.
4. Start the service with `pnpm dev` (development) or `pnpm build && pnpm start` (production).
