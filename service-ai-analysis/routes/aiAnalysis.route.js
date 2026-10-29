const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../controllers/aiAnalysis.controller');
const { consultChat } = require('../controllers/consultChat.controller');

// Endpoint: POST /api/ai-analysis/analyze
router.post('/analyze', aiAnalysisController.analyzeFace);

// Chatbot tư vấn trên web khách (gateway: POST /api/ai/chat)
router.post('/chat', consultChat);

module.exports = router;