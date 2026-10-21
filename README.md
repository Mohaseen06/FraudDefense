# Fraud Defense

Fraud Defense is a local development project for streaming card transaction scoring and analyst case review. The repository is organized as a JavaScript frontend and backend with Python scoring and investigation services. MongoDB is the only service started with Docker; the applications run locally.

## Stage 1: repository scaffold

This stage sets up the project layout and local configuration. The service directories are placeholders until their implementation stages.

### Prerequisites

- Node.js and npm
- Python 3.11 or newer
- Docker Compose (for local MongoDB)

### Start local MongoDB

```sh
docker compose up -d
```

On Windows, install Docker Desktop with its WSL 2 backend enabled. If WSL is missing, open PowerShell as Administrator and run `wsl --install --no-distribution`, then restart Windows when prompted. Start Docker Desktop after restart before running Compose.

Copy `.env.example` to `.env` and set a unique `JWT_SECRET` before starting the backend. Do not commit `.env` or real transaction data. Application run commands will be added as each service is implemented.

### Repository layout

```text
frontend/       React + Vite + Tailwind dashboard
backend/        Express API, MongoDB models, authentication, Socket.IO
ml-service/     Python feature engineering, model training, scoring API
agents-service/ Investigation API stub; future agents and RAG integration
simulator/      CSV transaction stream simulator
data/           Local datasets (not committed)
docs/           Architecture and API contracts
```

## Development stages

1. Repository scaffold, MongoDB compose file, and documentation
2. ML training pipeline and scoring service
3. Backend API, persistence, authentication, and live events
4. CSV simulator
5. Frontend dashboard and case workflows
6. End-to-end verification

## ML service (Stage 2)

From the repository root, create and activate a virtual environment, then install the ML service requirements:

```sh
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r ml-service/requirements.txt
python ml-service/training/train.py
uvicorn app.main:app --app-dir ml-service --reload --port 8000
```

Training reads `data/fraudTrain.csv`, inspects the available headers, and uses a chronological 80/20 split. If that file is absent, it writes a small synthetic training CSV under `data/`. Model and metrics artifacts are written under `ml-service/artifacts/` and stay out of git. Run the feature and endpoint contract checks from the repository root with `python -m unittest discover -s ml-service/tests`.

For the simulator's local holdout, the supplied Sparkov dataset is `data/fraudTest.csv`.

To evaluate the saved model on that file, first start the ML API on port 8000, then run `python ml-service/training/evaluate_holdout.py` from the repository root. Thresholds are read from the root `.env` (defaulting to `0.30` / `0.80`); validation is used for threshold review before the holdout is scored. Results and the `/score` latency sample are written to `ml-service/artifacts/holdout_metrics.json` and shown on the Model page. See [docs/ml-evaluation.md](docs/ml-evaluation.md) for the recorded evaluation.

## Backend (Stage 3)

With MongoDB running, copy `.env.example` to `.env`, set a private `JWT_SECRET` and change the demo password, then install and start the API:

```sh
cd backend
npm install
npm run dev
```

In development the server seeds one analyst using `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` from `.env`. All `/api` endpoints except health and login require the returned JWT.

## Simulator (Stage 4)

From the repository root, after the backend and model are running:

```sh
python simulator/replay.py --rate 2 --speed 1 --fraud-oversample 4 --limit 200 --email analyst@example.local --password 'your-demo-password'
```

The simulator uses Python's standard library and posts each row to the authenticated ingest endpoint. Increase `--speed` to replay faster; `--fraud-oversample` repeats each labeled fraud row for a more visible demo.

## Frontend (Stage 5)

In another terminal, install the frontend packages and start Vite:

```sh
cd frontend
npm install
npm run dev
```

The Vite app runs at `http://127.0.0.1:5173`. Set `VITE_API_URL` in `frontend/.env` if the backend uses a different address. The dashboard needs a trained ML model and the backend, while case investigation trace remains a placeholder supplied by the stub contract.

## Investigation stub

The stub runs locally, independently of the backend:

```sh
python -m venv .venv-agents
# Activate the virtual environment, then:
pip install -r agents-service/requirements.txt
uvicorn app.main:app --app-dir agents-service --reload --port 8001
```

It returns a labelled mock `verify` response in the documented contract. It does not call an LLM or retrieve policies.

## End-to-end verification (Stage 6)

Once MongoDB, the trained ML service, backend, and investigation stub are running:

```sh
cd backend
npm run test:e2e
```

This smoke flow signs in, ingests one synthetic transaction, checks the saved score and paginated feed, then checks case detail when the transaction is flagged and reads stats. It leaves the test transaction and its audit event in the local database.

## TODO: agents and RAG phase

- Replace the investigation stub with a LangGraph supervisor and specialist agents.
- Add retrieval over the fraud policy documents in `agents-service/policies/`.
- Select and configure an LLM provider (`github`, `gemini`, or local `ollama`).
- Add evaluation and analyst feedback before enabling automated actions.

Until that phase, the investigation endpoint returns an explicitly labelled mock response. No LLM, embedding, or vector store is part of this scaffold.

## Dataset

Place manually downloaded CSV files under `data/` (for example, `fraudTrain.csv` and `fraudTest.csv`). The ML stage will inspect actual headers and provide a synthetic-data generator for development when the dataset is unavailable.

See [docs/architecture.md](docs/architecture.md) and [docs/api-contracts.md](docs/api-contracts.md).
