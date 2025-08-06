// =====================================
// src/rag/vectorStore.ts (ENHANCED VERSION)
// =====================================
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { cosineSimilarity } from '../utils/cosineSimilarity';

interface Chunk {
  content: string;
  embedding: number[];
  source: string;
}

const API_KEY = process.env.GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

class VectorStore {
  private chunks: Chunk[] = [];
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    
    console.log('📚 Initializing Vector Store...');
    const contentDir = path.join(process.cwd(), 'content');
    
    try {
      const files = await fs.readdir(contentDir);
      console.log(`Found ${files.length} files in content directory`);

      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.txt')) {
          console.log(`Processing: ${file}`);
          
          try {
            const filePath = path.join(contentDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            
            // Split content into meaningful chunks
            const paragraphs = content
              .split(/\n\s*\n/)
              .map(p => p.trim())
              .filter(p => p.length > 20); // Minimum chunk size

            for (const paragraph of paragraphs) {
              try {
                const { embedding } = await embeddingModel.embedContent(paragraph);
                this.chunks.push({ 
                  content: paragraph, 
                  embedding: embedding.values,
                  source: file 
                });
              } catch (embeddingError) {
                console.warn(`Failed to embed paragraph from ${file}:`, embeddingError);
              }
            }
          } catch (fileError) {
            console.warn(`Failed to process file ${file}:`, fileError);
          }
        }
      }
      
      this.isInitialized = true;
      console.log(`✅ Vector Store initialized with ${this.chunks.length} chunks from ${files.length} files`);
      
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      this.isInitialized = true; // Mark as initialized even on error to prevent infinite retries
    }
  }

  async findSimilar(queryMessage: string, topK: number = 3): Promise<string[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.chunks.length === 0) {
      console.log('No chunks available for similarity search');
      return [];
    }
    
    try {
      const { embedding } = await embeddingModel.embedContent(queryMessage);
      const queryVector = embedding.values;

      const similarities = this.chunks.map(chunk => ({
        content: chunk.content,
        source: chunk.source,
        score: cosineSimilarity(queryVector, chunk.embedding),
      }));

      similarities.sort((a, b) => b.score - a.score);

      // Filter out very low similarity scores (< 0.1)
      const relevantChunks = similarities
        .filter(s => s.score > 0.1)
        .slice(0, topK);

      console.log(`Found ${relevantChunks.length} relevant chunks for query: "${queryMessage}"`);
      
      return relevantChunks.map(s => s.content);
    } catch (error) {
      console.error('Error in similarity search:', error);
      return [];
    }
  }
}

export const vectorStore = new VectorStore();