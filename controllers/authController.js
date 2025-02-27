const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createTransporter } = require('../services/emailService');

// Biến môi trường NODE_ENV sẽ có giá trị 'development' khi chạy ở chế độ development
const isDevelopment = process.env.NODE_ENV === 'development';

// Mã reset cố định cho môi trường phát triển
const DEV_RESET_TOKEN = 'dev-test-reset-token-123456';

// API Xử lý đăng ký người dùng mới
exports.register = async (req, res) => {
  try {
    // Lấy thông tin người dùng từ request body
    const { email, password, fullName } = req.body;

    // Kiểm tra xem người dùng đã tồn tại trong hệ thống chưa
    const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    
    // Nếu email đã tồn tại, trả về lỗi 400 (Bad Request)
    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Mã hóa mật khẩu bằng bcrypt với 10 vòng lặp (saltRounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Tạo một ID duy nhất cho người dùng mới
    const userId = uuidv4();
    
    // Thêm người dùng mới vào cơ sở dữ liệu
    await db.query(
      'INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)',
      [userId, email, passwordHash, fullName]
    );

    // Tạo gói đăng ký mặc định (miễn phí) cho người dùng mới
    const subscriptionId = uuidv4();  // ID duy nhất cho đăng ký
    const startDate = new Date();  // Ngày bắt đầu đăng ký
    
    await db.query(
      'INSERT INTO subscriptions (id, user_id, plan_type, start_date, status) VALUES (?, ?, ?, ?, ?)',
      [subscriptionId, userId, 'FREE', startDate, 'ACTIVE']
    );

    // Phản hồi thành công với mã trạng thái 201 (Created) và trả về userId
    res.status(201).json({ 
      message: 'User registered successfully',
      userId 
    });
  } catch (error) {
    // Ghi log lỗi nếu có lỗi xảy ra trong quá trình đăng ký
    console.error('Registration error:', error);

    // Phản hồi lỗi với mã trạng thái 500 (Internal Server Error)
    res.status(500).json({ message: 'Error registering user' });
  }
};

// API xử lý đăng nhập người dùng
exports.login = async (req, res) => {
  try {
    // Nhận thông tin đăng nhập từ request body
    const { email, password } = req.body;

    // Truy vấn cơ sở dữ liệu để tìm người dùng theo email
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    // Nếu không tìm thấy người dùng, trả về lỗi 401 (Unauthorized)
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Lấy thông tin người dùng đầu tiên từ kết quả truy vấn
    const user = users[0];

    // Kiểm tra mật khẩu có hợp lệ không bằng cách so sánh với mật khẩu đã hash trong database
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    // Nếu mật khẩu không đúng, trả về lỗi 401 (Unauthorized)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Tạo JWT token (token truy cập) để xác thực người dùng trong các yêu cầu tiếp theo
    const token = jwt.sign(
      { id: user.id, email: user.email }, // Payload chứa thông tin người dùng
      process.env.JWT_SECRET, // Khóa bí mật để ký token (cần được bảo mật trong biến môi trường)
      { expiresIn: '1h' } // Token có thời hạn 1 giờ
    );

    // Tạo Refresh Token để hỗ trợ làm mới Access Token khi hết hạn
    const refreshToken = uuidv4(); // Sinh một mã Refresh Token ngẫu nhiên
    const refreshTokenId = uuidv4(); // Sinh một ID duy nhất cho Refresh Token
    const expiresAt = new Date(); // Lấy thời gian hiện tại
    expiresAt.setDate(expiresAt.getDate() + 30); // Đặt thời gian hết hạn là 30 ngày kể từ hiện tại

    // Lưu Refresh Token vào cơ sở dữ liệu để quản lý phiên đăng nhập
    await db.query(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [refreshTokenId, user.id, refreshToken, expiresAt]
    );

    // Trả về phản hồi thành công với mã trạng thái 200 (OK) và thông tin người dùng
    res.status(200).json({
      message: 'Login successful',
      token, // JWT Access Token
      refreshToken, // Refresh Token để cấp mới Access Token khi hết hạn
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url
      }
    });
  } catch (error) {
    // Ghi log lỗi nếu có lỗi xảy ra trong quá trình đăng nhập
    console.error('Login error:', error);

    // Trả về lỗi 500 (Internal Server Error) nếu có lỗi hệ thống
    res.status(500).json({ message: 'Error during login' });
  }
};

