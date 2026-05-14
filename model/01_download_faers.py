import json, csv, time, sys, os
from pathlib import Path
from urllib.parse import quote
from collections import defaultdict

import requests

DRUGS_JSON = Path(__file__).parent.parent / "data" / "drugs.json"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "training"
os.makedirs(OUTPUT_DIR, exist_ok=True)

FAERS_BASE = "https://api.fda.gov/drug/event.json"
MAX_RESULTS = 10000
PAGE_SIZE = 500

with open(DRUGS_JSON) as f:
    drugs_data = json.load(f)

DRUG_MAP = {}
for drug in drugs_data["drugs"]:
    name_lower = drug["name"].lower()
    atx = drug.get("grls", {}).get("atx", "")
    inn = drug.get("grls", {}).get("inn", "").lower()

    generic_names = []
    if "парацетамол" in name_lower or "цефекон" in name_lower:
        generic_names = ["ACETAMINOPHEN", "PARACETAMOL"]
    elif "ибупрофен" in name_lower:
        generic_names = ["IBUPROFEN"]
    elif "амоксиклав" in name_lower or "амоксициллин" in name_lower:
        generic_names = ["AMOXICILLIN"]
    elif "фенистил" in name_lower or "диметинден" in name_lower:
        generic_names = ["DIMETINDENE"]
    elif "зиртек" in name_lower or "цетиризин" in name_lower:
        generic_names = ["CETIRIZINE"]
    elif "амброксол" in name_lower:
        generic_names = ["AMBROXOL"]
    elif "ацц" in name_lower or "ацетилцистеин" in name_lower:
        generic_names = ["ACETYLCYSTEINE"]
    elif "аквадетрим" in name_lower or "колекальциферол" in name_lower:
        generic_names = ["COLECALCIFEROL"]
    elif "мальтофер" in name_lower or "железа" in name_lower:
        generic_names = ["FERRIC HYDROXIDE POLYMALTOSE COMPLEX"]
    else:
        generic_names = [inn.upper()] if inn else []

    DRUG_MAP[drug["id"]] = {
        "name": drug["name"],
        "generic_names": generic_names,
        "drug_id": drug["id"]
    }

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "pediatric-dose-pwa/1.0 (https://github.com/TestingInPractice/pediatric-dose-pwa)"})

def fetch_page(url):
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()

def p(*args):
    print(*args, flush=True)

def download_generic(generic_name):
    rows = []
    skip = 0
    total = None
    while total is None or skip < min(total, MAX_RESULTS):
        search = f'patient.drug.openfda.generic_name:{quote(generic_name)}'
        url = f"{FAERS_BASE}?search={search}&limit={PAGE_SIZE}&skip={skip}"
        try:
            data = fetch_page(url)
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                p(f"  No data for {generic_name}")
                return []
            p(f"  HTTP {e.response.status_code} for {generic_name}")
            return []

        results = data.get("results", [])
        total = data.get("meta", {}).get("results", {}).get("total", 0)
        p(f"  {generic_name}: got {len(results)} records (total: {total}, skip: {skip})")

        for report in results:
            patient = report.get("patient", {})
            for drug_entry in patient.get("drug", []):
                of = drug_entry.get("openfda", {})
                gns = [g.lower() for g in of.get("generic_name", [])]
                if generic_name.lower() not in gns:
                    continue

                age = patient.get("patientonsetage")
                age_unit = patient.get("patientonsetageunit")
                weight = patient.get("patientweight")
                sex = patient.get("patientsex")
                dose_num = drug_entry.get("drugstructuredosagenumb")
                dose_unit = drug_entry.get("drugstructuredosageunit")
                dose_text = drug_entry.get("drugdosagetext")
                indication = drug_entry.get("drugindication")
                route = drug_entry.get("drugadministrationroute")
                dosage_form = drug_entry.get("drugdosageform")
                reactions = [r.get("reactionmeddrapt", "") for r in patient.get("reaction", [])]

                rows.append({
                    "generic_name": generic_name,
                    "age": age,
                    "age_unit": age_unit,
                    "weight_kg": weight,
                    "sex": sex,
                    "dose_num": dose_num,
                    "dose_unit": dose_unit,
                    "dose_text": dose_text,
                    "indication": indication or "",
                    "route": route or "",
                    "dosage_form": dosage_form or "",
                    "reactions": "|".join(reactions[:5])
                })
        skip += PAGE_SIZE
        time.sleep(0.3)
    return rows

FIELD_NAMES = ["drug_id", "drug_name", "generic_name", "age", "age_unit",
               "weight_kg", "sex", "dose_num", "dose_unit", "dose_text",
               "indication", "route", "dosage_form", "reactions"]

if __name__ == "__main__":
    p("=== FAERS Downloader ===")

    unique_generic = set()
    for info in DRUG_MAP.values():
        unique_generic.update(info["generic_names"])
    unique_generic.discard("")
    p(f"Unique generic names to download: {unique_generic}")

    cache = {}
    for g in sorted(unique_generic):
        # Skip if all drug files for this generic already exist
        pending_drugs = [
            did for did, info in DRUG_MAP.items()
            if g in info["generic_names"]
            and not (OUTPUT_DIR / f"drug_{did:02d}_{info['name'].split(' ')[0].lower().replace('(', '').replace(')', '')}.csv").exists()
        ]
        if not pending_drugs:
            p(f"Skipping {g} — all drug files already exist")
            continue

        p(f"\nDownloading: {g}")
        rows = download_generic(g)
        cache[g] = rows
        p(f"  Cached {len(rows)} rows for {g}")

        # Write per-drug files incrementally after each generic download
        for drug_id in pending_drugs:
            info = DRUG_MAP[drug_id]
            slug = info["name"].split(" ")[0].lower().replace("(", "").replace(")", "")
            out_path = OUTPUT_DIR / f"drug_{drug_id:02d}_{slug}.csv"
            drug_rows = [{**r, "drug_id": drug_id, "drug_name": info["name"]} for r in rows]
            if drug_rows:
                with open(out_path, "w", newline="") as f:
                    writer = csv.DictWriter(f, fieldnames=FIELD_NAMES)
                    writer.writeheader()
                    writer.writerows(drug_rows)
                p(f"  [{drug_id}] {info['name']}: {len(drug_rows)} rows -> {out_path.name}")
            else:
                p(f"  [{drug_id}] {info['name']}: no data")

    p("\nDone.")
