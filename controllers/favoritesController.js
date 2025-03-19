const dbMysql = require('../config/database');

/**
 * Lấy danh sách trang yêu thích
 * @route   GET /api/favorites
 * @desc    Trả về danh sách các trang trong danh sách yêu thích của người dùng
 * @access  Private
 */
const getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;

    // Truy vấn danh sách trang yêu thích
    const [favorites] = await dbMysql.query(
      `SELECT f.page_id, p.title, p.workspace_id, p.icon, p.created_by, f.added_at
       FROM favorites f
       JOIN pages p ON f.page_id = p.id
       WHERE f.user_id = ?`,
      [userId]
    );

    res.status(200).json({
      favorites: favorites.map(f => ({
        pageId: f.page_id,
        title: f.title,
        workspaceId: f.workspace_id,
        icon: f.icon,
        createdBy: f.created_by,
        addedAt: f.added_at
      }))
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách yêu thích:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách yêu thích' });
  }
};

/**
 * Thêm trang vào danh sách yêu thích
 * @route   POST /api/favorites
 * @desc    Thêm một trang vào danh sách yêu thích của người dùng
 * @access  Private
 */
const addFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { pageId } = req.body;

    if (!pageId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp pageId' });
    }

    // Kiểm tra trang có tồn tại không
    const [pages] = await dbMysql.query(
      'SELECT id, workspace_id, is_public, created_by FROM pages WHERE id = ?',
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const page = pages[0];

    // Kiểm tra quyền truy cập trang
    if (!page.is_public && page.created_by !== userId) {
      const [memberCheck] = await dbMysql.query(
        `SELECT wm.* FROM workspace_members wm
         JOIN roles r ON wm.role_id = r.id
         WHERE wm.workspace_id = ? AND wm.user_id = ?
         AND r.name IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')`,
        [page.workspace_id, userId]
      );
      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền truy cập trang này' });
      }
    }

    // Kiểm tra xem trang đã trong danh sách yêu thích chưa
    const [existingFavorite] = await dbMysql.query(
      'SELECT * FROM favorites WHERE user_id = ? AND page_id = ?',
      [userId, pageId]
    );

    if (existingFavorite.length > 0) {
      return res.status(400).json({ message: 'Trang này đã trong danh sách yêu thích' });
    }

    // Thêm vào danh sách yêu thích
    await dbMysql.query(
      'INSERT INTO favorites (user_id, page_id, added_at) VALUES (?, ?, NOW())',
      [userId, pageId]
    );

    res.status(201).json({ message: 'Đã thêm trang vào danh sách yêu thích', pageId });
  } catch (error) {
    console.error('Lỗi khi thêm trang vào yêu thích:', error);
    res.status(500).json({ message: 'Lỗi khi thêm trang vào yêu thích' });
  }
};

/**
 * Xóa trang khỏi danh sách yêu thích
 * @route   DELETE /api/favorites/:pageId
 * @desc    Xóa một trang khỏi danh sách yêu thích của người dùng
 * @access  Private
 */
const removeFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { pageId } = req.params;

    // Kiểm tra xem trang có trong danh sách yêu thích không
    const [existingFavorite] = await dbMysql.query(
      'SELECT * FROM favorites WHERE user_id = ? AND page_id = ?',
      [userId, pageId]
    );

    if (existingFavorite.length === 0) {
      return res.status(404).json({ message: 'Trang này không có trong danh sách yêu thích' });
    }

    // Xóa khỏi danh sách yêu thích
    await dbMysql.query(
      'DELETE FROM favorites WHERE user_id = ? AND page_id = ?',
      [userId, pageId]
    );

    res.status(200).json({ message: 'Đã xóa trang khỏi danh sách yêu thích', pageId });
  } catch (error) {
    console.error('Lỗi khi xóa trang khỏi yêu thích:', error);
    res.status(500).json({ message: 'Lỗi khi xóa trang khỏi yêu thích' });
  }
};

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite
};