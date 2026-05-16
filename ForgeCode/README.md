# 🛡️ ForgeCode

**Stateful Agentic Execution System**

ForgeCode is a local-first, AI-powered IDE designed for elite software engineering. It transitions beyond simple code editing into an autonomous, stateful agentic system with local LLM orchestration and real-time repository-scale reasoning.

## 🚀 Key Features

### 1. Stateful Agentic Runtime
*   **Autonomous Loops**: Implemented a "Plan → Execute → Verify" state machine in Rust (`runtime.rs`).
*   **Thread-Safe Backend**: High-performance async Tauri orchestration with robust `Send/Sync` management.
*   **Semantic Memory**: Context-aware reasoning powered by **LanceDB** vector storage.

### 2. Advanced AI Editor
*   **Inline Copilot**: High-performance inline suggestions via Monaco Editor using debounced (350ms) FIM (Fill-In-Middle) logic.
*   **Syntax-Guarded Patching**: `tree-sitter` based AST-aware patcher that performs dry-run validations on AI-generated code.
*   **Real-Time Sync**: Recursive file watching (`notify`) ensures the UI and AI context are always synchronized with the disk.

### 3. Premium UX: The Architect Dashboard
*   **Event-Driven UI**: Real-time streaming of agent reasoning and multi-step task progress.
*   **Harness Philosophy**: Optimized for 16GB RAM, ensuring smooth performance for local models like Qwen Coder.
*   **Integrated Tooling**: Built-in Prettier formatting and resolution-independent SVG branding.

## 🛠️ Technology Stack
- **Backend**: Rust, Tauri, LanceDB, tree-sitter, notify
- **Frontend**: React, TypeScript, Monaco Editor, Framer Motion, Lucide React
- **Local AI**: LM Studio / Ollama (Qwen2.5-Coder recommended)

## 🏁 Getting Started
1. Install dependencies: `npm install`
2. Run in development mode: `npm run tauri dev`
3. Ensure LM Studio or Ollama is running locally at the configured endpoint.

---
*Built for speed, reliability, and autonomous productivity.*
