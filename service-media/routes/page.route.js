const express = require('express');
const { banners, popups } = require('../controllers/page.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const manager = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// Banner trang chủ
router.get('/banners', banners.listPublic);
router.get('/banners/admin', ...manager, banners.listAdmin);
router.post('/banners', ...manager, banners.create);
router.put('/banners/:id', ...manager, banners.update);
router.delete('/banners/:id', ...manager, banners.remove);

// Popup quảng cáo
router.get('/popups', popups.listPublic);
router.get('/popups/admin', ...manager, popups.listAdmin);
router.post('/popups', ...manager, popups.create);
router.put('/popups/:id', ...manager, popups.update);
router.delete('/popups/:id', ...manager, popups.remove);

module.exports = router;
