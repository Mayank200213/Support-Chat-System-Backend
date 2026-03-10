const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { getAiResponse } = require('../services/aiService');

// GET /admin/conversations — fetch all active and escalated conversations
router.get('/admin/conversations', async (req, res) => {
    try {
        const conversations = await Conversation.find().sort('-createdAt');
        const enrichedConversations = await Promise.all(
            conversations.map(async (conv) => {
                const lastMsg = await Message.findOne({ conversationId: conv._id }).sort('-timestamp');
                return {
                    ...conv.toObject(),
                    lastMessage: lastMsg ? lastMsg.message : null
                };
            })
        );
        res.status(200).json(enrichedConversations);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// POST /chat/start — start a new conversation
router.post('/start', async (req, res) => {
    try {
        const conversation = new Conversation();
        await conversation.save();
        res.status(201).json(conversation);
    } catch (error) {
        console.error('❌ Conversation Start Error:', error.message);
        res.status(500).json({ error: 'Failed to start conversation: ' + error.message });
    }
});

// GET /chat/:id — fetch chat history
router.get('/:id', async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const messages = await Message.find({ conversationId: req.params.id }).sort('timestamp');
        res.status(200).json({ conversation, messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch conversation history' });
    }
});

// POST /chat/message — send a message
router.post('/message', async (req, res) => {
    try {
        const { conversationId, sender, message } = req.body;

        const userMessage = new Message({ conversationId, sender, message });
        await userMessage.save();

        // Emit the new message to the room
        req.io.to(conversationId).emit('new_message', userMessage);

        const conversation = await Conversation.findById(conversationId);

        // AI only replies if it's from user AND status is active
        if (sender === 'user' && conversation.status === 'active') {
            const recentMessages = await Message.find({ conversationId })
                .sort({ timestamp: 1 })
                .limit(10);

            const aiReply = await getAiResponse(message, recentMessages);

            const aiMessage = new Message({
                conversationId,
                sender: 'ai',
                message: aiReply.text
            });
            await aiMessage.save();
            req.io.to(conversationId).emit('new_message', aiMessage);

            if (aiReply.isLowConfidence) {
                conversation.status = 'escalated';
                await conversation.save();

                const escalationMsg = new Message({
                    conversationId,
                    sender: 'system',
                    message: 'Your request has been escalated to a human agent. Please wait for an agent to review.'
                });
                await escalationMsg.save();
                req.io.to(conversationId).emit('new_message', escalationMsg);

                req.io.to('admin_room').emit('chat_escalated', { conversationId, latestMessage: message });
                req.io.to(conversationId).emit('status_change', 'escalated');
            }
        } else if (sender === 'user' && conversation.status === 'escalated') {
            req.io.to('admin_room').emit('chat_update', { conversationId, latestMessage: message });
        } else if (sender === 'agent') {
            // Agent is replying
            if (conversation.status !== 'escalated') {
                conversation.status = 'escalated'; // keep status escalated
                await conversation.save();
            }
        }

        res.status(201).json(userMessage);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// PUT /chat/:id/resolve
router.put('/:id/resolve', async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ error: 'Not found' });

        conversation.status = 'resolved';
        await conversation.save();

        req.io.to(req.params.id).emit('status_change', 'resolved');
        req.io.to('admin_room').emit('chat_resolved', req.params.id);

        res.status(200).json(conversation);
    } catch (error) {
        res.status(500).json({ error: 'Failed to resolve chat' });
    }
});

module.exports = router;
