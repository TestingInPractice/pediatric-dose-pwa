import csv, re, json, sys
from pathlib import Path

TRAINING_DIR = Path(__file__).parent.parent / "data" / "training"
OUTPUT_FILE = TRAINING_DIR / "training_dataset.csv"
UNITS_MG = {"003", "mg", "mg/ml", "milligram", "milligrams", "mg/ml"}
UNITS_G = {"004", "g", "gram", "grams"}
UNITS_MCG = {"005", "mcg", "microgram", "micrograms"}
UNITS_ML = {"ml", "milliliter", "milliliters"}
UNITS_ME = {"meq", "iu", "unit", "units"}

AGE_UNIT_YEARS = {"801"}
AGE_UNIT_MONTHS = {"802"}
AGE_UNIT_DAYS = {"804"}
AGE_UNIT_HOURS = {"803"}
AGE_UNIT_WEEKS = {"805"}

DOSE_RE = re.compile(r'''
    ([\d]+(?:\.[\d]+)?) \s*
    (mg|milligram|milligrams|g|gram|grams|mcg|microgram|micrograms
     |ml|milliliter|milliliters|meq|iu|unit|units|mcg/kg|mg/kg
     |mg/dl|mcg/ml|mg/ml|gram/ml|g/ml)
    ''', re.IGNORECASE | re.VERBOSE)

SIMPLE_DOSE_RE = re.compile(r'''
    \b(\d{1,4}(?:\.\d{1,3})?)\s*(?:mg|milligram|milligrams)?\b
    ''', re.IGNORECASE | re.VERBOSE)

FREQ_RE = re.compile(r'(Q[DWH]|BID|TID|QID|PRN|QD|BID|TID|QID|Q[46]H|Q8H|Q12H|DAILY|ONCE|EOD|QOD)', re.IGNORECASE)

AGE_FIELD_RE = re.compile(r'(\d+)\s*(year|month|week|day|hour|yr|mo|wk|dy)', re.IGNORECASE)

def parse_age(age_val, age_unit):
    if not age_val:
        return None
    age_val = float(age_val)
    if age_unit in AGE_UNIT_YEARS:
        return age_val * 12
    elif age_unit in AGE_UNIT_MONTHS:
        return age_val
    elif age_unit in AGE_UNIT_WEEKS:
        return age_val * 0.23
    elif age_unit in AGE_UNIT_DAYS:
        return age_val / 30.44
    elif age_unit in AGE_UNIT_HOURS:
        return age_val / (30.44 * 24)
    return None

def parse_dose_from_text(dose_text):
    if not dose_text:
        return None, None
    dose_text = dose_text.strip()

    # Try structured dose pattern first (number + unit)
    matches = DOSE_RE.findall(dose_text)
    total_mg = 0
    found_dose = False
    for val_str, unit in matches:
        val = float(val_str)
        unit_lower = unit.lower()
        if unit_lower in ("mg/kg", "mcg/kg"):
            continue
        found_dose = True
        if unit_lower in UNITS_MG or unit_lower in UNITS_ML or "mg" in unit_lower or unit_lower == "iu":
            total_mg += val
        elif unit_lower in UNITS_G:
            total_mg += val * 1000
        elif unit_lower in UNITS_MCG:
            total_mg += val / 1000
    if found_dose and total_mg > 0:
        return total_mg, dose_text

    # Fallback: try simple number extraction for common patterns
    # e.g. "1 TABLET", "2 CAPSULE", "10 MG" (where MG is separate)
    simple_matches = SIMPLE_DOSE_RE.findall(dose_text)
    if simple_matches:
        vals = [float(m) for m in simple_matches]
        if any(10 <= v <= 2000 for v in vals):
            return max(vals), dose_text
        if len(vals) == 1 and 0.1 <= vals[0] <= 5000:
            return vals[0], dose_text

    return None, dose_text

def parse_dose_structured(dose_num, dose_unit):
    if not dose_num or not dose_unit:
        return None, None
    dose_num = float(dose_num)
    if dose_unit in UNITS_MG:
        return dose_num, f"{dose_num} MG"
    elif dose_unit in UNITS_G:
        return dose_num * 1000, f"{dose_num * 1000} MG"
    elif dose_unit in UNITS_MCG:
        return dose_num / 1000, f"{dose_num / 1000} MG"
    return None, None

FILTER_MIN_AGE_MONTHS = 0
FILTER_MAX_AGE_MONTHS = 18 * 12

