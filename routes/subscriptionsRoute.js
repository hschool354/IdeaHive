const express = require('express');
const router = express.Router();
const subscriptionsController = require('../controllers/subscriptionsController');
const authMiddleware = require('../middlewares/auth');

// Protected routes (yêu cầu xác thực bằng JWT)
router.get('/me', authMiddleware, subscriptionsController.getCurrentSubscription);
router.post('/upgrade', authMiddleware, subscriptionsController.upgradeSubscription);
router.post('/cancel', authMiddleware, subscriptionsController.cancelSubscription);

module.exports = router;