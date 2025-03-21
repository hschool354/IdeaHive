const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { MongoClient, ObjectId } = require('mongodb');
const mongoConfig = require('../config/mongodb');
const { mongo } = require('mongoose');

/**
 * API lấy danh sách templates của người dùng hiện tại.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về danh sách templates của người dùng.
 * @throws {Error} - Trả về lỗi nếu không thể lấy danh sách templates.
 * @example
 * GET /api/templates/my-templates?workspaceId=xxx&category=yyy
 */
const getMyTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workspaceId, category } = req.query;

    let query = `
      SELECT t.*, u.full_name as created_by_name
      FROM templates t
      JOIN users u ON t.created_by = u.id
      WHERE t.created_by = ?
    `;
    const queryParams = [userId];

    // Nếu có filter theo workspace
    if (workspaceId) {
      query += " AND t.workspace_id = ?";
      queryParams.push(workspaceId);

      // Kiểm tra quyền truy cập workspace
      const [memberCheck] = await db.query(
        'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, userId]
      );
      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền truy cập templates của workspace này' });
      }
    }

    // Nếu có filter theo category
    if (category) {
      query += " AND t.category = ?";
      queryParams.push(category);
    }

    query += " ORDER BY t.created_at DESC";

    // Thực hiện query
    const [templates] = await db.query(query, queryParams);

    // Kết nối đến MongoDB để lấy content
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const templatesCollection = mongoDB.collection('templates');

    const templatesWithContent = await Promise.all(templates.map(async (template) => {
      const templateContent = await templatesCollection.findOne({ _id: template.id });
      return {
        ...template,
        content: templateContent ? templateContent.content : []
      };
    }));

    await client.close();

    res.status(200).json(templatesWithContent);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách templates của tôi:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách templates của tôi' });
  }
};

/**
 * API lấy danh sách tất cả templates công khai.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về danh sách tất cả templates công khai.
 * @throws {Error} - Trả về lỗi nếu không thể lấy danh sách templates.
 * @example
 * GET /api/templates/public-templates?category=xxx
 */
const getPublicTemplates = async (req, res) => {
  try {
    const { category } = req.query;

    let query = `
      SELECT t.*, u.full_name as created_by_name
      FROM templates t
      JOIN users u ON t.created_by = u.id
      WHERE t.is_public = true
    `;
    const queryParams = [];

    // Nếu có filter theo category
    if (category) {
      query += " AND t.category = ?";
      queryParams.push(category);
    }

    query += " ORDER BY t.created_at DESC";

    // Thực hiện query
    const [templates] = await db.query(query, queryParams);

    // Kết nối đến MongoDB để lấy content
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const templatesCollection = mongoDB.collection('templates');

    const templatesWithContent = await Promise.all(templates.map(async (template) => {
      const templateContent = await templatesCollection.findOne({ _id: template.id });
      return {
        ...template,
        content: templateContent ? templateContent.content : []
      };
    }));

    await client.close();

    res.status(200).json(templatesWithContent);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách templates công khai:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách templates công khai' });
  }
};

/**
 * API lấy danh sách templates (kết hợp cả của người dùng và công khai - tùy chọn).
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về danh sách templates.
 * @throws {Error} - Trả về lỗi nếu không thể lấy danh sách templates.
 * @example
 * GET /api/templates?workspaceId=xxx&category=yyy
 */
const getTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workspaceId, category } = req.query;

    let query = `
      SELECT t.*, u.full_name as created_by_name
      FROM templates t
      JOIN users u ON t.created_by = u.id
      WHERE (t.is_public = true OR t.created_by = ?)
    `;
    const queryParams = [userId];

    if (workspaceId) {
      query += " AND (t.workspace_id = ? OR t.workspace_id IS NULL)";
      queryParams.push(workspaceId);

      const [memberCheck] = await db.query(
        'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, userId]
      );
      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền truy cập templates của workspace này' });
      }
    } else {
      query += " AND (t.workspace_id IS NULL OR t.created_by = ?)";
      queryParams.push(userId);
    }

    if (category) {
      query += " AND t.category = ?";
      queryParams.push(category);
    }

    query += " ORDER BY t.created_at DESC";

    const [templates] = await db.query(query, queryParams);

    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const templatesCollection = mongoDB.collection('templates');

    const templatesWithContent = await Promise.all(templates.map(async (template) => {
      const templateContent = await templatesCollection.findOne({ _id: template.id });
      return {
        ...template,
        content: templateContent ? templateContent.content : []
      };
    }));

    await client.close();

    res.status(200).json(templatesWithContent);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách templates:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách templates' });
  }
};

