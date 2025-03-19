const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const authMiddleware = require('../middlewares/auth');

/**
 * @route   GET /api/search
 * @desc    Tìm kiếm trang, blocks, comments trên toàn hệ thống
 * @access  Private
 */
router.get('/', authMiddleware, searchController.globalSearch);

/**
 * @route   GET /api/workspaces/:id/search
 * @desc    Tìm kiếm trang, blocks, comments trong một workspace cụ thể
 * @access  Private
 */
router.get('/workspaces/:id/search', authMiddleware, searchController.workspaceSearch);

module.exports = router;