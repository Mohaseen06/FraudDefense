"""Create a small deterministic Sparkov-shaped dataset for local development."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

CATEGORIES = ["grocery_pos", "shopping_net", "gas_transport", "misc_net", "food_dining", "health_fitness"]
JOBS = ["teacher", "nurse", "engineer", "accountant", "mechanic", "designer"]


def make_rows(count: int, start: datetime, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    customers = 150
    customer_lat = rng.uniform(27, 47, customers)
    customer_lon = rng.uniform(-123, -70, customers)
    dob_days = rng.integers(20 * 365, 75 * 365, customers)
    rows = []
    for index in range(count):
        customer_id = int(rng.integers(customers))
        when = start + timedelta(seconds=int(index * 86400 * 365 / max(count, 1)))
        amount = float(np.round(rng.lognormal(3.2, 1.0), 2))
        is_fraud = int((amount > 180 and rng.random() < 0.23) or (when.hour < 5 and rng.random() < 0.12) or rng.random() < 0.006)
        lat = float(customer_lat[customer_id])
        lon = float(customer_lon[customer_id])
        merch_lat = lat + float(rng.normal(0, 0.45 if is_fraud else 0.08))
        merch_lon = lon + float(rng.normal(0, 0.45 if is_fraud else 0.08))
        rows.append({
            "trans_date_trans_time": when.strftime("%Y-%m-%d %H:%M:%S"),
            "cc_num": str(4000000000000000 + customer_id),
            "merchant": f"fraud_Merchant {int(rng.integers(80))}",
            "category": str(rng.choice(CATEGORIES)),
            "amt": amount,
            "gender": str(rng.choice(["F", "M"])),
            "city": f"City {customer_id % 40}",
            "state": str(rng.choice(["CA", "NY", "TX", "FL", "NC"])),
            "lat": lat,
            "long": lon,
            "city_pop": int(rng.integers(1000, 500000)),
            "job": str(rng.choice(JOBS)),
            "dob": (datetime(2020, 1, 1) - timedelta(days=int(dob_days[customer_id]))).strftime("%Y-%m-%d"),
            "trans_num": f"synthetic-{seed}-{index:08d}",
            "unix_time": int(when.timestamp()),
            "merch_lat": merch_lat,
            "merch_long": merch_lon,
            "is_fraud": is_fraud,
        })
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[2] / "data")
    parser.add_argument("--train-rows", type=int, default=12000)
    parser.add_argument("--test-rows", type=int, default=3000)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    train = make_rows(args.train_rows, datetime(2019, 1, 1), 21)
    test = make_rows(args.test_rows, datetime(2020, 1, 1), 22)
    train.to_csv(args.output_dir / "syntheticTrain.csv", index=False)
    test.to_csv(args.output_dir / "syntheticTest.csv", index=False)
    print(f"Wrote {len(train):,} training and {len(test):,} test rows to {args.output_dir}")


if __name__ == "__main__":
    main()
