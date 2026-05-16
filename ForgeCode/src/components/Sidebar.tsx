import React from 'react';
import { Files, Zap, Cpu, Settings, Search, GitBranch, FolderOpen, Activity, FileCode, Database, Package, Hash } from 'lucide-react';

interface SidebarProps {
  files: string[];
  activeFile: string | null;
  onFileSelect: (file: string) => void;
  onOpenProject: () => void;
  gitStatus: Record<string, string>;
  projectPath: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  files, 
  activeFile, 
  onFileSelect, 
  onOpenProject,
  gitStatus,
  projectPath
}) => {

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'rs': return <Activity size={12} className="text-orange-500" />;
      case 'tsx':
      case 'ts': return <FileCode size={12} className="text-blue-400" />;
      case 'json': return <Database size={12} className="text-yellow-500" />;
      case 'toml': return <Package size={12} className="text-red-400" />;
      default: return <Hash size={12} className="text-muted-foreground/50" />;
    }
  };

  return (
    <div className="w-64 glass border-r border-white/5 flex flex-col shrink-0 overflow-hidden">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap size={14} className="text-background fill-current" />
          </div>
          <h1 className="font-bold tracking-tight text-sm glow-text">ForgeCode</h1>
        </div>
        <button 
          onClick={onOpenProject}
          className="p-1.5 hover:bg-white/5 rounded-md transition-colors text-muted-foreground hover:text-primary"
          title="Open Project"
        >
          <FolderOpen size={16} />
        </button>
      </div>

      {/* Explorer List */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2">
        <div className="px-2 py-2">
          <div className="flex items-center justify-between text-muted-foreground mb-3 px-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">Project Explorer</span>
            <Files size={10} className="opacity-40" />
          </div>
          
          <div className="space-y-0.5">
            {files.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[10px] text-muted-foreground/30 italic">No files loaded</p>
              </div>
            ) : (
              files.map((file) => (
                <button
                  key={file}
                  onClick={() => onFileSelect(file)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-all flex items-center justify-between group ${
                    activeFile === file 
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {getFileIcon(file)}
                    <span className="truncate">{file}</span>
                  </div>
                  {gitStatus[file] && (
                    <span className={`text-[9px] font-bold px-1 rounded-sm ${
                      gitStatus[file] === 'M' ? 'text-yellow-500 bg-yellow-500/10' : 
                      gitStatus[file] === 'A' ? 'text-green-500 bg-green-500/10' : 
                      'text-red-500 bg-red-500/10'
                    }`}>
                      {gitStatus[file]}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-white/5 bg-white/[0.01] space-y-3">
        <div className="flex items-center justify-around text-muted-foreground/40">
          <Search size={14} className="hover:text-primary cursor-pointer transition-colors" />
          <GitBranch size={14} className="hover:text-primary cursor-pointer transition-colors" />
          <Cpu size={14} className="hover:text-primary cursor-pointer transition-colors" />
          <Settings size={14} className="hover:text-primary cursor-pointer transition-colors" />
        </div>
        <div className="flex items-center space-x-2 text-[8px] font-bold text-muted-foreground/20 uppercase tracking-widest px-1">
          <div className={`w-1.5 h-1.5 rounded-full ${projectPath ? 'bg-green-500/50' : 'bg-red-500/50'}`} />
          <span className="truncate">{projectPath ? 'Engine Online' : 'Offline'}</span>
        </div>
      </div>
    </div>
  );
};
