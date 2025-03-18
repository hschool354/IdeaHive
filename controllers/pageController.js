const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * API lấy danh sách trang trong workspace.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về danh sách trang trong workspace.
 * @throws {Error} - Trả về lỗi nếu không thể lấy danh sách trang.
 * @example
 * GET /api/workspaces/:id/pages
 */
const getWorkspacePages = async (req, res) => {
  try {
    const { id: workspaceId } = req.params;
    const userId = req.user.id;

    // Kiểm tra người dùng có quyền truy cập workspace không
    const [memberCheck] = await db.query(
      'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ message: 'Không có quyền truy cập workspace này' });
    }

    // Lấy danh sách trang root (không có parent_page_id) trong workspace
    const [rootPages] = await db.query(
      `SELECT p.id, p.title, p.icon, p.cover_url, p.is_public, p.share_link, 
              p.created_at, p.updated_at, u.full_name as created_by_name
       FROM pages p
       JOIN users u ON p.created_by = u.id
       WHERE p.workspace_id = ? AND p.parent_page_id IS NULL
       ORDER BY p.updated_at DESC`,
      [workspaceId]
    );

    // Lấy danh sách tất cả các trang trong workspace để xây dựng cấu trúc cây
    const [allPages] = await db.query(
      `SELECT p.id, p.title, p.icon, p.cover_url, p.is_public, p.parent_page_id, 
              p.created_at, p.updated_at, u.full_name as created_by_name
       FROM pages p
       JOIN users u ON p.created_by = u.id
       WHERE p.workspace_id = ?
       ORDER BY p.updated_at DESC`,
      [workspaceId]
    );

    // Xây dựng cấu trúc cây cho các trang
    const pageMap = new Map();
    allPages.forEach(page => {
      page.children = [];
      pageMap.set(page.id, page);
    });

    // Đưa các trang con vào trang cha
    allPages.forEach(page => {
      if (page.parent_page_id && pageMap.has(page.parent_page_id)) {
        const parentPage = pageMap.get(page.parent_page_id);
        parentPage.children.push(page);
      }
    });

    res.status(200).json({
      rootPages,
      allPages
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách trang:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách trang' });
  }
};

/**
 * API tạo trang mới trong workspace.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin trang mới đã tạo.
 * @throws {Error} - Trả về lỗi nếu không thể tạo trang.
 * @example
 * POST /api/workspaces/:id/pages
 * Body: { "title": "Trang mới", "icon": "📝", "parent_page_id": "optional-parent-id" }
 */
const createPage = async (req, res) => {
  try {
    const { id: workspaceId } = req.params;
    const userId = req.user.id;
    const { title, icon, parent_page_id } = req.body;

    // Kiểm tra người dùng có quyền trong workspace
    const [memberCheck] = await db.query(
      `SELECT wm.* FROM workspace_members wm
       JOIN roles r ON wm.role_id = r.id
       WHERE wm.workspace_id = ? AND wm.user_id = ? 
       AND r.name IN ('OWNER', 'ADMIN', 'MEMBER')`,
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ message: 'Không có quyền tạo trang trong workspace này' });
    }

    // Nếu có parent_page_id, kiểm tra xem nó có tồn tại và thuộc workspace không
    if (parent_page_id) {
      const [parentCheck] = await db.query(
        'SELECT * FROM pages WHERE id = ? AND workspace_id = ?',
        [parent_page_id, workspaceId]
      );

      if (parentCheck.length === 0) {
        return res.status(400).json({ message: 'Trang cha không tồn tại hoặc không thuộc workspace này' });
      }
    }

    // Tạo ID mới cho trang
    const pageId = uuidv4();

    // Thêm trang mới vào cơ sở dữ liệu
    await db.query(
      `INSERT INTO pages 
       (id, workspace_id, title, icon, parent_page_id, created_by) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pageId, workspaceId, title, icon, parent_page_id || null, userId]
    );

    // Tạo nội dung trang mới trong MongoDB (nếu bạn sử dụng MongoDB cho nội dung)
    // Giả sử bạn có một service hoặc hàm để tạo nội dung trong MongoDB
    // await createPageContentInMongoDB(pageId);

    // Lấy thông tin trang mới đã tạo
    const [newPage] = await db.query(
      `SELECT p.id, p.title, p.icon, p.cover_url, p.is_public, p.parent_page_id,
              p.created_at, p.updated_at, u.full_name as created_by_name
       FROM pages p
       JOIN users u ON p.created_by = u.id
       WHERE p.id = ?`,
      [pageId]
    );

    res.status(201).json({
      message: 'Trang mới đã được tạo thành công',
      page: newPage[0]
    });
  } catch (error) {
    console.error('Lỗi khi tạo trang:', error);
    res.status(500).json({ message: 'Lỗi khi tạo trang mới' });
  }
};

/**
 * API lấy thông tin chi tiết của trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin chi tiết của trang.
 * @throws {Error} - Trả về lỗi nếu không thể lấy thông tin trang.
 * @example
 * GET /api/pages/:id
 */
const getPageDetails = async (req, res) => {
  try {
    const { id: pageId } = req.params;
    const userId = req.user.id;

    // Lấy thông tin trang và workspace của nó
    const [pages] = await db.query(
      `SELECT p.*, w.id as workspace_id, u.full_name as created_by_name
       FROM pages p
       JOIN workspaces w ON p.workspace_id = w.id
       JOIN users u ON p.created_by = u.id
       WHERE p.id = ?`,
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập trang
    // Nếu trang là public, cho phép truy cập
    if (!page.is_public) {
      // Kiểm tra người dùng có trong workspace không
      const [memberCheck] = await db.query(
        'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền truy cập trang này' });
      }
    }

    // Lấy các trang con (nếu có)
    const [childPages] = await db.query(
      `SELECT id, title, icon, updated_at 
       FROM pages 
       WHERE parent_page_id = ?
       ORDER BY updated_at DESC`,
      [pageId]
    );

    // Lấy thông tin trang cha (nếu có)
    let parentPage = null;
    if (page.parent_page_id) {
      const [parentResult] = await db.query(
        'SELECT id, title, icon FROM pages WHERE id = ?',
        [page.parent_page_id]
      );
      if (parentResult.length > 0) {
        parentPage = parentResult[0];
      }
    }

    // Lấy thông tin nội dung trang từ MongoDB
    // Bạn cần triển khai hàm này dựa trên cách bạn lưu trữ nội dung trong MongoDB
    // const pageContent = await getPageContentFromMongoDB(pageId);

    const result = {
      ...page,
      children: childPages,
      parent: parentPage,
      // content: pageContent, // Nội dung từ MongoDB
    };

    res.status(200).json(result);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin trang:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin trang' });
  }
};

/**
 * API cập nhật metadata của trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin trang đã cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật trang.
 * @example
 * PUT /api/pages/:id
 * Body: { "title": "Tiêu đề mới", "icon": "📘", "cover_url": "url-to-cover", "is_public": true }
 */
const updatePage = async (req, res) => {
  try {
    const { id: pageId } = req.params;
    const userId = req.user.id;
    const { title, icon, cover_url, is_public, parent_page_id } = req.body;

    // Lấy thông tin trang hiện tại
    const [pages] = await db.query(
      'SELECT * FROM pages WHERE id = ?',
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền chỉnh sửa trang
    const [memberCheck] = await db.query(
      `SELECT wm.* FROM workspace_members wm
       JOIN roles r ON wm.role_id = r.id
       WHERE wm.workspace_id = ? AND wm.user_id = ? 
       AND r.name IN ('OWNER', 'ADMIN', 'MEMBER')`,
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ message: 'Không có quyền chỉnh sửa trang này' });
    }

    // Kiểm tra sự tồn tại của trang cha mới (nếu được cung cấp)
    if (parent_page_id && parent_page_id !== page.parent_page_id) {
      // Kiểm tra trang cha mới có tồn tại không
      const [parentCheck] = await db.query(
        'SELECT * FROM pages WHERE id = ? AND workspace_id = ?',
        [parent_page_id, workspaceId]
      );

      if (parentCheck.length === 0) {
        return res.status(400).json({ message: 'Trang cha không tồn tại hoặc không thuộc workspace này' });
      }

      // Kiểm tra xem trang cha mới có phải là con của trang hiện tại không (tránh vòng lặp)
      const isDescendant = await checkIfDescendant(pageId, parent_page_id, db);
      if (isDescendant) {
        return res.status(400).json({ message: 'Không thể chọn trang con làm trang cha' });
      }
    }

    // Cập nhật metadata của trang
    await db.query(
      `UPDATE pages 
       SET title = COALESCE(?, title),
           icon = COALESCE(?, icon),
           cover_url = COALESCE(?, cover_url),
           is_public = COALESCE(?, is_public),
           parent_page_id = COALESCE(?, parent_page_id)
       WHERE id = ?`,
      [
        title, 
        icon, 
        cover_url, 
        is_public !== undefined ? is_public : page.is_public,
        parent_page_id !== undefined ? parent_page_id : page.parent_page_id,
        pageId
      ]
    );

    // Lấy thông tin trang sau khi cập nhật
    const [updatedPage] = await db.query(
      `SELECT p.*, u.full_name as created_by_name
       FROM pages p
       JOIN users u ON p.created_by = u.id
       WHERE p.id = ?`,
      [pageId]
    );

    res.status(200).json({
      message: 'Cập nhật trang thành công',
      page: updatedPage[0]
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật trang:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trang' });
  }
};

/**
 * API xóa trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông báo xóa thành công.
 * @throws {Error} - Trả về lỗi nếu không thể xóa trang.
 * @example
 * DELETE /api/pages/:id
 */
const deletePage = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id: pageId } = req.params;
    const userId = req.user.id;

    // Lấy thông tin trang
    const [pages] = await connection.query(
      'SELECT * FROM pages WHERE id = ?',
      [pageId]
    );

    if (pages.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền xóa trang
    const [memberCheck] = await connection.query(
      `SELECT wm.* FROM workspace_members wm
       JOIN roles r ON wm.role_id = r.id
       WHERE wm.workspace_id = ? AND wm.user_id = ? 
       AND r.name IN ('OWNER', 'ADMIN')`,
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      await connection.rollback();
      return res.status(403).json({ message: 'Không có quyền xóa trang này' });
    }

    // Lấy danh sách tất cả các trang con (bao gồm cả cháu, chắt,...)
    const descendantPages = await getAllDescendantPages(pageId, connection);
    const allPageIds = [pageId, ...descendantPages.map(p => p.id)];

    // Xóa các favorites liên quan đến các trang này
    await connection.query(
      'DELETE FROM favorites WHERE page_id IN (?)',
      [allPageIds]
    );

    // Cập nhật parent_page_id cho các trang con trực tiếp
    await connection.query(
      'UPDATE pages SET parent_page_id = ? WHERE parent_page_id = ?',
      [page.parent_page_id, pageId]
    );

    // Xóa nội dung trang từ MongoDB (nếu có)
    // Bạn cần triển khai phần này dựa trên cách bạn lưu trữ nội dung trong MongoDB
    // await deletePageContentsFromMongoDB(allPageIds);

    // Xóa trang từ MySQL
    await connection.query(
      'DELETE FROM pages WHERE id = ?',
      [pageId]
    );

    await connection.commit();
    
    res.status(200).json({
      message: 'Xóa trang thành công'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi khi xóa trang:', error);
    res.status(500).json({ message: 'Lỗi khi xóa trang' });
  } finally {
    connection.release();
  }
};

/**
 * API nhân bản trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin trang đã nhân bản.
 * @throws {Error} - Trả về lỗi nếu không thể nhân bản trang.
 * @example
 * POST /api/pages/:id/duplicate
 */
const duplicatePage = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id: pageId } = req.params;
    const userId = req.user.id;

    // Lấy thông tin trang gốc
    const [pages] = await connection.query(
      'SELECT * FROM pages WHERE id = ?',
      [pageId]
    );

    if (pages.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const originalPage = pages[0];
    const workspaceId = originalPage.workspace_id;

    // Kiểm tra quyền trong workspace
    const [memberCheck] = await connection.query(
      `SELECT wm.* FROM workspace_members wm
       JOIN roles r ON wm.role_id = r.id
       WHERE wm.workspace_id = ? AND wm.user_id = ? 
       AND r.name IN ('OWNER', 'ADMIN', 'MEMBER')`,
      [workspaceId, userId]
    );

    if (memberCheck.length === 0) {
      await connection.rollback();
      return res.status(403).json({ message: 'Không có quyền nhân bản trang trong workspace này' });
    }

    // Tạo ID mới cho trang nhân bản
    const newPageId = uuidv4();

    // Thêm trang mới vào cơ sở dữ liệu với dữ liệu từ trang gốc
    await connection.query(
      `INSERT INTO pages 
       (id, workspace_id, title, icon, cover_url, parent_page_id, is_public, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newPageId,
        workspaceId,
        `${originalPage.title} (Copy)`,
        originalPage.icon,
        originalPage.cover_url,
        originalPage.parent_page_id,
        originalPage.is_public,
        userId
      ]
    );

    // Lấy danh sách các trang con của trang gốc
    const [childPages] = await connection.query(
      'SELECT * FROM pages WHERE parent_page_id = ?',
      [pageId]
    );

    // Map để lưu trữ ánh xạ giữa ID trang cũ và ID trang mới
    const pageIdMap = new Map();
    pageIdMap.set(pageId, newPageId);

    // Nhân bản đệ quy các trang con
    await duplicateChildPages(childPages, newPageId, userId, pageIdMap, connection);

    
    await connection.commit();

    // Lấy thông tin trang mới đã tạo
    const [newPage] = await db.query(
      `SELECT p.*, u.full_name as created_by_name
       FROM pages p
       JOIN users u ON p.created_by = u.id
       WHERE p.id = ?`,
      [newPageId]
    );

    res.status(201).json({
      message: 'Nhân bản trang thành công',
      page: newPage[0]
    });
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi khi nhân bản trang:', error);
    res.status(500).json({ message: 'Lỗi khi nhân bản trang' });
  } finally {
    connection.release();
  }
};

