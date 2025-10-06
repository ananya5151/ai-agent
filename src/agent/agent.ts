import { GoogleGenerativeAI } from '@google/generative-ai';
import { sessionManager, ChatMessage } from '../memory/sessionManager.js';
import { vectorStore } from '../rag/vectorStore.js';
import { mathPlugin } from '../plugins/mathPlugin.js';
import { weatherPlugin } from '../plugins/weatherPlugin.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Use Gemini model for chat (with runtime fallback on 404)
// Keep the model list tight to avoid 404s on unsupported ids for v1beta
const PREFERRED_MODELS = ['gemini-pro-latest'];

// Simple global cooldown to avoid hammering the API during free-tier rate limits
let globalRateLimitUntil = 0;

async function generateWithModelFallback(
  genAI: any,
  options: { tools: any; systemInstruction?: string; contents: any[]; generationConfig?: any }
) {
  let lastErr: any;
  for (const modelId of PREFERRED_MODELS) {
    let hasRetriedOn429 = false;
    const mdl = genAI.getGenerativeModel({
      model: modelId,
      tools: options.tools,
      systemInstruction: options.systemInstruction,
    } as any);

    while (true) {
      try {
        // If we're within a global cooldown window, surface a rate-limit style error
        if (Date.now() < globalRateLimitUntil) {
          const remainingMs = globalRateLimitUntil - Date.now();
          const err: any = new Error('Backoff due to previous rate limit');
          err.status = 429;
          err.errorDetails = [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: `${Math.ceil(remainingMs / 1000)}s` }];
          throw err;
        }
        const res = await (mdl as any).generateContent({
          contents: options.contents,
          generationConfig: options.generationConfig,
        });
        console.log(`🧩 Used model: ${modelId}`);
        return res;
      } catch (err: any) {
        const status = err?.status;
        lastErr = err;

        // 404: model not available for this API version/method — try next model
        if (status === 404) {
          console.warn(`Model ${modelId} not available. Trying next...`);
          break; // break inner while, continue outer for-loop
        }

        // 429: rate limited — honor RetryInfo once, then try next model
        if (status === 429) {
          if (!hasRetriedOn429) {
            hasRetriedOn429 = true;

            // Extract retry delay from errorDetails if present
            let retryMs = 10_000; // default 10s
            try {
              const details: any[] = Array.isArray(err?.errorDetails) ? err.errorDetails : [];
              const retryInfo = details.find((d: any) => d?.['@type']?.includes('RetryInfo'));
              if (retryInfo?.retryDelay) {
                const match = String(retryInfo.retryDelay).match(/(\d+)(?:\.(\d+))?s/);
                if (match) {
                  const secs = parseInt(match[1] || '0', 10);
                  const frac = parseInt(match[2] || '0', 10);
                  retryMs = secs * 1000 + Math.round(frac / Math.pow(10, String(frac).length) * 1000);
                }
              }
            } catch {
              // ignore parsing issues, keep default
            }

            // Cap retry to fit within server 20s timeout budget
            retryMs = Math.min(retryMs, 7000);
            globalRateLimitUntil = Date.now() + retryMs;
            console.warn(`Rate limited on ${modelId}. Retrying once in ~${retryMs}ms...`);
            await new Promise((r) => setTimeout(r, retryMs));
            continue; // retry same model once
          }

          // On repeated 429 within the same minute, respect cooldown and bail to next model (if any)
          globalRateLimitUntil = Math.max(globalRateLimitUntil, Date.now() + 5000);
          console.warn(`Rate limited again on ${modelId}. Trying next model if available...`);
          break; // move to next preferred model
        }

        // Other errors: rethrow unless there's another model to try
        throw err;
      }
    }
  }
  throw lastErr;
}

const plugins = {
  [mathPlugin.name]: mathPlugin,
  [weatherPlugin.name]: weatherPlugin,
};

// Convert session history to Gemini message format: role and parts
const getRecentHistory = (history: ChatMessage[], k: number = 4) => {
  return history.slice(-k).map(msg => ({ role: msg.role === 'model' ? 'model' : 'user', parts: [{ text: msg.parts[0].text }] }));
};

// Convert plugin metadata into Gemini functionDeclarations
const functionDeclarations = [
  {
    name: mathPlugin.name,
    description: mathPlugin.description,
    parameters: mathPlugin.parameters,
  },
  {
    name: weatherPlugin.name,
    description: weatherPlugin.description,
    parameters: weatherPlugin.parameters,
  },
];

