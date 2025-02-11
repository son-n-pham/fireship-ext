import * as vscode from "vscode";
import ollama from "ollama";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load env variables from .env file
dotenv.config();

// Media type definitions
type MediaType = "image" | "video" | "audio" | "text";
type ModelProvider = "ollama" | "gemini" | "vscode-lm"; // Add 'vscode-lm'
type GeminiModelKey = "gemini-2.0-flash" | "gemini-2.0-flash-lite";
type OllamaModelKey = "deepseek-r1:7b";
type ModelKey = GeminiModelKey | OllamaModelKey;

interface ModelOptionsType {
  gemini: { [K in GeminiModelKey]: ModelConfig };
  ollama: { [K in OllamaModelKey]: ModelConfig };
}

interface ChatMessage {
  command: string;
  text: string;
  model?: ModelProvider;
  modelKey?: ModelKey;
  mediaData?: string;
  mediaType?: MediaType;
}

interface ModelConfig {
  name: string;
  modelCode: string;
  supportedMedia: MediaType[];
  maxInputSize?: number; // in MB
  sendRequest?: any;
  countTokens?: any;
}

// Updated model options to include VS Code Language Models
const modelOptions: ModelOptionsType = {
  gemini: {
    "gemini-2.0-flash": {
      name: "Gemini 2.0 Flash",
      modelCode: "gemini-2.0-flash-001",
      supportedMedia: ["image", "video", "audio", "text"],
      supportsGeneration: true,
      description: "Advanced multimodal analysis & generation",
      maxInputSize: 100, // MB
    } as ModelConfig,
    "gemini-2.0-flash-lite": {
      name: "Gemini 2.0 Flash Lite",
      modelCode: "gemini-2.0-flash-lite-preview-02-05",
      supportedMedia: ["image", "text"],
      supportsGeneration: false,
      description: "Fast text and image analysis",
      maxInputSize: 20,
    } as ModelConfig,
  },
  ollama: {
    "deepseek-r1:7b": {
      name: "DeepSeek 7B",
      modelCode: "deepseek-r1:7b",
      supportedMedia: ["text"],
      supportsGeneration: false,
      description: "Local text generation",
    } as ModelConfig,
  },
};

// Media processing utilities - Keep your existing MediaProcessor class
class MediaProcessor {
  static async validateMedia(
    file: File,
    config: ModelConfig
  ): Promise<boolean> {
    const mediaType = this.detectMediaType(file);
    if (!config.supportedMedia.includes(mediaType)) {
      throw new Error(`Media type ${mediaType} not supported by this model`);
    }
    if (file.size > (config.maxInputSize || 20) * 1024 * 1024) {
      throw new Error(`File size exceeds model's maximum input size`);
    }
    return true;
  }

  static detectMediaType(file: File): MediaType {
    if (file.type.startsWith("image/")) {
      return "image";
    }
    if (file.type.startsWith("video/")) {
      return "video";
    }
    if (file.type.startsWith("audio/")) {
      return "audio";
    }
    return "text";
  }

  static async processMediaToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

// Enhanced Gemini handler for multimodal content
async function handleGeminiMultimodalRequest(
  panel: vscode.WebviewPanel,
  userPrompt: string,
  mediaData: string,
  mediaType: MediaType,
  modelConfig: ModelConfig
) {
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: modelConfig.modelCode });

    // Extract MIME type and base64 data from the data URL
    const [metadata, base64Data] = mediaData.split(",", 2);
    const mimeType = metadata.match(/data:(.*?);base64/)?.[1] || "";
    if (!mimeType) {
      throw new Error("Unable to extract MIME type from media data");
    }

    const mediaPart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    const generationConfig = {
      temperature: 0.4,
      topK: 32,
      topP: 1,
      maxOutputTokens: 2048,
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }, mediaPart] }],
      generationConfig,
    });

    const response = result.response.text();
    try {
      panel.webview.postMessage({
        command: "chatResponse",
        text: response,
        mediaType: mediaType,
      });
    } catch (e) {
      console.warn("Failed to post message; webview may be disposed.");
    }
  } catch (error: any) {
    console.error("Multimodal processing error:", error);
    try {
      panel.webview.postMessage({
        command: "error",
        text: `Error processing ${mediaType}: ${error.message}`,
      });
    } catch (e) {
      console.warn("Failed to post error message; webview may be disposed.");
    }
  }
}

