const { MongoClient, ObjectId } = require('mongodb');
const { validationResult } = require('express-validator');
const db = require('../config/database');
const mongoConfig = require('../config/mongodb');

/**
 * API tạo block mới.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin block sau khi tạo.
 * @throws {Error} - Trả về lỗi nếu không thể tạo block.
 * @example
 * POST /api/blocks
 * Body: { "pageId": "uuidv4", "type": "text", "content": "Nội dung", "position": 0 }
 */
const createBlock = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { pageId, type, content, position, properties } = req.body;

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
    
    // Lấy thông tin nội dung trang hiện tại
    const pageContent = await mongoDB.collection('page_contents').findOne({ pageId });
    
    // Tạo block mới
    const now = new Date();
    const newBlock = {
      pageId,
      type,
      content: content || '',
      position: position !== undefined ? position : pageContent?.blocks?.length || 0,
      properties: properties || {},
      children: [],
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };
    
    const result = await mongoDB.collection('blocks').insertOne(newBlock);
    const blockId = result.insertedId;
    
    // Cập nhật page_contents
    if (pageContent) {
      // Nếu vị trí được chỉ định, cần điều chỉnh vị trí các block khác
      if (position !== undefined) {
        // Lấy danh sách block hiện tại
        const currentBlocks = await mongoDB.collection('blocks')
          .find({ pageId, _id: { $in: pageContent.blocks.map(id => new ObjectId(id)) } })
          .sort({ position: 1 })
          .toArray();
        
        // Cập nhật vị trí của các block bị ảnh hưởng
        for (const block of currentBlocks) {
          if (block.position >= position) {
            await mongoDB.collection('blocks').updateOne(
              { _id: block._id },
              { $set: { position: block.position + 1, updatedAt: now } }
            );
          }
        }
      }
      
      // Chèn block mới vào danh sách
      const updatedBlocks = [...pageContent.blocks];
      updatedBlocks.splice(position !== undefined ? position : updatedBlocks.length, 0, blockId);
      
      await mongoDB.collection('page_contents').updateOne(
        { pageId },
        { 
          $set: {
            blocks: updatedBlocks,
            version: pageContent.version + 1,
            lastEditedBy: userId,
            lastEditedAt: now
          }
        }
      );
    } else {
      // Nếu chưa có page_content, tạo mới
      await mongoDB.collection('page_contents').insertOne({
        pageId,
        blocks: [blockId],
        version: 1,
        lastEditedBy: userId,
        lastEditedAt: now
      });
    }
    
    // Lấy thông tin block đã tạo
    const createdBlock = await mongoDB.collection('blocks').findOne({ _id: blockId });
    
    // Cập nhật thời gian sửa đổi trang trong bảng SQL
    await db.query(
      'UPDATE pages SET updated_at = NOW() WHERE id = ?',
      [pageId]
    );
    
    res.status(201).json(createdBlock);
  } catch (error) {
    console.error('Lỗi khi tạo block:', error);
    res.status(500).json({ message: 'Lỗi khi tạo block' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API lấy thông tin block.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin block.
 * @throws {Error} - Trả về lỗi nếu không thể lấy thông tin block.
 * @example
 * GET /api/blocks/:id
 */
const getBlock = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy thông tin block
    const block = await mongoDB.collection('blocks').findOne({ _id: new ObjectId(id) });
    
    if (!block) {
      return res.status(404).json({ message: 'Block không tồn tại' });
    }
    
    // Kiểm tra quyền truy cập trang
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [block.pageId]
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
    
    res.status(200).json(block);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin block:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin block' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API cập nhật block.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin block sau khi cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật block.
 * @example
 * PUT /api/blocks/:id
 * Body: { "content": "Nội dung mới", "properties": {...} }
 */
const updateBlock = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy thông tin block
    const block = await mongoDB.collection('blocks').findOne({ _id: new ObjectId(id) });
    
    if (!block) {
      return res.status(404).json({ message: 'Block không tồn tại' });
    }
    
    // Kiểm tra quyền chỉnh sửa trang
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [block.pageId]
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
    
    // Cập nhật block
    updateData.updatedAt = new Date();
    
    await mongoDB.collection('blocks').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    // Lấy thông tin block sau khi cập nhật
    const updatedBlock = await mongoDB.collection('blocks').findOne({ _id: new ObjectId(id) });
    
    // Cập nhật thời gian sửa đổi trang trong bảng SQL
    await db.query(
      'UPDATE pages SET updated_at = NOW() WHERE id = ?',
      [block.pageId]
    );
    
    // Cập nhật version của page_content
    const pageContent = await mongoDB.collection('page_contents').findOne({ pageId: block.pageId });
    if (pageContent) {
      await mongoDB.collection('page_contents').updateOne(
        { pageId: block.pageId },
        { 
          $set: {
            version: pageContent.version + 1,
            lastEditedBy: userId,
            lastEditedAt: new Date()
          }
        }
      );
    }
    
    res.status(200).json(updatedBlock);
  } catch (error) {
    console.error('Lỗi khi cập nhật block:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật block' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API xóa block.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về xác nhận xóa block.
 * @throws {Error} - Trả về lỗi nếu không thể xóa block.
 * @example
 * DELETE /api/blocks/:id
 */
const deleteBlock = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy thông tin block
    const block = await mongoDB.collection('blocks').findOne({ _id: new ObjectId(id) });
    
    if (!block) {
      return res.status(404).json({ message: 'Block không tồn tại' });
    }
    
    // Kiểm tra quyền chỉnh sửa trang
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [block.pageId]
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
    
    // Cập nhật page_contents (xóa block khỏi danh sách)
    const pageContent = await mongoDB.collection('page_contents').findOne({ pageId: block.pageId });
    
    if (pageContent) {
      const updatedBlocks = pageContent.blocks.filter(
        blockId => blockId.toString() !== id
      );
      
      await mongoDB.collection('page_contents').updateOne(
        { pageId: block.pageId },
        { 
          $set: {
            blocks: updatedBlocks,
            version: pageContent.version + 1,
            lastEditedBy: userId,
            lastEditedAt: new Date()
          }
        }
      );
      
      // Cập nhật vị trí của các block phía sau
      const blocksToUpdate = await mongoDB.collection('blocks').find({
        pageId: block.pageId,
        position: { $gt: block.position }
      }).toArray();
      
      for (const blockToUpdate of blocksToUpdate) {
        await mongoDB.collection('blocks').updateOne(
          { _id: blockToUpdate._id },
          { $set: { position: blockToUpdate.position - 1 } }
        );
      }
    }
    
    // Xóa block
    await mongoDB.collection('blocks').deleteOne({ _id: new ObjectId(id) });
    
    // Cập nhật thời gian sửa đổi trang trong bảng SQL
    await db.query(
      'UPDATE pages SET updated_at = NOW() WHERE id = ?',
      [block.pageId]
    );
    
    res.status(200).json({ message: 'Xóa block thành công' });
  } catch (error) {
    console.error('Lỗi khi xóa block:', error);
    res.status(500).json({ message: 'Lỗi khi xóa block' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API thay đổi vị trí block.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về xác nhận thay đổi vị trí.
 * @throws {Error} - Trả về lỗi nếu không thể thay đổi vị trí block.
 * @example
 * PUT /api/blocks/:id/position
 * Body: { "position": 2 }
 */
const updateBlockPosition = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { position } = req.body;
    const userId = req.user.id;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy thông tin block
    const block = await mongoDB.collection('blocks').findOne({ _id: new ObjectId(id) });
    
    if (!block) {
      return res.status(404).json({ message: 'Block không tồn tại' });
    }
    
    // Kiểm tra quyền chỉnh sửa trang
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [block.pageId]
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
    
    // Lấy thông tin page_content
    const pageContent = await mongoDB.collection('page_contents').findOne({ pageId: block.pageId });
    
    if (!pageContent) {
      return res.status(404).json({ message: 'Không tìm thấy nội dung trang' });
    }
    
    // Số lượng blocks hiện có
    const totalBlocks = pageContent.blocks.length;
    
    // Kiểm tra vị trí mới có hợp lệ
    if (position < 0 || position >= totalBlocks) {
      return res.status(400).json({ message: 'Vị trí không hợp lệ' });
    }
    
    // Vị trí hiện tại của block
    const currentPosition = block.position;
    
    // Nếu vị trí không thay đổi, không cần làm gì
    if (currentPosition === position) {
      return res.status(200).json({ message: 'Vị trí không thay đổi' });
    }
    
    // Tìm tất cả các block của trang
    const blocksToReorder = await mongoDB.collection('blocks')
      .find({ pageId: block.pageId })
      .sort({ position: 1 })
      .toArray();
    
    // Loại bỏ block hiện tại khỏi mảng
    const filteredBlocks = blocksToReorder.filter(b => b._id.toString() !== id);
    
    // Chèn block vào vị trí mới
    filteredBlocks.splice(position, 0, block);
    
    // Cập nhật vị trí của tất cả các block
    for (let i = 0; i < filteredBlocks.length; i++) {
      await mongoDB.collection('blocks').updateOne(
        { _id: filteredBlocks[i]._id },
        { $set: { position: i, updatedAt: new Date() } }
      );
    }
    
    // Cập nhật thứ tự trong page_contents
    const updatedBlockIds = filteredBlocks.map(b => b._id);
    
    await mongoDB.collection('page_contents').updateOne(
      { pageId: block.pageId },
      { 
        $set: {
          blocks: updatedBlockIds,
          version: pageContent.version + 1,
          lastEditedBy: userId,
          lastEditedAt: new Date()
        }
      }
    );
    
    // Cập nhật thời gian sửa đổi trang trong bảng SQL
    await db.query(
      'UPDATE pages SET updated_at = NOW() WHERE id = ?',
      [block.pageId]
    );
    
    res.status(200).json({ message: 'Thay đổi vị trí block thành công' });
  } catch (error) {
    console.error('Lỗi khi thay đổi vị trí block:', error);
    res.status(500).json({ message: 'Lỗi khi thay đổi vị trí block' });
  } finally {
    if (client) await client.close();
  }
};

/**
 * API nhân bản block.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin block sau khi nhân bản.
 * @throws {Error} - Trả về lỗi nếu không thể nhân bản block.
 * @example
 * POST /api/blocks/:id/duplicate
 */
const duplicateBlock = async (req, res) => {
  let client;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    
    // Lấy thông tin block
    const block = await mongoDB.collection('blocks').findOne({ _id: new ObjectId(id) });
    
    if (!block) {
      return res.status(404).json({ message: 'Block không tồn tại' });
    }
    
    // Kiểm tra quyền chỉnh sửa trang
    const [pages] = await db.query(
      'SELECT p.*, w.id as workspace_id FROM pages p JOIN workspaces w ON p.workspace_id = w.id WHERE p.id = ?',
      [block.pageId]
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
    
    // Tạo block mới dựa trên block cũ
    const now = new Date();
    const newBlock = {
      pageId: block.pageId,
      type: block.type,
      content: block.content,
      properties: { ...block.properties },
      position: block.position + 1, // Đặt vị trí ngay sau block gốc
      children: [...block.children], // Sao chép danh sách con
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };
    
    // Thêm block mới vào database
    const result = await mongoDB.collection('blocks').insertOne(newBlock);
    const newBlockId = result.insertedId;
    
    // Cập nhật vị trí của các block phía sau
    const blocksToUpdate = await mongoDB.collection('blocks').find({
      pageId: block.pageId,
      position: { $gt: block.position },
      _id: { $ne: newBlockId }
    }).toArray();
    
    for (const blockToUpdate of blocksToUpdate) {
      await mongoDB.collection('blocks').updateOne(
        { _id: blockToUpdate._id },
        { $set: { position: blockToUpdate.position + 1, updatedAt: now } }
      );
    }
    
    // Cập nhật page_contents
    const pageContent = await mongoDB.collection('page_contents').findOne({ pageId: block.pageId });
    
    if (pageContent) {
      const updatedBlocks = [...pageContent.blocks];
      const blockIndex = updatedBlocks.findIndex(b => b.toString() === id);
      
      if (blockIndex !== -1) {
        updatedBlocks.splice(blockIndex + 1, 0, newBlockId);
        
        await mongoDB.collection('page_contents').updateOne(
          { pageId: block.pageId },
          { 
            $set: {
              blocks: updatedBlocks,
              version: pageContent.version + 1,
              lastEditedBy: userId,
              lastEditedAt: now
            }
          }
        );
      }
    }
    
    // Lấy thông tin block sau khi nhân bản
    const duplicatedBlock = await mongoDB.collection('blocks').findOne({ _id: newBlockId });
    
    // Cập nhật thời gian sửa đổi trang trong bảng SQL
    await db.query(
      'UPDATE pages SET updated_at = NOW() WHERE id = ?',
      [block.pageId]
    );
    
    res.status(201).json(duplicatedBlock);
  } catch (error) {
    console.error('Lỗi khi nhân bản block:', error);
    res.status(500).json({ message: 'Lỗi khi nhân bản block' });
  } finally {
    if (client) await client.close();
  }
};

module.exports = {
  createBlock,
  getBlock,
  updateBlock,
  deleteBlock,
  updateBlockPosition,
  duplicateBlock
};