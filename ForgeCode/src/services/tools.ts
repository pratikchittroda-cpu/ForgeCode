import { invoke } from '@tauri-apps/api/tauri';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'list_dir',
    description: 'List contents of a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to list' }
      },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing one',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file' },
        content: { type: 'string', description: 'The content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'run_command',
    description: 'Run a shell command and return the output',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run' }
      },
      required: ['command']
    }
  },
  {
    name: 'replace_content',
    description: 'Replace a specific block of text in a file with new content',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file' },
        target: { type: 'string', description: 'The exact text to find and replace' },
        replacement: { type: 'string', description: 'The new text to insert' }
      },
      required: ['path', 'target', 'replacement']
    }
  },
  {
    name: 'grep_search',
    description: 'Search for a string in files',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The string to search for' },
        path: { type: 'string', description: 'The path to search in' }
      },
      required: ['query', 'path']
    }
  },
  {
    name: 'get_symbols',
    description: 'Get a list of functions, classes, and variables defined in a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'git_status',
    description: 'Get the current git status (modified files, etc.)',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'read_file_lines',
    description: 'Read a specific range of lines from a file (useful for large files)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file' },
        start: { type: 'number', description: 'Starting line number (1-indexed)' },
        end: { type: 'number', description: 'Ending line number' }
      },
      required: ['path', 'start', 'end']
    }
  },
  {
    name: 'search_web',
    description: 'Search the web for documentation, libraries, or error solutions',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  }
];

export async function executeTool(name: string, args: any, projectPath: string | null): Promise<string> {
  const resolvePath = (p: string) => {
    if (!projectPath || p.startsWith('/')) return p;
    return `${projectPath}/${p}`;
  };

  switch (name) {
    case 'list_dir':
      return JSON.stringify(await invoke('list_project_files', { path: resolvePath(args.path) }));
    case 'read_file':
      return await invoke('read_project_file', { path: resolvePath(args.path) });
    case 'write_file':
      return await invoke('apply_file_patch', { path: resolvePath(args.path), content: args.content });
    case 'replace_content':
      return await invoke('replace_in_file', { path: resolvePath(args.path), target: args.target, replacement: args.replacement });
    case 'run_command':
      return await invoke('run_terminal_sync', { command: args.command });
    case 'grep_search':
      return JSON.stringify(await invoke('search_in_files', { path: resolvePath(args.path), query: args.query }));
    case 'get_symbols':
      return JSON.stringify(await invoke('get_symbols_in_file', { path: resolvePath(args.path) }));
    case 'git_status':
      return JSON.stringify(await invoke('get_git_status', { path: projectPath }));
    case 'read_file_lines':
      return await invoke('read_file_range', { path: resolvePath(args.path), start: args.start, end: args.end });
    case 'search_web':
      return await invoke('web_search', { query: args.query });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
