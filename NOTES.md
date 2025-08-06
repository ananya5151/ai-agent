#### **File: `NOTES.md`**
```markdown
# Developer Notes & Task Reflections

This document outlines the development process, challenges faced, and design decisions made while building the AI Agent Server.

### AI-Assisted vs. Human-Authored

My development philosophy was to use AI (primarily GitHub Copilot) as an accelerator for boilerplate and syntax, while retaining full human ownership of the core architecture and logic.

* **AI-Generated/Assisted**:
    * Initial Express server boilerplate (`server.ts`).
    * The mathematical formulas for the `cosineSimilarity` function.
    * Basic TypeScript interface definitions (e.g., `ChatMessage`).
    * Auto-completion of common code blocks and import statements.

* **Human-Authored (My Logic)**:
    * **Core Agent Architecture**: The entire two-step LLM call process (tool-check followed by synthesis) was my design. This is a robust and common pattern for building reliable agents that can use tools effectively.
    * **Prompt Engineering**: I wrote the main system prompt in `agent.ts` from scratch to carefully guide the LLM's persona and ensure it correctly synthesized the various pieces of context (memory, RAG, tools).
    * **Plugin System & Routing**: The logic for defining tools in OpenAI's required format, parsing the `tool_calls` response from the LLM, and executing the correct local plugin is my implementation.
    * **RAG Implementation**: I designed and built the `VectorStore` class from the ground up. The logic for reading files, chunking by paragraphs, managing embeddings, and performing the similarity search is my own code. This was done to demonstrate a fundamental understanding of the RAG workflow.
    * **Error Handling and State Management**: All logic related to session management, error handling within plugins, and managing the `isInitialized` state of the Vector Store was written by me.

### Bugs Faced & Solutions

1.  **Challenge: Environment Variables Not Loading.**
    * **Bug**: My initial implementation loaded `.env` inside `server.ts`. However, because other modules like `vectorStore.ts` were imported at the top of `server.ts`, they would execute *before* `dotenv.config()` was called, resulting in an "API key missing" error.
    * **Solution**: I modified the `npm run dev` script in `package.json` to include `-r dotenv/config`. This pre-loads the environment variables before any application code runs, ensuring they are available globally from the start. This is the standard, robust solution for Node.js projects.

2.  **Challenge: API Rate Limiting.**
    * **Bug**: Upon starting the server, the RAG system makes a burst of API calls to embed the content files. On a new OpenAI account, this immediately triggered the `429 You exceeded your current quota` error, crashing the server initialization.
    * **Solution**: The long-term fix is to add a payment method to the OpenAI account to access higher rate limits. For the code itself, I made it more resilient by wrapping the API calls in `try...catch` blocks within the `VectorStore` to handle embedding failures gracefully and adding similar error handling in `agent.ts` to manage quota issues during chat requests.

3.  **Challenge: Unsafe Math Evaluation.**
    * **Bug**: A naive math plugin might use `eval()`, which is a major security risk.
    * **Solution**: I used the `mathjs` library from the start, as its `evaluate()` function is a secure, sandboxed parser that only handles mathematical expressions.

### Agent Logic: Memory, Plugins, and Context

The agent's intelligence comes from how it combines three different sources of information:

1.  **Memory**: The last 2 messages are converted into OpenAI's message format and included in the first API call. This gives the model context for follow-up questions and allows it to understand conversational flow.
2.  **Plugins (Tools)**: My agent uses OpenAI's native "Tool Calling" feature. I define my local functions (e.g., `get_weather`) in a schema that OpenAI understands. The LLM then decides when to use them. My code parses the `tool_calls` object in the response, runs the corresponding local function, and then **feeds the output back into the conversation history** as a `role: 'tool'` message. The final response is then generated from this enriched conversation.
3.  **RAG Context**: After the tool-use step, the user's query is used to find the top 3 relevant text chunks from the `VectorStore`. This context is **prepended to the final conversation as a system message**. This clearly separates the grounded, factual information from the conversational history, allowing the LLM to draw upon it to construct an accurate, context-aware answer.