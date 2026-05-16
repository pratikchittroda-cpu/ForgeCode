use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SymbolType {
    Function,
    Class,
    Interface,
    Method,
    Variable,
    Import,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Symbol {
    pub name: String,
    pub symbol_type: SymbolType,
    pub start_line: usize,
    pub end_line: usize,
    pub content: String,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    pub path: String,
    pub last_modified: u64,
    pub symbols: Vec<Symbol>,
}
