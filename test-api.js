// test-api.js - Quick API key test
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testAPIKey() {
  const API_KEY = process.env.GEMINI_API_KEY;
  console.log('Testing API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT FOUND');
  
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    
    // Test simple text generation first
    console.log('Testing text generation...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
    const result = await model.generateContent('Say hello');
    console.log('✅ Text generation works:', result.response.text());
    
    // Test embedding
    console.log('Testing embedding...');
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const embedding = await embeddingModel.embedContent('test text');
    console.log('✅ Embedding works, vector length:', embedding.embedding.values.length);
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    console.error('Full error:', error);
  }
}

testAPIKey();