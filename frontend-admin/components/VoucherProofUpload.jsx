import React, { useState } from 'react';
import { Upload, Button, Image, message } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';

// Ảnh xác thực khi nhân viên áp voucher cho khách (VD: chụp lịch sử tư vấn chuyên gia trên điện thoại khách).
// Bắt buộc với mọi lần áp mã tại quầy; quản lý xem lại ở Khuyến mãi > Lịch sử áp mã.
export default function VoucherProofUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false);

  const upload = async ({ file, onSuccess, onError }) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('http://localhost:4000/api/media/upload', {
        method: 'POST', headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` }, body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.message || 'Tải ảnh thất bại');
      onChange?.(data.url);
      onSuccess?.('ok');
    } catch (err) {
      message.error(err.message);
      onError?.(err);
    } finally {
      setUploading(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <Image src={value} width={56} height={56} className="object-cover rounded border" />
        <span className="text-xs text-green-700">Đã có ảnh xác thực</span>
        <Button size="small" icon={<DeleteOutlined />} onClick={() => onChange?.(null)}>Đổi ảnh</Button>
      </div>
    );
  }
  return (
    <Upload accept="image/*" showUploadList={false} customRequest={upload}>
      <Button icon={<CameraOutlined />} loading={uploading} danger>Tải ảnh xác thực (bắt buộc)</Button>
    </Upload>
  );
}
