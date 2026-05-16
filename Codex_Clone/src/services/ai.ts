import { Body, getClient, ResponseType } from '@tauri-apps/api/http';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  stream?: boolean;
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions';
const MAX_CONTEXT_TOKENS = 10000; // Simplified token limit for local models

export class AIService {
  static trimContext(messages: Message[]): Message[] {
    // Basic implementation: keep system message + last N messages
    // Real implementation would use a tokenizer
    if (messages.length <= 10) return messages;
    
    const systemMessage = messages.find(m => m.role === 'system');
    const recentMessages = messages.slice(-10);
    
    return systemMessage ? [systemMessage, ...recentMessages] : recentMessages;
  }

  static async chat(
    messages: Message[],
    options: ChatOptions = {},
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const trimmedMessages = this.trimContext(messages);
    const { model = 'lmstudio-community/qwen2.5-coder-7b-instruct-mlx', temperature = 0.7, stream = true } = options;

    try {
      console.log('AI Request:', { endpoint: DEFAULT_ENDPOINT, model, messages: trimmedMessages });
      
      const client = await getClient();
      const response = await client.post(DEFAULT_ENDPOINT, Body.json({
        model,
        messages: trimmedMessages,
        temperature,
        stream: false, // Tauri HTTP client handles streaming differently, starting with non-stream for stability
      }), {
        responseType: ResponseType.JSON
      });

      console.log('AI Response:', response);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = response.data as any;
      const content = data.choices[0].message.content;
      
      if (onChunk) {
        onChunk(content);
      }
      
      return content;
    } catch (error) {
      console.error('Detailed AI Service Error:', error);
      throw error;
    }
  }
}
