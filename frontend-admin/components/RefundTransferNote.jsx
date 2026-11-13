import React from 'react';
import { Alert, Typography } from 'antd';

// Nội dung chuyển khoản hoàn tiền "HOAN <6 ký tự đầu mã>": ngân hàng báo tiền ra đúng nội dung + số tiền thì khoản hoàn
// được xác minh tự động; sai nội dung thì quản lý phải đối chiếu sao kê.
export const refundCode = (id) => `HOAN ${String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export default function RefundTransferNote({ sourceId, amount }) {
  return (
    <Alert
      type="info" showIcon className="mb-3"
      message={<span>Chuyển khoản <b>{Number(amount || 0).toLocaleString('vi-VN')}đ</b> với nội dung <Typography.Text strong copyable>{refundCode(sourceId)}</Typography.Text></span>}
      description="Ghi đúng nội dung và số tiền để hệ thống tự đối chiếu khi ngân hàng báo tiền ra. Khoản hoàn chưa khớp giao dịch ngân hàng sẽ nằm ở mục Kiểm soát hoàn tiền để quản lý kiểm tra."
    />
  );
}
