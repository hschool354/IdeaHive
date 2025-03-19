const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const authMiddleware = require('../middlewares/auth');

/**
 * @route   GET /api/templates
 * @desc    Lấy danh sách templates
 * @access  Private
 */
router.get('/', authMiddleware, templateController.getTemplates);

/**
 * @route   POST /api/templates
 * @desc    Tạo template mới
 * @access  Private
 */
router.post('/', authMiddleware, templateController.createTemplate);

/**
 * @route   GET /api/templates/:id
 * @desc    Lấy thông tin template
 * @access  Private
 */
router.get('/:id', authMiddleware, templateController.getTemplateById);

/**
 * @route   PUT /api/templates/:id
 * @desc    Cập nhật template
 * @access  Private
 */
router.put('/:id', authMiddleware, templateController.updateTemplate);

/**
 * @route   DELETE /api/templates/:id
 * @desc    Xóa template
 * @access  Private
 */
router.delete('/:id', authMiddleware, templateController.deleteTemplate);

/**
 * @route   POST /api/pages/:id/apply-template/:templateId
 * @desc    Áp dụng template vào trang
 * @access  Private
 */
router.post('/pages/:id/apply-template/:templateId', authMiddleware, templateController.applyTemplate);

module.exports = router;