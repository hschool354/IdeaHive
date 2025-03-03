const { body } = require('express-validator');
const { validationResult } = require('express-validator');
const { BadRequestError } = require('./error');

// Validation rules cho workspace
const workspaceValidationRules = [
  body('name')
    .notEmpty()
    .withMessage('Tên workspace không được để trống')
    .isLength({ min: 3, max: 100 })
    .withMessage('Tên workspace phải từ 3 đến 100 ký tự'),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Mô tả workspace không quá 500 ký tự')
];

// Middleware xử lý validation cho workspace
const validateWorkspace = [
  ...workspaceValidationRules,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => error.msg);
      return next(new BadRequestError(errorMessages.join(', ')));
    }
    next();
  }
];

module.exports = {
  validateWorkspace
};