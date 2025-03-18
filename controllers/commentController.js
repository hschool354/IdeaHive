const { MongoClient, ObjectId } = require("mongodb");
const mongoConfig = require("../config/mongodb");
const db = require("../config/database");
const { validationResult } = require("express-validator");

/**
 * API lấy tất cả bình luận của một trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về danh sách bình luận của trang.
 * @throws {Error} - Trả về lỗi nếu không thể lấy bình luận.
 * @example
 * GET /api/pages/:id/comments
 */
const getPageComments = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: pageId } = req.params;
    const userId = req.user.id;

    // Kiểm tra sự tồn tại của trang và quyền truy cập
    const [pages] = await db.query(
      "SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?",
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: "Trang không tồn tại" });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập trang (nếu không phải public)
    if (!page.is_public) {
      const [memberCheck] = await db.query(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res
          .status(403)
          .json({ message: "Không có quyền truy cập trang này" });
      }
    }

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Lấy bình luận từ collection comments
    const comments = await mongoDB
      .collection("comments")
      .find({ pageId, blockId: { $exists: false } })
      .sort({ createdAt: -1 })
      .toArray();

    // Lấy thông tin người dùng từ MySQL
    if (comments.length > 0) {
      const userIds = [...new Set(comments.map((comment) => comment.userId))];

      const [users] = await db.query(
        "SELECT id, full_name, avatar_url FROM users WHERE id IN (?)",
        [userIds]
      );

      const userMap = new Map(users.map((user) => [user.id, user]));

      // Thêm thông tin người dùng vào comments
      comments.forEach((comment) => {
        if (userMap.has(comment.userId)) {
          comment.user = {
            full_name: userMap.get(comment.userId).full_name,
            avatar_url: userMap.get(comment.userId).avatar_url,
          };
        }
      });
    }

    res.status(200).json(comments);
  } catch (error) {
    console.error("Lỗi khi lấy bình luận của trang:", error);
    res.status(500).json({ message: "Lỗi khi lấy bình luận của trang" });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API thêm bình luận vào trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin bình luận mới.
 * @throws {Error} - Trả về lỗi nếu không thể thêm bình luận.
 * @example
 * POST /api/pages/:id/comments
 * Body: { "content": "Nội dung bình luận", "mentions": ["user_id1", "user_id2"] }
 */
const addPageComment = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: pageId } = req.params;
    const userId = req.user.id;
    const { content, mentions = [] } = req.body;

    // Kiểm tra sự tồn tại của trang và quyền truy cập
    const [pages] = await db.query(
      "SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?",
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: "Trang không tồn tại" });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập và chỉnh sửa
    const [memberCheck] = await db.query(
      `SELECT wm.* FROM workspace_members wm
       JOIN roles r ON wm.role_id = r.id
       WHERE wm.workspace_id = ? AND wm.user_id = ? 
       AND r.name IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')`,
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      return res
        .status(403)
        .json({ message: "Không có quyền bình luận trên trang này" });
    }

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Tạo comment mới
    const newComment = {
      pageId,
      userId,
      content,
      mentions: mentions.length > 0 ? mentions : [],
      reactions: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Lưu comment vào MongoDB
    const result = await mongoDB.collection("comments").insertOne(newComment);

    // Lấy thông tin người dùng từ MySQL
    const [userData] = await db.query(
      "SELECT id, full_name, avatar_url FROM users WHERE id = ?",
      [userId]
    );

    if (userData.length > 0) {
      newComment.user = {
        full_name: userData[0].full_name,
        avatar_url: userData[0].avatar_url,
      };
    }

    newComment._id = result.insertedId;

    res.status(201).json(newComment);
  } catch (error) {
    console.error("Lỗi khi thêm bình luận vào trang:", error);
    res.status(500).json({ message: "Lỗi khi thêm bình luận vào trang" });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API lấy tất cả bình luận của một block.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về danh sách bình luận của block.
 * @throws {Error} - Trả về lỗi nếu không thể lấy bình luận.
 * @example
 * GET /api/blocks/:id/comments
 */
const getBlockComments = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: blockId } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Lấy thông tin block để xác định pageId
    const block = await mongoDB
      .collection("blocks")
      .findOne({ _id: new ObjectId(blockId) });

    if (!block) {
      return res.status(404).json({ message: "Block không tồn tại" });
    }

    const pageId = block.pageId;

    // Kiểm tra sự tồn tại của trang và quyền truy cập
    const [pages] = await db.query(
      "SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?",
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: "Trang không tồn tại" });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập trang (nếu không phải public)
    if (!page.is_public) {
      const [memberCheck] = await db.query(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res
          .status(403)
          .json({ message: "Không có quyền truy cập trang này" });
      }
    }

    // Lấy bình luận từ collection comments
    const comments = await mongoDB
      .collection("comments")
      .find({ blockId: new ObjectId(blockId) })
      .sort({ createdAt: -1 })
      .toArray();

    // Lấy thông tin người dùng từ MySQL
    if (comments.length > 0) {
      const userIds = [...new Set(comments.map((comment) => comment.userId))];

      const [users] = await db.query(
        "SELECT id, full_name, avatar_url FROM users WHERE id IN (?)",
        [userIds]
      );

      const userMap = new Map(users.map((user) => [user.id, user]));

      // Thêm thông tin người dùng vào comments
      comments.forEach((comment) => {
        if (userMap.has(comment.userId)) {
          comment.user = {
            full_name: userMap.get(comment.userId).full_name,
            avatar_url: userMap.get(comment.userId).avatar_url,
          };
        }
      });
    }

    res.status(200).json(comments);
  } catch (error) {
    console.error("Lỗi khi lấy bình luận của block:", error);
    res.status(500).json({ message: "Lỗi khi lấy bình luận của block" });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API thêm bình luận vào block.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin bình luận mới.
 * @throws {Error} - Trả về lỗi nếu không thể thêm bình luận.
 * @example
 * POST /api/blocks/:id/comments
 * Body: { "content": "Nội dung bình luận", "mentions": ["user_id1", "user_id2"] }
 */
const addBlockComment = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: blockId } = req.params;
    const userId = req.user.id;
    const { content, mentions = [] } = req.body;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Lấy thông tin block để xác định pageId
    const block = await mongoDB
      .collection("blocks")
      .findOne({ _id: new ObjectId(blockId) });

    if (!block) {
      return res.status(404).json({ message: "Block không tồn tại" });
    }

    const pageId = block.pageId;

    // Kiểm tra sự tồn tại của trang và quyền truy cập
    const [pages] = await db.query(
      "SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?",
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: "Trang không tồn tại" });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập và chỉnh sửa
    const [memberCheck] = await db.query(
      `SELECT wm.* FROM workspace_members wm
       JOIN roles r ON wm.role_id = r.id
       WHERE wm.workspace_id = ? AND wm.user_id = ? 
       AND r.name IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')`,
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      return res
        .status(403)
        .json({ message: "Không có quyền bình luận trên trang này" });
    }

    // Tạo comment mới
    const newComment = {
      blockId: new ObjectId(blockId),
      pageId,
      userId,
      content,
      mentions: mentions.length > 0 ? mentions : [],
      reactions: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Lưu comment vào MongoDB
    const result = await mongoDB.collection("comments").insertOne(newComment);

    // Lấy thông tin người dùng từ MySQL
    const [userData] = await db.query(
      "SELECT id, full_name, avatar_url FROM users WHERE id = ?",
      [userId]
    );

    if (userData.length > 0) {
      newComment.user = {
        full_name: userData[0].full_name,
        avatar_url: userData[0].avatar_url,
      };
    }

    newComment._id = result.insertedId;

    res.status(201).json(newComment);
  } catch (error) {
    console.error("Lỗi khi thêm bình luận vào block:", error);
    res.status(500).json({ message: "Lỗi khi thêm bình luận vào block" });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API cập nhật nội dung bình luận.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin bình luận sau khi cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật bình luận.
 * @example
 * PUT /api/comments/:id
 * Body: { "content": "Nội dung bình luận mới", "mentions": ["user_id1", "user_id2"] }
 */
const updateComment = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: commentId } = req.params;
    const userId = req.user.id;
    const { content, mentions = [] } = req.body;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Lấy thông tin comment
    const comment = await mongoDB
      .collection("comments")
      .findOne({ _id: new ObjectId(commentId) });

    if (!comment) {
      return res.status(404).json({ message: "Bình luận không tồn tại" });
    }

    // Kiểm tra người dùng có phải người tạo comment không
    if (comment.userId !== userId) {
      return res
        .status(403)
        .json({ message: "Không có quyền chỉnh sửa bình luận này" });
    }

    // Cập nhật comment
    const updateData = {
      content,
      mentions: mentions.length > 0 ? mentions : comment.mentions,
      updatedAt: new Date(),
    };

    await mongoDB
      .collection("comments")
      .updateOne({ _id: new ObjectId(commentId) }, { $set: updateData });

    // Lấy comment đã cập nhật
    const updatedComment = await mongoDB
      .collection("comments")
      .findOne({ _id: new ObjectId(commentId) });

    // Lấy thông tin người dùng từ MySQL
    const [userData] = await db.query(
      "SELECT id, full_name, avatar_url FROM users WHERE id = ?",
      [userId]
    );

    if (userData.length > 0) {
      updatedComment.user = {
        full_name: userData[0].full_name,
        avatar_url: userData[0].avatar_url,
      };
    }

    res.status(200).json(updatedComment);
  } catch (error) {
    console.error("Lỗi khi cập nhật bình luận:", error);
    res.status(500).json({ message: "Lỗi khi cập nhật bình luận" });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API xóa bình luận.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông báo xóa thành công.
 * @throws {Error} - Trả về lỗi nếu không thể xóa bình luận.
 * @example
 * DELETE /api/comments/:id
 */
const deleteComment = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: commentId } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Lấy thông tin comment
    const comment = await mongoDB
      .collection("comments")
      .findOne({ _id: new ObjectId(commentId) });

    if (!comment) {
      return res.status(404).json({ message: "Bình luận không tồn tại" });
    }

    const pageId = comment.pageId;

    // Kiểm tra người dùng có phải người tạo comment không
    const isCommentCreator = comment.userId === userId;

    if (!isCommentCreator) {
      // Nếu không phải người tạo, kiểm tra quyền admin của workspace
      const [pages] = await db.query(
        "SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?",
        [pageId]
      );

      if (pages.length === 0) {
        return res.status(404).json({ message: "Trang không tồn tại" });
      }

      const workspaceId = pages[0].workspace_id;

      // Kiểm tra xem người dùng có quyền admin hoặc owner không
      const [adminCheck] = await db.query(
        `SELECT wm.* FROM workspace_members wm
         JOIN roles r ON wm.role_id = r.id
         WHERE wm.workspace_id = ? AND wm.user_id = ? 
         AND r.name IN ('OWNER', 'ADMIN')`,
        [workspaceId, userId]
      );

      if (adminCheck.length === 0) {
        return res
          .status(403)
          .json({ message: "Không có quyền xóa bình luận này" });
      }
    }

    // Xóa comment
    await mongoDB
      .collection("comments")
      .deleteOne({ _id: new ObjectId(commentId) });

    res.status(200).json({ message: "Xóa bình luận thành công" });
  } catch (error) {
    console.error("Lỗi khi xóa bình luận:", error);
    res.status(500).json({ message: "Lỗi khi xóa bình luận" });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API thêm reaction vào bình luận.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin reactions sau khi cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể thêm reaction.
 * @example
 * POST /api/comments/:id/reactions
 * Body: { "type": "like" }
 */
const addReaction = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: commentId } = req.params;
    const userId = req.user.id;
    const { type } = req.body;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Lấy thông tin comment
    const comment = await mongoDB
      .collection("comments")
      .findOne({ _id: new ObjectId(commentId) });

    if (!comment) {
      return res.status(404).json({ message: "Bình luận không tồn tại" });
    }

    const pageId = comment.pageId;

    // Kiểm tra quyền truy cập trang
    const [pages] = await db.query(
      "SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?",
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: "Trang không tồn tại" });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    if (!page.is_public) {
      const [memberCheck] = await db.query(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res
          .status(403)
          .json({ message: "Không có quyền truy cập trang này" });
      }
    }

    // Cập nhật reactions
    const updatePath = `reactions.${type}`;

    await mongoDB
      .collection("comments")
      .updateOne(
        { _id: new ObjectId(commentId) },
        { $addToSet: { [updatePath]: userId } }
      );

    // Lấy reactions sau khi cập nhật
    const updatedComment = await mongoDB
      .collection("comments")
      .findOne(
        { _id: new ObjectId(commentId) },
        { projection: { reactions: 1 } }
      );

    res.status(200).json({ reactions: updatedComment.reactions });
  } catch (error) {
    console.error("Lỗi khi thêm reaction vào bình luận:", error);
    res.status(500).json({ message: "Lỗi khi thêm reaction vào bình luận" });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API xóa reaction khỏi bình luận.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin reactions sau khi cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể xóa reaction.
 * @example
 * DELETE /api/comments/:id/reactions/:type
 */
const removeReaction = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: commentId, type } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);

    // Lấy thông tin comment
    const comment = await mongoDB
      .collection("comments")
      .findOne({ _id: new ObjectId(commentId) });

    if (!comment) {
      return res.status(404).json({ message: "Bình luận không tồn tại" });
    }

    const pageId = comment.pageId;

    // Kiểm tra quyền truy cập trang
    const [pages] = await db.query(
      "SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?",
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: "Trang không tồn tại" });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    if (!page.is_public) {
      const [memberCheck] = await db.query(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res
          .status(403)
          .json({ message: "Không có quyền truy cập trang này" });
      }
    }

    // Cập nhật reactions - xóa userId khỏi mảng reactions của loại cụ thể
    const updatePath = `reactions.${type}`;

    await mongoDB
      .collection("comments")
      .updateOne(
        { _id: new ObjectId(commentId) },
        { $pull: { [updatePath]: userId } }
      );

    // Lấy reactions sau khi cập nhật
    const updatedComment = await mongoDB
      .collection("comments")
      .findOne(
        { _id: new ObjectId(commentId) },
        { projection: { reactions: 1 } }
      );

    res.status(200).json({ reactions: updatedComment.reactions });
  } catch (error) {
    console.error("Lỗi khi xóa reaction khỏi bình luận:", error);
    res.status(500).json({ message: "Lỗi khi xóa reaction khỏi bình luận" });
  } finally {
    if (client) await client.close();
  }
};

module.exports = {
  getPageComments,
  addPageComment,
  getBlockComments,
  addBlockComment,
  updateComment,
  deleteComment,
  addReaction,
  removeReaction,
};