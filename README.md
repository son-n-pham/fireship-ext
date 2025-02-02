# DeepSeek VSCode Extension

A Visual Studio Code extension that integrates DeepSeek AI using Ollama for local, privacy-focused AI assistance.

## Overview

This extension demonstrates how to build a modern VSCode extension that leverages local AI models through Ollama. It showcases several important concepts in extension development:

1. WebView Integration
2. Message Passing Architecture
3. Streaming AI Responses
4. Local AI Model Integration

## Technical Architecture

### Core Components

#### 1. Extension Activation

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Registers the command that launches our extension
  const disposable = vscode.commands.registerCommand(
    'fireship-ext.start',
    () => {
      // Creates the WebView panel
      const panel = vscode.window.createWebviewPanel(
        'deepChat',
        'DeepSeek Chat',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
        }
      );
    }
  );
}
```

#### 2. Chat Response Handler

```typescript
async function handleChatResponse(
  panel: vscode.WebviewPanel,
  userPrompt: string
) {
  let responseText = '';

  try {
    const streamResponse = await ollama.chat({
      model: 'deepseek-r1:7b',
      messages: [{ role: 'user', content: userPrompt }],
      stream: true,
    });

    for await (const part of streamResponse) {
      responseText += part.message.content;
      panel.webview.postMessage({
        command: 'chatResponse',
        text: responseText,
      });
    }
  } catch (error) {
    console.error(error);
  }
}
```

### Key Implementation Details

1. **WebView Communication**

   - Uses a message-passing architecture between the extension and WebView
   - Implements bidirectional communication for sending prompts and receiving responses

2. **Streaming Response Handling**

   - Utilizes async iterators to handle streaming responses from Ollama
   - Updates the UI in real-time as responses are received

3. **User Interface**
   - Clean, minimal interface for text input and response display
   - Responsive design that adapts to the VSCode window

## Educational Value

This project serves as an excellent learning resource for:

1. **VSCode Extension Development**

   - Learn how to create and structure a VSCode extension
   - Understand the extension lifecycle and activation events
   - Master WebView integration and communication patterns

2. **AI Integration**

   - Implement local AI model integration using Ollama
   - Handle streaming responses effectively
   - Manage asynchronous communication with AI models

3. **Modern JavaScript/TypeScript**
   - Async/await patterns
   - Event-driven programming
   - TypeScript interfaces and type safety

## Prerequisites

1. Visual Studio Code
2. Node.js and npm
3. Ollama installed locally with the DeepSeek model

```bash
ollama pull deepseek-r1:7b
```

## Setup and Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Start Ollama server locally
4. Press F5 in VSCode to start debugging the extension

## How It Works

1. The extension creates a WebView panel when activated
2. User enters a prompt in the text area
3. The prompt is sent to the Ollama server via message passing
4. Responses are streamed back and displayed in real-time
5. All processing happens locally, ensuring privacy

## Code Organization

The code follows a clear, modular structure:

1. **Import Section** - Package dependencies
2. **Types Section** - TypeScript interfaces
3. **Chat Response Handler** - AI interaction logic
4. **WebView Content** - UI implementation
5. **Extension Lifecycle** - Activation and deactivation handlers

This organization makes the code maintainable and educational, serving as a reference for similar projects.

## Contributing

Feel free to contribute by:

1. Creating issues for bugs or feature requests
2. Submitting pull requests with improvements
3. Adding documentation or examples

## License

MIT License - Feel free to use this code for learning and building your own extensions!