/**
 * Hàm kiểm tra xem trang B có phải là con cháu của trang A không.
 * @async
 * @param {string} pageA - ID của trang A.
 * @param {string} pageB - ID của trang B.
 * @param {Object} dbConnection - Kết nối database.
 * @returns {Promise<boolean>} - Trả về true nếu B là con cháu của A, ngược lại false.
 */
async function checkIfDescendant(pageA, pageB, dbConnection) {
  let currentPageId = pageB;
  const visited = new Set();

  while (currentPageId) {
    // Nếu đã xét trang này rồi (tránh vòng lặp vô hạn)
    if (visited.has(currentPageId)) {
      return false;
    }
    visited.add(currentPageId);

    // Nếu trang hiện tại là pageA, thì pageB là con cháu của pageA
    if (currentPageId === pageA) {
      return true;
    }

    // Lấy trang cha của trang hiện tại
    const [parents] = await dbConnection.query(
      'SELECT parent_page_id FROM pages WHERE id = ?',
      [currentPageId]
    );

    if (parents.length === 0 || !parents[0].parent_page_id) {
      return false; // Không còn trang cha nữa
    }

    currentPageId = parents[0].parent_page_id;
  }

  return false;
}

/**
 * Hàm lấy tất cả các trang con cháu của một trang.
 * @async
 * @param {string} pageId - ID của trang cha.
 * @param {Object} connection - Kết nối database.
 * @returns {Promise<Array>} - Trả về mảng các trang con cháu.
 */
