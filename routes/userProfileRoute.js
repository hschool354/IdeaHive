const express = require('express');
const router = express.Router();
const userProfileController = require('../controllers/userProfileController');
const authenticated = require('../middlewares/auth');
const { body } = require('express-validator');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// Lấy thông tin profile
router.get('/', 
  authenticated,
  userProfileController.getUserProfile
);

// Cập nhật profile
router.put('/',
  authenticated,
  body('full_name').optional().notEmpty().withMessage('Tên không được để trống nếu được cung cấp'),
  body('email').optional().isEmail().withMessage('Email không hợp lệ'),
  userProfileController.updateUserProfile
);

// Cập nhật avatar
router.put('/avatar',
  authenticated,
  upload.single('avatar'), // 'avatar' là tên field trong form-data
  userProfileController.updateUserAvatar
);

// Lấy cài đặt người dùng
router.get('/users/settings',
  authenticated,
  userProfileController.getUserSettings
);

// Cập nhật cài đặt người dùng
router.put('/users/settings',
  authenticated,
  userProfileController.updateUserSettings
);

// Xóa tài khoản
router.delete('/users/account',
  authenticated,
  userProfileController.deleteUserAccount
);

module.exports = router;