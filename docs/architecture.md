# Architecture

## Local system outline

```text
CSV simulator ──HTTP──> Express API ──HTTP──> ML scoring API
                            │                     │
                            ├── MongoDB           └── model + metrics
                            ├── Socket.IO ──> React dashboard
                            └── agents adapter ──HTTP──> investigation stub
```

The React application and Python services run locally. Docker Compose is used only for MongoDB. The Express API owns transaction persistence, case state, authentication, and audit records. The ML service scores transactions. Borderline and high risk transactions become cases; the investigation integration is a mock contract until the later agents and RAG phase.

## Request lifecycle

1. The simulator posts a transaction to the backend ingest endpoint.
2. The backend records receipt time, requests a score from the ML service, and stores the score and timing.
3. Low-risk transactions are automatically approved. Other risk tiers create a case and are sent to the investigation adapter.
4. The backend publishes transaction updates over Socket.IO. Analysts review cases through the frontend.
5. Case decisions are recorded in an audit log. High-value cases require analyst approval before action.

## Service boundaries

- **Frontend:** login, live feed and summary metrics, case review, model metrics.
- **Backend:** API validation, JWT authentication, persistence, orchestration, audit trail, and live events.
- **ML service:** feature engineering, time-aware model training, risk scoring, and model metadata.
- **Agents service:** currently a documented mock investigation endpoint. Future agent and retrieval work is intentionally out of scope for the initial build.
- **Simulator:** reads a local CSV and submits rows at a configurable rate.

The ML feature builder derives distance, transaction time parts, age at transaction time, amount and merchant category, city population, and prior customer amount/count aggregates. Training is chronological and computes customer aggregates from earlier transactions only. During online ingest, the backend reads prior amounts for the same customer from MongoDB and sends the resulting average and count with the scoring request.

## Local data and secrets

Transaction datasets and generated model artifacts stay local and are gitignored. Configure credentials and thresholds through `.env`; never put secrets in source files.
