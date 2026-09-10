# -*- coding: utf-8 -*-
import json
import os
import re
from pathlib import Path

from pypdf import PdfReader

DOWNLOADS = Path(r"c:\Users\benja\Downloads")
OUT_DIR = Path(r"C:\Users\benja\Projects\travelba\tmp_mtrip_extract")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Exact filenames requested by user (normalize accents later via contains)
KEYWORDS = [
    "BCHIRI EP BENAMARASHIRLEYNM 12AUG2026",
    "BENAMARASAUL 12AUG2026 DAVID",
    "BENAMARAYANIK 03AUG2026 PANAMA CITY BOCAS",
    "Waldorf Astoria Panama, 14 August 2026",
    "Hotel La Compa",  # Compañia
    "02 August 2026 - 03 August 2026",
    "BENAMARAYANIK 12AUG2026 DAVID",
    "BENAMARAELLY 03AUG2026",
    "BENAMARAELLY 12AUG2026",
    "BCHIRI EP BENAMARASHIRLEY 03AUG2026",
]

# Also include complementary Panama Benamara tickets for a complete trip
EXTRA = [
    "02AUG2026 PARIS PANAMA",
    "BENAMARABLUMA",
    "BENAMARASAUL 03AUG2026",
    "BCHIRI EP BENAMARASHIRLEY 02AUG2026",
    "Panama-Bluma",
    "Panama-Elly",
    "Panama-Saul",
    "Panama-Shirley",
]


def normalize(s: str) -> str:
    return (
        s.replace("\u0327", "")
        .replace("̧", "")
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )


def want(name: str) -> bool:
    n = normalize(name)
    if "benamara" in n or "bchiri" in n:
        if "aug2026" in n or "panama" in n or "paris" in n or "david" in n or "bocas" in n:
            return True
    if "waldorf astoria panama" in n and "14 august 2026" in n:
        return True
    if "hotel la compa" in n and "02 august 2026" in n:
        return True
    if "hotel la compa" in n and "2 aug 2026" in n:
        return True
    return False


selected = []
for p in DOWNLOADS.iterdir():
    if p.suffix.lower() == ".pdf" and want(p.name):
        selected.append(p)

selected = sorted(set(selected), key=lambda p: p.name.lower())
manifest = []

for i, path in enumerate(selected):
    try:
        reader = PdfReader(str(path))
        texts = []
        for page in reader.pages:
            texts.append(page.extract_text() or "")
        text = "\n".join(texts)
    except Exception as e:
        text = f"ERROR: {e}"
    out_name = f"{i:02d}_{normalize(path.stem)[:80].replace(' ', '_')}.txt"
    out_path = OUT_DIR / out_name
    out_path.write_text(text, encoding="utf-8")
    manifest.append({"file": str(path), "out": str(out_path), "chars": len(text)})

(OUT_DIR / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(f"extracted {len(manifest)} files")
