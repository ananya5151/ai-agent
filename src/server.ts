// src/server.ts (FIXED VERSION for Express 4.x)
import express from 'express';
import { processMessage } from './agent/agent';
import { vectorStore } from './rag/vectorStore';


console.log("DEBUG: Is the API key loaded?", process.env.OPENAI_API_KEY); // <-- ADD THIS LINE

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add CORS headers for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'AI Agent Server is running!',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: 'GET /',
            chat: 'POST /agent/message'
        }
    });
});

// Main agent endpoint
app.post('/agent/message', async (req, res) => {
    try {
        const { session_id, message } = req.body;

        // Validation
        if (!session_id || typeof session_id !== 'string') {
            return res.status(400).json({
                error: 'session_id is required and must be a string'
            });
        }

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                error: 'message is required and must be a non-empty string'
            });
        }

        console.log(`📨 Processing message for session ${session_id}: "${message.substring(0, 100)}..."`);

        const startTime = Date.now();
        const reply = await processMessage(session_id, message);
        const duration = Date.now() - startTime;

        console.log(`✅ Response generated in ${duration}ms`);

        res.status(200).json({
            reply,
            session_id,
            processing_time_ms: duration
        });

    } catch (error) {
        console.error('❌ Error processing message:', error);

        res.status(500).json({
            error: 'Failed to process message',
            details: process.env.NODE_ENV === 'development' ? String(error) : 'Internal server error'
        });
    }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? String(err) : undefined
    });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        available_endpoints: {
            health: 'GET /',
            chat: 'POST /agent/message'
        }
    });
});

const startServer = async () => {
    try {
        console.log('🚀 Starting AI Agent Server...');

        // Validate required environment variables
        if (!process.env.GEMINI_API_KEY) {
            console.error('❌ GEMINI_API_KEY is required');
            process.exit(1);
        }

        // Initialize vector store
        await vectorStore.initialize();

        app.listen(port, () => {
            console.log(`✅ Server is running at http://localhost:${port}`);
            console.log(`📡 API endpoint: POST http://localhost:${port}/agent/message`);
            console.log(`🏥 Health check: GET http://localhost:${port}/`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();