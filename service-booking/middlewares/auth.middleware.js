const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // Lấy token từ header của request (chuẩn Authorization: Bearer <token>)
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1]; // Tách chữ Bearer ra để lấy mã token

  if (!token) {
    return res.status(401).json({ message: 'Truy cập bị từ chối. Không tìm thấy Token!' });
  }

  try {
    // Dùng khóa bí mật để giải mã Token (Phải khớp với khóa lúc sinh ra ở hàm login)
    const JWT_SECRET = 'O2O_SKINCARE_SECRET_KEY_2026';
    const decoded = jwt.verify(token, JWT_SECRET);

    // Giải mã thành công, ta nhét thông tin user (id, role) vào req để các hàm phía sau dùng
    req.user = decoded;
    
    // Cấp phép cho đi tiếp vào Controller
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Token không hợp lệ hoặc đã hết hạn!' });
  }
};

// Middleware phân quyền dựa trên Role
// Sử dụng Rest Parameter (...allowedRoles) để nhận vào một mảng các role cho phép
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // req.user đã được bóc tách từ token ở bước verifyToken trước đó
    if (!req.user || !req.user.role) {
      return res.status(403).json({ message: 'Không thể xác định quyền hạn của bạn!' });
    }

    // Kiểm tra xem role của user hiện tại có nằm trong danh sách cho phép không
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Truy cập bị từ chối! Chức năng này chỉ dành cho: ${allowedRoles.join(', ')}` 
      });
    }

    // Nếu hợp lệ, cho phép đi tiếp vào Controller
    next();
  };
};

module.exports = { verifyToken , authorizeRoles };