if __name__ == "__main__":
    print("=== FAERS Parser & Filter ===")
    csv_files = sorted(TRAINING_DIR.glob("drug_*.csv"))
    print(f"Found {len(csv_files)} CSV files")
    all_rows = []
    stats = {"total_raw": 0, "has_age": 0, "has_weight": 0, "has_dose": 0,
             "pediatric": 0, "valid_dose": 0, "valid_weight": 0, "final": 0}

    for csv_file in csv_files:
        print(f"\nProcessing: {csv_file.name}")
        with open(csv_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                stats["total_raw"] += 1
                age_val = row.get("age")
                age_unit = row.get("age_unit")
                age_months = parse_age(age_val, age_unit)
                if age_months is None:
                    continue
                stats["has_age"] += 1
                if not (FILTER_MIN_AGE_MONTHS <= age_months <= FILTER_MAX_AGE_MONTHS):
                    continue
                stats["pediatric"] += 1
                weight_str = row.get("weight_kg", "").strip()
                if not weight_str:
                    continue
                try:
                    weight_kg = float(weight_str)
                except ValueError:
                    continue
                if weight_kg < 1 or weight_kg > 200:
                    continue
                stats["has_weight"] += 1

                dose_mg = None
                dose_text = ""
                dose_num = row.get("dose_num", "").strip()
                dose_unit = row.get("dose_unit", "").strip()
                if dose_num and dose_unit:
                    dose_mg, dose_text = parse_dose_structured(dose_num, dose_unit)

                if dose_mg is None:
                    raw_text = row.get("dose_text", "")
                    if raw_text and raw_text.upper() not in ("UNK", "UNKNOWN", ""):
                        dose_mg, dose_text = parse_dose_from_text(raw_text)

                if dose_mg is None or dose_mg <= 0:
                    continue
                stats["has_dose"] += 1

                dose_per_kg = dose_mg / weight_kg
                if dose_per_kg > 100 or dose_per_kg <= 0:
                    continue
                stats["valid_dose"] += 1

                sex = row.get("sex", "")
                indication = row.get("indication", "").strip()
                has_fever = 1 if any(kw in indication.upper()
                    for kw in ["FEVER", "PYREXIA", "FEBRILE", "HOT", "TEMPERATURE"]) else 0

                drug_name = row["drug_name"]
                base_name = drug_name.split(" ")[0].split("(")[0].strip()
                if base_name in ("Парацетамол", "Цефекон"):
                    generic_name = "paracetamol"
                elif base_name == "Ибупрофен":
                    generic_name = "ibuprofen"
                elif base_name == "Амоксиклав":
                    generic_name = "amoxicillin"
                elif base_name == "Зиртек":
                    generic_name = "cetirizine"
                elif base_name == "АЦЦ":
                    generic_name = "acetylcysteine"
                else:
                    generic_name = base_name.lower()

                all_rows.append({
                    "drug_id": row["drug_id"],
                    "drug_name": row["drug_name"],
                    "generic_name": generic_name,
                    "age_months": round(age_months, 2),
                    "weight_kg": round(weight_kg, 1),
                    "sex": int(sex) if sex.isdigit() else -1,
                    "dose_mg": round(dose_mg, 2),
                    "dose_per_kg": round(dose_per_kg, 2),
                    "indication": indication[:100],
                    "indication_fever": has_fever,
                    "route": row.get("route", ""),
                    "dose_text": dose_text,
                    "reactions": row.get("reactions", "")[:200],
                })
                stats["valid_weight"] += 1

    stats["final"] = len(all_rows)
    print(f"\n=== Stats ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    if all_rows:
        fieldnames = ["drug_id", "drug_name", "generic_name", "age_months", "weight_kg", "sex",
                      "dose_mg", "dose_per_kg", "indication", "indication_fever",
                      "route", "dose_text", "reactions"]
        with open(OUTPUT_FILE, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)
        print(f"\nWrote {len(all_rows)} rows to {OUTPUT_FILE.name}")

        by_drug = {}
        for r in all_rows:
            by_drug.setdefault(r["drug_name"], 0)
            by_drug[r["drug_name"]] += 1
        print("\nPer drug:")
        for name, cnt in sorted(by_drug.items(), key=lambda x: -x[1]):
            print(f"  {name}: {cnt}")
    else:
        print("No valid rows to write.")
