import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { cosineSimilarity } from '../utils/cosineSimilarity';

interface Chunk {
  content: string;
  embedding: number[];
  source: string;
}

// ==================================================================
// THE FIX: We explicitly tell the OpenAI client what the key is.
// ==================================================================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Directly pass the key
});

const EMBEDDING_MODEL = 'text-embedding-3-small';

class VectorStore {
  private chunks: Chunk[] = [];
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    
    console.log('📚 Initializing Vector Store for OpenAI...');
    const contentDir = path.join(process.cwd(), 'content');
    
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
            try {
              const response = await openai.embeddings.create({
                model: EMBEDDING_MODEL,
                input: paragraph,
              });
              
              this.chunks.push({ 
                content: paragraph, 
                embedding: response.data[0].embedding,
                source: file 
              });
            } catch (embeddingError) {
              console.warn(`Failed to embed paragraph from ${file}:`, embeddingError);
            }
          }
        }
      }
      
      this.isInitialized = true;
      console.log(`✅ Vector Store initialized with ${this.chunks.length} chunks.`);
      
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      this.isInitialized = true;
    }
  }

  async findSimilar(queryMessage: string, topK: number = 3): Promise<string[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.chunks.length === 0) return [];
    
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: queryMessage,
      });
      const queryVector = response.data[0].embedding;

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