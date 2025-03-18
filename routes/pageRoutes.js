const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
const authenticated = require('../middlewares/auth');
// const validator = require('../middlewares/validator');
const { body, param } = require('express-validator');

cconsole.log('getWorkspacePages exists:', !!pageController.getWorkspacePages);
console.log('createPage exists:', !!pageController.createPage);

// Lấy danh sách trang trong workspace
router.get('/workspaces/:id/pages', authenticated,
  param('id').isUUID().withMessage('Workspace ID không hợp lệ'),
  
  pageController.getWorkspacePages
);

// Tạo trang mới trong workspace
router.post('/workspaces/:id/pages',authenticated,
  param('id').isUUID().withMessage('Workspace ID không hợp lệ'),
  body('title').notEmpty().withMessage('Tiêu đề trang là bắt buộc'),
  body('parent_page_id').optional().isUUID().withMessage('ID trang cha không hợp lệ'),
  
  pageController.createPage
);

// Lấy thông tin chi tiết của trang
router.get('/pages/:id',authenticated,
  param('id').isUUID().withMessage('Page ID không hợp lệ'),
  
  pageController.getPageDetails
);

// Cập nhật metadata của trang
router.put('/pages/:id',authenticated,
  param('id').isUUID().withMessage('Page ID không hợp lệ'),
  body('title').optional().notEmpty().withMessage('Tiêu đề không được để trống'),
  body('is_public').optional().isBoolean().withMessage('is_public phải là giá trị boolean'),
  body('parent_page_id').optional().isUUID().withMessage('ID trang cha không hợp lệ'),
  
  pageController.updatePage
);

// Xóa trang
router.delete('/pages/:id',authenticated,
  param('id').isUUID().withMessage('Page ID không hợp lệ'),
  
  pageController.deletePage
);

// Nhân bản trang
router.post('/pages/:id/duplicate',authenticated,
  param('id').isUUID().withMessage('Page ID không hợp lệ'),
  
  pageController.duplicatePage
);

module.exports = router;