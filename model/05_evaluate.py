import json
from pathlib import Path

STATS_JSON = Path(__file__).parent.parent / "data" / "l3_stats.json"
DRUGS_JSON = Path(__file__).parent.parent / "data" / "drugs.json"

if __name__ == "__main__":
    print("=== L3 Stats Evaluation ===\n")

    with open(STATS_JSON) as f:
        stats = json.load(f)

    with open(DRUGS_JSON) as f:
        drugs_data = json.load(f)

    print(f"Version: {stats['version']}")
    print(f"Source: {stats['source']}")
    print(f"\nPer active ingredient:")
    for gname, s in stats["by_generic"].items():
        d = s["dose_mg_per_kg"]
        print(f"  {gname:15s} n={d['n']:4d}  mean={d['mean']:6.2f}  "
              f"p50={d['p50']:6.2f}  p5–p95: {d['p5']:.2f}–{d['p95']:.2f} mg/kg")

    print(f"\nPer drug_id:")
    for did, s in stats["by_drug"].items():
        d = s["dose_mg_per_kg"]
        drug_name = next((x["name"] for x in drugs_data["drugs"] if str(x["id"]) == did), f"drug_{did}")
        print(f"  {did:>3s} {drug_name[:35]:35s} n={d['n']:4d}  "
              f"p50={d['p50']:6.2f}  [{d['p5']:.2f}–{d['p95']:.2f}]")

    print("\nDone.")
