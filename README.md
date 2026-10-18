# Huawei PC Marketing Agent

An evidence-backed marketing-content agent for Huawei PC operations and store marketing staff. It retrieves static facts from the local `华为PC全板块深度知识库_v7`, supplements dynamic commerce fields from the official VMall site, then generates platform-specific content with fact and compliance checks.

## Documentation

- [作品说明书](docs/作品说明书.md): positioning, differentiated capabilities, technical design, demo story, and delivery plan.
- [Frontend interaction specification](docs/frontend-interaction-spec.md): Ant Design workbench and API integration rules.
- [API contract](接口约束.md): source of truth for public endpoints and request/response fields.

## Repository map

```text
apps/web/              Web interface
services/api/          Agent orchestration and API server
packages/shared/       Shared request, response, and domain types
tests/                 API contract tests and fixed fixtures
docs/                  Architecture, API examples, and demo scripts
scripts/               Local developer and validation scripts
assets/mock-images/    Non-production mock assets only
接口约束.md             Source of truth for the public API contract
```

## Team ownership

| Owner | Scope |
| --- | --- |
| A | Task analysis, knowledge/image retrieval, validation APIs |
| B | Web experience, generate/platform/export integration |
| C | Contract tests, API examples, README, demo script |
| Integration | API contract review, shared types, final demo |

## Guardrails

- Do not commit credentials or real customer data. The runtime does not depend on ima cloud retrieval.
- The frontend may call only this project's `/api/v1` endpoints; ima credentials remain server-side.
- Product facts in final content require traceable local knowledge-base evidence. Prices, inventory and promotions require a fresh VMall check and staff confirmation.
- Update `接口约束.md` before changing request or response fields.