// Updated Gemini text handler
async function handleGeminiChatResponse(
  panel: vscode.WebviewPanel,
  userPrompt: string,
  modelConfig: ModelConfig
) {
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: modelConfig.modelCode });

    // Wrap the prompt text in an object with a 'text' property.
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 1024,
      },
    });

    const response = result.response.text();
    panel.webview.postMessage({ command: "chatResponse", text: response });
  } catch (error: any) {
    console.error("Text processing error:", error);
    panel.webview.postMessage({
      command: "error",
      text: `Error: ${error.message}`,
    });
  }
}

// Updated Ollama handler (unchanged but with error handling)
async function handleOllamaChatResponse(
  panel: vscode.WebviewPanel,
  userPrompt: string,
  modelConfig: ModelConfig
) {
  let responseText = "";
  try {
    const streamResponse = await ollama.chat({
      model: modelConfig.modelCode,
      messages: [{ role: "user", content: userPrompt }],
      stream: true,
    });

    for await (const part of streamResponse) {
      responseText += part.message.content;
      panel.webview.postMessage({
        command: "chatResponse",
        text: responseText,
      });
    }
  } catch (error: any) {
    console.error("Ollama processing error:", error);
    panel.webview.postMessage({
      command: "error",
      text: `Error: ${error.message}`,
    });
  }
}

// Update the 'chat' message handler to incorporate VS Code LM
async function handleChatMessage(
  panel: vscode.WebviewPanel,
  message: ChatMessage
) {
  let modelConfig: ModelConfig | undefined;
  if (message.model === "vscode-lm") {
    // Attempt to retrieve vsCodeLmModelSelector from extension settings
    const vsCodeLmModelSelector = vscode.workspace
      .getConfiguration("fireship-ext")
      .get("vsCodeLmModelSelector") as
      | vscode.LanguageModelChatSelector
      | undefined;
    if (!vsCodeLmModelSelector) {
      panel.webview.postMessage({
        command: "error",
        text: "Error: VS Code Language Model API is selected but fireship-ext.vsCodeLmModelSelector is not configured in settings.",
      });
      return;
    }
    try {
      // Attempt to activate language model to prompt user the approve request and handle errors

      const models = await vscode.lm.selectChatModels(vsCodeLmModelSelector);

      if (!models || models.length === 0) {
        throw new Error(
          `No VS Code Language Models found matching selector ${JSON.stringify(
            vsCodeLmModelSelector
          )}`
        );
      }

      const selectedModel = models[0];

      const response = await selectedModel.sendRequest(
        [vscode.LanguageModelChatMessage.User(message.text)],
        {},
        new vscode.CancellationTokenSource().token
      );

      let result = "";
      for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
          result += chunk.value;
        }
      }
      panel.webview.postMessage({ command: "chatResponse", text: result });
      return;
    } catch (error: any) {
      console.error("VS Code LM API processing error:", error);
      panel.webview.postMessage({
        command: "error",
        text: `Error: ${error.message}`,
      });
      return;
    }
  } else if (message.model === "gemini") {
    modelConfig = modelOptions.gemini[message.modelKey as GeminiModelKey];
  } else if (message.model === "ollama") {
    modelConfig = modelOptions.ollama[message.modelKey as OllamaModelKey];
  } else {
    console.error("Unsupported model provider:", message.model);
    panel.webview.postMessage({
      command: "error",
      text: `Unsupported model provider: ${message.model}`,
    });
    return;
  }

  try {
    if (
      message.mediaData &&
      message.mediaType &&
      modelConfig?.supportedMedia?.includes(message.mediaType)
    ) {
      await handleGeminiMultimodalRequest(
        panel,
        message.text,
        message.mediaData,
        message.mediaType,
        modelConfig
      );
    } else {
      await handleGeminiChatResponse(panel, message.text, modelConfig);
    }
  } catch (error: any) {
    panel.webview.postMessage({
      command: "error",
      text: `Error: ${error.message}`,
    });
  }
}

