import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { cosineSimilarity } from '../utils/cosineSimilarity';

interface Chunk {
  content: string;
  embedding: number[];
}

const API_KEY = process.env.GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

class VectorStore {
  private chunks: Chunk[] = [];

  async initialize() {
    console.log('📚 Initializing Vector Store...');
    const contentDir = path.join(process.cwd(), 'content');
    const files = await fs.readdir(contentDir);

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        const content = await fs.readFile(path.join(contentDir, file), 'utf-8');
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 10);

        for (const paragraph of paragraphs) {
          const { embedding } = await embeddingModel.embedContent(paragraph);
          this.chunks.push({ content: paragraph, embedding: embedding.values });
        }
      }
    }
    console.log(`✅ Vector Store initialized with ${this.chunks.length} chunks.`);
  }

  async findSimilar(queryMessage: string, topK: number = 3): Promise<string[]> {
    if (this.chunks.length === 0) return [];
    
    const { embedding } = await embeddingModel.embedContent(queryMessage);
    const queryVector = embedding.values;

    const similarities = this.chunks.map(chunk => ({
      content: chunk.content,
      score: cosineSimilarity(queryVector, chunk.embedding),
    }));

    similarities.sort((a, b) => b.score - a.score);

    return similarities.slice(0, topK).map(s => s.content);
  }
}

export const vectorStore = new VectorStore();