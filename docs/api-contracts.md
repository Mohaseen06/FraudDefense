# API contracts

This document defines the initial service boundaries. Endpoint implementation is added in the corresponding build stage.

## Backend API

The backend will expose:

- `POST /api/auth/login` — authenticate an analyst and return a JWT.
- `POST /api/transactions/ingest` — score and persist a transaction, create a case when needed, and publish the update.
- `GET /api/transactions` — return a paginated transaction list.
- `GET /api/cases` — list cases, with optional status filtering.
- `GET /api/cases/:id` — return case details.
- `POST /api/cases/:id/approve` and `POST /api/cases/:id/reject` — record analyst decisions and audit events.
- `GET /api/stats` — return dashboard counts, fraud rate, and average scoring latency.
- `GET /api/model-info` — authenticated proxy to the ML service's model metadata.

## ML service

- `GET /health` — report service health.
- `POST /score` — accept transaction JSON and return `risk_score` (0–1), `risk_tier`, and top contributing features.
- `GET /model-info` — return the active model's evaluation metrics and metadata.

Risk tiers are `low`, `borderline`, and `high`, using configurable `LOW_MAX` and `HIGH_MIN` thresholds.

## Agents service (mock contract)

`POST /investigate` accepts:

```json
{
  "case_id": "case identifier",
  "transaction": {},
  "customer_history_summary": "summary or empty string",
  "ml_score": 0.5,
  "risk_tier": "borderline"
}
```

It returns the following shape. The initial implementation must label the response as mock data in its reasons or trace summary.

```json
{
  "recommendation": "verify",
  "confidence": 0.5,
  "reasons": ["Mock response: no agents or retrieval are configured."],
  "citations": [],
  "agent_trace": [
    {
      "agent": "mock-investigator",
      "action": "return_mock_recommendation",
      "summary": "Mock response; no investigation was performed.",
      "timestamp": "ISO-8601 timestamp"
    }
  ]
}
```

Recommendations are `allow`, `verify`, or `block`; confidence is between 0 and 1. Citations contain `{ "source": "...", "section": "..." }`. Trace entries contain `{ "agent": "...", "action": "...", "summary": "...", "timestamp": "..." }`.

## Live events

The backend will publish transaction and case updates through Socket.IO. Event names and payloads will be documented alongside their implementation.

The initial Socket.IO events are `transaction:new` and `case:updated`. Clients authenticate their socket handshake with `{ auth: { token: "<JWT>" } }`.
