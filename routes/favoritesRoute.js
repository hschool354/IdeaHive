const express = require('express');
const router = express.Router();
const favoritesController = require('../controllers/favoritesController');
const authMiddleware = require('../middlewares/auth');

/**
 * @route   GET /api/favorites
 * @desc    Lấy danh sách trang yêu thích của người dùng
 * @access  Private
 */
router.get('/', authMiddleware, favoritesController.getFavorites);

/**
 * @route   POST /api/favorites
 * @desc    Thêm một trang vào danh sách yêu thích
 * @access  Private
 */
router.post('/', authMiddleware, favoritesController.addFavorite);

/**
 * @route   DELETE /api/favorites/:pageId
 * @desc    Xóa một trang khỏi danh sách yêu thích
 * @access  Private
 */
router.delete('/:pageId', authMiddleware, favoritesController.removeFavorite);

module.exports = router;