const express = require('express');
const {
  getPublishedArticles, getArticleBySlug, getCategories, getAllArticlesForAdmin,
  getArticleByIdForAdmin, createArticle, updateArticle, deleteArticle
} = require('../controllers/news.controller.js');
const {
  getMySubmissions, getSubmissionsForManager, getSubmission, createSubmission, updateSubmission,
  withdrawSubmission, deleteSubmission, approveSubmission, requestChanges, MANAGER_ROLES,
} = require('../controllers/submission.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const manager = [verifyToken, authorizeRoles(...MANAGER_ROLES)];
const doctor = [verifyToken, authorizeRoles('DOCTOR')];

router.get('/', getPublishedArticles);
router.get('/categories', getCategories); // đặt trước '/:slug'
router.get('/admin', ...manager, getAllArticlesForAdmin);
router.get('/admin/:id', ...manager, getArticleByIdForAdmin);

// Bài nghiên cứu bác sĩ gửi duyệt
router.get('/submissions/mine', ...doctor, getMySubmissions);
router.get('/submissions', ...manager, getSubmissionsForManager);
router.get('/submissions/:id', verifyToken, authorizeRoles('DOCTOR', ...MANAGER_ROLES), getSubmission);
router.post('/submissions', ...doctor, createSubmission);
router.put('/submissions/:id', ...doctor, updateSubmission);
router.post('/submissions/:id/withdraw', ...doctor, withdrawSubmission);
router.delete('/submissions/:id', ...doctor, deleteSubmission);
router.post('/submissions/:id/approve', ...manager, approveSubmission);
router.post('/submissions/:id/request-changes', ...manager, requestChanges);

router.post('/', ...manager, createArticle);
router.put('/:id', ...manager, updateArticle);
router.delete('/:id', ...manager, deleteArticle);
router.get('/:slug', getArticleBySlug);

module.exports = router;
