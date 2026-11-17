// Quản lý xem lịch sử email đã gửi khách, gửi lại email lỗi
const express = require('express');
const { Op } = require('sequelize');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { EmailLog, User, Profile } = require('../models');
const { resend, TEMPLATES } = require('../services/email');

const router = express.Router();
const manager = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// GET /emails?status=&template=&q=&page= — mới nhất trước, 20 dòng / trang
router.get('/', ...manager, async (req, res) => {
  try {
    const where = {};
    if (['QUEUED', 'SENT', 'FAILED', 'SKIPPED'].includes(req.query.status)) where.status = req.query.status;
    if (TEMPLATES[req.query.template]) where.template = req.query.template;
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q) where[Op.or] = [{ to_email: { [Op.iLike]: `%${q}%` } }, { subject: { [Op.iLike]: `%${q}%` } }];
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const [{ rows, count }, byStatus] = await Promise.all([
      EmailLog.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit: 20, offset: (page - 1) * 20, attributes: { exclude: ['data'] } }),
      EmailLog.findAll({ attributes: ['status', [EmailLog.sequelize.fn('COUNT', '*'), 'n']], group: ['status'], raw: true }),
    ]);
    const users = await User.findAll({ where: { id: [...new Set(rows.map((r) => r.user_id).filter(Boolean))] }, attributes: ['id'], include: [{ model: Profile, attributes: ['full_name'] }] });
    const names = Object.fromEntries(users.map((u) => [u.id, u.Profile?.full_name]));
    res.json({
      data: rows.map((r) => ({ ...r.toJSON(), recipient_name: names[r.user_id] || null, can_resend: r.status === 'FAILED' && !(TEMPLATES[r.template]?.sensitive || []).length })),
      total: count, page,
      counts: Object.fromEntries(byStatus.map((s) => [s.status, Number(s.n)])),
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// POST /emails/:id/resend — gửi lại email lỗi
router.post('/:id/resend', ...manager, async (req, res) => {
  try {
    const log = await EmailLog.findByPk(req.params.id).catch(() => null);
    if (!log) return res.status(404).json({ message: 'Không tìm thấy email' });
    if (log.status !== 'FAILED') return res.status(409).json({ message: 'Chỉ gửi lại email bị lỗi' });
    const status = await resend(log);
    res.json({ message: status === 'SENT' ? 'Đã gửi lại email' : `Gửi lại vẫn lỗi: ${log.last_error}`, status });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;
