const express = require("express");
const router = express.Router();
const commentController = require("../controllers/commentController");
const authenticated = require("../middlewares/auth");
const { param, body } = require("express-validator");

// Get comments for a page
router.get(
  "/pages/:id/comments",
  authenticated,
  param("id").isUUID().withMessage("Page ID không hợp lệ"),
  commentController.getPageComments
);

// Add comment to a page
router.post(
  "/pages/:id/comments",
  authenticated,
  param("id").isUUID().withMessage("Page ID không hợp lệ"),
  body("content").notEmpty().withMessage("Nội dung bình luận không được để trống"),
  commentController.addPageComment
);

// Get comments for a block
router.get(
  "/blocks/:id/comments",
  authenticated,
  param("id").isMongoId().withMessage("Block ID không hợp lệ"),
  commentController.getBlockComments
);

// Add comment to a block
router.post(
  "/blocks/:id/comments",
  authenticated,
  param("id").isMongoId().withMessage("Block ID không hợp lệ"),
  body("content").notEmpty().withMessage("Nội dung bình luận không được để trống"),
  commentController.addBlockComment
);

// Update a comment
router.put(
  "/comments/:id",
  authenticated,
  param("id").isMongoId().withMessage("Comment ID không hợp lệ"),
  body("content").notEmpty().withMessage("Nội dung bình luận không được để trống"),
  commentController.updateComment
);

// Delete a comment
router.delete(
  "/comments/:id",
  authenticated,
  param("id").isMongoId().withMessage("Comment ID không hợp lệ"),
  commentController.deleteComment
);

// Add reaction to a comment
router.post(
  "/comments/:id/reactions",
  authenticated,
  param("id").isMongoId().withMessage("Comment ID không hợp lệ"),
  body("type").isIn(["like", "heart", "laugh", "surprised", "sad", "angry"])
    .withMessage("Loại reaction không hợp lệ"),
  commentController.addReaction
);

// Remove reaction from a comment
router.delete(
  "/comments/:id/reactions/:type",
  authenticated,
  param("id").isMongoId().withMessage("Comment ID không hợp lệ"),
  param("type").isIn(["like", "heart", "laugh", "surprised", "sad", "angry"])
    .withMessage("Loại reaction không hợp lệ"),
  commentController.removeReaction
);

module.exports = router;