// API xử lý làm mới Access Token bằng Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    // Lấy refreshToken từ request body
    const { refreshToken } = req.body;

    // Kiểm tra nếu không có refreshToken, trả về lỗi 400 (Bad Request)
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    // Truy vấn cơ sở dữ liệu để tìm refreshToken hợp lệ (còn hạn sử dụng)
    const [tokens] = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()', 
      [refreshToken]
    );

    // Nếu không tìm thấy refreshToken hợp lệ, trả về lỗi 401 (Unauthorized)
    if (tokens.length === 0) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Lấy dữ liệu của refreshToken từ kết quả truy vấn
    const tokenData = tokens[0];

    // Truy vấn lấy thông tin người dùng tương ứng với refreshToken
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [tokenData.user_id]);

    // Nếu không tìm thấy người dùng, trả về lỗi 404 (Not Found)
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Lấy thông tin người dùng từ kết quả truy vấn
    const user = users[0];

    // Tạo Access Token mới để gửi lại cho người dùng
    const newToken = jwt.sign(
      { id: user.id, email: user.email }, // Payload chứa thông tin người dùng
      process.env.JWT_SECRET, // Khóa bí mật để ký JWT (lưu trong biến môi trường)
      { expiresIn: '1h' } // Token có thời hạn sử dụng 1 giờ
    );

    // Trả về Access Token mới trong phản hồi với mã trạng thái 200 (OK)
    res.status(200).json({
      token: newToken
    });
  } catch (error) {
    // Ghi log lỗi nếu xảy ra lỗi trong quá trình làm mới token
    console.error('Refresh token error:', error);

    // Trả về mã lỗi 500 (Internal Server Error) nếu có lỗi hệ thống
    res.status(500).json({ message: 'Error refreshing token' });
  }
};

// API xử lý đăng xuất người dùng
exports.logout = async (req, res) => {
  try {
    // Lấy refreshToken từ request body
    const { refreshToken } = req.body;

    // Kiểm tra nếu không có refreshToken, trả về lỗi 400 (Bad Request)
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    // Xóa refreshToken khỏi database để vô hiệu hóa việc sử dụng lại
    await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

    // Trả về phản hồi thành công với mã trạng thái 200 (OK)
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    // Ghi log lỗi nếu xảy ra lỗi trong quá trình xử lý đăng xuất
    console.error('Logout error:', error);

    // Trả về mã lỗi 500 (Internal Server Error) nếu có lỗi hệ thống
    res.status(500).json({ message: 'Error during logout' });
  }
};

