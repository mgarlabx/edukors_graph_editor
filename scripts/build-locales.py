#!/usr/bin/env python3
"""Writes src/i18n/locales/{pt,en,es}.json from scripts/strings_table.py."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from strings_table import S
for i, lang in enumerate(["pt", "en", "es"]):
    out = {k: v[i] for k, v in sorted(S.items())}
    with open(os.path.join(HERE, "..", "src", "i18n", "locales", f"{lang}.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
print(f"{len(S)} keys x 3 languages")
