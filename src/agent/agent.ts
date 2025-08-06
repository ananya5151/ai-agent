// src/agent/agent.ts (QUOTA-FRIENDLY VERSION)
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionDeclaration, Part, Tool } from '@google/generative-ai';
import { sessionManager, ChatMessage } from '../memory/sessionManager';
import { vectorStore } from '../rag/vectorStore';
import { mathPlugin } from '../plugins/mathPlugin';
import { weatherPlugin } from '../plugins/weatherPlugin';

const API_KEY = process.env.GEMINI_API_KEY as string;
// Use the lighter model to save quota
const MODEL_NAME = 'gemini-1.5-flash'; // Much lighter than pro
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

let modelWithTools: any;
let finalModel: any;

// Initialize models with error handling
const initializeModels = () => {
  try {
    modelWithTools = genAI.getGenerativeModel({
      model: MODEL_NAME,
      tools: tools,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024, // Limit tokens to save quota
      }
    });

    finalModel = genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      generationConfig: {
        maxOutputTokens: 512, // Even more limited for final response
      }
    });
    
    console.log('✅ Models initialized with', MODEL_NAME);
  } catch (error) {
    console.error('❌ Failed to initialize models:', error);
  }
};

const getRecentHistory = (history: ChatMessage[], k: number = 1): ChatMessage[] => {
    // Reduce history to save tokens
    return history.slice(-k);
}

export const processMessage = async (sessionId: string, message: string): Promise<string> => {
  try {
    if (!modelWithTools || !finalModel) {
      initializeModels();
    }

    const history = sessionManager.getHistory(sessionId);
    
    // Simple plugin detection without using Gemini API
    let pluginOutput: string | null = null;
    
    // Basic intent detection (save API calls)
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('calculate') || lowerMessage.includes('math') || 
        /[\d\+\-\*\/\(\)\^\√]/.test(message)) {
      console.log('🔌 Detected math intent');
      // Extract math expression
      const mathExpression = message.match(/[\d\+\-\*\/\(\)\^\√\s]+/g)?.[0]?.trim();
      if (mathExpression) {
        try {
          pluginOutput = await mathPlugin.execute({ expression: mathExpression });
        } catch (error) {
          console.log('Math plugin failed, trying full message as expression');
          try {
            pluginOutput = await mathPlugin.execute({ expression: message.replace(/[^\d\+\-\*\/\(\)\^\√\s]/g, '') });
          } catch {
            pluginOutput = 'Could not parse mathematical expression';
          }
        }
      }
    }
    
    if (lowerMessage.includes('weather') || lowerMessage.includes('temperature') || 
        lowerMessage.includes('forecast')) {
      console.log('🔌 Detected weather intent');
      // Extract location
      const locationMatch = message.match(/(?:in|for|at)\s+([a-zA-Z\s,]+)/i);
      const location = locationMatch ? locationMatch[1].trim() : 'London'; // Default
      pluginOutput = await weatherPlugin.execute({ location });
    }

    // Get contextual information (but limit it to save tokens)
    const contextChunks = await vectorStore.findSimilar(message, 2); // Reduce to 2
    const recentHistory = getRecentHistory(history, 1); // Only last message

    // Build minimal system prompt to save tokens
    let systemPrompt = `You are a helpful AI assistant.`;
    
    if (pluginOutput) {
      systemPrompt += `\n\nTool result: ${pluginOutput}`;
    }

    if (contextChunks.length > 0) {
      systemPrompt += `\n\nRelevant info: ${contextChunks.slice(0, 1).join(' ')}`; // Only first chunk
    }

    if (recentHistory.length > 0) {
      systemPrompt += `\n\nPrevious: ${recentHistory[0].role}: ${recentHistory[0].parts[0].text.substring(0, 100)}`;
    }

    systemPrompt += `\n\nUser: ${message}\nAssistant:`;

    // Generate response with quota-friendly settings
    console.log('🧠 Generating response...');
    
    try {
      const finalResult = await finalModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
      });
      
      const finalResponse = finalResult.response.text();

      // Save to session memory
      sessionManager.addMessage(sessionId, { role: 'user', parts: [{ text: message }] });
      sessionManager.addMessage(sessionId, { role: 'model', parts: [{ text: finalResponse }] });

      return finalResponse;
      
    } catch (apiError: any) {
      if (apiError.status === 429) {
        // Quota exceeded fallback
        console.log('⚠️ API quota exceeded, using fallback response');
        
        if (pluginOutput) {
          return `I calculated that for you: ${pluginOutput}`;
        }
        
        if (contextChunks.length > 0) {
          return `Based on the available information: ${contextChunks[0].substring(0, 200)}...`;
        }
        
        return `I'm currently experiencing high usage. Please try again in a few minutes. Your message was: "${message}"`;
      }
      throw apiError;
    }

  } catch (error) {
    console.error('Error in processMessage:', error);
    
    // Fallback response when API is down
    if (message.toLowerCase().includes('math') || /[\d\+\-\*\/]/.test(message)) {
      try {
        const mathResult = await mathPlugin.execute({ expression: message.replace(/[^\d\+\-\*\/\(\)\^\√\s]/g, '') });
        return `Here's the math result: ${mathResult}`;
      } catch {
        return 'I can help with math, but I couldn\'t parse that expression. Try something like "2 + 2" or "15 * 7".';
      }
    }
    
    return `I'm experiencing technical difficulties right now. Please try again in a few minutes. (Error: API quota exceeded)`;
  }
};

// Initialize models on startup
initializeModels();