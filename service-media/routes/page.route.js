const express = require('express');
const { banners, popups, clinicInfo, getContentStats, trackBannerClick, trackPopupClick } = require('../controllers/page.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const manager = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// Banner trang chủ
router.get('/banners', banners.listPublic);
router.post('/banners/:id/click', trackBannerClick);
router.get('/banners/admin', ...manager, banners.listAdmin);
router.post('/banners', ...manager, banners.create);
router.put('/banners/:id', ...manager, banners.update);
router.delete('/banners/:id', ...manager, banners.remove);

// Popup quảng cáo
router.get('/popups', popups.listPublic);
router.post('/popups/:id/click', trackPopupClick);
router.get('/popups/admin', ...manager, popups.listAdmin);
router.post('/popups', ...manager, popups.create);
router.put('/popups/:id', ...manager, popups.update);
router.delete('/popups/:id', ...manager, popups.remove);

// Thông tin phòng khám hiện trên website
router.get('/clinic-info', clinicInfo.get);
router.put('/clinic-info', ...manager, clinicInfo.update);

// Số liệu cho trang tổng quan của quản lý
router.get('/stats', ...manager, getContentStats);

module.exports = router;