export const processMessage = async (sessionId: string, message: string): Promise<string> => {
  try {
    const history = sessionManager.getHistory(sessionId);

    // Build base contents (recent history + user message)
    const recent = getRecentHistory(history);
    const baseContents: any[] = [
      ...recent,
      { role: 'user', parts: [{ text: message }] },
    ];

    // Retrieve context once (non-blocking if not ready)
    const contextChunks = await vectorStore.findSimilar(message);
    if (contextChunks.length > 0) {
      baseContents.push({ role: 'user', parts: [{ text: '[CONTEXT FROM DOCUMENTS]:\n' + contextChunks.map((c: string) => `- ${c}`).join('\n') }] });
    }

    const systemInstruction = `You are a helpful and efficient AI Agent.\n- Answer the user's question based on the provided context, chat history, and tool output.\n- Be concise and clear.\n- If you use a tool, briefly mention how you got the information.`;

    // Iteratively handle tool calls (up to 2 rounds)
    let contents = [...baseContents];
    const maxRounds = 2;
    let lastToolOutputs: Array<{ name: string; output: string }> = [];
    for (let round = 0; round < maxRounds; round++) {
      console.log(round === 0 ? '🧠 Determining if a tool is needed...' : '🔁 Continuing after tool results...');
      const resp = await generateWithModelFallback(genAI, {
        tools: [{ functionDeclarations }],
        systemInstruction,
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      });

      const parts = (resp as any)?.response?.candidates?.[0]?.content?.parts || [];
      const textParts = parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text);
      const functionCalls: any[] = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (functionCalls.length === 0 && textParts.length > 0) {
        const finalText = textParts.join('\n');
        sessionManager.addMessage(sessionId, { role: 'user', parts: [{ text: message }] });
        sessionManager.addMessage(sessionId, { role: 'model', parts: [{ text: finalText }] });
        return finalText;
      }

      if (functionCalls.length > 0) {
        const toolOutputs: Array<{ name: string; output: string }> = [];
        const seenCalls = new Map<string, string>(); // key: name|argsJSON -> output
        for (const fc of functionCalls) {
          if (!fc?.name) { continue; }
          try {
            console.log(`Tool call detected: ${fc.name}`);
            const functionName = fc.name;
            const args = fc.arguments ?? fc.args ?? {};
            const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
            const plugin = plugins[functionName];
            if (plugin) {
              const key = `${functionName}|${JSON.stringify(parsedArgs)}`;
              if (seenCalls.has(key)) {
                toolOutputs.push({ name: functionName, output: seenCalls.get(key)! });
              } else {
                const functionResponse = await plugin.execute(parsedArgs as any);
                seenCalls.set(key, functionResponse);
                toolOutputs.push({ name: functionName, output: functionResponse });
              }
            }
          } catch (err) {
            console.error('Error executing tool:', err);
            toolOutputs.push({ name: fc?.name || 'unknown', output: 'Tool execution failed.' });
          }
        }
        // Append tool responses for the next round
        for (const t of toolOutputs) {
          contents.push({ role: 'tool', parts: [{ functionResponse: { name: t.name, response: { text: t.output } } }] });
        }
        lastToolOutputs = toolOutputs;
        continue;
      }
    }

    // If we reach here, we failed to produce text
    if (lastToolOutputs.length > 0) {
      // Return tool results directly as a fallback if the model didn't produce text
      const combined = lastToolOutputs.map(t => `${t.output}`).join('\n');
      sessionManager.addMessage(sessionId, { role: 'user', parts: [{ text: message }] });
      sessionManager.addMessage(sessionId, { role: 'model', parts: [{ text: combined }] });
      return combined;
    }
    const fallback = "I'm sorry, I seem to be having trouble formulating a response. Please try again.";
    sessionManager.addMessage(sessionId, { role: 'user', parts: [{ text: message }] });
    sessionManager.addMessage(sessionId, { role: 'model', parts: [{ text: fallback }] });
    return fallback;

  } catch (error: any) {
    console.error('❌ Error in processMessage:', error);
    if (error?.status === 429) {
      return "I'm experiencing a high volume of requests right now. Please try again in a moment.";
    }
    return "I've encountered an unexpected error. Please try your request again.";
  }
};