async function getAllDescendantPages(pageId, connection) {
  const descendants = [];
  const queue = [pageId];
  const visited = new Set();

  while (queue.length > 0) {
    const currentId = queue.shift();
    
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Lấy tất cả các trang con trực tiếp
    const [childPages] = await connection.query(
      'SELECT * FROM pages WHERE parent_page_id = ?',
      [currentId]
    );

    for (const child of childPages) {
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return descendants;
}

/**
 * Hàm nhân bản đệ quy các trang con.
 * @async
 * @param {Array} childPages - Mảng các trang con cần nhân bản.
 * @param {string} newParentId - ID của trang cha mới.
 * @param {string} userId - ID của người dùng thực hiện nhân bản.
 * @param {Map} pageIdMap - Map ánh xạ giữa ID trang cũ và ID trang mới.
 * @param {Object} connection - Kết nối database.
 * @returns {Promise<void>}
 */
async function duplicateChildPages(childPages, newParentId, userId, pageIdMap, connection) {
  for (const childPage of childPages) {
    const newChildId = uuidv4();
    pageIdMap.set(childPage.id, newChildId);

    // Tạo bản sao của trang con
    await connection.query(
      `INSERT INTO pages 
       (id, workspace_id, title, icon, cover_url, parent_page_id, is_public, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newChildId,
        childPage.workspace_id,
        childPage.title,
        childPage.icon,
        childPage.cover_url,
        newParentId,
        childPage.is_public,
        userId
      ]
    );

    // Lấy các trang con của trang con hiện tại
    const [grandChildPages] = await connection.query(
      'SELECT * FROM pages WHERE parent_page_id = ?',
      [childPage.id]
    );

    // Đệ quy nhân bản các trang cháu
    if (grandChildPages.length > 0) {
      await duplicateChildPages(grandChildPages, newChildId, userId, pageIdMap, connection);
    }
  }
}

module.exports = {
  getWorkspacePages,
  createPage,
  getPageDetails,
  updatePage,
  deletePage,
  duplicatePage
};
