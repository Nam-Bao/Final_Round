import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Card, Modal, Form, Input, InputNumber, Select, Popconfirm, Row, Col } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';

export default function PackagesPage() {
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]); // Chứa danh sách mỹ phẩm từ kho
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchPackages();
    fetchProductsFromCommerce(); // Tự động kéo kho hàng về khi mở trang
  }, []);

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      // Gọi API dành riêng cho Admin (Lấy cả gói ACTIVE và HIDDEN)
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
      // Chỉ lấy những mặt hàng là Sản phẩm (PRODUCT) để tặng khách
      setProducts(result.data.filter(p => p.type === 'PRODUCT'));
    } catch (error) {
      console.error('Không thể kết nối đến service-commerce');
    }
  };

  const openModal = (record = null) => {
    setEditingItem(record);
    if (record) form.setFieldsValue(record);
    else form.resetFields();
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      const isUpdate = !!editingItem;
      const url = isUpdate 
        ? `http://localhost:4000/api/booking/packages/${editingItem.id}` 
        : 'http://localhost:4000/api/booking/packages';

      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(values)
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
        width={750} // Form nhiều dữ liệu nên làm rộng ra
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          
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

          {/* Dùng Select multiple để chọn nhiều sản phẩm - Sẽ tự động lưu thành mảng JSONB xuống DB */}
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

          <Row gutter={16}>
             <Col span={12}>
                <Form.Item label="Link Ảnh Thumbnail" name="thumbnail_url">
                  <Input placeholder="https://example.com/image.jpg" />
                </Form.Item>
             </Col>
             <Col span={12}>
                <Form.Item label="Trạng thái mở bán" name="status" initialValue="ACTIVE">
                  <Select>
                    <Select.Option value="ACTIVE">Đang mở bán (ACTIVE)</Select.Option>
                    <Select.Option value="HIDDEN">Tạm ẩn (HIDDEN)</Select.Option>
                  </Select>
                </Form.Item>
             </Col>
          </Row>

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