use homealacarte_web::{
    SourceFile, consolidate_personal_sources, merge_personal_documents,
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn json_files(root: &Path, directory: &Path, result: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("cannot read {}: {error}", directory.display()))?;
    for entry in entries {
        let path = entry
            .map_err(|error| format!("cannot read {}: {error}", directory.display()))?
            .path();
        if path.is_dir() {
            if !path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with('.'))
            {
                json_files(root, &path, result)?;
            }
        } else if path.extension().is_some_and(|extension| extension == "json")
            && !path
                .strip_prefix(root)
                .unwrap_or(&path)
                .components()
                .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
        {
            result.push(path);
        }
    }
    Ok(())
}

fn load_directory(source_directory: &Path) -> Result<Vec<SourceFile>, String> {
    if !source_directory.is_dir() {
        return Err(format!(
            "personal data directory does not exist: {}",
            source_directory.display()
        ));
    }
    let mut paths = Vec::new();
    json_files(&source_directory, &source_directory, &mut paths)?;
    paths.sort();
    if paths.is_empty() {
        return Err(format!(
            "personal data directory contains no JSON files: {}",
            source_directory.display()
        ));
    }
    paths
        .into_iter()
        .map(|path| {
            Ok(SourceFile {
                path: path
                    .strip_prefix(source_directory)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string(),
                content: fs::read_to_string(&path)
                    .map_err(|error| format!("cannot read {}: {error}", path.display()))?,
            })
        })
        .collect::<Result<Vec<_>, String>>()
}

fn atomic_write(output_path: &Path, content: &str) -> Result<(), String> {
    let parent = output_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    fs::create_dir_all(parent)
        .map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
    let temporary_path = output_path.with_extension(format!("json.{}.tmp", std::process::id()));
    fs::write(&temporary_path, format!("{content}\n"))
        .map_err(|error| format!("cannot write {}: {error}", temporary_path.display()))?;
    fs::rename(&temporary_path, &output_path)
        .map_err(|error| format!("cannot replace {}: {error}", output_path.display()))
}

fn convert(source_directory: &Path, output_path: &Path) -> Result<(), String> {
    let (content, report) = consolidate_personal_sources(load_directory(source_directory)?, "fr")?;
    atomic_write(output_path, &content)?;

    println!("Personal import written to {}", output_path.display());
    println!(
        "{} foods, {} household items, {} dishes, {} people, {} menu rows, {} stock rows, {} extra needs",
        report.ingredients,
        report.household_items,
        report.dishes,
        report.people,
        report.menu,
        report.stock,
        report.extra_needs,
    );
    println!(
        "{} Nutri-Score ingredient values remain missing",
        report.missing_nutrition_values
    );
    Ok(())
}

fn merge(
    base_directory: &Path,
    overlay_directory: &Path,
    output_path: &Path,
    audit_path: &Path,
) -> Result<(), String> {
    let (base_content, _) =
        consolidate_personal_sources(load_directory(base_directory)?, "fr")?;
    let (overlay_content, _) =
        consolidate_personal_sources(load_directory(overlay_directory)?, "fr")?;
    let (content, audit) = merge_personal_documents(&base_content, &overlay_content, "fr")?;
    atomic_write(output_path, &content)?;
    atomic_write(
        audit_path,
        &serde_json::to_string_pretty(&audit)
            .map_err(|error| format!("cannot encode merge audit: {error}"))?,
    )?;
    println!("Merged personal import written to {}", output_path.display());
    println!("Merge audit written to {}", audit_path.display());
    println!(
        "{} foods, {} household items, {} dishes, {} people, {} menu rows, {} stock rows, {} extra needs",
        audit.merged.ingredients,
        audit.merged.household_items,
        audit.merged.dishes,
        audit.merged.people,
        audit.merged.menu,
        audit.merged.stock,
        audit.merged.extra_needs,
    );
    println!(
        "{} nutrition enrichments, {} merged price histories, {} unresolved field conflicts",
        audit.nutrition_enrichments.len(),
        audit.price_history_merges.len(),
        audit.conflicts.len(),
    );
    Ok(())
}

fn run() -> Result<(), String> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    match arguments.as_slice() {
        [source_directory, output_path] => {
            convert(Path::new(source_directory), Path::new(output_path))
        }
        [command, base_directory, overlay_directory, output_path, audit_path]
            if command == "merge" =>
        {
            merge(
                Path::new(base_directory),
                Path::new(overlay_directory),
                Path::new(output_path),
                Path::new(audit_path),
            )
        }
        _ => Err(
            "usage: personal-data <source-directory> <output.json>\n       personal-data merge <base-directory> <overlay-directory> <output.json> <audit.json>"
                .to_string(),
        ),
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Personal data migration failed: {error}");
        std::process::exit(1);
    }
}
