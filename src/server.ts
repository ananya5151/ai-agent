import express from 'express';
import dotenv from 'dotenv';
import { processMessage } from './agent/agent';
import { vectorStore } from './rag/vectorStore';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('AI Agent is running!');
});

app.post('/agent/message', async (req, res) => {
  try {
    const { session_id, message } = req.body;
    if (!session_id || !message) {
      return res.status(400).json({ error: 'session_id and message are required' });
    }
    const reply = await processMessage(session_id, message);
    res.status(200).json({ reply });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

const startServer = async () => {
  await vectorStore.initialize();
  app.listen(port, () => {
    console.log(`✅ Server is running at http://localhost:${port}`);
  });
};

startServer();