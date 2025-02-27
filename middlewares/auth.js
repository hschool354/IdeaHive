const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    // Lấy token từ header Authorization của request
    const authHeader = req.headers.authorization;
    
    // Kiểm tra xem header Authorization có tồn tại và có đúng định dạng không
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Tách token từ chuỗi 'Bearer <token>'
    const token = authHeader.split(' ')[1];

    // Xác thực token bằng JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Thêm thông tin người dùng vào request để các middleware hoặc route handler sau có thể sử dụng
    req.user = decoded;

    // Gọi `next()` để tiếp tục xử lý request
    next();
  } catch (error) {
    // Trả về lỗi 401 nếu xác thực thất bại
    return res.status(401).json({ message: 'Authentication failed' });
  }
};
