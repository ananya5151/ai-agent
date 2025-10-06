import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { cosineSimilarity } from '../utils/cosineSimilarity.js';

interface Chunk {
  content: string;
  embedding: number[];
  source: string;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const EMBEDDING_MODEL = 'text-embedding-004';
const embeddingModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL }) as any;

async function embedWithRetry(text: string, maxRetries = 3, baseDelayMs = 400): Promise<number[] | null> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const result = await embeddingModel.embedContent(text);
      return result.embedding.values as number[];
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      const retriable = status === 429 || (typeof status === 'number' && status >= 500);
      if (!retriable || attempt === maxRetries) {
        console.warn('Embedding failed:', { attempt, status, err: String(err) });
        return null;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(res => setTimeout(res, delay));
      attempt++;
    }
  }
  return null;
}

class VectorStore {
  private chunks: Chunk[] = [];
  private isInitialized = false;
  private initStarted = false;
  private initPromise: Promise<void> | null = null;

  async initialize() {
    if (this.isInitialized) {
      return;
    }
    if (this.initStarted) {
      return this.initPromise ?? undefined;
    }

    // Mark started before any async/logging to prevent duplicate kicks
    this.initStarted = true;
    console.log('📚 Initializing Vector Store for Gemini...');
    const contentDir = path.join(process.cwd(), 'content');
    this.initPromise = (async () => {
      try {
        const files = await fs.readdir(contentDir);
        console.log(`Found ${files.length} files in content directory.`);

        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.txt')) {
            console.log(`Processing file: ${file}`);
            const filePath = path.join(contentDir, file);
            const content = await fs.readFile(filePath, 'utf-8');

            const paragraphs = content
              .split(/\n\s*\n/)
              .map(p => p.trim())
              .filter(p => p.length > 20);

            for (const paragraph of paragraphs) {
              const embedding = await embedWithRetry(paragraph);
              if (embedding) {
                this.chunks.push({ content: paragraph, embedding, source: file });
              } else {
                console.warn(`Skipped paragraph without embedding from ${file}.`);
              }
            }
          }
        }

        this.isInitialized = true;
        console.log(`✅ Vector Store initialized with ${this.chunks.length} chunks.`);
      } catch (error) {
        console.error('Failed to initialize vector store:', error);
        this.isInitialized = true; // Avoid repeated attempts
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async findSimilar(queryMessage: string, topK: number = 3): Promise<string[]> {
    if (!this.isInitialized) {
      // If initialization is ongoing, don't block the request—serve without RAG
      if (this.initStarted) {
        return [];
      }
      // Kick off initialization in background and continue without RAG
      void this.initialize();
      return [];
    }

    if (this.chunks.length === 0) {
      return [];
    }

    try {
      const queryVector = await embedWithRetry(queryMessage);
      if (!queryVector) {
        return [];
      }

      const similarities = this.chunks.map(chunk => ({
        content: chunk.content,
        score: cosineSimilarity(queryVector, chunk.embedding),
      }));

      similarities.sort((a, b) => b.score - a.score);

      const relevantChunks = similarities.slice(0, topK);

      return relevantChunks.map(s => s.content);
    } catch (error) {
      console.error('Error in OpenAI similarity search:', error);
      return [];
    }
  }
}

export const vectorStore = new VectorStore();