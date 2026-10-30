const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../controllers/aiAnalysis.controller');
const { consultChat } = require('../controllers/consultChat.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Endpoint: POST /api/ai-analysis/analyze
router.post('/analyze', verifyToken, aiAnalysisController.analyzeFace);

// Chatbot tư vấn trên web khách (gateway: POST /api/ai/chat)
router.post('/chat', verifyToken, consultChat);

module.exports = router;