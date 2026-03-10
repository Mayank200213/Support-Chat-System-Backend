const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['active', 'escalated', 'resolved'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Conversation', ConversationSchema);