// Updated WebView content with enhanced UI and debugging logs
function getWebviewContent() {
  return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Assistant</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 1rem;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                #prompt {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                #response {
                    border: 1px solid #ccc;
                    margin-top: 1rem;
                    padding: 1rem;
                    border-radius: 4px;
                    min-height: 100px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .media-preview {
                    max-width: 300px;
                    max-height: 300px;
                    margin-top: 1rem;
                }
                .error {
                    color: red;
                    margin-top: 0.5rem;
                }
                .controls {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }
                button {
                    padding: 8px 16px;
                    background-color: #0078D4;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                button:hover {
                    background-color: #106EBE;
                }
                .media-controls {
                    margin-top: 1rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>AI Assistant</h2>

        <div class="controls">
          <label for="modelSelect">Model:</label>
          <select id="modelSelect">
            <optgroup label="VS Code Language Model API (Experimental)">
                <option value="vscode-lm">VS Code Language Model</option>
            </optgroup>
            <optgroup label="Gemini">
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
            </optgroup>
            <optgroup label="Ollama">
                <option value="deepseek-r1:7b">DeepSeek 7B</option>
            </optgroup>
          </select>
        </div>

                <div class="media-controls">
                    <input type="file" id="mediaInput" accept="image/*, video/*, audio/*" />
                    <div id="mediaPreview"></div>
                </div>

                <textarea id="prompt" rows="4" placeholder="Enter your prompt here..."></textarea>
                <button id="askBtn">Send</button>
                <div id="response"></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const modelSelect = document.getElementById('modelSelect');
                const askBtn = document.getElementById('askBtn');
                const responseElement = document.getElementById('response');
                const mediaInput = document.getElementById('mediaInput');
                const mediaPreview = document.getElementById('mediaPreview');

                let currentMediaData = null;
                let currentMediaType = null;

                // Initialize model select with grouped options by provider
                function populateModelSelect() {
                    modelSelect.innerHTML = '';
                    const modelOptions = {
                        'vscode-lm': {
                            'vscode-lm': {
                                name: 'VS Code Language Model',
                                supportedMedia: ['text']
                            }
                        },
                        'gemini': {
                            'gemini-2.0-flash': {
                                name: 'Gemini 2.0 Flash',
                                supportedMedia: ['image', 'video', 'audio', 'text']
                            },
                            'gemini-2.0-flash-lite': {
                                name: 'Gemini 2.0 Flash Lite',
                                supportedMedia: ['image', 'text']
                            }
                        },
                        'ollama': {
                            'deepseek-r1:7b': {
                                name: 'DeepSeek 7B',
                                supportedMedia: ['text']
                            }
                        }
                    };
                    Object.keys(modelOptions).forEach(provider => {
                        const optGroup = document.createElement('optgroup');
                        optGroup.label = provider.charAt(0).toUpperCase() + provider.slice(1);
                        Object.keys(modelOptions[provider]).forEach(key => {
                            const option = modelOptions[provider][key];
                            const optionElem = document.createElement('option');
                            optionElem.value = JSON.stringify({ provider, modelKey: key, supportedMedia: option.supportedMedia });
                            optionElem.text = option.name;
                            optGroup.appendChild(optionElem);
                        });
                        modelSelect.appendChild(optGroup);
                    });
                }

                populateModelSelect(); // Populate on startup

                mediaInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            currentMediaData = e.target.result;
                            currentMediaType = file.type.split('/')[0];
                            mediaPreview.innerHTML = '';
                            if (currentMediaType === 'image') {
                                const img = document.createElement('img');
                                img.src = currentMediaData;
                                img.className = 'media-preview';
                                mediaPreview.appendChild(img);
                            } else if (currentMediaType === 'video') {
                                const video = document.createElement('video');
                                video.src = currentMediaData;
                                video.className = 'media-preview';
                                video.controls = true;
                                mediaPreview.appendChild(video);
                            } else if (currentMediaType === 'audio') {
                                const audio = document.createElement('audio');
                                audio.src = currentMediaData;
                                audio.controls = true;
                                mediaPreview.appendChild(audio);
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });

                // Send message handling with button text update and debug logs
                askBtn.addEventListener('click', () => {
                    console.log('Send button clicked.');
                    askBtn.textContent = 'Sending';
                    askBtn.disabled = true;

                    const text = document.getElementById('prompt').value;
                    const selected = JSON.parse(modelSelect.value);
                    const { provider, modelKey, supportedMedia } = selected;

                    let message = { 
                        command: 'chat', 
                        text
                    };

                    if (currentMediaData && supportedMedia.includes(currentMediaType)) {
                        message.mediaData = currentMediaData;
                        message.mediaType = currentMediaType;
                    }
                    
                    if (provider === 'vscode-lm') {
                        message.model = 'vscode-lm';
                    } else {
                        message.model = provider;
                        message.modelKey = modelKey;
                    }
                    
                    console.log('Posting message:', message);
                    vscode.postMessage(message);
                });

                window.addEventListener('message', event => {
                    const { command, text } = event.data;
                    const responseElement = document.getElementById('response');
                    const askBtn = document.getElementById('askBtn');
                    askBtn.textContent = 'Send';
                    askBtn.disabled = false;

                    if (command === 'chatResponse') {
                        responseElement.innerText = text;
                        responseElement.className = '';
                    } else if (command === 'error') {
                        responseElement.innerText = text;
                        responseElement.className = 'error';
                    }
                });

                // Update UI based on model selection
                modelSelect.addEventListener('change', (event) => {
                    const selected = JSON.parse(event.target.value);
                    mediaInput.style.display =
                        selected.supportedMedia.length > 1 ? 'block' : 'none';
                });
            </script>
        </body>
        </html>
        `;
}

// Extension activation
export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "fireship-ext" is now active!');

  let disposable = vscode.commands.registerCommand("fireship-ext.start", () => {
    const panel = vscode.window.createWebviewPanel(
      "aiAssistant",
      "AI Assistant",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "media")),
        ],
      }
    );

    panel.webview.html = getWebviewContent();

    panel.webview.onDidReceiveMessage(async (message: ChatMessage) => {
      console.log("Received message from webview:", message);
      if (message.command === "chat") {
        let modelConfig: ModelConfig | undefined;
        if (message.model === "vscode-lm") {
          const vsCodeLmModelSelector = vscode.workspace
            .getConfiguration("fireship-ext")
            .get("roo-cline.vsCodeLmModelSelector") as
            | vscode.LanguageModelChatSelector
            | undefined; //  This allows for dynamic access of extension's settings
          if (!vsCodeLmModelSelector) {
            panel.webview.postMessage({
              command: "error",
              text: "Error: VS Code Language Model API is selected but fireship-ext.vsCodeLmModelSelector is not configured in settings.",
            });
            return;
          }

          try {
            const models = await vscode.lm.selectChatModels(
              vsCodeLmModelSelector
            );

            if (!models || models.length === 0) {
              throw new Error(
                `No VS Code Language Models found matching selector ${JSON.stringify(
                  vsCodeLmModelSelector
                )}`
              );
            }

            const selectedModel = models[0];
            console.log(`Using VS Code LM Model: ${selectedModel.id}`);

            panel.webview.postMessage({
              command: "chatResponse",
              text: "Result from VS Code LM API",
            });
          } catch (err: any) {
            console.error("VS Code LM API processing error:", err);
            panel.webview.postMessage({
              command: "error",
              text: `Error: VS Code LM API Error: ${err.message}`,
            });
          }

          return;
        } else if (message.model === "gemini") {
          modelConfig = modelOptions.gemini[message.modelKey as GeminiModelKey];
        } else if (message.model === "ollama") {
          modelConfig = modelOptions.ollama[message.modelKey as OllamaModelKey];
        } else {
          throw new Error(`Unsupported model provider: ${message.model}`);
        }

        try {
          if (
            message.mediaData &&
            message.mediaType &&
            modelConfig?.supportedMedia?.includes(message.mediaType)
          ) {
            await handleGeminiMultimodalRequest(
              panel,
              message.text,
              message.mediaData,
              message.mediaType,
              modelConfig
            );
          } else {
            await handleGeminiChatResponse(panel, message.text, modelConfig);
          }
        } catch (error: any) {
          panel.webview.postMessage({
            command: "error",
            text: `Error: ${error.message}`,
          });
        }
      }
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
