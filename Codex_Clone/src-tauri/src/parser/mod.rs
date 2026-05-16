use tree_sitter::{Parser, Query, QueryCursor};
use tree_sitter_typescript::{language_typescript, language_tsx};
use crate::parser::types::{Symbol, SymbolType};
use anyhow::Result;

pub mod types;

pub struct RepoParser {
    ts_parser: Parser,
    tsx_parser: Parser,
}

impl RepoParser {
    pub fn new() -> Self {
        let mut ts_parser = Parser::new();
        ts_parser.set_language(language_typescript()).expect("Error loading TS language");

        let mut tsx_parser = Parser::new();
        tsx_parser.set_language(language_tsx()).expect("Error loading TSX language");

        Self { ts_parser, tsx_parser }
    }

    pub fn parse_file(&mut self, path: &str, content: &str) -> Result<Vec<Symbol>> {
        let is_tsx = path.ends_with(".tsx");
        let tree = if is_tsx {
            self.tsx_parser.parse(content, None)
        } else {
            self.ts_parser.parse(content, None)
        };

        let tree = tree.ok_or_else(|| anyhow::anyhow!("Failed to parse file"))?;
        let root_node = tree.root_node();

        // Simple query to find functions and classes
        // In a real app, this would be much more comprehensive
        let query_str = r#"
            (function_declaration name: (identifier) @name) @func
            (class_declaration name: (type_identifier) @name) @class
            (interface_declaration name: (type_identifier) @name) @interface
            (method_definition name: (property_identifier) @name) @method
        "#;

        let language = if is_tsx { language_tsx() } else { language_typescript() };
        let query = Query::new(language, query_str).expect("Error building query");
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&query, root_node, content.as_bytes());

        let mut symbols = Vec::new();

        for m in matches {
            for capture in m.captures {
                let node = capture.node;
                let capture_name = query.capture_names()[capture.index as usize].as_str();
                
                let symbol_type = match capture_name {
                    "func" => SymbolType::Function,
                    "class" => SymbolType::Class,
                    "interface" => SymbolType::Interface,
                    "method" => SymbolType::Method,
                    _ => continue,
                };

                let name_node = node.child_by_field_name("name").unwrap_or(node);
                let name = content[name_node.start_byte()..name_node.end_byte()].to_string();

                symbols.push(Symbol {
                    name,
                    symbol_type,
                    start_line: node.start_position().row,
                    end_line: node.end_position().row,
                    content: content[node.start_byte()..node.end_byte()].to_string(),
                    file_path: path.to_string(),
                });
            }
        }

        Ok(symbols)
    }
}
