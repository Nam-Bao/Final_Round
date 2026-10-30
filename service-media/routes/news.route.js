const express = require('express');
const {
  getPublishedArticles, getArticleBySlug, getCategories, getAllArticlesForAdmin,
  getArticleByIdForAdmin, createArticle, updateArticle, deleteArticle
} = require('../controllers/news.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const adminRoles = ['ADMIN', 'GEN_MANAGER'];

router.get('/', getPublishedArticles);
router.get('/categories', getCategories); // đặt trước '/:slug'
router.get('/admin', verifyToken, authorizeRoles(...adminRoles), getAllArticlesForAdmin);
router.get('/admin/:id', verifyToken, authorizeRoles(...adminRoles), getArticleByIdForAdmin);
router.post('/', verifyToken, authorizeRoles(...adminRoles), createArticle);
router.put('/:id', verifyToken, authorizeRoles(...adminRoles), updateArticle);
router.delete('/:id', verifyToken, authorizeRoles(...adminRoles), deleteArticle);
router.get('/:slug', getArticleBySlug);

module.exports = router;
