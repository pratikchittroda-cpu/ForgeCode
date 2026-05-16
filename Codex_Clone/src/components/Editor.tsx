import React, { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useMonaco } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/tauri';
import type * as MonacoType from 'monaco-editor';
import prettier from 'prettier/standalone';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';
import * as prettierPluginTypescript from 'prettier/plugins/typescript';
import * as prettierPluginHtml from 'prettier/plugins/html';
import * as prettierPluginPostcss from 'prettier/plugins/postcss';

interface EditorProps {
  file: string | null;
  projectPath: string | null;
}

export const Editor: React.FC<EditorProps> = ({ file, projectPath }) => {
  const [content, setContent] = useState('// Select a file to start coding');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const monaco = useMonaco();
  const providerRef = useRef<MonacoType.IDisposable | null>(null);

  // ── Load file ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) { setContent('// Select a file to start coding'); return; }
    (async () => {
      try {
        const fullPath = projectPath ? `${projectPath}/${file}` : file;
        const text = await invoke('read_project_file', { path: fullPath }) as string;
        setContent(text);
      } catch {
        setContent(`// Could not load: ${file}\n// Make sure a project is open.`);
      }
    })();
  }, [file, projectPath]);

  // ── Save on change ────────────────────────────────────────────────────────
  const handleEditorChange = async (value: string | undefined) => {
    if (file && value !== undefined) {
      setContent(value);
      try {
        const fullPath = projectPath ? `${projectPath}/${file}` : file;
        await invoke('apply_file_patch', { path: fullPath, content: value });
      } catch (err) {
        console.error('Save failed:', err);
      }
    }
  };

  // ── Inline AI Suggestions (FIM via LM Studio) ─────────────────────────────
  const fetchSuggestion = useCallback(async (prefix: string, suffix: string, signal: AbortSignal): Promise<string> => {
    try {
      const res = await fetch('http://127.0.0.1:1234/v1/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'lmstudio-community/qwen2.5-coder-7b-instruct-mlx',
          prompt: `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`,
          max_tokens: 120, temperature: 0.1,
          stop: ['\n', '<|fim_', '```'],
          stream: false,
        }),
        signal,
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.choices?.[0]?.text ?? '';
    } catch { return ''; }
  }, []);

  useEffect(() => {
    if (!monaco) return;
    providerRef.current?.dispose();
    const langs = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'rust', 'python', 'css', 'html'];
    
    let debounceTimer: any = null;

    providerRef.current = monaco.languages.registerInlineCompletionsProvider(langs, {
      provideInlineCompletions: async (model, position, context, token) => {
        // Only suggest at the end of a line or in whitespace
        const lineContent = model.getLineContent(position.lineNumber);
        const charAfter = lineContent.substring(position.column - 1, position.column);
        
        // Don't suggest if we are in the middle of a word unless manually triggered
        if (charAfter.trim().length > 0 && context.triggerKind === 0) {
          return { items: [] };
        }

        return new Promise((resolve) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            if (token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            const offset = model.getOffsetAt(position);
            const full = model.getValue();
            const prefix = full.slice(0, offset);
            const suffix = full.slice(offset);

            // Don't suggest if prefix is too short and not at a new line
            if (prefix.trim().length < 2 && !prefix.endsWith('\n')) {
              resolve({ items: [] });
              return;
            }

            setIsSuggesting(true);
            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());

            const suggestion = await fetchSuggestion(prefix, suffix, abortController.signal);
            setIsSuggesting(false);

            if (!suggestion || token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            resolve({
              items: [{
                insertText: suggestion,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                ),
                command: { id: 'editor.action.inlineSuggest.commit', title: 'Accept' }
              }],
              enableForwardStability: true,
            });
          }, 350); // 350ms debounce for local LLM
        });
      },
      freeInlineCompletions: () => {},
    });
    // ── Prettier Formatting Extension ───────────────────────────────────────
    const formatProvider = monaco.languages.registerDocumentFormattingEditProvider(langs, {
      async provideDocumentFormattingEdits(model, options, token) {
        try {
          const text = model.getValue();
          const languageId = model.getLanguageId();
          
          let parser = 'babel';
          const plugins: any[] = [prettierPluginBabel, prettierPluginEstree];

          if (languageId === 'typescript' || languageId === 'typescriptreact') {
            parser = 'typescript';
            plugins.push(prettierPluginTypescript);
          } else if (languageId === 'html') {
            parser = 'html';
            plugins.push(prettierPluginHtml);
          } else if (languageId === 'css' || languageId === 'scss') {
            parser = 'css';
            plugins.push(prettierPluginPostcss);
          }

          const formatted = await prettier.format(text, {
            parser,
            plugins,
            singleQuote: true,
            trailingComma: 'es5',
            tabWidth: options.tabSize,
            useTabs: !options.insertSpaces,
          });

          return [{
            range: model.getFullModelRange(),
            text: formatted,
          }];
        } catch (err) {
          console.error('Prettier formatting failed:', err);
          return [];
        }
      }
    });

    return () => {
      providerRef.current?.dispose();
      formatProvider.dispose();
    };
  }, [monaco, fetchSuggestion]);

  // ── Language detection ────────────────────────────────────────────────────
  const getLanguage = (f: string | null) => {
    const ext = f?.split('.').pop()?.toLowerCase();
    return ({ tsx: 'typescriptreact', ts: 'typescript', jsx: 'javascriptreact', js: 'javascript', rs: 'rust', py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown', toml: 'toml', yaml: 'yaml', yml: 'yaml', sh: 'shell' } as Record<string, string>)[ext || ''] || 'plaintext';
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isSuggesting && (
        <div style={{ position: 'absolute', top: 10, right: 14, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#a78bfa', pointerEvents: 'none' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />
          AI thinking...
        </div>
      )}

      <MonacoEditor
        height="100%"
        language={getLanguage(file)}
        value={content}
        theme="forge-dark"
        onChange={handleEditorChange}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.updateOptions({ inlineSuggest: { enabled: true, mode: 'prefix' } });
        }}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          padding: { top: 16 },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'off',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          renderWhitespace: 'none',
          inlineSuggest: { enabled: true, mode: 'prefix' },
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestOnTriggerCharacters: true,
          tabCompletion: 'on',
          'semanticHighlighting.enabled': false,
        }}
        beforeMount={(monaco) => {
          // ── TypeScript + JSX compiler options ───────────────────────────
          const tsOpts: import('monaco-editor').languages.typescript.CompilerOptions = {
            target: monaco.languages.typescript.ScriptTarget.ES2020,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            jsxImportSource: 'react',
            strict: false,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            allowJs: true,
            allowNonTsExtensions: true,
            resolveJsonModule: true,
          };
          monaco.languages.typescript.typescriptDefaults.setCompilerOptions(tsOpts);
          monaco.languages.typescript.javascriptDefaults.setCompilerOptions(tsOpts);

          // ── Silence "module not found", keep syntax errors ──────────────
          const diagOpts = { noSemanticValidation: true, noSyntaxValidation: false };
          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagOpts);
          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagOpts);

          // ── React type stubs (useState, FC, JSX elements, events) ───────
          const reactDts = `
declare module 'react' {
  export type ReactNode = string | number | boolean | null | undefined | ReactElement | Iterable<ReactNode>;
  export type ReactElement<P = any> = { type: any; props: P; key: string | null };
  export type FC<P = {}> = (props: P & { children?: ReactNode }) => ReactElement | null;
  export type CSSProperties = { [key: string]: string | number | undefined };
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type RefObject<T> = { current: T | null };
  export type MutableRefObject<T> = { current: T };
  export type Context<T> = { Provider: FC<{ value: T; children?: ReactNode }>; Consumer: FC<{ children: (v: T) => ReactNode }> };
  export interface SyntheticEvent<T = Element> { currentTarget: T; target: EventTarget & Partial<T>; preventDefault(): void; stopPropagation(): void; }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T> { clientX: number; clientY: number; button: number; }
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> { target: T & { value: string; checked?: boolean; files?: FileList }; }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T> { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; }
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface DragEvent<T = Element> extends MouseEvent<T> { dataTransfer: DataTransfer; }
  export interface ClipboardEvent<T = Element> extends SyntheticEvent<T> { clipboardData: DataTransfer; }
  export interface HTMLAttributes<T> {
    children?: ReactNode; className?: string; style?: CSSProperties; id?: string; key?: any; ref?: any;
    onClick?: (e: MouseEvent<T>) => void; onChange?: (e: ChangeEvent<T>) => void;
    onKeyDown?: (e: KeyboardEvent<T>) => void; onKeyUp?: (e: KeyboardEvent<T>) => void;
    onSubmit?: (e: FormEvent<T>) => void; onFocus?: (e: SyntheticEvent<T>) => void; onBlur?: (e: SyntheticEvent<T>) => void;
    onDragOver?: (e: DragEvent<T>) => void; onDrop?: (e: DragEvent<T>) => void; onPaste?: (e: ClipboardEvent<T>) => void;
    onMouseEnter?: (e: MouseEvent<T>) => void; onMouseLeave?: (e: MouseEvent<T>) => void;
    placeholder?: string; disabled?: boolean; title?: string; tabIndex?: number; role?: string;
  }
  export function useState<S>(init: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  export function useCallback<T extends (...args: any[]) => any>(cb: T, deps: ReadonlyArray<unknown>): T;
  export function useMemo<T>(factory: () => T, deps: ReadonlyArray<unknown>): T;
  export function useRef<T>(init: T): MutableRefObject<T>;
  export function useRef<T>(init: T | null): RefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useContext<T>(ctx: Context<T>): T;
  export function createContext<T>(defaultValue: T): Context<T>;
  export function memo<T extends FC<any>>(c: T): T;
  export const Fragment: FC<{ children?: ReactNode }>;
  export const StrictMode: FC<{ children?: ReactNode }>;
  export const Suspense: FC<{ children?: ReactNode; fallback?: ReactNode }>;
  export default { useState, useEffect, useCallback, useMemo, useRef, useContext, createContext, Fragment, StrictMode, Suspense };
}
declare module 'react/jsx-runtime' {
  export function jsx(type: any, props: any, key?: string): any;
  export function jsxs(type: any, props: any, key?: string): any;
  export const Fragment: any;
}
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    div: import('react').HTMLAttributes<HTMLDivElement>;
    span: import('react').HTMLAttributes<HTMLSpanElement>;
    p: import('react').HTMLAttributes<HTMLParagraphElement>;
    h1: import('react').HTMLAttributes<HTMLHeadingElement>;
    h2: import('react').HTMLAttributes<HTMLHeadingElement>;
    h3: import('react').HTMLAttributes<HTMLHeadingElement>;
    h4: import('react').HTMLAttributes<HTMLHeadingElement>;
    button: import('react').HTMLAttributes<HTMLButtonElement> & { type?: string };
    input: import('react').HTMLAttributes<HTMLInputElement> & { type?: string; value?: string; checked?: boolean; multiple?: boolean; accept?: string; readOnly?: boolean };
    textarea: import('react').HTMLAttributes<HTMLTextAreaElement> & { rows?: number; value?: string; readOnly?: boolean };
    select: import('react').HTMLAttributes<HTMLSelectElement> & { value?: string; multiple?: boolean };
    option: import('react').HTMLAttributes<HTMLOptionElement> & { value?: string };
    form: import('react').HTMLAttributes<HTMLFormElement>;
    label: import('react').HTMLAttributes<HTMLLabelElement> & { htmlFor?: string };
    img: import('react').HTMLAttributes<HTMLImageElement> & { src?: string; alt?: string; width?: number | string; height?: number | string; loading?: string };
    a: import('react').HTMLAttributes<HTMLAnchorElement> & { href?: string; target?: string; rel?: string };
    ul: import('react').HTMLAttributes<HTMLUListElement>;
    ol: import('react').HTMLAttributes<HTMLOListElement>;
    li: import('react').HTMLAttributes<HTMLLIElement>;
    nav: import('react').HTMLAttributes<HTMLElement>;
    main: import('react').HTMLAttributes<HTMLElement>;
    section: import('react').HTMLAttributes<HTMLElement>;
    article: import('react').HTMLAttributes<HTMLElement>;
    header: import('react').HTMLAttributes<HTMLElement>;
    footer: import('react').HTMLAttributes<HTMLElement>;
    aside: import('react').HTMLAttributes<HTMLElement>;
    pre: import('react').HTMLAttributes<HTMLPreElement>;
    code: import('react').HTMLAttributes<HTMLElement>;
    strong: import('react').HTMLAttributes<HTMLElement>;
    em: import('react').HTMLAttributes<HTMLElement>;
    br: import('react').HTMLAttributes<HTMLBRElement>;
    hr: import('react').HTMLAttributes<HTMLHRElement>;
    table: import('react').HTMLAttributes<HTMLTableElement>;
    tr: import('react').HTMLAttributes<HTMLTableRowElement>;
    td: import('react').HTMLAttributes<HTMLTableCellElement> & { colSpan?: number };
    th: import('react').HTMLAttributes<HTMLTableCellElement> & { colSpan?: number };
    svg: import('react').HTMLAttributes<SVGSVGElement> & { viewBox?: string; fill?: string; stroke?: string; width?: string | number; height?: string | number };
    path: { d?: string; fill?: string; stroke?: string; strokeWidth?: string | number; strokeLinecap?: string; strokeLinejoin?: string };
    circle: { cx?: number; cy?: number; r?: number; fill?: string; stroke?: string };
    rect: { x?: number; y?: number; width?: number | string; height?: number | string; fill?: string; rx?: number };
    [tag: string]: any;
  }
}`;
          monaco.languages.typescript.typescriptDefaults.addExtraLib(reactDts, 'file:///node_modules/@types/react/index.d.ts');
          monaco.languages.typescript.javascriptDefaults.addExtraLib(reactDts, 'file:///node_modules/@types/react/index.d.ts');

          // ── Forge Dark Theme ─────────────────────────────────────────────
          monaco.editor.defineTheme('forge-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '4a4a6a', fontStyle: 'italic' },
              { token: 'keyword', foreground: 'a78bfa' },
              { token: 'keyword.control', foreground: 'c084fc' },
              { token: 'string', foreground: '86efac' },
              { token: 'number', foreground: 'fbbf24' },
              { token: 'type', foreground: '60a5fa' },
              { token: 'class', foreground: '34d399' },
              { token: 'function', foreground: 'f9a8d4' },
              { token: 'variable', foreground: 'e4e4e7' },
              { token: 'operator', foreground: '94a3b8' },
            ],
            colors: {
              'editor.background': '#09090b',
              'editor.foreground': '#e4e4e7',
              'editorLineNumber.foreground': '#3f3f46',
              'editorLineNumber.activeForeground': '#71717a',
              'editor.lineHighlightBackground': '#ffffff06',
              'editorCursor.foreground': '#8b5cf6',
              'editor.selectionBackground': '#8b5cf625',
              'editorIndentGuide.background1': '#ffffff08',
              'editorIndentGuide.activeBackground1': '#ffffff18',
              'editorGhostText.foreground': '#52527a',
              'editorSuggestWidget.background': '#141418',
              'editorSuggestWidget.border': '#2a2a3a',
              'editorSuggestWidget.selectedBackground': '#8b5cf620',
              'editorHoverWidget.background': '#141418',
              'editorHoverWidget.border': '#2a2a3a',
            },
          });
        }}
      />
    </div>
  );
};
