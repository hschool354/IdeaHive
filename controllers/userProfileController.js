const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * API lấy thông tin profile người dùng.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin profile người dùng.
 * @throws {Error} - Trả về lỗi nếu không thể lấy thông tin profile.
 * @example
 * GET /api/users/profile
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const [userProfile] = await db.query(
      `SELECT id, email, full_name, avatar_url, created_at, updated_at
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    if (userProfile.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin người dùng' });
    }

    res.status(200).json(userProfile[0]);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin profile:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin profile' });
  }
};

/**
 * API cập nhật thông tin profile người dùng.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin profile đã cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật thông tin profile.
 * @example
 * PUT /api/users/profile
 * Body: { "full_name": "Nguyễn Văn A", "email": "example@email.com" }
 */
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, email } = req.body;

    // Nếu không có thông tin gì cần cập nhật
    if (!full_name && !email) {
      return res.status(400).json({ message: 'Không có thông tin nào được cung cấp để cập nhật' });
    }

    // Kiểm tra xem email đã tồn tại chưa nếu có email trong request
    if (email) {
      const [existingEmail] = await db.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (existingEmail.length > 0) {
        return res.status(400).json({ message: 'Email này đã được sử dụng bởi tài khoản khác' });
      }
    }

    // Tạo query động để cập nhật các trường được cung cấp
    let updateFields = [];
    let queryParams = [];

    if (full_name) {
      updateFields.push('full_name = ?');
      queryParams.push(full_name);
    }

    if (email) {
      updateFields.push('email = ?');
      queryParams.push(email);
    }

    queryParams.push(userId);

    // Thực hiện cập nhật thông tin
    await db.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      queryParams
    );

    // Lấy thông tin đã cập nhật
    const [updatedProfile] = await db.query(
      `SELECT id, email, full_name, avatar_url, created_at, updated_at
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    res.status(200).json({
      message: 'Cập nhật thông tin profile thành công',
      profile: updatedProfile[0]
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật profile:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật thông tin profile' });
  }
};

/**
 * API cập nhật avatar người dùng.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về đường dẫn avatar đã cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật avatar.
 * @example
 * PUT /api/users/avatar
 * Body: { "avatar_url": "https://example.com/avatar.jpg" }
 */
const updateUserAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const { avatar_url } = req.body;

    if (!avatar_url) {
      return res.status(400).json({ message: 'URL avatar là bắt buộc' });
    }

    // Cập nhật URL avatar
    await db.query(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [avatar_url, userId]
    );

    res.status(200).json({
      message: 'Cập nhật avatar thành công',
      avatar_url
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật avatar:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật avatar' });
  }
};

/**
 * API lấy cài đặt người dùng.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về cài đặt của người dùng.
 * @throws {Error} - Trả về lỗi nếu không thể lấy cài đặt.
 * @example
 * GET /api/users/settings
 */
const getUserSettings = async (req, res) => {
  try {
    const userId = req.user.id;

    // Giả sử bạn có bảng user_settings để lưu cài đặt
    const [userSettings] = await db.query(
      `SELECT * FROM user_settings WHERE user_id = ?`,
      [userId]
    );

    // Nếu chưa có cài đặt, trả về cài đặt mặc định
    if (userSettings.length === 0) {
      return res.status(200).json({
        theme: 'light',
        language: 'vi',
        notifications_enabled: true,
        // Thêm các cài đặt mặc định khác nếu cần
      });
    }

    res.status(200).json(userSettings[0]);
  } catch (error) {
    console.error('Lỗi khi lấy cài đặt người dùng:', error);
    res.status(500).json({ message: 'Lỗi khi lấy cài đặt người dùng' });
  }
};

/**
 * API cập nhật cài đặt người dùng.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về cài đặt đã cập nhật.
 * @throws {Error} - Trả về lỗi nếu không thể cập nhật cài đặt.
 * @example
 * PUT /api/users/settings
 * Body: { "theme": "dark", "language": "en", "notifications_enabled": false }
 */
const updateUserSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = req.body;

    if (Object.keys(settings).length === 0) {
      return res.status(400).json({ message: 'Không có cài đặt nào được cung cấp để cập nhật' });
    }

    // Kiểm tra xem người dùng đã có cài đặt chưa
    const [existingSettings] = await db.query(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId]
    );

    if (existingSettings.length === 0) {
      // Nếu chưa có, tạo mới
      const settingsId = uuidv4();
      const columns = ['id', 'user_id', ...Object.keys(settings)];
      const values = [settingsId, userId, ...Object.values(settings)];
      const placeholders = Array(columns.length).fill('?').join(', ');

      await db.query(
        `INSERT INTO user_settings (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );
    } else {
      // Nếu đã có, cập nhật
      let updateFields = [];
      let queryParams = [];

      for (const [key, value] of Object.entries(settings)) {
        updateFields.push(`${key} = ?`);
        queryParams.push(value);
      }

      queryParams.push(userId);

      await db.query(
        `UPDATE user_settings SET ${updateFields.join(', ')} WHERE user_id = ?`,
        queryParams
      );
    }

    // Lấy cài đặt đã cập nhật
    const [updatedSettings] = await db.query(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId]
    );

    res.status(200).json({
      message: 'Cập nhật cài đặt thành công',
      settings: updatedSettings[0]
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật cài đặt:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cài đặt người dùng' });
  }
};

/**
 * API xóa tài khoản người dùng.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông báo xóa tài khoản thành công.
 * @throws {Error} - Trả về lỗi nếu không thể xóa tài khoản.
 * @example
 * DELETE /api/users/account
 */
const deleteUserAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Bắt đầu transaction để đảm bảo tính toàn vẹn dữ liệu
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Xóa các dữ liệu liên quan trước, đảm bảo không vi phạm ràng buộc khóa ngoại
      
      // Xóa cài đặt người dùng
      await connection.query('DELETE FROM user_settings WHERE user_id = ?', [userId]);
      
      // Xóa workspace_members mà người dùng là thành viên
      await connection.query('DELETE FROM workspace_members WHERE user_id = ?', [userId]);
      
      // Xử lý các workspaces mà người dùng sở hữu (OWNER)
      // Bạn có thể chọn xóa hoặc chuyển quyền cho người khác
      
      // Xóa người dùng từ bảng users
      await connection.query('DELETE FROM users WHERE id = ?', [userId]);
      
      await connection.commit();
      
      // Đăng xuất người dùng bằng cách xóa token (nếu bạn sử dụng JWT)
      // Bạn cần xử lý phần này ở middleware auth
      
      res.status(200).json({
        message: 'Tài khoản đã được xóa thành công'
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Lỗi khi xóa tài khoản:', error);
    res.status(500).json({ message: 'Lỗi khi xóa tài khoản người dùng' });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  updateUserAvatar,
  getUserSettings,
  updateUserSettings,
  deleteUserAccount
};