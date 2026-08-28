from pathlib import Path
import subprocess


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    write(path, text.replace(old, new, 1))


replace_once(
    "src/model.rs",
    '''pub const NUT_ALLERGEN_CODES: [&str; 8] = [
    "almond",
    "hazelnut",
    "walnut",
    "cashew_nut",
    "pecan",
    "brazil_nut",
    "pistachio",
    "macadamia",
];

pub const LEGACY_GENERIC_NUT_CODE: &str = concat!("tree", "_nut");

''',
    "",
)

old_loader = '''        let allergens = input
            .allergens
            .into_iter()
            .flat_map(|allergen| {
                let allergen = allergen.trim().to_lowercase();
                if allergen == crate::model::LEGACY_GENERIC_NUT_CODE {
                    crate::model::NUT_ALLERGEN_CODES
                        .iter()
                        .map(|code| (*code).to_string())
                        .collect::<Vec<_>>()
                } else {
                    vec![allergen]
                }
            })
            .filter(|allergen| !allergen.is_empty() && seen_allergens.insert(allergen.clone()))
            .collect::<Vec<_>>();'''
new_loader = '''        let allergens = input
            .allergens
            .into_iter()
            .map(|allergen| allergen.trim().to_lowercase())
            .filter(|allergen| !allergen.is_empty() && seen_allergens.insert(allergen.clone()))
            .collect::<Vec<_>>();'''
replace_once("src/loader/mod.rs", old_loader, new_loader)

old_rule_loader = '''        rule.allergens = rule
            .allergens
            .into_iter()
            .flat_map(|allergen| {
                let allergen = allergen.trim().to_lowercase();
                if allergen == crate::model::LEGACY_GENERIC_NUT_CODE {
                    crate::model::NUT_ALLERGEN_CODES
                        .iter()
                        .map(|code| (*code).to_string())
                        .collect::<Vec<_>>()
                } else {
                    vec![allergen]
                }
            })
            .filter(|allergen| !allergen.is_empty() && allergens.insert(allergen.clone()))
            .collect();'''
new_rule_loader = '''        rule.allergens = rule
            .allergens
            .into_iter()
            .map(|allergen| allergen.trim().to_lowercase())
            .filter(|allergen| !allergen.is_empty() && allergens.insert(allergen.clone()))
            .collect();'''
replace_once("src/loader/menu.rs", old_rule_loader, new_rule_loader)

path = "tests/allergens.mjs"
text = read(path)
text = text.replace('assert.equal(ALLERGEN_CODES.includes(["tree", "nut"].join("_")), false);\n', '')
text = text.replace('assert.equal(allergenCodesOverlap(["tree", "nut"].join("_"), "hazelnut"), false);\n', '')
write(path, text)

Path("scripts/drop_generic_nut_compat_once.py").unlink()
Path(".github/workflows/drop-generic-nut-compat.yml").unlink()

forbidden = [
    "LEGACY_GENERIC_NUT_CODE",
    "NUT_ALLERGEN_CODES",
    "tree" + "_nut",
]
tracked = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
found = []
for filename in tracked:
    file = Path(filename)
    if not file.exists() or not file.is_file():
        continue
    try:
        content = file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for token in forbidden:
        if token in content:
            found.append(f"{filename}: {token}")
if found:
    raise SystemExit("obsolete generic nut concept remains:\n" + "\n".join(found))
