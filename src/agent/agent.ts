import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionDeclaration, Part, Tool } from '@google/generative-ai';
import { sessionManager, ChatMessage } from '../memory/sessionManager';
import { vectorStore } from '../rag/vectorStore';
import { mathPlugin } from '../plugins/mathPlugin';
import { weatherPlugin } from '../plugins/weatherPlugin';

const API_KEY = process.env.GEMINI_API_KEY as string;
const MODEL_NAME = 'gemini-1.5-pro-latest';
const genAI = new GoogleGenerativeAI(API_KEY);

const plugins = {
  [mathPlugin.name]: mathPlugin,
  [weatherPlugin.name]: weatherPlugin,
};

const tools: Tool[] = [{
  functionDeclarations: [
    mathPlugin as FunctionDeclaration,
    weatherPlugin as FunctionDeclaration,
  ],
}];

const modelWithTools = genAI.getGenerativeModel({
  model: MODEL_NAME,
  tools: tools,
});

const getRecentHistory = (history: ChatMessage[], k: number = 2): ChatMessage[] => {
    return history.slice(-k);
}

export const processMessage = async (sessionId: string, message: string): Promise<string> => {
  const history = sessionManager.getHistory(sessionId);
  const chat = modelWithTools.startChat({ history });
  const result = await chat.sendMessage(message);
  const response = result.response;
  const fnCall = response.functionCalls()?.[0];

  let pluginOutput: string | null = null;
  if (fnCall) {
    const plugin = plugins[fnCall.name];
    if (plugin) {
      console.log(`🔌 Calling plugin: ${fnCall.name} with args:`, fnCall.args);
      // AFTER
    pluginOutput = await plugin.execute(fnCall.args as any);
    }
  }

  const contextChunks = await vectorStore.findSimilar(message);
  const recentHistory = getRecentHistory(history);

  const systemPrompt = `You are a helpful AI Agent. Your responses should be concise and helpful.
  1. If you have output from a tool, use it to answer the user's question. State that you used a tool.
  2. If you have context from documents, use it to answer the user's question.
  3. If the question is conversational, use the chat history to continue the conversation.
  4. Do not mention the internal context or tool system unless the user asks about it.
  ---
  ${pluginOutput ? `[TOOL OUTPUT]:\n${pluginOutput}\n---` : ''}
  [CONTEXT FROM DOCUMENTS]:
  ${contextChunks.length > 0 ? contextChunks.map(c => `- ${c}`).join('\n') : 'No relevant documents found.'}
  ---
  [RECENT CONVERSATION HISTORY]:
  ${recentHistory.length > 0 ? recentHistory.map(h => `${h.role}: ${h.parts[0].text}`).join('\n') : 'No recent history.'}
  ---`;

  const finalPromptParts: Part[] = [
      {text: systemPrompt},
      {text: `USER'S CURRENT MESSAGE: ${message}`}
  ];
  
  const finalModel = genAI.getGenerativeModel({ model: MODEL_NAME });
  const finalResult = await finalModel.generateContent({contents: [{role: 'user', parts: finalPromptParts}]});
  
  const finalResponse = finalResult.response.text();

  sessionManager.addMessage(sessionId, { role: 'user', parts: [{ text: message }] });
  sessionManager.addMessage(sessionId, { role: 'model', parts: [{ text: finalResponse }] });

  return finalResponse;
};