const { MongoClient, ObjectId } = require('mongodb');
const mongoConfig = require('../config/mongodb');
const dbMysql = require('../config/database');

/**
 * Tìm kiếm toàn cục trên toàn hệ thống
 * @route   GET /api/search
 * @desc    Tìm kiếm trang, blocks, comments mà người dùng có quyền truy cập
 * @access  Private
 */
const globalSearch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q } = req.query; // Query string (ví dụ: ?q=keyword)

    if (!q || q.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng cung cấp từ khóa tìm kiếm' });
    }

    // Kết nối MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDb = client.db(mongoConfig.dbName);
    const blocksCollection = mongoDb.collection('blocks');
    const commentsCollection = mongoDb.collection('comments');

    // 1. Tìm kiếm trang (pages) trong MySQL
    const [pages] = await dbMysql.query(
      `SELECT p.id, p.title, p.workspace_id, p.created_by
       FROM pages p
       LEFT JOIN workspace_members wm ON p.workspace_id = wm.workspace_id
       WHERE (p.title LIKE ? OR p.id = ?)
       AND (p.is_public = TRUE OR p.created_by = ? OR wm.user_id = ?)`,
      [`%${q}%`, q, userId, userId]
    );

    // 2. Tìm kiếm blocks trong MongoDB
    const blocks = await blocksCollection
      .find({
        $text: { $search: q }, // Sử dụng text index đã tạo
        $or: [
          { createdBy: userId }, // Blocks do người dùng tạo
          { pageId: { $in: pages.map(p => p.id) } } // Blocks trong trang người dùng có quyền
        ]
      })
      .limit(50)
      .toArray();

    // 3. Tìm kiếm comments trong MongoDB
    const comments = await commentsCollection
      .find({
        $or: [
          { content: { $regex: q, $options: 'i' } }, // Tìm kiếm không phân biệt hoa thường
          { pageId: { $in: pages.map(p => p.id) } } // Comments trong trang người dùng có quyền
        ],
        userId: { $exists: true } // Đảm bảo chỉ lấy comments hợp lệ
      })
      .limit(50)
      .toArray();

    await client.close();

    // Trả về kết quả
    res.status(200).json({
      pages: pages.map(p => ({
        id: p.id,
        title: p.title,
        workspaceId: p.workspace_id
      })),
      blocks: blocks.map(b => ({
        id: b._id,
        pageId: b.pageId,
        type: b.type,
        content: b.content,
        position: b.position
      })),
      comments: comments.map(c => ({
        id: c._id,
        pageId: c.pageId,
        blockId: c.blockId,
        content: c.content,
        userId: c.userId,
        createdAt: c.createdAt
      }))
    });
  } catch (error) {
    console.error('Lỗi khi tìm kiếm toàn cục:', error);
    res.status(500).json({ message: 'Lỗi khi thực hiện tìm kiếm' });
  }
};

/**
 * Tìm kiếm trong một workspace cụ thể
 * @route   GET /api/workspaces/:id/search
 * @desc    Tìm kiếm trang, blocks, comments trong workspace mà người dùng có quyền
 * @access  Private
 */
const workspaceSearch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: workspaceId } = req.params;
    const { q } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng cung cấp từ khóa tìm kiếm' });
    }

    // Kiểm tra quyền truy cập workspace
    const [memberCheck] = await dbMysql.query(
      `SELECT wm.* FROM workspace_members wm
       JOIN roles r ON wm.role_id = r.id
       WHERE wm.workspace_id = ? AND wm.user_id = ?`,
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ message: 'Không có quyền truy cập workspace này' });
    }

    // Kết nối MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDb = client.db(mongoConfig.dbName);
    const blocksCollection = mongoDb.collection('blocks');
    const commentsCollection = mongoDb.collection('comments');

    // 1. Tìm kiếm trang (pages) trong workspace
    const [pages] = await dbMysql.query(
      `SELECT id, title, workspace_id, created_by
       FROM pages
       WHERE workspace_id = ? AND (title LIKE ? OR id = ?)`,
      [workspaceId, `%${q}%`, q]
    );

    // 2. Tìm kiếm blocks trong workspace
    const blocks = await blocksCollection
      .find({
        $text: { $search: q },
        pageId: { $in: pages.map(p => p.id) }
      })
      .limit(50)
      .toArray();

    // 3. Tìm kiếm comments trong workspace
    const comments = await commentsCollection
      .find({
        $or: [
          { content: { $regex: q, $options: 'i' } },
          { pageId: { $in: pages.map(p => p.id) } }
        ]
      })
      .limit(50)
      .toArray();

    await client.close();

    // Trả về kết quả
    res.status(200).json({
      pages: pages.map(p => ({
        id: p.id,
        title: p.title,
        workspaceId: p.workspace_id
      })),
      blocks: blocks.map(b => ({
        id: b._id,
        pageId: b.pageId,
        type: b.type,
        content: b.content,
        position: b.position
      })),
      comments: comments.map(c => ({
        id: c._id,
        pageId: c.pageId,
        blockId: c.blockId,
        content: c.content,
        userId: c.userId,
        createdAt: c.createdAt
      }))
    });
  } catch (error) {
    console.error('Lỗi khi tìm kiếm trong workspace:', error);
    res.status(500).json({ message: 'Lỗi khi thực hiện tìm kiếm' });
  }
};

module.exports = {
  globalSearch,
  workspaceSearch
};