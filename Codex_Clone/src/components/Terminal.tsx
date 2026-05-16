import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

interface TerminalProps {
  projectPath: string | null;
}

export const Terminal: React.FC<TerminalProps> = ({ projectPath }) => {

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: 'transparent',
        foreground: '#a1a1aa',
        cursor: '#8b5cf6',
        selectionBackground: 'rgba(139,92,246,0.3)',
      },
      allowTransparency: true,
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    
    // Initial fit with slight delay to ensure container is ready
    setTimeout(() => fitAddon.fit(), 100);

    xtermRef.current = term;

    // Handle window resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Initialize terminal session in Rust
    invoke('init_terminal').then(() => {
      // Clear initial shell noise after it has likely finished loading
      setTimeout(() => {
        xtermRef.current?.clear();
      }, 1000);
    }).catch(console.error);

    // Listen for data from Rust PTY
    const unlisten = listen('terminal-data', (event) => {
      term.write(event.payload as string);
    });

    // Send data to Rust PTY
    term.onData((data) => {
      invoke('write_terminal', { data }).catch(console.error);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      unlisten.then(u => u());
    };
  }, []);

  // ── Sync terminal with project directory ──────────────────────────────────
  useEffect(() => {
    if (projectPath && xtermRef.current) {
      // Small delay to ensure the PTY is ready for input
      setTimeout(() => {
        // Send cd command followed by clear to make it look professional
        const cmd = `cd "${projectPath}"\rclear\r`;
        invoke('write_terminal', { data: cmd }).catch(console.error);
      }, 500);
    }
  }, [projectPath]);


  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-1.5 border-b border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Terminal</span>
      </div>
      <div ref={terminalRef} className="flex-1 p-2" />
    </div>
  );
};
