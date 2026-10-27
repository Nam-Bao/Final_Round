const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../controllers/aiAnalysis.controller');

// Endpoint: POST /api/ai-analysis/analyze
router.post('/analyze', aiAnalysisController.analyzeFace);

module.exports = router;