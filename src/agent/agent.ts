import OpenAI from 'openai';
import { sessionManager, ChatMessage } from '../memory/sessionManager';
import { vectorStore } from '../rag/vectorStore';
import { mathPlugin } from '../plugins/mathPlugin';
import { weatherPlugin } from '../plugins/weatherPlugin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Use a cheaper and faster model for the main logic
const CHAT_MODEL = 'gpt-3.5-turbo';

const plugins = {
  [mathPlugin.name]: mathPlugin,
  [weatherPlugin.name]: weatherPlugin,
};

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: 'function', function: mathPlugin },
  { type: 'function', function: weatherPlugin },
];

const getRecentHistory = (history: ChatMessage[], k: number = 2): OpenAI.Chat.ChatCompletionMessageParam[] => {
    return history.slice(-k).map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts[0].text,
    }));
}

export const processMessage = async (sessionId: string, message: string): Promise<string> => {
  try {
    const history = sessionManager.getHistory(sessionId);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...getRecentHistory(history),
      { role: 'user', content: message }
    ];

    console.log('🧠 Determining if a tool is needed...');
    const initialResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
    });

    const responseMessage = initialResponse.choices[0].message;
    messages.push(responseMessage);

    const toolCalls = responseMessage.tool_calls;
    if (toolCalls) {
      console.log(`Tool call detected: ${toolCalls.map(t => t.function.name).join(', ')}`);
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        const plugin = plugins[functionName];
        
        if (plugin) {
          const functionResponse = await plugin.execute(functionArgs as any);
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: functionResponse,
          });
        }
      }
    }

    console.log('📚 Retrieving contextual documents...');
    const contextChunks = await vectorStore.findSimilar(message);

    const systemMessage = `You are a helpful and efficient AI Agent.
    - Answer the user's question based on the provided context, chat history, and tool output.
    - Be concise and clear.
    - If you use a tool, briefly mention how you got the information. For example: "Using my weather tool, I found that..."
    ---
    [CONTEXT FROM DOCUMENTS]:
    ${contextChunks.length > 0 ? contextChunks.map(c => `- ${c}`).join('\n') : 'No relevant documents were found.'}
    ---`;

    messages.unshift({ role: 'system', content: systemMessage });

    console.log('💬 Generating final response...');
    const finalResponse = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
    });
    
    const finalResponseMessage = finalResponse.choices[0].message.content || "I'm sorry, I seem to be having trouble formulating a response. Please try again.";

    sessionManager.addMessage(sessionId, { role: 'user', parts: [{ text: message }] });
    sessionManager.addMessage(sessionId, { role: 'model', parts: [{ text: finalResponseMessage }] });

    return finalResponseMessage;
  } catch (error: any) {
    console.error('❌ Error in processMessage:', error);
    if (error.status === 429) {
      return "I'm experiencing a high volume of requests right now. Please try again in a moment.";
    }
    return "I've encountered an unexpected error. Please try your request again.";
  }
};