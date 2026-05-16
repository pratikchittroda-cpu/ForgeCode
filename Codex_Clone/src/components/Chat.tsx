import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, BrainCircuit, Activity, Loader2, Image as ImageIcon, Volume2, Copy, X, FileCode, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AIService, Message } from '../services/ai';
import { executeTool } from '../services/tools';
import { PlanPanel } from './PlanPanel';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

const LOGO_PATH = "/Users/pratik/.gemini/antigravity/brain/af9588d8-6081-40ee-885f-9cd9d24a33c8/forgecode_logo_1778870422899.png";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatProps {
  activeFile: string | null;
  projectPath: string | null;
  projectFiles?: string[];
  cursorLine?: number;
  onFileSelect?: (path: string) => void;
}

export const Chat: React.FC<ChatProps> = ({ activeFile, projectPath, projectFiles = [], cursorLine, onFileSelect }) => {
  const [mode, setMode] = useState<'fast' | 'plan'>('fast');
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your local AI engineer. I can see your whole project. Ask me to create files, refactor code, or run terminal commands!" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const unlisten = listen('agent_state_changed', (event) => {
      const state = event.payload as any;
      console.log('Agent State Changed:', state);
    });
    
    const unlistenPlan = listen('plan_updated', (event) => {
      const plan = event.payload as any;
      setCurrentPlan(plan);
    });

    return () => { 
      unlisten.then(f => f());
      unlistenPlan.then(f => f());
    };
  }, []);

  // ── Load active file content whenever it changes ──────────────────────────
  useEffect(() => {
    if (!activeFile) {
      setFileContent(null);
      setFileError(false);
      return;
    }
    const load = async () => {
      try {
        const fullPath = projectPath ? `${projectPath}/${activeFile}` : activeFile;
        const content = await invoke('read_project_file', { path: fullPath }) as string;
        setFileContent(content);
        setFileError(false);
      } catch {
        setFileContent(null);
        setFileError(true);
      }
    };
    load();
  }, [activeFile, projectPath]);

  // ── Build system context (always injected before every message) ───────────
  const buildSystemContext = useCallback((): string => {
    let context = `You are ForgeCode, an elite AI Software Engineer.\n\n### Project Context\n`;
    
    context += `### Project Root\n**Absolute Path:** \`${projectPath}\`\n\n`;

    if (projectFiles.length > 0) {
      context += `Here is the current directory structure of the project (relative to root):\n\`\`\`\n${projectFiles.map(f => f.replace(projectPath || '', '').replace(/^[\/\\]/, '')).join('\n')}\n\`\`\`\n\n`;
    }

    if (activeFile && fileContent) {
      const filename = activeFile.split('/').pop() || activeFile;
      const ext = filename.split('.').pop() || '';
      const lines = fileContent.split('\n');
      const cursorCtx = cursorLine ? `\nCursor is on line ${cursorLine}: \`${lines[cursorLine - 1]?.trim() || ''}\`` : '';

      context += `### Currently Open File\n**File:** \`${activeFile}\`\n**Language:** ${ext.toUpperCase()}${cursorCtx}\n\`\`\`${ext}\n${fileContent}\n\`\`\`\n\n`;
    }

    context += `### Instructions
1. All file paths provided to tools MUST be relative to the Project Root (e.g., 'src/App.tsx' instead of '/full/path/src/App.tsx').
2. Always use 'replace_content' for editing existing files to be more efficient.
3. Be concise and technical.`;

    context += `### Autonomous Capabilities
You have access to the following tools to interact with the project:
1. list_dir(path: string): List contents of a directory.
2. read_file(path: string): Read a file's content.
3. write_file(path: string, content: string): Create/Update a file.
4. replace_content(path: string, target: string, replacement: string): Replace a specific block of text in a file.
5. run_command(command: string): Run a terminal command (non-interactive).
6. grep_search(query: string, path: string): Search text across files.
7. get_symbols(path: string): Get a list of functions, classes, and variables in a file.
8. git_status(): Get current git status.
9. read_file_lines(path: string, start: number, end: number): Read a range of lines.
10. search_web(query: string): Search the web for info.

To use a tool, you MUST output your reasoning first, followed by a JSON block in triple backticks:

### Thought
I need to...

\`\`\`json
{
  "thought": "I will now...",
  "tool": "tool_name",
  "args": { "param": "value" }
}
\`\`\`

CRITICAL: You are an autonomous agent. If a task requires multiple steps, do them one by one. The system will provide the result after each tool call. DO NOT output multiple tool calls in one response.
`;

    return context;
  }, [activeFile, fileContent, cursorLine, projectFiles]);
  const handleClear = () => {
    setMessages([{ role: 'assistant', content: "Chat cleared. I still have context of your active file. How can I help?" }]);
    setImages([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => setImages(curr => [...curr, ev.target?.result as string]);
        reader.readAsDataURL(file);
      }
    });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    Array.from(e.clipboardData.items).forEach(item => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => setImages(curr => [...curr, ev.target?.result as string]);
          reader.readAsDataURL(file);
        }
      }
    });
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    window.speechSynthesis.speak(u);
  };

  const handleSend = async (overrideInput?: string, prevMessages?: Message[]) => {
    const currentInput = overrideInput || input;
    if ((!currentInput.trim() && images.length === 0) || isLoading) return;

    if (!overrideInput) {
      const userMessage: Message = { role: 'user', content: currentInput };
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setImages([]);
    }
    
    setIsLoading(true);

    const systemCtx = buildSystemContext();
    const chatMessages = prevMessages || [...messages, { role: 'user', content: currentInput }];
    
    // Inject system context as the first message or a specific block
    const messagesWithContext: Message[] = [
      { role: 'system', content: systemCtx },
      ...chatMessages
    ];

    try {
      const response = await AIService.chat(messagesWithContext);
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);

      // Check for tool calls (robust extraction)
      let toolCallData = null;
      
      // Try to find JSON in markdown blocks first
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonCandidate = codeBlockMatch ? codeBlockMatch[1] : response;

      try {
        // Find the first { and the last } to handle chatty models
        const start = jsonCandidate.indexOf('{');
        const end = jsonCandidate.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          const rawJson = jsonCandidate.substring(start, end + 1);
          const parsed = JSON.parse(rawJson);
          if (parsed.tool && parsed.args) {
            toolCallData = parsed;
          }
        }
      } catch (e) {
        console.warn('Failed to parse potential tool call:', e);
      }

      if (toolCallData) {
        // It's a tool call!
        const result = await executeTool(toolCallData.tool, toolCallData.args, projectPath);
        
        // Add tool result and recurse
        const resultMessage: Message = { 
          role: 'system', 
          content: `Tool result (${toolCallData.tool}):\n${result}` 
        };
        
        setMessages(prev => [...prev, resultMessage]);
        
        // Recursive call to let AI process the tool result
        setTimeout(() => {
          handleSend('', [...chatMessages, { role: 'assistant', content: response }, resultMessage]);
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 600);
      }

    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${error}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlan = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    try {
      await invoke('start_agent_task', { goal: input });
      setMode('plan');
      setInput('');
    } catch (error) {
      console.error('Plan failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fileName = activeFile?.split('/').pop() || null;

  return (
    <div
      className={`flex flex-col h-full relative overflow-hidden ${isDragging ? 'ring-1 ring-primary/50' : ''}`}
      style={{ backgroundColor: '#0c0c0f' }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0e0e12' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={convertFileSrc(LOGO_PATH)} alt="ForgeCode" style={{ width: '22px', height: '22px', borderRadius: '5px' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Architect</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: isLoading ? '#8b5cf6' : '#22c55e' }} className={isLoading ? 'animate-pulse' : ''} />
              <span style={{ fontSize: '8px', color: '#52525b', fontWeight: 600 }}>{isLoading ? 'WORKING' : 'IDLE'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handleClear} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: '2px' }} className="hover:text-red-400 transition-colors">
            <X size={13} />
          </button>
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '2px' }}>
            {(['fast', 'plan'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '3px 10px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                  textTransform: 'uppercase', border: 'none', cursor: 'pointer',
                  backgroundColor: mode === m ? '#8b5cf6' : 'transparent',
                  color: mode === m ? '#fff' : '#71717a',
                  transition: 'all 0.15s',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active File Context Banner */}
      <div style={{
        flexShrink: 0,
        padding: '6px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        backgroundColor: fileName ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        {fileName ? (
          <>
            <FileCode size={10} style={{ color: '#8b5cf6', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName}
            </span>
            {cursorLine && (
              <span style={{ fontSize: '9px', color: '#52525b', flexShrink: 0 }}>
                line {cursorLine}
              </span>
            )}
            {fileError && (
              <AlertCircle size={10} style={{ color: '#f87171', flexShrink: 0, marginLeft: 'auto' }} />
            )}
            {fileContent && (
              <span style={{ fontSize: '9px', color: '#3f3f46', flexShrink: 0, marginLeft: 'auto' }}>
                {fileContent.split('\n').length} lines · in context
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: '10px', color: '#3f3f46' }}>No file open — open a file for code context</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {mode === 'fast' ? (
          messages.map((msg, i) => (
            <div key={i} className="group" style={{ 
              display: 'flex', 
              gap: '10px', 
              alignItems: 'flex-start',
              backgroundColor: msg.role === 'system' ? 'rgba(139,92,246,0.03)' : 'transparent',
              padding: msg.role === 'system' ? '8px' : '0',
              borderRadius: msg.role === 'system' ? '8px' : '0',
              border: msg.role === 'system' ? '1px dashed rgba(139,92,246,0.1)' : 'none'
            }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: msg.role === 'user' ? 'rgba(255,255,255,0.05)' : msg.role === 'system' ? 'rgba(255,255,255,0.02)' : 'rgba(139,92,246,0.15)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.05)' : msg.role === 'system' ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.3)'}`,
              }}>
                {msg.role === 'user'
                  ? <Activity size={12} style={{ color: '#71717a' }} />
                  : msg.role === 'system' ? <div style={{ fontSize: '10px', color: '#52525b', fontWeight: 800 }}>R</div>
                  : <Sparkles size={12} style={{ color: '#8b5cf6' }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {msg.role === 'assistant' || msg.role === 'system' ? (
                  <div style={{ position: 'relative' }}>
                    <div style={{ fontSize: msg.role === 'system' ? '11px' : '12px', lineHeight: '1.6', color: msg.role === 'system' ? '#71717a' : '#a1a1aa', fontFamily: msg.role === 'system' ? 'monospace' : 'inherit' }}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a({ href, children }) {
                            if (href?.startsWith('forgecode://')) {
                              const targetPath = href.replace('forgecode://', '');
                              return (
                                <button
                                  onClick={() => onFileSelect && onFileSelect(targetPath)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', textDecoration: 'underline', padding: 0, fontSize: 'inherit', fontWeight: 600 }}
                                  className="hover:text-purple-300 transition-colors"
                                >
                                  {children}
                                </button>
                              );
                            }
                            return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>{children}</a>;
                          },
                          code({ className, children }) {
                            const isInline = !className;
                            const content = String(children);
                            
                            // Check if it's a tool call JSON
                            if (!isInline && content.includes('"tool"') && content.includes('"args"')) {
                              try {
                                const toolObj = JSON.parse(content);
                                return (
                                  <div style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', padding: '12px', margin: '8px 0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                      <BrainCircuit size={14} style={{ color: '#a78bfa' }} />
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase' }}>Thought</span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#e4e4e7', fontStyle: 'italic', marginBottom: '12px' }}>
                                      {toolObj.thought}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                                      <Activity size={14} style={{ color: '#8b5cf6' }} />
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase' }}>Executing {toolObj.tool}</span>
                                    </div>
                                    <pre style={{ fontSize: '10px', color: '#a1a1aa', margin: 0 }}>
                                      {JSON.stringify(toolObj.args, null, 2)}
                                    </pre>
                                  </div>
                                );
                              } catch (e) { /* fallback to normal code block */ }
                            }

                            return isInline
                              ? <code style={{ background: 'rgba(139,92,246,0.1)', padding: '1px 5px', borderRadius: '4px', fontSize: '11px', color: '#c4b5fd', fontFamily: 'monospace' }}>{children}</code>
                              : <code style={{ display: 'block', background: '#09090b', padding: '12px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', overflowX: 'auto', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.08)' }}>{children}</code>;
                          },
                          h3({ children, ...props }) {
                            const isThought = String(children).toLowerCase().includes('thought');
                            if (isThought) {
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(139,92,246,0.2)' }}>
                                  <BrainCircuit size={14} style={{ color: '#a78bfa' }} />
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reasoning</span>
                                </div>
                              );
                            }
                            return <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f4f4f5', marginTop: '16px', marginBottom: '8px' }} {...props}>{children}</h3>;
                          },
                          pre({ children }) {
                            return (
                              <div style={{ position: 'relative', margin: '8px 0' }} className="group/code">
                                <pre style={{ margin: 0 }}>{children}</pre>
                                <button
                                  onClick={() => {
                                    const text = (children as any)?.props?.children;
                                    navigator.clipboard.writeText(String(text || ''));
                                  }}
                                  style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', color: '#71717a' }}
                                  className="opacity-0 group-hover/code:opacity-100 transition-opacity"
                                >
                                  <Copy size={11} />
                                </button>
                              </div>
                            );
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    <button
                      onClick={() => speak(msg.content)}
                      style={{ position: 'absolute', top: 0, right: '-4px', background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: '2px' }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                      title="Read aloud"
                    >
                      <Volume2 size={11} />
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#e4e4e7', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                )}
              </div>
            </div>
          ))
        ) : (
          <PlanPanel goal={currentPlan?.goal || ''} steps={currentPlan?.steps || []} />
        )}

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6' }}>
            <Loader2 size={13} className="animate-spin" />
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {fileName ? `Analyzing ${fileName}...` : 'Thinking...'}
            </span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Image Previews */}
      <AnimatePresence>
        {images.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ flexShrink: 0, padding: '8px 12px', display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {images.map((img, idx) => (
              <div key={idx} style={{ position: 'relative' }} className="group">
                <img src={img} alt="preview" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.3)' }} />
                <button onClick={() => setImages(c => c.filter((_, i) => i !== idx))}
                  style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#1a1a1f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', padding: '2px', cursor: 'pointer', color: '#f87171', display: 'flex' }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={9} />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#0e0e12' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                mode === 'fast' ? handleSend() : handlePlan();
              }
            }}
            onPaste={handlePaste}
            placeholder={fileName ? `Ask about ${fileName}...` : 'Ask your architect...'}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '10px 80px 10px 12px', fontSize: '12px',
              color: '#e4e4e7', resize: 'none', minHeight: '72px', maxHeight: '160px',
              outline: 'none', fontFamily: 'inherit', lineHeight: '1.5',
            }}
            className="focus:border-primary/40 transition-colors placeholder:text-zinc-600"
          />
          <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ cursor: 'pointer', color: '#52525b', display: 'flex' }} className="hover:text-primary transition-colors" title="Attach image">
              <ImageIcon size={15} />
              <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => {
                Array.from(e.target.files || []).forEach(file => {
                  const reader = new FileReader();
                  reader.onload = (ev) => setImages(c => [...c, ev.target?.result as string]);
                  reader.readAsDataURL(file);
                });
              }} />
            </label>
            <button
              onClick={() => (mode === 'fast' ? handleSend() : handlePlan())}
              disabled={isLoading || (!input.trim() && images.length === 0)}
              style={{
                width: '28px', height: '28px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#8b5cf6', color: '#fff', flexShrink: 0,
              }}
              className="disabled:opacity-30 hover:bg-violet-500 transition-colors"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', padding: '0 2px' }}>
          <div style={{ display: 'flex', gap: '8px', fontSize: '9px', color: '#3f3f46', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>⚡ Local</span>
            <span>·</span>
            <span style={{ color: fileName ? '#6d28d9' : '#3f3f46' }}>
              {fileName ? `📄 ${fileName} in context` : '🔍 Vision Ready'}
            </span>
          </div>
          <span style={{ fontSize: '9px', color: '#3f3f46', fontFamily: 'monospace' }}>↵ send</span>
        </div>
      </div>
    </div>
  );
};
