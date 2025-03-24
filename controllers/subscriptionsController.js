const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * API lấy thông tin gói đăng ký hiện tại của người dùng.
 * @async
 * @param {Object} req - Đối tượng request từ client (chứa user từ middleware).
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin gói đăng ký hiện tại hoặc null nếu không có.
 * @throws {Error} - Trả về lỗi nếu có vấn đề xảy ra.
 * @example
 * GET /subscriptions/me
 * Headers: { "Authorization": "Bearer jwt-token-string" }
 */
exports.getCurrentSubscription = async (req, res) => {
  try {
    // Lấy userId từ middleware xác thực
    const userId = req.user.id;

    // Truy vấn gói đăng ký đang hoạt động (ACTIVE) hoặc hết hạn (EXPIRED)
    const [subscriptions] = await db.query(
      `SELECT id, plan_type, start_date, end_date, status 
       FROM subscriptions 
       WHERE user_id = ? 
       AND (status = 'ACTIVE' OR status = 'EXPIRED') 
       ORDER BY start_date DESC 
       LIMIT 1`,
      [userId]
    );

    if (subscriptions.length === 0) {
      return res.status(200).json({
        message: 'No active subscription found',
        subscription: null,
      });
    }

    const subscription = subscriptions[0];

    // Trả về thông tin gói đăng ký
    res.status(200).json({
      message: 'Subscription retrieved successfully',
      subscription: {
        id: subscription.id,
        planType: subscription.plan_type,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        status: subscription.status,
      },
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ message: 'Error fetching subscription' });
  }
};

/**
 * API nâng cấp gói đăng ký từ FREE lên PREMIUM.
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông tin gói đăng ký mới sau khi nâng cấp.
 * @throws {Error} - Trả về lỗi nếu không đủ điều kiện nâng cấp hoặc lỗi hệ thống.
 * @example
 * POST /subscriptions/upgrade
 * Headers: { "Authorization": "Bearer jwt-token-string" }
 */
exports.upgradeSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Kiểm tra gói hiện tại
    const [currentSubscriptions] = await db.query(
      `SELECT id, plan_type, status 
       FROM subscriptions 
       WHERE user_id = ? 
       AND status = 'ACTIVE' 
       ORDER BY start_date DESC 
       LIMIT 1`,
      [userId]
    );

    if (currentSubscriptions.length > 0 && currentSubscriptions[0].plan_type === 'PREMIUM') {
      return res.status(400).json({ message: 'You already have a PREMIUM subscription' });
    }

    // Nếu có gói FREE đang ACTIVE, cập nhật trạng thái thành EXPIRED
    if (currentSubscriptions.length > 0 && currentSubscriptions[0].plan_type === 'FREE') {
      await db.query(
        'UPDATE subscriptions SET status = "EXPIRED", end_date = NOW() WHERE id = ?',
        [currentSubscriptions[0].id]
      );
    }

    // Tạo gói PREMIUM mới
    const subscriptionId = uuidv4();
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // Giả sử PREMIUM kéo dài 1 tháng

    await db.query(
      'INSERT INTO subscriptions (id, user_id, plan_type, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
      [subscriptionId, userId, 'PREMIUM', startDate, endDate, 'ACTIVE']
    );

    // Trả về thông tin gói mới
    res.status(201).json({
      message: 'Subscription upgraded to PREMIUM successfully',
      subscription: {
        id: subscriptionId,
        planType: 'PREMIUM',
        startDate,
        endDate,
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    res.status(500).json({ message: 'Error upgrading subscription' });
  }
};

/**
 * API hủy gói đăng ký hiện tại (chuyển trạng thái thành CANCELLED).
 * @async
 * @param {Object} req - Đối tượng request từ client.
 * @param {Object} res - Đối tượng response để gửi phản hồi.
 * @returns {Promise<void>} - Trả về thông báo hủy thành công.
 * @throws {Error} - Trả về lỗi nếu không có gói để hủy hoặc lỗi hệ thống.
 * @example
 * POST /subscriptions/cancel
 * Headers: { "Authorization": "Bearer jwt-token-string" }
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Kiểm tra gói hiện tại
    const [currentSubscriptions] = await db.query(
      `SELECT id, plan_type, status 
       FROM subscriptions 
       WHERE user_id = ? 
       AND status = 'ACTIVE' 
       ORDER BY start_date DESC 
       LIMIT 1`,
      [userId]
    );

    if (currentSubscriptions.length === 0) {
      return res.status(400).json({ message: 'No active subscription to cancel' });
    }

    const subscription = currentSubscriptions[0];

    // Chỉ cho phép hủy gói PREMIUM
    if (subscription.plan_type === 'FREE') {
      return res.status(400).json({ message: 'Cannot cancel a FREE subscription' });
    }

    // Cập nhật trạng thái thành CANCELLED
    await db.query(
      'UPDATE subscriptions SET status = "CANCELLED", end_date = NOW() WHERE id = ?',
      [subscription.id]
    );

    res.status(200).json({
      message: 'Subscription cancelled successfully',
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Error cancelling subscription' });
  }
};

module.exports = exports;