// src/server.ts (FIXED VERSION for Express 4.x)
import express from 'express';
import { processMessage } from './agent/agent.js';
import { vectorStore } from './rag/vectorStore.js';

// Serve static files from public directory (chat UI)
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve UI
app.use(express.static(path.join(process.cwd(), 'public')));

// Add CORS with optional whitelist for separate frontend deployments
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    const isAllowed = origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin));

    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (isAllowed) {
        res.header('Access-Control-Allow-Origin', origin as string);
        res.header('Access-Control-Allow-Credentials', 'true');
    }

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
        // Overall request timeout so the UI never hangs indefinitely
        const REQUEST_TIMEOUT_MS = 20000; // 20s
        const replyPromise = processMessage(session_id, message);
        const timeoutPromise = new Promise<string>((resolve) => {
            setTimeout(() => resolve("I'm taking longer than expected. Please try again in a moment."), REQUEST_TIMEOUT_MS);
        });
        const reply = await Promise.race([replyPromise, timeoutPromise]);
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

        // Start server first so UI is available immediately
        app.listen(port, () => {
            console.log(`✅ Server is running at http://localhost:${port}`);
            console.log(`📡 API endpoint: POST http://localhost:${port}/agent/message`);
            console.log(`🏥 Health check: GET http://localhost:${port}/`);
        });

        // Initialize vector store in the background (non-blocking)
        vectorStore.initialize()
            .then(() => console.log('🧩 Vector store ready.'))
            .catch((err: unknown) => console.error('Vector store initialization error:', err));

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();