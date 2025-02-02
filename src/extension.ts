// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import ollama from 'ollama';
// import {Ollama} from 'ollama';

interface ChatMessage {
	command: string;
	text: string;
}

// const ollama = new Ollama({
// 	host: 'http://localhost:11434',
// 	headers: {
// 	"Authorization": "Bearer token123",
// 	"Custom-Header": "value"
// }
// });

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "fireship-ext" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand 
	// The commandId parameter must match the command field in package.json
	// Register a new VS Code command named 'fireship-ext.start'
	// This returns a disposable object that can be used to unregister the command later
	const disposable = vscode.commands.registerCommand('fireship-ext.start', () => {


			// Create a new webview panel instance
		const panel = vscode.window.createWebviewPanel(
			'deepChat',      // Internal identifier for the panel
			'DeepSeek Chat', // Title shown to the user in the UI
			vscode.ViewColumn.One,  // Display in the first (leftmost) editor column
			{
				enableScripts: true // Allow JavaScript to run in the webview
			}
		);
		
		panel.webview.html = getWebviewContent();

		panel.webview.onDidReceiveMessage(async (message: ChatMessage) => {
			if (message.command === 'chat') {
				const userPrompt = message.text;
				let reponseText = '';

				try {
					const streamResponse = await ollama.chat({
						model: 'deepseek-r1:7b',
						messages: [{ role: 'user', content: userPrompt }],
						stream: true
					});

					for await (const part of streamResponse) {
						reponseText += part.message.content;
						panel.webview.postMessage({command: 'chatResponse', text: reponseText}); // Post command 
					}
				} catch (error) {
					console.error(error);
				}

		
			}
		});
	});

	context.subscriptions.push(disposable);
}

function getWebviewContent() {
	return /*html*/`
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
				vscode.postMessage({command: 'chat', text}); /* Post command chat with value text, which will be caught be webview to response*/
			});
			window.addEventListener('message', event => {
				const {command, text} = event.data;
				if (command === 'chatResponse') {
					document.getElementById('response').innerText = text;
				}
			});
		</script>
	</body>`;
}

// This method is called when your extension is deactivated
export function deactivate() {}
