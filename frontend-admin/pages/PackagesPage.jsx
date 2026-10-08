import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Card, Modal, Form, Input, InputNumber, Select, Popconfirm, Row, Col, Radio, Upload } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';

export default function PackagesPage() {
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();
  
  // State quản lý việc nhập ảnh
  const [imageMode, setImageMode] = useState('url'); 
  const [fileList, setFileList] = useState([]);

  useEffect(() => {
    fetchPackages();
    fetchProductsFromCommerce(); 
  }, []);

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/booking/packages/admin', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      setPackages(result.data);
    } catch (error) {
      message.error('Lỗi tải danh sách Lộ trình');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsFromCommerce = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/commerce/products');
      const result = await res.json();
      setProducts(result.data.filter(p => p.type === 'PRODUCT'));
    } catch (error) {
      console.error('Không thể kết nối đến service-commerce');
    }
  };

  const openModal = (record = null) => {
    setEditingItem(record);
    setFileList([]); // Xóa file cũ nếu có
    if (record) {
      form.setFieldsValue(record);
      // Mặc định hiển thị dạng URL
      setImageMode(record.thumbnail_url ? 'url' : 'url'); 
    } else {
      form.resetFields();
      setImageMode('url');
    }
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      let finalThumbnailUrl = values.thumbnail_url;

      // 1. XỬ LÝ UPLOAD ẢNH (NẾU CÓ)
      if (imageMode === 'file' && fileList.length > 0) {
        const formData = new FormData();
        // Dùng phép OR: Lấy originFileObj nếu có, nếu không có thì lấy thẳng file gốc
        formData.append('image', fileList[0].originFileObj || fileList[0]);
        
        const uploadRes = await fetch('http://localhost:4000/api/media/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }, // Không set Content-Type
          body: formData
        });
        
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error('Không thể tải ảnh lên máy chủ!');
        // Cập nhật lại URL từ Cloudinary
        finalThumbnailUrl = uploadData.url; 
      }

      // 2. TẠO PAYLOAD CHÍNH
      const payload = {
        ...values,
        thumbnail_url: finalThumbnailUrl 
      };

      const isUpdate = !!editingItem;
      const url = isUpdate 
        ? `http://localhost:4000/api/booking/packages/${editingItem.id}` 
        : 'http://localhost:4000/api/booking/packages';

      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      message.success(isUpdate ? 'Cập nhật Lộ trình thành công!' : 'Tạo Lộ trình mới thành công!');
      setIsModalVisible(false);
      fetchPackages();
    } catch (error) {
      message.error(error.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`http://localhost:4000/api/booking/packages/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Thất bại');
      message.success('Đã gỡ Gói Lộ trình xuống (Chuyển sang Ẩn)!');
      fetchPackages();
    } catch (error) {
      message.error('Lỗi khi gỡ lộ trình');
    }
  };

  const uploadProps = {
    onRemove: () => setFileList([]),
    beforeUpload: (file) => {
      setFileList([file]);
      return false; // Chặn Antd upload mặc định
    },
    fileList,
    maxCount: 1,
  };

  const columns = [
    { title: 'Tên Lộ trình', dataIndex: 'name', key: 'name', render: text => <b className="text-blue-600">{text}</b> },
    { 
      title: 'Giá gốc', dataIndex: 'price', key: 'price',
      render: (price) => <span className="line-through text-gray-400">{Number(price).toLocaleString('vi-VN')} ₫</span>
    },
    { 
      title: 'Giá KM (Bán)', dataIndex: 'promotional_price', key: 'promotional_price',
      render: (price) => <b className="text-red-500">{Number(price).toLocaleString('vi-VN')} ₫</b>
    },
    { title: 'Số buổi', dataIndex: 'total_sessions', key: 'sessions', render: val => `${val} buổi` },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status',
      render: (status) => <Tag color={status === 'ACTIVE' ? 'success' : 'default'}>{status === 'ACTIVE' ? 'Đang mở bán' : 'Đã ẩn'}</Tag>
    },
    {
      title: 'Hành động', key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>Chi tiết / Sửa</Button>
          <Popconfirm title="Tạm ngưng bán gói này?" onConfirm={() => handleDelete(record.id)} okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} size="small" disabled={record.status === 'HIDDEN'}>Gỡ xuống</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card 
        title="Quản lý Gói Lộ Trình (Treatment Packages)" 
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>Tạo Lộ Trình Mới</Button>}
      >
        <Table columns={columns} dataSource={packages} rowKey="id" loading={loading} />
      </Card>

      <Modal 
        title={editingItem ? "Điều chỉnh Gói Lộ Trình" : "Thiết kế Gói Lộ Trình mới"} 
        open={isModalVisible} 
        onCancel={() => setIsModalVisible(false)} 
        footer={null}
        width={750} 
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          
          {/* Card Hình ảnh được đưa lên đầu để dễ nhìn */}
          <Card size="small" title="Hình ảnh Thumbnail" className="mb-4 bg-gray-50">
            <Form.Item>
              <Radio.Group 
                value={imageMode} 
                onChange={(e) => setImageMode(e.target.value)}
                className="mb-3"
              >
                <Radio value="url">Nhập URL có sẵn</Radio>
                <Radio value="file">Tải ảnh từ máy</Radio>
              </Radio.Group>

              {imageMode === 'url' ? (
                <Form.Item name="thumbnail_url" noStyle>
                  <Input placeholder="Nhập đường dẫn ảnh (VD: https://...)" size="large"/>
                </Form.Item>
              ) : (
                <Upload {...uploadProps} accept="image/*">
                  <Button icon={<UploadOutlined />} size="large">Chọn File Ảnh</Button>
                </Upload>
              )}
            </Form.Item>
          </Card>

          <Form.Item label="Tên Lộ trình" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}>
            <Input placeholder="VD: Lộ trình trị mụn chuyên sâu 8 tuần" size="large"/>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Giá gốc (VNĐ)" name="price" rules={[{ required: true }]}>
                <InputNumber className="w-full" min={0} step={10000} size="large"/>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Giá Khuyến mãi (Bán thực tế)" name="promotional_price">
                <InputNumber className="w-full" min={0} step={10000} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Tổng số buổi" name="total_sessions" rules={[{ required: true }]}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Khoảng cách buổi (ngày)" name="interval_days" rules={[{ required: true }]}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Hạn dùng gói (ngày)" name="validity_days" rules={[{ required: true }]}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Mỹ phẩm đi kèm (Tặng khách)" name="included_products">
            <Select 
              mode="multiple" 
              placeholder="Chọn các mỹ phẩm đính kèm lộ trình này"
              allowClear
            >
              {products.map(p => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name} - (Tồn: {p.stock_quantity})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Mô tả chi tiết & Chỉ định" name="description">
            <Input.TextArea rows={4} placeholder="Nhập các bước trong liệu trình, dặn dò..." />
          </Form.Item>

          {/* Đã gỡ bỏ ô Input Link Ảnh cũ, chỉ giữ lại phần trạng thái */}
          <Form.Item label="Trạng thái mở bán" name="status" initialValue="ACTIVE">
            <Select size="large">
              <Select.Option value="ACTIVE">Đang mở bán (ACTIVE)</Select.Option>
              <Select.Option value="HIDDEN">Tạm ẩn (HIDDEN)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item className="text-right mb-0 mt-4">
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" size="large">
                {editingItem ? 'Lưu cập nhật' : 'Phát hành Lộ trình'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}