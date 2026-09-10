# -*- coding: utf-8 -*-
import json
import re
from pathlib import Path

OUT = Path(r"C:\Users\benja\Projects\travelba\tmp_mtrip_extract")
parsed = []

for path in sorted(OUT.glob("*.txt")):
    if path.name.startswith("14_") or path.name.startswith("15_") or path.name.startswith("16_") or path.name.startswith("17_") or path.name.startswith("18_"):
        # skip large panama dossier binaries / huge files for now
        continue
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        continue
    if "ERROR" in text[:20]:
        continue

    entry = {"file": path.name}

    # Passenger
    m = re.search(r"Passager.*?-\s*([^\n\d]+?)\s+(\d{3}-\d+)", text, re.S)
    if m:
        entry["passenger"] = re.sub(r"\s+", " ", m.group(1)).strip(" -")
        entry["ticket"] = m.group(2)

    m = re.search(r"Referencedudossier([A-Z0-9]+)", text)
    if m:
        entry["dossier"] = m.group(1)

    m = re.search(r"Référence du dossier compagnie\s+([A-Z0-9]+)/([A-Z0-9]+)", text)
    if m:
        entry["airline_code"] = m.group(1)
        entry["pnr"] = m.group(2)

    # Flights - collect date + flight number lines
    flights = []
    for fm in re.finditer(
        r"((?:Air France|Hahn Air|Copa Airlines)[^\n]*?)\s+(\d{2} August \d{4})\s+(\d{2}:\d{2})\s+([^\n]+?)(?:Terminal\s*:\s*([^\n-]+))?\s*-\s*(?:A[eé]rogare[^\n]*)?\s*D[eé]part\s*\n?\s*(\d{2} August \d{4})?\s*(\d{2}:\d{2})?\s*([^\n]+?)(?:Terminal\s*:\s*([^\n]+))?Arriv",
        text,
        re.I,
    ):
        flights.append({k: v for k, v in enumerate(fm.groups())})

    # Simpler flight extraction
    flight_nums = re.findall(r"(AF|CM|X1)\s+(\d+)", text)
    entry["flight_codes"] = [f"{a}{n}" for a, n in flight_nums]
    dates = re.findall(r"(\d{2} August \d{4})\s+(\d{2}:\d{2})", text)
    entry["datetimes"] = dates
    classe = re.findall(r"(Premium [ÉE]conomique|Economique|Business|First)\s*\(([A-Z])\)", text)
    entry["classes"] = classe
    baggage = re.findall(r"Bagages autoris[eé]s\s+([^\n]+)", text)
    entry["baggage"] = baggage
    airports = re.findall(
        r"(CHARLES-DE-GAULLE|TOCUMEN|MARCOS A\. GELABERT|ISLA COLON|ENRIQUE MALEK|BOCAS|DAVID|PANAMA)",
        text,
        re.I,
    )
    entry["airports_mentions"] = airports

    # Hotels
    if "Booking Reference" in text or "Check in" in text:
        entry["type"] = "hotel"
        m = re.search(r"Booking Reference\s*\n?\s*([A-Z0-9]+)", text)
        if m:
            entry["booking_ref"] = m.group(1)
        m = re.search(r"Check in\s*\n?\s*([^\n]+)", text)
        if m:
            entry["check_in"] = m.group(1).strip()
        m = re.search(r"Check out\s*\n?\s*([^\n]+)", text)
        if m:
            entry["check_out"] = m.group(1).strip()
        m = re.search(r"Booking name\s*\n?\s*([^\n]+)", text)
        if m:
            entry["booking_name"] = m.group(1).strip()
        # room type - line before Adults
        m = re.search(r"Address\s*\n([^\n]+)\n([^\n]+)\nAdults", text)
        if m:
            entry["address"] = m.group(1).strip()
            entry["room"] = m.group(2).strip()
        m = re.search(r"Total\s*\n([^\n]+)", text)
        if m:
            entry["total"] = m.group(1).strip()
        m = re.search(r"^(Hotel[^\n]+|Waldorf[^\n]+)", text, re.M)
        if m:
            entry["hotel_name"] = m.group(1).strip()
        cancel = re.search(r"Cancellation policy\s*\n([^\n]+(?:\n[^\n]+)?)", text)
        if cancel:
            entry["cancellation"] = " ".join(cancel.group(1).split())
    else:
        entry["type"] = "flight"

    parsed.append(entry)

(OUT / "parsed.json").write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"parsed {len(parsed)}")