/**
 * API tạo template mới.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin template mới đã tạo.
 * @throws {Error} - Trả về lỗi nếu không thể tạo template.
 * @example
 * POST /api/templates
 * Body: { 
 *   "name": "Tên template", 
 *   "description": "Mô tả template", 
 *   "content": [...], 
 *   "workspaceId": "optional-workspace-id",
 *   "category": "category-name",
 *   "isPublic": true
 * }
 */
const createTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, content, workspaceId, category, isPublic } = req.body;

    // Validate input
    if (!name || !content || !Array.isArray(content)) {
      return res.status(400).json({ message: 'Tên và nội dung template là bắt buộc' });
    }

    // Nếu có workspaceId, kiểm tra quyền của người dùng trong workspace đó
    if (workspaceId) {
      const [memberCheck] = await db.query(
        `SELECT wm.* FROM workspace_members wm
         JOIN roles r ON wm.role_id = r.id
         WHERE wm.workspace_id = ? AND wm.user_id = ? 
         AND r.name IN ('OWNER', 'ADMIN', 'MEMBER')`,
        [workspaceId, userId]
      );

      if (memberCheck.length === 0) {
        return res.status(403).json({ message: 'Không có quyền tạo template trong workspace này' });
      }
    }

    // Tạo ID mới cho template
    const templateId = uuidv4();

    // Thêm template vào MySQL
    await db.query(
      `INSERT INTO templates 
       (id, name, description, workspace_id, category, is_public, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [templateId, name, description, workspaceId, category, isPublic || false, userId]
    );

    // Thêm content vào MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const templatesCollection = mongoDB.collection('templates');
    
    await templatesCollection.insertOne({
      _id: templateId,
      content
    });

    await client.close();

    // Lấy thông tin template mới đã tạo
    const [template] = await db.query(
      `SELECT t.*, u.full_name as created_by_name
       FROM templates t
       JOIN users u ON t.created_by = u.id
       WHERE t.id = ?`,
      [templateId]
    );

    res.status(201).json({
      message: 'Template mới đã được tạo thành công',
      template: {
        ...template[0],
        content
      }
    });
  } catch (error) {
    console.error('Lỗi khi tạo template:', error);
    res.status(500).json({ message: 'Lỗi khi tạo template mới' });
  }
};

/**
 * API lấy thông tin chi tiết của template.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin chi tiết của template.
 * @throws {Error} - Trả về lỗi nếu không thể lấy thông tin template.
 * @example
 * GET /api/templates/:id
 */
const getTemplateById = async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const userId = req.user.id;

    // Lấy thông tin template từ MySQL
    const [templates] = await db.query(
      `SELECT t.*, u.full_name as created_by_name
       FROM templates t
       JOIN users u ON t.created_by = u.id
       WHERE t.id = ?`,
      [templateId]
    );

    if (templates.length === 0) {
      return res.status(404).json({ message: 'Template không tồn tại' });
    }

    const template = templates[0];

    // Kiểm tra quyền truy cập template
    if (!template.is_public && template.created_by !== userId) {
      // Nếu template thuộc workspace, kiểm tra người dùng có trong workspace không
      if (template.workspace_id) {
        const [memberCheck] = await db.query(
          'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
          [template.workspace_id, userId]
        );

        if (memberCheck.length === 0) {
          return res.status(403).json({ message: 'Không có quyền truy cập template này' });
        }
      } else {
        return res.status(403).json({ message: 'Không có quyền truy cập template này' });
      }
    }

    // Lấy content từ MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const templatesCollection = mongoDB.collection('templates');
    
    const templateContent = await templatesCollection.findOne({ _id: templateId });
    await client.close();

    res.status(200).json({
      ...template,
      content: templateContent ? templateContent.content : []
    });
  } catch (error) {
    console.error('Lỗi khi lấy thông tin template:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin template' });
  }
};

/**
 * API cập nhật template.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin template đã cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật template.
 * @example
 * PUT /api/templates/:id
 * Body: { 
 *   "name": "Tên mới", 
 *   "description": "Mô tả mới", 
 *   "content": [...], 
 *   "category": "category-mới",
 *   "isPublic": true
 * }
 */
const updateTemplate = async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const userId = req.user.id;
    const { name, description, content, category, isPublic } = req.body;

    // Lấy thông tin template hiện tại
    const [templates] = await db.query(
      'SELECT * FROM templates WHERE id = ?',
      [templateId]
    );

    if (templates.length === 0) {
      return res.status(404).json({ message: 'Template không tồn tại' });
    }

    const template = templates[0];

    // Kiểm tra quyền chỉnh sửa template
    if (template.created_by !== userId) {
      // Nếu template thuộc workspace, kiểm tra người dùng có quyền admin trong workspace không
      if (template.workspace_id) {
        const [memberCheck] = await db.query(
          `SELECT wm.* FROM workspace_members wm
           JOIN roles r ON wm.role_id = r.id
           WHERE wm.workspace_id = ? AND wm.user_id = ? 
           AND r.name IN ('OWNER', 'ADMIN')`,
          [template.workspace_id, userId]
        );

        if (memberCheck.length === 0) {
          return res.status(403).json({ message: 'Không có quyền chỉnh sửa template này' });
        }
      } else {
        return res.status(403).json({ message: 'Không có quyền chỉnh sửa template này' });
      }
    }

    // Cập nhật thông tin template trong MySQL
    await db.query(
      `UPDATE templates 
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           category = COALESCE(?, category),
           is_public = COALESCE(?, is_public),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, category, isPublic !== undefined ? isPublic : template.is_public, templateId]
    );

    // Nếu có cập nhật nội dung, cập nhật trong MongoDB
    if (content && Array.isArray(content)) {
      const client = await MongoClient.connect(mongoConfig.url);
      const mongoDB = client.db(mongoConfig.dbName);
      const templatesCollection = mongoDB.collection('templates');
      
      await templatesCollection.updateOne(
        { _id: templateId },
        { $set: { content } },
        { upsert: true }
      );

      await client.close();
    }

    // Lấy thông tin template sau khi cập nhật
    const [updatedTemplate] = await db.query(
      `SELECT t.*, u.full_name as created_by_name
       FROM templates t
       JOIN users u ON t.created_by = u.id
       WHERE t.id = ?`,
      [templateId]
    );

    // Lấy content từ MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const templatesCollection = mongoDB.collection('templates');
    
    const templateContent = await templatesCollection.findOne({ _id: templateId });
    await client.close();

    res.status(200).json({
      message: 'Cập nhật template thành công',
      template: {
        ...updatedTemplate[0],
        content: templateContent ? templateContent.content : []
      }
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật template:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật template' });
  }
};

