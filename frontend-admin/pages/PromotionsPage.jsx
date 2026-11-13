import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Card, Modal, Form, Input, InputNumber, Select, Popconfirm, Row, Col, DatePicker, Radio, Upload, Image } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, UploadOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const VISIBILITY = {
  PUBLIC: { color: 'blue', text: 'Website khách' },
  INTERNAL: { color: 'purple', text: 'Nội bộ' },
};
const CHANNEL = { ONLINE: 'Khách tự áp (online)', CLINIC: 'Hoá đơn sau khám', COUNTER: 'Bán tại quầy / đặt hộ' };

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();
  
  // State quản lý việc nhập ảnh
  const [imageMode, setImageMode] = useState('url'); 
  const [fileList, setFileList] = useState([]);

  const discountType = Form.useWatch('discount_type', form); 
  // Lịch sử áp mã (null = đóng; { promo } = 1 mã; { promo: null } = tất cả)
  const [usageView, setUsageView] = useState(null);
  const [usages, setUsages] = useState([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const openUsages = async (promo = null) => {
    setUsageView({ promo });
    setUsageLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await fetch(`http://localhost:4000/api/commerce/promotions/admin/usages${promo ? `?promotion_id=${promo.id}` : ''}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      setUsages(result.data || []);
    } catch (error) {
      message.error('Không tải được lịch sử áp mã');
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/commerce/promotions/admin', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      setPromotions(result.data);
    } catch (error) {
      message.error('Lỗi tải danh sách khuyến mãi');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (record = null) => {
    setEditingItem(record);
    setFileList([]); 
    if (record) {
      form.setFieldsValue({
        ...record,
        start_date: dayjs(record.start_date),
        end_date: dayjs(record.end_date)
      });
      setImageMode(record.image_url ? 'url' : 'url'); 
    } else {
      form.resetFields();
      setImageMode('url');
    }
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      let finalImageUrl = values.image_url;

      // 1. XỬ LÝ UPLOAD ẢNH (NẾU CÓ) TRƯỚC KHI TẠO MÃ
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
        finalImageUrl = uploadData.url; 
      }

      // 2. TẠO PAYLOAD CHÍNH
      const payload = {
        ...values,
        image_url: finalImageUrl, 
        start_date: values.start_date.toISOString(),
        end_date: values.end_date.toISOString(),
      };

      const isUpdate = !!editingItem;
      const url = isUpdate 
        ? `http://localhost:4000/api/commerce/promotions/${editingItem.id}` 
        : 'http://localhost:4000/api/commerce/promotions';

      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      message.success(isUpdate ? 'Cập nhật thành công!' : 'Tạo mã mới thành công!');
      setIsModalVisible(false);
      fetchPromotions();
    } catch (error) {
      message.error(error.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await fetch(`http://localhost:4000/api/commerce/promotions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Thất bại');
      message.success('Đã vô hiệu hóa mã!');
      fetchPromotions();
    } catch (error) {
      message.error('Lỗi khi xóa mã');
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
    { title: 'Mã Code', dataIndex: 'code', key: 'code', render: text => <Tag color="blue" className="text-lg">{text}</Tag> },
    { 
      title: 'Giảm giá', 
      key: 'discount',
      render: (_, record) => {
        if (record.discount_type === 'PERCENTAGE') return <b className="text-red-500">{record.discount_value}%</b>;
        return <b className="text-red-500">- {Number(record.discount_value).toLocaleString('vi-VN')} ₫</b>;
      }
    },
    { 
      title: 'Đã dùng / Tổng', 
      key: 'usage', 
      render: (_, record) => `${record.used_count} / ${record.usage_limit || '∞'}`
    },
    { 
      title: 'Hết hạn', 
      dataIndex: 'end_date', 
      key: 'end_date',
      render: date => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status',
      render: (status) => <Tag color={status === 'ACTIVE' ? 'success' : 'error'}>{status}</Tag>
    },
    {
      title: 'Hiển thị', dataIndex: 'visibility', key: 'visibility',
      render: (v) => <Tag color={VISIBILITY[v || 'PUBLIC'].color}>{VISIBILITY[v || 'PUBLIC'].text}</Tag>
    },
    {
      title: 'Hành động', key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>Sửa</Button>
          <Button icon={<HistoryOutlined />} size="small" onClick={() => openUsages(record)}>Lịch sử áp</Button>
          <Popconfirm title="Khóa mã này lại?" onConfirm={() => handleDelete(record.id)} okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} size="small" disabled={record.status === 'HIDDEN'}>Khóa</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card 
        title="Quản lý Khuyến mãi (Voucher)" 
        extra={<Space><Button icon={<HistoryOutlined />} onClick={() => openUsages()}>Lịch sử áp mã</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>Tạo Mã Code</Button></Space>}
      >
        <Table columns={columns} dataSource={promotions} rowKey="id" loading={loading} />
      </Card>

      <Modal 
        title={editingItem ? "Điều chỉnh Mã Khuyến Mãi" : "Tạo Mã Khuyến Mãi"} 
        open={isModalVisible} 
        onCancel={() => setIsModalVisible(false)} 
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          
          <Card size="small" title="Hình ảnh & Phạm vi Áp dụng" className="mb-4 bg-gray-50">
            <Form.Item label="Phạm vi áp dụng" name="applicable_scope" rules={[{ required: true }]} initialValue="ALL">
              <Select size="large">
                <Select.Option value="ALL">Áp dụng Toàn hệ thống (Dịch vụ & Mỹ phẩm)</Select.Option>
                <Select.Option value="SPA_SERVICE">Chỉ áp dụng cho Dịch vụ Spa lẻ</Select.Option>
                <Select.Option value="TREATMENT_PACKAGE">Chỉ áp dụng cho Gói Lộ trình (VIP)</Select.Option>
                <Select.Option value="PRODUCT">Chỉ áp dụng khi mua Mỹ phẩm/Sản phẩm</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="Ảnh minh họa (Tùy chọn)">
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

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Mã Code (VD: SALE20)" name="code" rules={[{ required: true }]}>
                <Input placeholder="Nhập mã code viết liền" size="large" style={{ textTransform: 'uppercase' }}/>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Loại giảm giá" name="discount_type" rules={[{ required: true }]} initialValue="PERCENTAGE">
                <Select size="large">
                  <Select.Option value="PERCENTAGE">Giảm theo phần trăm (%)</Select.Option>
                  <Select.Option value="FIXED_AMOUNT">Giảm số tiền cố định (VNĐ)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                label={discountType === 'PERCENTAGE' ? "Mức giảm (%)" : "Số tiền giảm (VNĐ)"} 
                name="discount_value" 
                rules={[{ required: true }]}
              >
                <InputNumber className="w-full" min={1} size="large"/>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Giảm tối đa (VNĐ)" name="max_discount">
                <InputNumber className="w-full" min={0} size="large" disabled={discountType === 'FIXED_AMOUNT'} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Đơn tối thiểu để áp dụng" name="min_order_value" initialValue={0}>
                <InputNumber className="w-full" min={0} size="large" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Giới hạn số lần nhập (Bỏ trống = Vô hạn)" name="usage_limit">
                <InputNumber className="w-full" min={1} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Thời gian Bắt đầu" name="start_date" rules={[{ required: true }]}>
                <DatePicker showTime className="w-full" size="large" format="DD/MM/YYYY HH:mm"/>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Thời gian Kết thúc" name="end_date" rules={[{ required: true }]}>
                <DatePicker showTime className="w-full" size="large" format="DD/MM/YYYY HH:mm"/>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Trạng thái mã" name="status" initialValue="ACTIVE">
                <Select size="large">
                  <Select.Option value="ACTIVE">Kích hoạt</Select.Option>
                  <Select.Option value="HIDDEN">Khóa tạm thời</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Hiển thị" name="visibility" initialValue="PUBLIC"
                extra="Nội bộ: không hiện trên website, khách không tự nhập được; chỉ nhân viên áp hộ khách và phải tải ảnh xác thực.">
                <Select size="large">
                  <Select.Option value="PUBLIC">Hiển thị trên giao diện khách</Select.Option>
                  <Select.Option value="INTERNAL">Lưu hành nội bộ</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item className="text-right mb-0 mt-4">
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" size="large">
                {editingItem ? 'Lưu cập nhật' : 'Tạo Mã'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={usageView?.promo ? `Lịch sử áp mã ${usageView.promo.code}` : 'Lịch sử áp mã'} open={!!usageView} onCancel={() => setUsageView(null)} footer={null} width={1000}>
        <Table
          rowKey="id" size="small" loading={usageLoading} dataSource={usages} pagination={{ pageSize: 10 }} scroll={{ x: 900 }}
          columns={[
            { title: 'Thời gian', dataIndex: 'createdAt', width: 130, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
            ...(usageView?.promo ? [] : [{ title: 'Mã', dataIndex: 'code', width: 110, render: (v, r) => <><Tag color="blue">{v}</Tag>{r.visibility === 'INTERNAL' && <Tag color="purple">Nội bộ</Tag>}</> }]),
            { title: 'Khách', key: 'c', width: 170, render: (_, r) => <><div>{r.customer?.name || 'Khách hàng'}</div><div className="text-xs text-gray-500">{r.customer?.phone}</div></> },
            { title: 'Kênh', dataIndex: 'channel', width: 150, render: (v) => CHANNEL[v] || 'Không rõ (dữ liệu cũ)' },
            { title: 'Giảm', dataIndex: 'discount_amount', width: 110, align: 'right', render: (v) => (v == null ? '' : `${Number(v).toLocaleString('vi-VN')} đ`) },
            { title: 'Người áp', dataIndex: 'applied_by_name', width: 150, render: (v, r) => v || (r.applied_by ? 'Nhân viên' : 'Khách tự áp') },
            { title: 'Ảnh xác thực', dataIndex: 'proof_url', width: 110, render: (v, r) => (v ? <Image src={v} width={64} height={64} className="object-cover rounded" /> : r.applied_by ? <Tag color="red">Thiếu ảnh</Tag> : '') },
          ]}
        />
      </Modal>
    </>
  );
}