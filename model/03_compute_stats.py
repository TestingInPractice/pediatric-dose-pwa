import csv, json
from pathlib import Path
from collections import defaultdict
import statistics

TRAINING_CSV = Path(__file__).parent.parent / "data" / "training" / "training_dataset.csv"
OUTPUT_JSON = Path(__file__).parent.parent / "data" / "l3_stats.json"

def load_data(csv_path):
    rows = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows

def compute_stats(values):
    n = len(values)
    if n == 0:
        return None
    sorted_v = sorted(values)
    return {
        "n": n,
        "mean": round(statistics.mean(values), 3),
        "std": round(statistics.stdev(values), 3) if n > 1 else 0,
        "min": round(sorted_v[0], 3),
        "p5": round(sorted_v[max(0, int(n * 0.05))], 3),
        "p25": round(sorted_v[int(n * 0.25)], 3),
        "p50": round(sorted_v[int(n * 0.50)], 3),
        "p75": round(sorted_v[int(n * 0.75)], 3),
        "p95": round(sorted_v[min(n - 1, int(n * 0.95))], 3),
        "max": round(sorted_v[-1], 3),
    }

if __name__ == "__main__":
    print("=== FAERS Stats Generator (L3) ===")

    data = load_data(TRAINING_CSV)
    print(f"Loaded {len(data)} training rows")

    by_generic = defaultdict(list)
    for r in data:
        by_generic[r["generic_name"]].append(r)

    seen = defaultdict(set)
    unique = defaultdict(list)
    for gname, rows in by_generic.items():
        for r in rows:
            key = (r["age_months"], r["weight_kg"], r["sex"], r["indication_fever"],
                   round(float(r["dose_per_kg"]), 2))
            if key not in seen[gname]:
                seen[gname].add(key)
                unique[gname].append(r)

    per_drug = defaultdict(list)
    for r in data:
        per_drug[int(r["drug_id"])].append(r)

    per_drug_unique = defaultdict(list)
    for did, rows in per_drug.items():
        s = set()
        for r in rows:
            key = (r["age_months"], r["weight_kg"], r["sex"], r["indication_fever"],
                   round(float(r["dose_per_kg"]), 2))
            if key not in s:
                s.add(key)
                per_drug_unique[did].append(r)

    output = {
        "version": "1.0.0",
        "source": "FAERS (openFDA)",
        "by_generic": {},
        "by_drug": {},
    }

    for gname in sorted(by_generic):
        doses = [float(r["dose_per_kg"]) for r in unique[gname]]
        ages = [float(r["age_months"]) for r in unique[gname]]
        weights = [float(r["weight_kg"]) for r in unique[gname]]
        stats = {
            "count": len(unique[gname]),
            "dose_mg_per_kg": {**compute_stats(doses), "_all": [round(d, 3) for d in sorted(doses)]},
            "age_months": compute_stats(ages),
            "weight_kg": compute_stats(weights),
        }
        output["by_generic"][gname] = stats
        label = f"{gname:15s} {stats['count']:5d} rows"
        z50 = stats["dose_mg_per_kg"]["p50"]
        lo = stats["dose_mg_per_kg"]["p5"]
        hi = stats["dose_mg_per_kg"]["p95"]
        print(f"  {label}  p50={z50:.2f}  p5–p95: {lo:.2f}–{hi:.2f} mg/kg")

    for did in sorted(per_drug_unique):
        doses = [float(r["dose_per_kg"]) for r in per_drug_unique[did]]
        name = per_drug_unique[did][0]["drug_name"]
        stats = {
            "count": len(per_drug_unique[did]),
            "dose_mg_per_kg": compute_stats(doses),
        }
        output["by_drug"][str(did)] = stats

    with open(OUTPUT_JSON, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nWritten: {OUTPUT_JSON.name}")

    print("\nDone.")
