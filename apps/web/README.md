# Web App

React + Vite + Ant Design internal workbench for the Huawei PC Store Growth Agent.

It has two compatible workspaces:

- Customer Deal Assistant: calls `POST /api/v1/customer/assist` to turn a store conversation into customer insight, evidence-separated guidance, talk tracks, objection responses, and staff-reviewed follow-up drafts.
- Marketing Content Workbench: preserves the original `POST /api/v1/generate` workflow for scenario-based marketing content.

## Run locally

From the repository root, start the API service first:

```powershell
node scripts\start-api.cjs
```

Then start the web app:

```powershell
cd apps\web
npm run dev
```

Open `http://localhost:5173`. The Vite proxy forwards `/api` requests to port `3000`.

The frontend never stores or reads ima credentials. It only calls the project API, and it surfaces retrieval-limit warnings as an explicit staff-review state. See [frontend-interaction-spec.md](../../docs/frontend-interaction-spec.md) and [接口约束.md](../../接口约束.md) for the full interaction and API contracts.
