# Repository instructions

## Adding a recipe from a URL

When the user asks to add a recipe, follow this workflow:

1. Read `HOMEALACARTE_JSON_AGENT_GUIDE.md` completely and follow its schema and validation rules.
2. Open the supplied source URL and extract the current title, yield, ingredient quantities, method, cuisine or origin, and any relevant alternatives or notes. Do not rely on the page title or memory alone.
3. Search every `data/items*.json` and `data/dishes*.json` file before choosing keys. Reuse an existing item only when it represents the same ingredient; never create duplicate keys or duplicate ingredient records.
4. Keep recipe additions as incremental, date-stamped import patches:
   - add or append the dish in `data/dishes_YYYY_MM_DD.json`;
   - add or append only genuinely new ingredients in `data/items_YYYY_MM_DD_recipes.json`;
   - do not copy existing items or dishes into those patches.
5. Use stable lowercase `snake_case` keys, reliable French and English display text, a valid ISO 3166-1 alpha-2 `origin_country` when clear, the source URL, the source yield, and the correct `auto_menu_main` value.
6. Preserve each original amount in `source_quantity`. Convert it to a positive supported component quantity and unit for calculations. Explain all conversions, estimates, substitutions, optional-ingredient choices, and omissions in bilingual `source_notes`; never present an estimate as an exact source quantity.
7. For each new food item, provide the complete item schema, registered structural category, allergens, gram conversion, purchase metadata, and nutrition from the local CIQUAL dataset or another authoritative source. Identify the source record or code. Prefer conservative documented values over guesses.
8. Include a concise bilingual method summary in `source_notes`; do not reproduce long copyrighted instructions.
9. Validate before finishing:
   - parse every changed JSON file with `jq empty`;
   - confirm new keys are unique and every component resolves across all `data/items*.json` files;
   - run `target/debug/personal-data data /tmp/homealacarte-recipe-validation.json` (or the equivalent freshly built binary) and require a successful full-data validation;
   - inspect both the root worktree and the nested `data` repository status without altering unrelated user changes.

