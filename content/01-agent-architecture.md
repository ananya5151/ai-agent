# Agent Core Architecture

The AI Agent is built on a sophisticated, multi-step orchestration pattern designed for accuracy and extensibility. The entire process is stateless at the server level, with conversation state managed per `session_id`.

When a `POST /agent/message` request is received, the agent initiates a sequence: first, it retrieves the recent conversation history for the given session. Then, it performs a "tool use" check by sending the message and history to the primary LLM, which determines if a function call (like `get_weather`) is necessary. This ensures that the agent can leverage external data sources or perform calculations before formulating its final answer.