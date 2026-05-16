import React, { useEffect, useState, useRef } from 'react';
import { Search, FileCode, Terminal, Sparkles, FolderOpen, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';

interface CommandPaletteProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  files: string[];
  onFileSelect: (file: string) => void;
  onOpenProject: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ 
  isOpen, 
  setIsOpen, 
  files, 
  onFileSelect,
  onOpenProject
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      try {
        const results = await invoke('search_in_files', { path: './', query }) as string[];
        setSearchResults(results);
      } catch (e) {
        console.error('Search failed:', e);
      }
    } else {
      setSearchResults([]);
    }
  };

  if (!isOpen) return null;

  interface CommandItem {
    type: 'search' | 'file' | 'action';
    label: string;
    icon: React.ReactNode;
    action?: () => void;
  }

  const combinedItems: CommandItem[] = [
    ...searchResults.map(s => ({ type: 'search', label: s, icon: <Search size={14} className="text-primary" /> } as CommandItem)),
    ...files.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()) && !searchResults.includes(f))
      .map(f => ({ type: 'file', label: f, icon: <FileCode size={14} className="text-muted-foreground" /> } as CommandItem)),
    { type: 'action', label: 'Open Folder...', icon: <FolderOpen size={14} />, action: onOpenProject },
    { type: 'action', label: 'Ask AI to Refactor', icon: <Sparkles size={14} /> },
    { type: 'action', label: 'Open New Terminal', icon: <Terminal size={14} /> },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-background/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-[600px] bg-[#1c1c1f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center border-b border-white/5 px-4 py-4 space-x-3">
          <Search size={20} className="text-muted-foreground" />
          <input 
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search files or run commands..." 
            className="flex-1 bg-transparent border-none outline-none text-base placeholder:text-muted-foreground/50 text-foreground"
          />
          <div className="px-1.5 py-0.5 rounded border border-white/10 text-[10px] text-muted-foreground font-mono">ESC</div>
        </div>
        
        <div className="max-h-[400px] overflow-y-auto p-2 no-scrollbar">
          {combinedItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No results found for "{searchQuery}"</div>
          ) : (
            <div className="space-y-1">
              {combinedItems.map((item, idx) => (
                <div
                  key={`${item.type}-${item.label}`}
                  onClick={() => {
                    if (item.type === 'action' && item.action) item.action();
                    else onFileSelect(item.label);
                    setIsOpen(false);
                  }}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all hover:bg-white/5 group ${
                    idx === selectedIndex ? 'bg-primary/10 text-primary' : 'text-foreground'
                  }`}
                >
                  <div className="flex-shrink-0">{item.icon}</div>
                  <div className="flex-1 text-sm font-medium truncate">{item.label}</div>
                  {item.type === 'action' && <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity uppercase font-bold tracking-widest">Run</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border-t border-white/5 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
          <div className="flex items-center space-x-4">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>ForgeCode Search</span>
        </div>
      </div>
    </div>
  );
};
