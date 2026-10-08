import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Card, Modal, Form, Input, InputNumber, Select, Popconfirm, Row, Col, Radio, Upload } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';

export default function SpaServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();
  
  // State quản lý việc nhập ảnh
  const [imageMode, setImageMode] = useState('url'); 
  const [fileList, setFileList] = useState([]);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/booking/spa-services/admin', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      setServices(result.data);
    } catch (error) {
      message.error('Lỗi tải danh sách Dịch vụ Spa');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (record = null) => {
    setEditingItem(record);
    setFileList([]); 
    if (record) {
      form.setFieldsValue(record);
      setImageMode(record.image_url ? 'url' : 'url'); 
    } else {
      form.resetFields();
      setImageMode('url');
    }
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      let finalImageUrl = values.image_url;

      // 1. XỬ LÝ UPLOAD ẢNH (NẾU CÓ)
      if (imageMode === 'file' && fileList.length > 0) {
        const formData = new FormData();
        // Dùng phép OR: Lấy originFileObj nếu có, nếu không có thì lấy thẳng file gốc
        formData.append('image', fileList[0].originFileObj || fileList[0]);
        
        const uploadRes = await fetch('http://localhost:4000/api/media/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error('Không thể tải ảnh lên máy chủ!');
        finalImageUrl = uploadData.url; 
      }

      const payload = {
        ...values,
        image_url: finalImageUrl 
      };

      const isUpdate = !!editingItem;
      const url = isUpdate 
        ? `http://localhost:4000/api/booking/spa-services/${editingItem.id}` 
        : 'http://localhost:4000/api/booking/spa-services';

      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      message.success(isUpdate ? 'Cập nhật dịch vụ thành công!' : 'Tạo dịch vụ mới thành công!');
      setIsModalVisible(false);
      fetchServices();
    } catch (error) {
      message.error(error.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`http://localhost:4000/api/booking/spa-services/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Thất bại');
      message.success('Đã ẩn Dịch vụ thành công!');
      fetchServices();
    } catch (error) {
      message.error('Lỗi khi ẩn dịch vụ');
    }
  };

  const uploadProps = {
    onRemove: () => setFileList([]),
    beforeUpload: (file) => {
      setFileList([file]);
      return false; 
    },
    fileList,
    maxCount: 1,
  };

  const columns = [
    { title: 'Tên Dịch vụ', dataIndex: 'name', key: 'name', render: text => <b className="text-blue-600">{text}</b> },
    { 
      title: 'Đơn giá', dataIndex: 'price', key: 'price',
      render: (price) => <b className="text-red-500">{Number(price).toLocaleString('vi-VN')} ₫</b>
    },
    { title: 'Thời gian (Phút)', dataIndex: 'duration_minutes', key: 'duration', render: val => `${val} phút` },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status',
      render: (status) => <Tag color={status === 'ACTIVE' ? 'success' : 'default'}>{status === 'ACTIVE' ? 'Hoạt động' : 'Đã ẩn'}</Tag>
    },
    {
      title: 'Hành động', key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>Sửa</Button>
          <Popconfirm title="Tạm ngưng cung cấp dịch vụ này?" onConfirm={() => handleDelete(record.id)} okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} size="small" disabled={record.status === 'HIDDEN'}>Ẩn</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card 
        title="Quản lý Dịch vụ Spa (Lấy mụn, Triệt lông, vv...)" 
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>Thêm Dịch vụ</Button>}
      >
        <Table columns={columns} dataSource={services} rowKey="id" loading={loading} />
      </Card>

      <Modal 
        title={editingItem ? "Điều chỉnh Dịch vụ" : "Thêm Dịch vụ mới"} 
        open={isModalVisible} 
        onCancel={() => setIsModalVisible(false)} 
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          
          <Card size="small" title="Hình ảnh Đại diện" className="mb-4 bg-gray-50">
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
                <Form.Item name="image_url" noStyle>
                  <Input placeholder="Nhập đường dẫn ảnh (VD: https://...)" size="large"/>
                </Form.Item>
              ) : (
                <Upload {...uploadProps} accept="image/*">
                  <Button icon={<UploadOutlined />} size="large">Chọn File Ảnh</Button>
                </Upload>
              )}
            </Form.Item>
          </Card>

          <Form.Item label="Tên Dịch vụ" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}>
            <Input placeholder="VD: Lấy nhân mụn chuẩn y khoa" size="large"/>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Giá dịch vụ (VNĐ)" name="price" rules={[{ required: true }]}>
                <InputNumber className="w-full" min={0} step={10000} size="large"/>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Thời lượng (Phút)" name="duration_minutes" rules={[{ required: true }]} initialValue={60}>
                <InputNumber className="w-full" min={15} step={15} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Mô tả chi tiết" name="description">
            <Input.TextArea rows={4} placeholder="Nhập mô tả các bước thực hiện..." />
          </Form.Item>

          <Form.Item label="Trạng thái" name="status" initialValue="ACTIVE">
            <Select size="large">
              <Select.Option value="ACTIVE">Đang hoạt động</Select.Option>
              <Select.Option value="HIDDEN">Tạm ẩn</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item className="text-right mb-0 mt-4">
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" size="large">
                {editingItem ? 'Lưu cập nhật' : 'Thêm Dịch vụ'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}