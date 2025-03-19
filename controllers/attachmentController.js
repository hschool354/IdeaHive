const { MongoClient, ObjectId } = require('mongodb');
const mongoConfig = require('../config/mongodb');
const dbMysql = require('../config/database');

/**
 * Tải lên tệp đính kèm
 * @route   POST /api/attachments
 * @desc    Tải file lên và lưu dưới dạng base64 vào MongoDB
 * @access  Private
 */
const uploadAttachment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { blockId } = req.body;
    const file = req.file; // Không dùng req.files vì upload.single trả về req.file

    if (!file) {
      return res.status(400).json({ message: 'Không có tệp nào được tải lên' });
    }

    // Mã hóa file thành base64
    const fileData = file.buffer.toString('base64');
    const fileSize = file.size; // Kích thước tệp (bytes)
    const fileType = file.mimetype; // MIME type của file

    // Kết nối MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDb = client.db(mongoConfig.dbName);
    const attachmentsCollection = mongoDb.collection('attachments');

    // Tạo metadata cho attachment
    const attachment = {
      _id: new ObjectId(),
      blockId: blockId ? new ObjectId(blockId) : null,
      fileName: file.originalname,
      fileSize,
      fileType,
      fileData, // Lưu dữ liệu base64
      uploadedBy: userId,
      uploadedAt: new Date()
    };

    // Lưu vào MongoDB
    await attachmentsCollection.insertOne(attachment);

    await client.close();

    res.status(201).json({
      message: 'Tệp đính kèm đã được tải lên thành công',
      attachment: {
        id: attachment._id,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
        uploadedAt: attachment.uploadedAt
      }
    });
  } catch (error) {
    console.error('Lỗi khi tải lên tệp đính kèm:', error);
    res.status(500).json({ message: 'Lỗi khi tải lên tệp đính kèm' });
  }
};

/**
 * Lấy thông tin tệp đính kèm
 * @route   GET /api/attachments/:id
 * @desc    Lấy thông tin chi tiết của tệp đính kèm (bao gồm dữ liệu base64)
 * @access  Private
 */
const getAttachmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDb = client.db(mongoConfig.dbName);
    const attachmentsCollection = mongoDb.collection('attachments');

    // Tìm attachment
    const attachment = await attachmentsCollection.findOne({ _id: new ObjectId(id) });

    if (!attachment) {
      await client.close();
      return res.status(404).json({ message: 'Tệp đính kèm không tồn tại' });
    }

    // Kiểm tra quyền truy cập
    if (attachment.blockId) {
      const block = await mongoDb.collection('blocks').findOne({ _id: attachment.blockId });
      if (block) {
        const [pages] = await dbMysql.query('SELECT workspace_id FROM pages WHERE id = ?', [block.pageId]);
        if (pages.length > 0) {
          const workspaceId = pages[0].workspace_id;
          const [memberCheck] = await dbMysql.query(
            `SELECT wm.* FROM workspace_members wm
             JOIN roles r ON wm.role_id = r.id
             WHERE wm.workspace_id = ? AND wm.user_id = ?
             AND r.name IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')`,
            [workspaceId, userId]
          );
          if (memberCheck.length === 0) {
            await client.close();
            return res.status(403).json({ message: 'Không có quyền xem tệp đính kèm này' });
          }
        }
      }
    } else if (attachment.uploadedBy !== userId) {
      await client.close();
      return res.status(403).json({ message: 'Không có quyền xem tệp đính kèm này' });
    }

    await client.close();

    res.status(200).json({
      id: attachment._id,
      blockId: attachment.blockId,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      fileData: attachment.fileData, // Trả về dữ liệu base64
      uploadedBy: attachment.uploadedBy,
      uploadedAt: attachment.uploadedAt
    });
  } catch (error) {
    console.error('Lỗi khi lấy thông tin tệp đính kèm:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin tệp đính kèm' });
  }
};

/**
 * Xóa tệp đính kèm
 * @route   DELETE /api/attachments/:id
 * @desc    Xóa tệp đính kèm khỏi MongoDB
 * @access  Private
 */
const deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Kết nối MongoDB
    const client = await MongoClient.connect(mongoConfig.url);
    const mongoDb = client.db(mongoConfig.dbName);
    const attachmentsCollection = mongoDb.collection('attachments');

    // Tìm attachment
    const attachment = await attachmentsCollection.findOne({ _id: new ObjectId(id) });

    if (!attachment) {
      await client.close();
      return res.status(404).json({ message: 'Tệp đính kèm không tồn tại' });
    }

    // Kiểm tra quyền xóa
    if (attachment.uploadedBy !== userId) {
      if (attachment.blockId) {
        const block = await mongoDb.collection('blocks').findOne({ _id: attachment.blockId });
        if (block) {
          const [pages] = await dbMysql.query('SELECT workspace_id FROM pages WHERE id = ?', [block.pageId]);
          if (pages.length > 0) {
            const workspaceId = pages[0].workspace_id;
            const [memberCheck] = await dbMysql.query(
              `SELECT wm.* FROM workspace_members wm
               JOIN roles r ON wm.role_id = r.id
               WHERE wm.workspace_id = ? AND wm.user_id = ?
               AND r.name IN ('OWNER', 'ADMIN')`,
              [workspaceId, userId]
            );
            if (memberCheck.length === 0) {
              await client.close();
              return res.status(403).json({ message: 'Không có quyền xóa tệp đính kèm này' });
            }
          }
        }
      } else {
        await client.close();
        return res.status(403).json({ message: 'Không có quyền xóa tệp đính kèm này' });
      }
    }

    // Xóa khỏi MongoDB
    await attachmentsCollection.deleteOne({ _id: new ObjectId(id) });

    await client.close();

    res.status(200).json({ message: 'Tệp đính kèm đã được xóa thành công' });
  } catch (error) {
    console.error('Lỗi khi xóa tệp đính kèm:', error);
    res.status(500).json({ message: 'Lỗi khi xóa tệp đính kèm' });
  }
};

module.exports = {
  uploadAttachment,
  getAttachmentById,
  deleteAttachment
};