/**
 * API xóa template.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông báo xóa thành công.
 * @throws {Error} - Trả về lỗi nếu không thể xóa template.
 * @example
 * DELETE /api/templates/:id
 */
const deleteTemplate = async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const userId = req.user.id;

    // Lấy thông tin template
    const [templates] = await db.query(
      'SELECT * FROM templates WHERE id = ?',
      [templateId]
    );

    if (templates.length === 0) {
      return res.status(404).json({ message: 'Template không tồn tại' });
    }

    const template = templates[0];

    // Kiểm tra quyền xóa template
    if (template.created_by !== userId) {
      // Nếu template thuộc workspace, kiểm tra người dùng có quyền admin trong workspace không
      if (template.workspace_id) {
        const [memberCheck] = await db.query(
          `SELECT wm.* FROM workspace_members wm
           JOIN roles r ON wm.role_id = r.id
           WHERE wm.workspace_id = ? AND wm.user_id = ? 
           AND r.name IN ('OWNER', 'ADMIN')`,
          [template.workspace_id, userId]
        );

        if (memberCheck.length === 0) {
          return res.status(403).json({ message: 'Không có quyền xóa template này' });
        }
      } else {
        return res.status(403).json({ message: 'Không có quyền xóa template này' });
      }
    }

    // Xóa template từ MySQL
    await db.query('DELETE FROM templates WHERE id = ?', [templateId]);

    // Xóa content từ MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const templatesCollection = mongoDB.collection('templates');
    
    await templatesCollection.deleteOne({ _id: templateId });
    await client.close();

    res.status(200).json({
      message: 'Xóa template thành công'
    });
  } catch (error) {
    console.error('Lỗi khi xóa template:', error);
    res.status(500).json({ message: 'Lỗi khi xóa template' });
  }
};

/**
 * API áp dụng template vào trang.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin trang sau khi áp dụng template.
 * @throws {Error} - Trả về lỗi nếu không thể áp dụng template.
 * @example
 * POST /api/pages/:id/apply-template/:templateId
 * Body: { "overwrite": true/false }
 */
