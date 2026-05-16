use similar::{TextDiff, ChangeTag};
use anyhow::Result;

pub struct Patcher;

impl Patcher {
    pub fn replace_content(original: &str, target: &str, replacement: &str) -> Result<String, String> {
        // 1. Exact Match (Fast path)
        if original.contains(target) {
            return Ok(original.replace(target, replacement));
        }

        // 2. Normalization Match (Line endings)
        let original_lf = original.replace("\r\n", "\n");
        let target_lf = target.replace("\r\n", "\n");
        if original_lf.contains(&target_lf) {
            return Ok(original_lf.replace(&target_lf, replacement));
        }

        // 3. Robust Fuzzy Match (Indentation & Whitespace Agnostic)
        let target_trimmed: Vec<&str> = target_lf.lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect();
            
        if target_trimmed.is_empty() {
            return Err("Target content is empty.".to_string());
        }

        let original_lines: Vec<&str> = original_lf.lines().collect();
        let mut potential_matches = Vec::new();

        for i in 0..original_lines.len() {
            // Only start matching on a non-empty line that matches our first target line
            if original_lines[i].trim() != target_trimmed[0] {
                continue;
            }

            let mut target_idx = 0;
            let mut original_idx = i;
            
            while target_idx < target_trimmed.len() && original_idx < original_lines.len() {
                let orig_line = original_lines[original_idx].trim();
                
                // Skip empty lines in the original source during comparison
                if orig_line.is_empty() {
                    original_idx += 1;
                    continue;
                }

                if orig_line == target_trimmed[target_idx] {
                    target_idx += 1;
                    original_idx += 1;
                } else {
                    break;
                }
            }

            if target_idx == target_trimmed.len() {
                // Found a match range: [i..original_idx]
                potential_matches.push((i, original_idx));
            }
        }

        if potential_matches.len() == 1 {
            let (start, end) = potential_matches[0];
            let mut result_lines = original_lines.clone();
            result_lines.splice(start..end, vec![replacement]);
            return Ok(result_lines.join("\n"));
        } else if potential_matches.len() > 1 {
            return Err("Target content is not unique. Multiple matches found in the file. Please provide more context.".to_string());
        }

        Err("Target content not found in file. Please ensure you provide a unique, continuous block of code to replace (ignoring indentation and empty lines).".to_string())
    }

    pub fn generate_diff(original: &str, new: &str) -> Vec<(ChangeTag, String)> {
        let diff = TextDiff::from_lines(original, new);
        let mut changes = Vec::new();

        for change in diff.iter_all_changes() {
            changes.push((change.tag(), change.to_string()));
        }

        changes
    }

    pub fn dry_run_patch(original: &str, target: &str, replacement: &str, path: &str) -> Result<String, String> {
        let patched = Self::replace_content(original, target, replacement)?;
        
        // Simple syntax check for TS/TSX
        if path.ends_with(".ts") || path.ends_with(".tsx") || path.ends_with(".js") || path.ends_with(".jsx") {
            Self::validate_syntax(&patched, path)?;
        }
        
        Ok(patched)
    }

    fn validate_syntax(content: &str, path: &str) -> Result<(), String> {
        use tree_sitter::Parser;
        use tree_sitter_typescript::{language_typescript, language_tsx};

        let mut parser = Parser::new();
        let is_tsx = path.ends_with(".tsx") || path.ends_with(".jsx");
        let lang = if is_tsx { language_tsx() } else { language_typescript() };
        
        parser.set_language(lang).map_err(|e| e.to_string())?;
        let tree = parser.parse(content, None).ok_or("Failed to parse content")?;
        
        if tree.root_node().has_error() {
            // Find where the error is
            return Err("Syntax error detected in patched content. The generated code is invalid and was not saved.".to_string());
        }
        
        Ok(())
    }
}
