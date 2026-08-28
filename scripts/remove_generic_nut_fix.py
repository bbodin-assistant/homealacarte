#!/usr/bin/env python3
from pathlib import Path

legacy = "tree" + "_nut"

path = Path("tests/dishes_feature.mjs")
text = path.read_text(encoding="utf-8")
text = text.replace(f'allergens: ["{legacy}"]', 'allergens: ["walnut"]')
path.write_text(text, encoding="utf-8")

path = Path("HOMEALACARTE_JSON_AGENT_GUIDE.md")
text = path.read_text(encoding="utf-8")
old = f'''- `allergens` contains the canonical allergen codes documented under food rules. Use the precise
  tree-nut code when it is known; reserve `{legacy}` for a genuinely generic or unspecified
  tree-nut declaration rather than adding it alongside a precise code.'''
new = '''- `allergens` contains the canonical allergen codes documented under food rules. Nut allergens
  must use explicit named nut codes; generic nut-group codes are not supported.'''
if old not in text:
    raise SystemExit("ingredient allergen guide paragraph not found")
text = text.replace(old, new, 1)
text = text.replace(f', `{legacy}`', '', 1)
old = f'''  Use the individual tree-nut code when it is known. Reserve `{legacy}` for a genuinely generic
  or unspecified tree-nut declaration; broad `{legacy}` allergy profiles already match each
  individual tree-nut code.'''
new = '''  Nut allergens must use one or more explicit named nut codes. Generic nut-group allergen codes
  are not supported.'''
if old not in text:
    raise SystemExit("food-rule allergen guide paragraph not found")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")

Path("scripts/remove_generic_nut_fix.py").unlink()