const applyTemplate = async (req, res) => {  
  try {
    const { id: pageId, templateId } = req.params;
    const userId = req.user.id;
    const { overwrite = false } = req.body;

    // Lấy thông tin trang
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

    // Lấy thông tin template
    const [templates] = await db.query(
      'SELECT * FROM templates WHERE id = ?',
      [templateId]
    );

    if (templates.length === 0) {
      return res.status(404).json({ message: 'Template không tồn tại' });
    }

    const template = templates[0];

    // Kiểm tra quyền truy cập template
    if (!template.is_public && template.created_by !== userId) {
      // Nếu template thuộc workspace, kiểm tra người dùng có trong workspace không
      if (template.workspace_id && template.workspace_id !== workspaceId) {
        const [templateMemberCheck] = await db.query(
          'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
          [template.workspace_id, userId]
        );

        if (templateMemberCheck.length === 0) {
          return res.status(403).json({ message: 'Không có quyền sử dụng template này' });
        }
      } else if (!template.workspace_id) {
        return res.status(403).json({ message: 'Không có quyền sử dụng template này' });
      }
    }

    // Kết nối đến MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDB = client.db(mongoConfig.dbName);
    const mongoDb = mongoDB; 

    // Sử dụng mongoDb cho các collection
    const pageContentsCollection = mongoDb.collection('page_contents');
    const blocksCollection = mongoDb.collection('blocks');
    const templatesCollection = mongoDb.collection('templates');
    const pageHistoryCollection = mongoDb.collection('page_history');

    // Lấy nội dung template từ MongoDB
    const templateContent = await templatesCollection.findOne({ _id: templateId });
    if (!templateContent || !templateContent.content) {
      await client.close();
      return res.status(404).json({ message: 'Không tìm thấy nội dung template' });
    }

    // Lấy nội dung trang hiện tại
    const currentPageContent = await pageContentsCollection.findOne({ pageId });
    
    // Lưu lại phiên bản hiện tại vào lịch sử
    if (currentPageContent) {
      const currentBlocks = await blocksCollection.find({ 
        _id: { $in: currentPageContent.blocks.map(id => new ObjectId(id)) } 
      }).toArray();
      
      await pageHistoryCollection.insertOne({
        pageId,
        version: currentPageContent.version,
        content: currentBlocks,
        editedBy: userId,
        editedAt: new Date()
      });
    }

    // Nếu overwrite = true, xóa nội dung cũ và áp dụng template mới hoàn toàn
    if (overwrite) {
      // Xóa các blocks hiện tại của trang
      if (currentPageContent && currentPageContent.blocks) {
        await blocksCollection.deleteMany({ 
          _id: { $in: currentPageContent.blocks.map(id => new ObjectId(id)) } 
        });
      }

      // Tạo blocks mới từ template
      const newBlocks = [];
      for (let i = 0; i < templateContent.content.length; i++) {
        const templateBlock = templateContent.content[i];
        const newBlock = {
          ...templateBlock,
          _id: new ObjectId(),
          pageId,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          position: i
        };
        await blocksCollection.insertOne(newBlock);
        newBlocks.push(newBlock._id);
      }

      // Cập nhật hoặc tạo mới page_contents
      const newVersion = currentPageContent ? currentPageContent.version + 1 : 1;
      await pageContentsCollection.updateOne(
        { pageId },
        { 
          $set: {
            blocks: newBlocks,
            version: newVersion,
            lastEditedBy: userId,
            lastEditedAt: new Date()
          }
        },
        { upsert: true }
      );
    } else {
      // Nếu không overwrite, thêm nội dung template vào cuối trang
      let startPosition = 0;
      const newBlocks = [];

      // Nếu trang đã có nội dung, lấy vị trí bắt đầu
      if (currentPageContent && currentPageContent.blocks) {
        const lastBlock = await blocksCollection.findOne(
          { _id: new ObjectId(currentPageContent.blocks[currentPageContent.blocks.length - 1]) },
          { sort: { position: -1 } }
        );
        if (lastBlock) {
          startPosition = lastBlock.position + 1;
        }
        newBlocks.push(...currentPageContent.blocks);
      }

      // Thêm blocks mới từ template
      for (let i = 0; i < templateContent.content.length; i++) {
        const templateBlock = templateContent.content[i];
        const newBlock = {
          ...templateBlock,
          _id: new ObjectId(),
          pageId,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          position: startPosition + i
        };
        await blocksCollection.insertOne(newBlock);
        newBlocks.push(newBlock._id);
      }

      // Cập nhật hoặc tạo mới page_contents
      const newVersion = currentPageContent ? currentPageContent.version + 1 : 1;
      await pageContentsCollection.updateOne(
        { pageId },
        { 
          $set: {
            blocks: newBlocks,
            version: newVersion,
            lastEditedBy: userId,
            lastEditedAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    await client.close();

    res.status(200).json({
      message: 'Áp dụng template thành công',
      pageId
    });
  } catch (error) {
    console.error('Lỗi khi áp dụng template:', error);
    res.status(500).json({ message: 'Lỗi khi áp dụng template' });
  }
};

module.exports = {
  getTemplates,
  getMyTemplates,
  getPublicTemplates,
  createTemplate,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  applyTemplate
};