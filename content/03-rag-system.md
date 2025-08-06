# Retrieval-Augmented Generation (RAG) Workflow

The agent's contextual understanding is powered by a custom-built Retrieval-Augmented Generation (RAG) system. During server startup, the `VectorStore` reads all markdown files from the `/content` directory.

The workflow is as follows:
1.  **Chunking**: Each document is split into smaller, semantically coherent paragraphs. This ensures that the retrieved context is focused and relevant.
2.  **Embedding**: Each chunk is sent to the OpenAI `text-embedding-3-small` model to be converted into a high-dimensional vector. These vectors are stored in memory.
3.  **Retrieval**: When a user message is received, it is also embedded into a vector. The system then calculates the cosine similarity between the user's vector and all document vectors, retrieving the top 3 most similar chunks. This retrieved context is then injected directly into the final prompt.