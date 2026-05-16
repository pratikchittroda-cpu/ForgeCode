import React, { useState, useEffect, useCallback } from 'react';
import { Editor } from './components/Editor';
import { Chat } from './components/Chat';
import { Terminal } from './components/Terminal';
import { CommandPalette } from './components/CommandPalette';
import { Logo } from './components/Logo';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
import {
  FolderOpen, FileCode, Activity, ChevronRight, Database,
  Package, Hash, X, BrainCircuit, GitBranch, Search,
  Settings, ChevronDown, ChevronRight as ChevronRightSm,
  Folder, FolderOpen as FolderOpenIcon, Zap
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

// ─── Types ────────────────────────────────────────────────────────────────────
interface FileNode {
  name: string;
  path: string;      // relative path from project root
  isDir: boolean;
  children?: FileNode[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const IGNORED = new Set(['node_modules', '.git', 'target', 'dist', '.DS_Store', '__pycache__', '.next', 'build', '.cache', 'out', '.turbo']);

function buildTree(relativePaths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  relativePaths.forEach(relPath => {
    const parts = relPath.split('/');
    let current = root;
    let cumPath = '';

    parts.forEach((part, i) => {
      cumPath = cumPath ? `${cumPath}/${part}` : part;
      if (!map[cumPath]) {
        const node: FileNode = {
          name: part,
          path: cumPath,
          isDir: i < parts.length - 1,
          children: i < parts.length - 1 ? [] : undefined,
        };
        map[cumPath] = node;
        current.push(node);
      }
      if (map[cumPath].children) {
        current = map[cumPath].children!;
      }
    });
  });

  return root;
}

function getFileIcon(name: string, size = 12) {
  const ext = name.split('.').pop()?.toLowerCase();
  const colors: Record<string, string> = {
    tsx: '#60a5fa', ts: '#60a5fa', jsx: '#34d399', js: '#fbbf24',
    rs: '#f97316', json: '#facc15', toml: '#fb923c', md: '#a78bfa',
    css: '#38bdf8', html: '#f87171', py: '#4ade80', sh: '#86efac',
    sql: '#fb7185', yaml: '#a78bfa', yml: '#a78bfa',
  };
  const color = colors[ext || ''] || '#71717a';
  return <FileCode size={size} style={{ color, flexShrink: 0 }} />;
}

// ─── FileTree Component ───────────────────────────────────────────────────────
const FileTree: React.FC<{
  nodes: FileNode[];
  depth: number;
  activeFile: string | null;
  onSelect: (path: string) => void;
  gitStatus: Record<string, string>;
}> = ({ nodes, depth, activeFile, onSelect, gitStatus }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (path: string) => setCollapsed(p => ({ ...p, [path]: !p[path] }));

  return (
    <>
      {nodes.map(node => (
        <div key={node.path}>
          <div
            onClick={() => node.isDir ? toggle(node.path) : onSelect(node.path)}
            style={{
              paddingLeft: `${8 + depth * 12}px`,
              paddingRight: '8px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              color: activeFile === node.path ? '#e4e4e7' : '#71717a',
              backgroundColor: activeFile === node.path ? 'rgba(139,92,246,0.15)' : 'transparent',
              userSelect: 'none',
            }}
            className="hover:bg-white/[0.04] group"
          >
            {node.isDir ? (
              <>
                {collapsed[node.path]
                  ? <ChevronRightSm size={10} style={{ flexShrink: 0, color: '#52525b' }} />
                  : <ChevronDown size={10} style={{ flexShrink: 0, color: '#52525b' }} />
                }
                {collapsed[node.path]
                  ? <Folder size={13} style={{ flexShrink: 0, color: '#60a5fa' }} />
                  : <FolderOpenIcon size={13} style={{ flexShrink: 0, color: '#60a5fa' }} />
                }
              </>
            ) : (
              <>
                <span style={{ width: '10px', flexShrink: 0 }} />
                {getFileIcon(node.name, 13)}
              </>
            )}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
            {gitStatus[node.path] && (
              <span style={{
                fontSize: '9px', fontWeight: 700, flexShrink: 0,
                color: gitStatus[node.path] === 'M' ? '#eab308' : gitStatus[node.path] === 'A' ? '#22c55e' : '#ef4444'
              }}>
                {gitStatus[node.path]}
              </span>
            )}
          </div>
          {node.isDir && !collapsed[node.path] && node.children && (
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              activeFile={activeFile}
              onSelect={onSelect}
              gitStatus={gitStatus}
            />
          )}
        </div>
      ))}
    </>
  );
};

// ─── SplashScreen Component ──────────────────────────────────────────────────
const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.8, delay: 2.5 }}
      onAnimationComplete={onComplete}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#050507', zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '24px'
      }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{ position: 'relative' }}
      >
        <Logo size={140} />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          style={{
            position: 'absolute', top: -15, left: -15, right: -15, bottom: -15,
            border: '2px solid rgba(139,92,246,0.05)', borderTopColor: 'rgba(139,92,246,0.4)',
            borderRadius: '50%'
          }}
        />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        style={{ textAlign: 'center' }}
      >
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#f4f4f5', letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0, background: 'linear-gradient(to right, #8b5cf6, #d8b4fe)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ForgeCode</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
          <div style={{ width: '20px', height: '1px', backgroundColor: 'rgba(139,92,246,0.3)' }} />
          <p style={{ fontSize: '9px', color: '#52525b', letterSpacing: '0.5em', textTransform: 'uppercase', margin: 0 }}>Architecting the Future</p>
          <div style={{ width: '20px', height: '1px', backgroundColor: 'rgba(139,92,246,0.3)' }} />
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({});
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('No Project');

  // ⌘K command palette shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(p => !p);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Git status polling
  useEffect(() => {
    if (!projectPath) return;
    const poll = setInterval(async () => {
      try {
        const status = await invoke('get_git_status', { path: projectPath }) as Record<string, string>;
        setGitStatus(status);
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [projectPath]);

  const handleFileClick = useCallback((relativePath: string) => {
    setActiveFile(relativePath);
    setOpenTabs(prev => prev.includes(relativePath) ? prev : [...prev, relativePath]);
  }, []);

  const closeTab = useCallback((file: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenTabs(prev => {
      const next = prev.filter(t => t !== file);
      if (activeFile === file) setActiveFile(next[next.length - 1] ?? null);
      return next;
    });
  }, [activeFile]);

  const refreshFiles = useCallback(async (path: string) => {
    try {
      const fileList = await invoke('list_project_files', { path }) as string[];
      const relative = fileList
        .map(f => f.replace(path + '/', '').replace(path + '\\', ''))
        .filter(f => {
          const parts = f.split('/');
          return !parts.some(p => IGNORED.has(p)) && !f.startsWith('.');
        })
        .sort();

      setFiles(relative);
      setFileTree(buildTree(relative));
    } catch (err) {
      console.error('Failed to refresh files:', err);
    }
  }, []);

  const handleOpenProject = async () => {
    try {
      const path = await invoke('open_project') as string;
      setProjectPath(path);
      setProjectName(path.split('/').pop() || path);
      await refreshFiles(path);
    } catch (err) {
      console.error('Failed to open project:', err);
    }
  };

  // Watcher event listeners
  useEffect(() => {
    let active = true;
    let unlistens: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        const uRepo = await listen('repo-changed', () => {
          if (active && projectPath) refreshFiles(projectPath);
        });
        if (!active) { uRepo(); return; }
        unlistens.push(uRepo);

        const uFile = await listen('file-changed', () => {
          if (active && projectPath) refreshFiles(projectPath);
        });
        if (!active) { uFile(); return; }
        unlistens.push(uFile);
      } catch (err) {
        console.error('Failed to setup listeners:', err);
      }
    };

    setupListeners();
    return () => {
      active = false;
      unlistens.forEach(u => u());
    };
  }, [projectPath, refreshFiles]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#0a0a0c', color: '#e4e4e7', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      {/* ── Activity Bar + Sidebar + Main + Chat ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Activity Bar (VS Code leftmost strip) */}
        <div style={{ width: '48px', backgroundColor: '#0c0c0f', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '8px', gap: '4px', borderRight: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
          {[
            { icon: <Logo size={20} />, label: 'Explorer', active: true },
            { icon: <Search size={20} />, label: 'Search' },
            { icon: <GitBranch size={20} />, label: 'Source Control' },
            { icon: <BrainCircuit size={20} />, label: 'AI' },
          ].map((item, i) => (
            <button
              key={i}
              title={item.label}
              onClick={item.label === 'AI' ? () => setIsChatOpen(p => !p) : undefined}
              style={{
                width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px',
                color: item.active || (item.label === 'AI' && isChatOpen) ? '#8b5cf6' : '#52525b',
                borderLeft: item.active ? '2px solid #8b5cf6' : '2px solid transparent',
              }}
              className="hover:text-foreground hover:bg-white/5 transition-colors"
            >
              {item.icon}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            title="Settings"
            style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', marginBottom: '8px' }}
            className="hover:text-foreground transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* File Explorer Sidebar */}
        <div style={{ width: '220px', backgroundColor: '#0c0c0f', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, overflow: 'hidden' }}>
          {/* Sidebar Header */}
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#52525b' }}>Explorer</span>
            <button
              onClick={handleOpenProject}
              title="Open Folder"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', display: 'flex', padding: '2px' }}
              className="hover:text-foreground transition-colors"
            >
              <FolderOpen size={14} />
            </button>
          </div>

          {/* Project name row */}
          <div style={{ padding: '6px 12px 2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ChevronDown size={10} style={{ color: '#52525b', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {projectName}
            </span>
          </div>

          {/* File Tree */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {fileTree.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <FolderOpen size={24} style={{ color: '#3f3f46', margin: '0 auto 8px' }} />
                <p style={{ fontSize: '11px', color: '#3f3f46', lineHeight: 1.5 }}>Open a folder to start</p>
                <button
                  onClick={handleOpenProject}
                  style={{ marginTop: '10px', fontSize: '11px', color: '#8b5cf6', background: 'none', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer' }}
                >
                  Open Folder
                </button>
              </div>
            ) : (
              <FileTree
                nodes={fileTree}
                depth={0}
                activeFile={activeFile}
                onSelect={handleFileClick}
                gitStatus={gitStatus}
              />
            )}
          </div>
        </div>

        {/* Main Editor Area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: '#09090b', overflow: 'hidden' }}>

          {/* Tab Bar */}
          <div style={{ height: '35px', display: 'flex', alignItems: 'center', backgroundColor: '#0c0c0e', borderBottom: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto', flexShrink: 0 }}>
            {openTabs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '11px', color: '#3f3f46' }}>Open a file to start editing</span>
              </div>
            ) : openTabs.map(tab => {
              const isActive = activeFile === tab;
              const name = tab.split('/').pop() || tab;
              return (
                <div
                  key={tab}
                  onClick={() => setActiveFile(tab)}
                  style={{
                    height: '100%', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px',
                    cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    borderRight: '1px solid rgba(255,255,255,0.04)',
                    backgroundColor: isActive ? '#09090b' : 'transparent',
                    borderBottom: isActive ? '1px solid #8b5cf6' : '1px solid transparent',
                    color: isActive ? '#e4e4e7' : '#71717a',
                  }}
                >
                  {getFileIcon(name, 12)}
                  <span style={{ fontSize: '12px' }}>{name}</span>
                  <button
                    onClick={(e) => closeTab(tab, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '1px', display: 'flex', alignItems: 'center', opacity: 0.6, marginLeft: '2px' }}
                    className="hover:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Breadcrumb */}
          <div style={{ height: '22px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '4px', backgroundColor: '#09090b', borderBottom: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
            {activeFile ? (
              activeFile.split('/').map((part, i, arr) => (
                <React.Fragment key={i}>
                  <span style={{ fontSize: '11px', color: i === arr.length - 1 ? '#a1a1aa' : '#52525b' }}>{part}</span>
                  {i < arr.length - 1 && <ChevronRight size={9} style={{ color: '#3f3f46' }} />}
                </React.Fragment>
              ))
            ) : (
              <span style={{ fontSize: '11px', color: '#3f3f46' }}>{projectName}</span>
            )}
          </div>

          {/* Monaco Editor */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Editor file={activeFile} projectPath={projectPath} />
          </div>

          {/* Integrated Terminal */}
          <div style={{ flexShrink: 0, height: '160px', borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#050507' }}>
            <Terminal projectPath={projectPath} />
          </div>
        </main>

        {/* AI Chat Panel */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              style={{ backgroundColor: '#0c0c0f', borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}
            >
              <Chat activeFile={activeFile} projectPath={projectPath} projectFiles={files} onFileSelect={handleFileClick} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status Bar (VS Code bottom) */}
      <div style={{ height: '22px', backgroundColor: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.9)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Logo size={22} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <GitBranch size={10} />
            <span>main</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={10} style={{ color: '#bbf7d0' }} />
            <span>Ready</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>
          {activeFile && <span>{activeFile.split('.').pop()?.toUpperCase()}</span>}
          <span>UTF-8</span>
          <span>⌘K to search</span>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        setIsOpen={setIsCommandPaletteOpen}
        files={files}
        onFileSelect={handleFileClick}
        onOpenProject={handleOpenProject}
      />
    </div>
  );
}

export default App;
