const express = require("express");
const router = express.Router();
const pageContentController = require("../controllers/pageContentController");
const authenticated = require("../middlewares/auth");
const { param, body } = require("express-validator");

// Get page content
router.get(
  "/pages/:id/content",
  authenticated,
  param("id").isUUID().withMessage("Page ID không hợp lệ"),
  pageContentController.getPageContent
);

// Update page content
router.put(
  "/pages/:id/content",
  authenticated,
  param("id").isUUID().withMessage("Page ID không hợp lệ"),
  body("blocks").isArray().withMessage("Blocks phải là một mảng"),
  pageContentController.updatePageContent
);

// Get page edit history
router.get(
  "/pages/:id/history",
  authenticated,
  param("id").isUUID().withMessage("Page ID không hợp lệ"),
  pageContentController.getPageHistory
);

// Get specific page version
router.get(
  "/pages/:id/history/:version",
  authenticated,
  param("id").isUUID().withMessage("Page ID không hợp lệ"),
  param("version").isInt().withMessage("Version phải là số nguyên"),
  pageContentController.getPageVersion
);

// Restore page to a previous version
router.post(
  "/pages/:id/restore/:version",
  authenticated,
  param("id").isUUID().withMessage("Page ID không hợp lệ"),
  param("version").isInt().withMessage("Version phải là số nguyên"),
  pageContentController.restorePageVersion
);

module.exports = router;
