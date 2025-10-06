Markdown

# Pluggable AI Agent Server (TypeScript)

This repository contains a backend AI agent built in TypeScript for a 1-day technical challenge. The system features a modular architecture with session-based memory, a pluggable tool system, and a Retrieval-Augmented Generation (RAG) pipeline for providing context-aware responses.

---

Backend (Render) URL: e.g. <https://your-backend.onrender.com/>

---

### Current Status & Known Issues

This backend uses Google Gemini for chat and embeddings. On free tiers, you may hit rate limits (HTTP 429) during bursts (for example, right after startup while the RAG index warms up). The server now backs off briefly when this happens.

---

## 🚀 Core Features

* **🧠 Conversational Memory**: Maintains conversation history on a per-session basis.
* **🔌 Plugin System**: Dynamically executes tools based on user intent.
  * **Weather Plugin**: Fetches live weather data from an external API.
  * **Math Plugin**: Safely evaluates mathematical expressions.
* **📚 Retrieval-Augmented Generation (RAG)**: Ingests local markdown files to answer questions with specific, grounded knowledge.
* **Typed & Modular**: Built entirely in TypeScript with a clean, scalable file structure.

---

## ⚙️ Architecture & Data Flow

The agent operates on a multi-step orchestration loop designed to enrich the final response with the most relevant information available.

1. **Receive Request**: The Express server handles `POST /agent/message` requests containing a `session_id` and `message`.
2. **Retrieve Memory**: The `SessionManager` loads the recent chat history for the session.
3. **Tool Check (LLM Call #1)**: The agent sends the user's message and history to the LLM (Google Gemini) along with a list of available plugins. The LLM decides if a tool is needed and returns the function and arguments to call.
4. **Plugin Execution**: If a tool call is recommended, the system executes the corresponding plugin (e.g., `weatherPlugin`) and captures its output.
5. **RAG Retrieval**: The user's message is embedded into a vector. A cosine similarity search is performed against a pre-embedded vector store of local documents to find the top 3 most relevant context chunks.
6. **Synthesize (LLM Call #2)**: A final prompt is constructed, containing the system instructions, recent memory, plugin output, and RAG context. This is sent to Gemini to generate a final, synthesized answer.
7. **Update Memory & Respond**: The user's message and the agent's final response are saved to the session history, and the reply is sent to the client.

---

## 🛠️ Setup and Usage

### Local Setup

1. **Clone the repository:**

    ```bash
    git clone [https://github.com/ananya5151/ai-agent.git](https://github.com/ananya5151/ai-agent.git)
    cd ai-agent
    ```

2. **Install dependencies:**

    ```bash
    npm install
    ```

3. **Set up your environment:**
    Create a `.env` file in the project root and add your keys.

    ```env
    GEMINI_API_KEY="..."        # Required
    WEATHER_API_KEY="..."       # Optional
    PORT="3000"                 # Optional (Render sets PORT automatically)
    ALLOWED_ORIGINS="https://your-frontend.example.com, http://localhost:5173" # Optional CORS whitelist
    ```

4. **Run the development server (backend only):**

    ```bash
    npm run dev
    ```

    The server will be available at `http://localhost:3000`.

### Frontend integration (separate deploy)

If your frontend is hosted elsewhere (e.g., Vercel/Netlify/Static hosting), call the backend like this:

```ts
async function sendMessage(sessionId: string, message: string) {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/agent/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.reply as string;
}
```

Be sure to set `ALLOWED_ORIGINS` on the backend so the browser Origin is permitted by CORS.

### Sample API Calls

#### 1) Basic Conversation (with Memory)

```bash
# First message
curl -X POST http://localhost:3000/agent/message -H "Content-Type: application/json" -d '{"session_id": "convo-01", "message": "My name is Ananya."}'

# Follow-up message
curl -X POST http://localhost:3000/agent/message -H "Content-Type: application/json" -d '{"session_id": "convo-01", "message": "What is my name?"}'
```

#### 2) Weather Plugin

```bash
curl -X POST http://localhost:3000/agent/message -H "Content-Type: application/json" -d '{"session_id": "weather-test", "message": "What is the weather like in Lucknow?"}'
```

#### 3) Math Plugin

```bash
curl -X POST http://localhost:3000/agent/message -H "Content-Type: application/json" -d '{"session_id": "math-test", "message": "Can you calculate (100 / 5) * 2 + 15?"}'
```

#### 4) RAG Context Retrieval

```bash
curl -X POST http://localhost:3000/agent/message -H "Content-Type: application/json" -d '{"session_id": "rag-test", "message": "How does the RAG system perform retrieval?"}'
```
