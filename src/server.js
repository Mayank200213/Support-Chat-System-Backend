require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const chatRoutes = require('./routes/chat');
const ObjectModels = require('./models/Conversation'); // Ensure models load
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
const { getAiResponse } = require('./services/aiService');

const app = express();
// Robust CORS for production
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Incoming Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.get('origin')}`);
    next();
});

// Health check endpoints
app.get('/', (req, res) => res.json({ status: 'ok', msg: 'Backend is Live' }));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Print environment confirmation on startup
console.log('--- SERVER CONFIG ---');
console.log('MONGODB_URI:', process.env.MONGODB_URI || process.env.MONOGDB_URI ? 'SET' : 'MISSING');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'SET' : 'MISSING');
console.log('---------------------');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONOGDB_URI || 'mongodb://localhost:27017/support_chat';

mongoose.connect(MONGODB_URI).then(() => {
    console.log('✅ Successfully connected to MongoDB');
}).catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1); // Stop the server if DB fails to connect in production
});

// Middleware to inject io into req object
app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use('/chat', chatRoutes);

// Socket.io for Real-Time and status
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Client joins a room specific to their conversation
    socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`Socket ${socket.id} joined conversation: ${conversationId}`);
    });

    // Admin joins a global admin room to listen for escalated chats
    socket.on('join_admin', () => {
        socket.join('admin_room');
        console.log(`Admin ${socket.id} joined admin_room`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
