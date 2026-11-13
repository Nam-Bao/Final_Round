// GET /tasks/mine — bài viết chờ quản lý duyệt / bài của bác sĩ cần chỉnh sửa (chuông thông báo trang quản trị)
const express = require('express');
const { ArticleSubmission } = require('../models');
const { verifyToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const task = (key, label, count, path, topic) => ({ key, label, count, path, topic });

router.get('/mine', verifyToken, async (req, res) => {
  try {
    const { id, role } = req.user;
    const data = [];
    if (['GEN_MANAGER', 'ADMIN'].includes(role)) {
      data.push(task('articles-pending', 'Bài viết của bác sĩ chờ duyệt', await ArticleSubmission.count({ where: { status: 'PENDING' } }), '/content', 'articles'));
    }
    if (role === 'DOCTOR') {
      data.push(task('articles-changes', 'Bài viết cần chỉnh sửa theo góp ý', await ArticleSubmission.count({ where: { author_id: id, status: 'CHANGES_REQUESTED' } }), '/my-articles', 'articles'));
    }
    res.status(200).json({ data });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

module.exports = router;
