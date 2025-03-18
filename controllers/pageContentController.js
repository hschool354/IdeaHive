const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { MongoClient, ObjectId } = require('mongodb');
const mongoConfig = require('../config/mongodb');

/**
 * API lấy nội dung trang từ MongoDB.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về nội dung trang.
 * @throws {Error} - Trả về lỗi nếu không thể lấy nội dung trang.
 * @example
 * GET /api/pages/:id/content
 */
const getPageContent = async (req, res) => {
  let client;
  try {
    const { id: pageId } = req.params;
    const userId = req.user.id;

    // Kiểm tra sự tồn tại của trang và quyền truy cập
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập trang (nếu không phải public)
    if (!page.is_public) {
      const [memberCheck] = await db.query(
        'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền truy cập trang này' });
      }
    }

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy nội dung trang từ collection page_contents
    const pageContent = await mongoDB.collection('page_contents').findOne({ pageId });

    if (!pageContent) {
      // Nếu chưa có nội dung, trả về một nội dung mặc định
      return res.status(200).json({
        pageId,
        blocks: [],
        version: 0
      });
    }

    // Lấy thông tin chi tiết của từng block
    let blocks = [];
    if (pageContent.blocks && pageContent.blocks.length > 0) {
      const blockIds = pageContent.blocks.map(id => new ObjectId(id));
      blocks = await mongoDB.collection('blocks')
        .find({ _id: { $in: blockIds } })
        .sort({ position: 1 })
        .toArray();
    }

    res.status(200).json({
      pageId,
      blocks,
      version: pageContent.version
    });
  } catch (error) {
    console.error('Lỗi khi lấy nội dung trang:', error);
    res.status(500).json({ message: 'Lỗi khi lấy nội dung trang' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API cập nhật nội dung trang trong MongoDB.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin sau khi cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật nội dung trang.
 * @example
 * PUT /api/pages/:id/content
 * Body: { "blocks": [...blockData] }
 */
const updatePageContent = async (req, res) => {
  let client;
  try {
    const { id: pageId } = req.params;
    const userId = req.user.id;
    const { blocks } = req.body;

    // Kiểm tra sự tồn tại của trang và quyền chỉnh sửa
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
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

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy thông tin nội dung trang hiện tại để xác định version
    const currentPageContent = await mongoDB.collection('page_contents').findOne({ pageId });
    
    const nextVersion = currentPageContent ? currentPageContent.version + 1 : 1;
    
    // Lưu trữ block mới hoặc cập nhật block hiện có
    const blockIds = [];
    
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      block.pageId = pageId;
      block.position = i;
      block.updatedAt = new Date();
      
      if (!block._id) {
        // Block mới, thêm thông tin người tạo
        block.createdBy = userId;
        block.createdAt = new Date();
        const result = await mongoDB.collection('blocks').insertOne(block);
        blockIds.push(result.insertedId);
      } else {
        // Block hiện có, cập nhật
        const blockId = typeof block._id === 'string' ? new ObjectId(block._id) : block._id;
        const { _id, ...updateData } = block;
        await mongoDB.collection('blocks').updateOne(
          { _id: blockId },
          { $set: updateData }
        );
        blockIds.push(blockId);
      }
    }
    
    // Lưu trữ lịch sử phiên bản
    if (currentPageContent) {
      await mongoDB.collection('page_history').insertOne({
        pageId,
        version: currentPageContent.version,
        content: currentPageContent.blocks,
        editedBy: userId,
        editedAt: new Date()
      });
    }
    
    // Cập nhật hoặc tạo mới nội dung trang
    if (currentPageContent) {
      await mongoDB.collection('page_contents').updateOne(
        { pageId },
        { 
          $set: {
            blocks: blockIds,
            version: nextVersion,
            lastEditedBy: userId,
            lastEditedAt: new Date()
          }
        }
      );
    } else {
      await mongoDB.collection('page_contents').insertOne({
        pageId,
        blocks: blockIds,
        version: nextVersion,
        lastEditedBy: userId, 
        lastEditedAt: new Date()
      });
    }
    
    // Cập nhật thời gian sửa đổi trong bảng SQL
    await db.query(
      'UPDATE pages SET updated_at = NOW() WHERE id = ?',
      [pageId]
    );
    
    res.status(200).json({
      message: 'Cập nhật nội dung trang thành công',
      pageId,
      version: nextVersion
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật nội dung trang:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật nội dung trang' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API lấy lịch sử chỉnh sửa của trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về lịch sử chỉnh sửa của trang.
 * @throws {Error} - Trả về lỗi nếu không thể lấy lịch sử.
 * @example
 * GET /api/pages/:id/history
 */
const getPageHistory = async (req, res) => {
  let client;
  try {
    const { id: pageId } = req.params;
    const userId = req.user.id;

    // Kiểm tra sự tồn tại của trang và quyền truy cập
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập trang
    if (!page.is_public) {
      const [memberCheck] = await db.query(
        'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền truy cập trang này' });
      }
    }

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy lịch sử chỉnh sửa từ collection page_history
    const historyEntries = await mongoDB.collection('page_history')
      .find({ pageId })
      .sort({ version: -1 })
      .toArray();

    // Lấy thông tin người chỉnh sửa
    const userIds = [...new Set(historyEntries.map(entry => entry.editedBy))];
    
    if (userIds.length > 0) {
      const [users] = await db.query(
        'SELECT id, full_name, avatar_url FROM users WHERE id IN (?)',
        [userIds]
      );
      
      const userMap = new Map(users.map(user => [user.id, user]));
      
      // Thêm thông tin người dùng vào lịch sử
      historyEntries.forEach(entry => {
        if (userMap.has(entry.editedBy)) {
          entry.editor = userMap.get(entry.editedBy);
          delete entry.editor.id;  // Không cần trả về ID
        }
      });
    }

    res.status(200).json({
      pageId,
      history: historyEntries
    });
  } catch (error) {
    console.error('Lỗi khi lấy lịch sử chỉnh sửa:', error);
    res.status(500).json({ message: 'Lỗi khi lấy lịch sử chỉnh sửa' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API lấy phiên bản cụ thể của trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về nội dung của phiên bản cụ thể.
 * @throws {Error} - Trả về lỗi nếu không thể lấy phiên bản.
 * @example
 * GET /api/pages/:id/history/:version
 */
const getPageVersion = async (req, res) => {
  let client;
  try {
    const { id: pageId, version } = req.params;
    const userId = req.user.id;

    // Kiểm tra sự tồn tại của trang và quyền truy cập
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [pageId]
    );

    if (pages.length === 0) {
      return res.status(404).json({ message: 'Trang không tồn tại' });
    }

    const page = pages[0];
    const workspaceId = page.workspace_id;

    // Kiểm tra quyền truy cập trang
    if (!page.is_public) {
      const [memberCheck] = await db.query(
        'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền truy cập trang này' });
      }
    }

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy thông tin phiên bản từ collection page_history
    const historyEntry = await mongoDB.collection('page_history').findOne({ 
      pageId, 
      version: parseInt(version) 
    });

    if (!historyEntry) {
      return res.status(404).json({ message: 'Phiên bản không tồn tại' });
    }

    // Lấy thông tin các block trong phiên bản
    let blocks = [];
    if (historyEntry.content && historyEntry.content.length > 0) {
      const blockIds = historyEntry.content.map(id => 
        typeof id === 'string' ? new ObjectId(id) : id
      );
      
      blocks = await mongoDB.collection('blocks')
        .find({ _id: { $in: blockIds } })
        .toArray();
        
      // Sắp xếp blocks theo thứ tự trong content
      const blockMap = new Map(blocks.map(block => [block._id.toString(), block]));
      blocks = historyEntry.content.map(id => blockMap.get(id.toString())).filter(Boolean);
    }

    // Lấy thông tin người chỉnh sửa
    const [editor] = await db.query(
      'SELECT full_name, avatar_url FROM users WHERE id = ?',
      [historyEntry.editedBy]
    );

    res.status(200).json({
      pageId,
      version: parseInt(version),
      blocks,
      editedAt: historyEntry.editedAt,
      editor: editor[0] || null
    });
  } catch (error) {
    console.error('Lỗi khi lấy phiên bản trang:', error);
    res.status(500).json({ message: 'Lỗi khi lấy phiên bản trang' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API khôi phục trang về phiên bản cũ.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin sau khi khôi phục.
 * @throws {Error} - Trả về lỗi nếu không thể khôi phục phiên bản.
 * @example
 * POST /api/pages/:id/restore/:version
 */
const restorePageVersion = async (req, res) => {
  let client;
  try {
    const { id: pageId, version } = req.params;
    const userId = req.user.id;

    // Kiểm tra sự tồn tại của trang và quyền chỉnh sửa
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
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

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy phiên bản cần khôi phục
    const historyEntry = await mongoDB.collection('page_history').findOne({ 
      pageId, 
      version: parseInt(version) 
    });

    if (!historyEntry) {
      return res.status(404).json({ message: 'Phiên bản không tồn tại' });
    }

    // Lấy thông tin nội dung trang hiện tại
    const currentPageContent = await mongoDB.collection('page_contents').findOne({ pageId });
    
    if (!currentPageContent) {
      return res.status(404).json({ message: 'Không tìm thấy nội dung trang hiện tại' });
    }

    // Lưu phiên bản hiện tại vào lịch sử
    await mongoDB.collection('page_history').insertOne({
      pageId,
      version: currentPageContent.version,
      content: currentPageContent.blocks,
      editedBy: userId,
      editedAt: new Date()
    });

    // Cập nhật nội dung trang bằng nội dung từ phiên bản cũ
    await mongoDB.collection('page_contents').updateOne(
      { pageId },
      { 
        $set: {
          blocks: historyEntry.content,
          version: currentPageContent.version + 1,
          lastEditedBy: userId,
          lastEditedAt: new Date()
        }
      }
    );
    
    // Cập nhật thời gian sửa đổi trong bảng SQL
    await db.query(
      'UPDATE pages SET updated_at = NOW() WHERE id = ?',
      [pageId]
    );
    
    res.status(200).json({
      message: 'Khôi phục trang về phiên bản cũ thành công',
      pageId,
      version: currentPageContent.version + 1,
      restoredFrom: parseInt(version)
    });
  } catch (error) {
    console.error('Lỗi khi khôi phục phiên bản trang:', error);
    res.status(500).json({ message: 'Lỗi khi khôi phục phiên bản trang' });
  } finally {
    if (client) await client.close();
  }
};

module.exports = {
  getPageContent,
  updatePageContent,
  getPageHistory,
  getPageVersion,
  restorePageVersion
};