// API quên mật khẩu với chế độ phát triển (dev mode)
exports.forgotPassword = async (req, res) => {
  try {
    // Lấy email từ request body
    const { email } = req.body;

    // Tìm kiếm người dùng trong cơ sở dữ liệu bằng email
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    // Nếu không tìm thấy người dùng, vẫn trả về phản hồi 200 để tránh tiết lộ thông tin nhạy cảm
    if (users.length === 0) {
      return res.status(200).json({ 
        message: 'If your email is registered, you will receive a password reset link' 
      });
    }

    const user = users[0]; // Lấy thông tin người dùng đầu tiên tìm thấy

    // **Tạo token reset**:
    // - Trong môi trường phát triển (dev mode), sử dụng token cố định (`DEV_RESET_TOKEN`)
    // - Trong môi trường production, tạo token ngẫu nhiên 32 byte
    const resetToken = isDevelopment ? DEV_RESET_TOKEN : crypto.randomBytes(32).toString('hex');

    // Tạo ID duy nhất cho token (UUID v4)
    const resetTokenId = uuidv4();

    // **Thiết lập thời gian hết hạn cho token (1 giờ)**
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // **Lưu token vào cơ sở dữ liệu**
    await db.query(
      'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [resetTokenId, user.id, resetToken, expiresAt]
    );

    // **Trong môi trường phát triển, trả về token trong response**
    if (isDevelopment) {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      return res.status(200).json({ 
        message: 'Development mode: Password reset link generated', 
        resetToken: resetToken,
        resetUrl: resetUrl 
      });
    }

    // **Chỉ gửi email trong môi trường production**
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // **Cấu hình email gửi đi**
    const mailOptions = {
      from: process.env.EMAIL_FROM, // Địa chỉ email gửi đi
      to: user.email, // Email của người dùng nhận thông báo đặt lại mật khẩu
      subject: 'ideaHive Password Reset', // Tiêu đề email
      html: `
        <p>You requested a password reset for your ideaHive account.</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link is valid for 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    };

    // **Gửi email bằng transporter sử dụng OAuth2**
    const transporter = await createTransporter();
    await transporter.sendMail(mailOptions);

    // Trả về phản hồi thành công, nhưng không tiết lộ nếu email tồn tại hay không
    res.status(200).json({ 
      message: 'If your email is registered, you will receive a password reset link' 
    });

  } catch (error) {
    // **Xử lý lỗi và ghi log**
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing password reset request' });
  }
};

// API để lấy token reset password trong môi trường phát triển
exports.getDevResetToken = async (req, res) => {
  // Kiểm tra nếu không phải môi trường phát triển thì trả về lỗi 404 (Not Found)
  if (!isDevelopment) {
    return res.status(404).json({ message: 'Not found' });
  }

  try {
    // Lấy email từ query parameters của request
    const { email } = req.query;

    // Kiểm tra nếu email không được cung cấp thì trả về lỗi 400 (Bad Request)
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Truy vấn database để tìm user theo email
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    // Nếu không tìm thấy user, trả về lỗi 404 (Not Found)
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Lấy ID của user tìm được
    const userId = users[0].id;

    // Truy vấn database để tìm token reset password mới nhất của user này,
    // sắp xếp theo thời gian hết hạn (expires_at) giảm dần và lấy token mới nhất
    const [tokens] = await db.query(
      'SELECT * FROM password_reset_tokens WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1',
      [userId]
    );

    // Nếu không tìm thấy token reset nào cho user này, trả về lỗi 404 (Not Found)
    if (tokens.length === 0) {
      return res.status(404).json({ message: 'No reset token found for this user' });
    }

    // Lấy token reset gần nhất
    const resetToken = tokens[0].token;
    const expiresAt = tokens[0].expires_at;

    // Tạo URL reset password dựa trên token lấy được
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Trả về response chứa token, URL reset password và thời gian hết hạn của token
    res.status(200).json({
      resetToken: resetToken,
      resetUrl: resetUrl,
      expiresAt: expiresAt
    });

  } catch (error) {
    // Nếu xảy ra lỗi trong quá trình xử lý, ghi log lỗi ra console
    console.error('Get dev reset token error:', error);

    // Trả về lỗi 500 (Internal Server Error) với thông báo lỗi chung
    res.status(500).json({ message: 'Error fetching reset token' });
  }
};

// API xử lý yêu cầu đặt lại mật khẩu (reset password)
exports.resetPassword = async (req, res) => {
  try {
    // Lấy token reset và mật khẩu mới từ request body
    const { token, newPassword } = req.body;

    // Kiểm tra nếu token hoặc mật khẩu mới không được cung cấp
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    // Tìm token hợp lệ trong database, kiểm tra xem token có tồn tại và chưa hết hạn
    const [tokens] = await db.query(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > NOW()',
      [token]
    );

    // Nếu không tìm thấy token hợp lệ, trả về lỗi 400 (Bad Request)
    if (tokens.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Lấy thông tin token hợp lệ
    const resetToken = tokens[0];

    // Băm (hash) mật khẩu mới để bảo mật trước khi lưu vào database
    const saltRounds = 10; // Số vòng băm (càng cao càng bảo mật nhưng chậm hơn)
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Cập nhật mật khẩu mới cho user có ID tương ứng với token reset
    await db.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, resetToken.user_id]
    );

    // Xóa token reset đã sử dụng để tránh tái sử dụng
    await db.query('DELETE FROM password_reset_tokens WHERE id = ?', [resetToken.id]);

    // Xóa tất cả refresh tokens của user để đăng xuất khỏi tất cả các thiết bị (nếu có cơ chế đăng nhập bằng refresh token)
    await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [resetToken.user_id]);

    // Trả về phản hồi thành công
    res.status(200).json({ message: 'Password reset successful' });

  } catch (error) {
    // Ghi log lỗi ra console để dễ dàng debug
    console.error('Reset password error:', error);

    // Trả về lỗi 500 (Internal Server Error) nếu có lỗi trong quá trình xử lý
    res.status(500).json({ message: 'Error resetting password' });
  }
};

// API lấy thông tin người dùng hiện tại
exports.getCurrentUser = async (req, res) => {
  try {
      // Lấy ID của người dùng từ request (được gán từ middleware xác thực)
      const userId = req.user.id;

      // Truy vấn database để lấy thông tin người dùng dựa trên userId
      const [users] = await db.query(
          'SELECT id, email, full_name, avatar_url, created_at FROM users WHERE id = ?', 
          [userId]
      );

      // Nếu không tìm thấy người dùng, trả về lỗi 404 (Not Found)
      if (users.length === 0) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Lấy thông tin của người dùng từ kết quả truy vấn
      const user = users[0];

      // Truy vấn database để lấy thông tin gói đăng ký của người dùng
      // Chỉ lấy gói có trạng thái "ACTIVE" (đang hoạt động)
      const [subscriptions] = await db.query(
          'SELECT plan_type, status FROM subscriptions WHERE user_id = ? AND status = "ACTIVE"', 
          [userId]
      );

      // Trả về thông tin người dùng và gói đăng ký (nếu có)
      res.status(200).json({
          id: user.id,                  // ID người dùng
          email: user.email,            // Email người dùng
          fullName: user.full_name,     // Họ và tên đầy đủ
          avatarUrl: user.avatar_url,   // Ảnh đại diện
          createdAt: user.created_at,   // Thời gian tạo tài khoản
          subscription: subscriptions.length > 0 ? { // Thông tin gói đăng ký (nếu có)
              planType: subscriptions[0].plan_type, // Loại gói đăng ký
              status: subscriptions[0].status      // Trạng thái gói đăng ký
          } : null // Nếu không có gói đăng ký, trả về null
      });

  } catch (error) {
      // Ghi log lỗi ra console để dễ dàng debug
      console.error('Get current user error:', error);

      // Trả về lỗi 500 (Internal Server Error) nếu có lỗi trong quá trình xử lý
      res.status(500).json({ message: 'Error fetching user data' });
  }
};
