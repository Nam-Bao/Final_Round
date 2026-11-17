// Nhân viên nghỉ việc (khoá / xoá tài khoản, hồ sơ nhân sự "Đã nghỉ việc") => xoá ảnh gốc khuôn mặt + vector ở service AI
// (dữ liệu sinh trắc học chỉ giữ khi còn dùng cho chấm công). Gọi bằng token của quản lý đang thao tác; lỗi thì ghi log.
const axios = require('axios');

const removeStaffFace = (userId, authorization) => axios
  .delete(`${process.env.GATEWAY_URL || 'http://localhost:4000'}/api/ai/faces/${userId}`, { headers: { Authorization: authorization }, timeout: 10000 })
  .catch((e) => console.warn('Chưa xoá được dữ liệu khuôn mặt của nhân viên nghỉ việc:', e.response?.data?.message || e.message));

module.exports = { removeStaffFace };
