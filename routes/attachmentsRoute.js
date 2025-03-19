const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const authMiddleware = require('../middlewares/auth');
const multer = require('multer');

// Sử dụng memoryStorage để không lưu file vào disk
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * @route   POST /api/attachments
 * @desc    Tải lên tệp đính kèm
 * @access  Private
 */
router.post('/', authMiddleware, upload.single('file'), attachmentController.uploadAttachment);

/**
 * @route   GET /api/attachments/:id
 * @desc    Lấy thông tin tệp đính kèm
 * @access  Private
 */
router.get('/:id', authMiddleware, attachmentController.getAttachmentById);

/**
 * @route   DELETE /api/attachments/:id
 * @desc    Xóa tệp đính kèm
 * @access  Private
 */
router.delete('/:id', authMiddleware, attachmentController.deleteAttachment);

module.exports = router;