const express = require("express");
const router = express.Router();
const blockController = require("../controllers/blockController");
const authenticated = require("../middlewares/auth");
const { param, body } = require("express-validator");

// Create a new block
router.post(
  "/blocks",
  authenticated,
  body("pageId").isUUID().withMessage("Page ID không hợp lệ"),
  body("type").isString().withMessage("Loại block không hợp lệ"),
  body("content").optional(),
  body("position").isInt().optional().withMessage("Vị trí phải là số nguyên"),
  blockController.createBlock
);

// Get block information
router.get(
  "/blocks/:id",
  authenticated,
  param("id").isMongoId().withMessage("Block ID không hợp lệ"),
  blockController.getBlock
);

// Update block
router.put(
  "/blocks/:id",
  authenticated,
  param("id").isMongoId().withMessage("Block ID không hợp lệ"),
  body("content").optional(),
  body("type").optional().isString().withMessage("Loại block không hợp lệ"),
  body("properties").optional().isObject().withMessage("Properties phải là một đối tượng"),
  blockController.updateBlock
);

// Delete block
router.delete(
  "/blocks/:id",
  authenticated,
  param("id").isMongoId().withMessage("Block ID không hợp lệ"),
  blockController.deleteBlock
);

// Change block position
router.put(
  "/blocks/:id/position",
  authenticated,
  param("id").isMongoId().withMessage("Block ID không hợp lệ"),
  body("position").isInt().withMessage("Vị trí phải là số nguyên"),
  blockController.updateBlockPosition
);

// Duplicate block
router.post(
  "/blocks/:id/duplicate",
  authenticated,
  param("id").isMongoId().withMessage("Block ID không hợp lệ"),
  blockController.duplicateBlock
);

module.exports = router;