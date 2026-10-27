const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');

router.get('/', cartController.getCart);
router.post('/add', cartController.addToCart);
router.put('/item/:item_id', cartController.updateCartItem);
router.delete('/item/:item_id', cartController.removeFromCart);

module.exports = router;