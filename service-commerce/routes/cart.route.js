const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

// Giỏ hàng luôn là của khách đang đăng nhập (customer_id lấy từ token)
router.use(verifyToken, authorizeRoles('CUSTOMER'));

router.get('/', cartController.getCart);
router.post('/add', cartController.addToCart);
router.put('/item/:item_id', cartController.updateCartItem);
router.delete('/item/:item_id', cartController.removeFromCart);

module.exports = router;
