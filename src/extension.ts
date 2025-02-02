// Import Section
import * as vscode from 'vscode';
import ollama from 'ollama';

// Types Section
interface ChatMessage {
  command: string;
  text: string;
}

// Chat Response Handler Section
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

// WebView Content Section
function getWebviewContent() {
  return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 1rem}
        #prompt {width: 100%; box-sizing: border-box;}
        #response {border: 1px solid #ccc; margin-top: 1rem; padding: 0.5rem;}
      </style>
    </head>
    <body>
      <h2>Deep Seek VS Code Extension</h2>
      <textarea id="prompt" rows="3" placeholder="Ask me anything..."></textarea><br/>
      <button id="askBtn">Ask</button>
      <div id="response"></div>

      <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('askBtn').addEventListener('click', () => {
          const text = document.getElementById('prompt').value;
          vscode.postMessage({command: 'chat', text});
        });
        
        window.addEventListener('message', event => {
          const {command, text} = event.data;
          if (command === 'chatResponse') {
            document.getElementById('response').innerText = text;
          }
        });
      </script>
    </body>
    </html>`;
}

// Extension Activation Section
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "fireship-ext" is now active!');

  const disposable = vscode.commands.registerCommand(
    'fireship-ext.start',
    () => {
      const panel = vscode.window.createWebviewPanel(
        'deepChat',
        'DeepSeek Chat by Son Pham',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
        }
      );

      panel.webview.html = getWebviewContent();

      panel.webview.onDidReceiveMessage(async (message: ChatMessage) => {
        if (message.command === 'chat') {
          await handleChatResponse(panel, message.text);
        }
      });
    }
  );

  context.subscriptions.push(disposable);
}

// Extension Deactivation Section
export function deactivate() {}
