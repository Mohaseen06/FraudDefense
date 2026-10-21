"""Replay a Sparkov CSV into the Fraud Defense ingest API using only stdlib."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def post_json(url: str, payload: dict, token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get_token(base_url: str, email: str, password: str) -> str:
    response = post_json(f"{base_url}/api/auth/login", {"email": email, "password": password})
    return response["token"]


def replay(args: argparse.Namespace) -> int:
    rate = args.rate * args.speed
    if rate <= 0:
        raise ValueError("rate and speed must be greater than zero")
    token = args.token or os.getenv("FRAUD_DEFENSE_TOKEN")
    email = args.email or os.getenv("DEMO_USER_EMAIL")
    password = args.password or os.getenv("DEMO_USER_PASSWORD")
    if not token:
        if not email or not password:
            raise ValueError("Pass --token or set DEMO_USER_EMAIL and DEMO_USER_PASSWORD")
        token = get_token(args.backend, email, password)

    interval = 1 / rate
    sent = 0
    fraud_rows = 0
    started = time.monotonic()
    with args.input.open("r", newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames:
            raise ValueError(f"CSV has no header: {args.input}")
        for row in reader:
            row = {key: value for key, value in row.items() if key and not key.startswith("Unnamed:")}
            fraud = str(row.get("is_fraud", "0")).strip() in {"1", "true", "True"}
            if fraud:
                fraud_rows += 1
            repeats = args.fraud_oversample if fraud else 1
            for _ in range(repeats):
                if args.limit and sent >= args.limit:
                    break
                delay = started + sent * interval - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                try:
                    result = post_json(f"{args.backend}/api/transactions/ingest", row, token)
                    transaction = result.get("transaction", {})
                    print(f"sent={sent + 1} tier={transaction.get('riskTier', '?')} score={transaction.get('riskScore', '?')} status={transaction.get('status', '?')}")
                except (HTTPError, URLError, TimeoutError) as error:
                    detail = error.read().decode("utf-8", errors="replace") if isinstance(error, HTTPError) else str(error)
                    print(f"ingest failed at row {sent + 1}: {detail}", file=sys.stderr)
                    return 1
                sent += 1
            if args.limit and sent >= args.limit:
                break
    print(f"Finished: sent {sent} rows; source fraud rows encountered {fraud_rows}; effective rate {rate:g}/sec")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "fraudTest.csv")
    parser.add_argument("--backend", default=os.getenv("BACKEND_URL", "http://127.0.0.1:4000"))
    parser.add_argument("--rate", type=float, default=2, help="Transactions per second before speed multiplier")
    parser.add_argument("--speed", type=float, default=1, help="Multiply replay rate (for example, 5 means 5x)")
    parser.add_argument("--fraud-oversample", type=int, default=1, help="Replay each fraud row this many times")
    parser.add_argument("--limit", type=int, default=0, help="Stop after N requests; 0 means no limit")
    parser.add_argument("--token", help="JWT; alternatively provide demo analyst credentials")
    parser.add_argument("--email", help="Analyst login email")
    parser.add_argument("--password", help="Analyst login password")
    args = parser.parse_args()
    if args.fraud_oversample < 1:
        parser.error("--fraud-oversample must be at least 1")
    if not args.input.exists() and args.input.name == "fraudTest.csv":
        synthetic = args.input.with_name("syntheticTest.csv")
        if synthetic.exists():
            args.input = synthetic
        else:
            parser.error(f"CSV not found: {args.input}; generate one with ml-service/training/generate_synthetic_data.py")
    try:
        raise SystemExit(replay(args))
    except (ValueError, KeyError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
