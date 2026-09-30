import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Modal, Form, Input, InputNumber, Select, Popconfirm, Tabs } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';

// ==========================================
// TAB 1: COMPONENT QUẢN LÝ DANH MỤC
// ==========================================
const CategoriesTab = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchText, setSearchText] = useState(''); // THÊM state tìm kiếm
  const [form] = Form.useForm();

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => { /* ... giữ nguyên logic gọi API ... */ 
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/commerce/categories');
      const data = await res.json();
      setCategories(data.data);
    } catch (error) { message.error('Lỗi tải dữ liệu'); } finally { setLoading(false); }
  };

  const openModal = (record = null) => {
    setEditingItem(record);
    if (record) form.setFieldsValue(record); else form.resetFields();
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => { /* ... giữ nguyên logic gọi API ... */ 
    try {
      const token = localStorage.getItem('admin_token');
      const isUpdate = !!editingItem;
      const url = isUpdate ? `http://localhost:4000/api/commerce/categories/${editingItem.id}` : 'http://localhost:4000/api/commerce/categories';
      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error('Thao tác thất bại');
      message.success(isUpdate ? 'Cập nhật danh mục thành công!' : 'Thêm mới thành công!');
      setIsModalVisible(false);
      fetchCategories();
    } catch (error) { message.error(error.message); }
  };

  const handleDelete = async (id) => { /* ... giữ nguyên logic gọi API ... */ 
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`http://localhost:4000/api/commerce/categories/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã xóa danh mục!'); fetchCategories();
    } catch (error) { message.error('Lỗi khi xóa'); }
  };

  // Lọc danh mục theo từ khóa
  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(searchText.toLowerCase()));

  const columns = [
    { title: 'Tên danh mục', dataIndex: 'name', key: 'name', render: text => <b>{text}</b> },
    { title: 'Mô tả', dataIndex: 'description', key: 'description' },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status',
      // THÊM: Bộ lọc tại cột Trạng thái
      filters: [
        { text: 'Hoạt động (ACTIVE)', value: 'ACTIVE' },
        { text: 'Ẩn (INACTIVE)', value: 'INACTIVE' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => <Tag color={status === 'ACTIVE' ? 'success' : 'error'}>{status}</Tag>
    },
    {
      title: 'Hành động', key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>Sửa</Button>
          <Popconfirm title="Xóa danh mục này?" onConfirm={() => handleDelete(record.id)} okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} size="small">Xóa</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="pt-2">
      <div className="flex justify-between items-center mb-4">
        <Space>
          <h3 className="text-lg font-semibold text-gray-700 m-0">Phân loại Dược mỹ phẩm</h3>
          <Input.Search placeholder="Tìm tên danh mục..." allowClear onChange={e => setSearchText(e.target.value)} style={{ width: 250, marginLeft: 16 }} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>Thêm Danh Mục</Button>
      </div>
      <Table columns={columns} dataSource={filteredCategories} rowKey="id" loading={loading} />
      {/* ... Modal giữ nguyên ... */}
      <Modal title={editingItem ? "Sửa danh mục" : "Thêm danh mục mới"} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="Tên danh mục" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Mô tả" name="description"><Input.TextArea rows={3} /></Form.Item>
          {editingItem && (
            <Form.Item label="Trạng thái" name="status"><Select><Select.Option value="ACTIVE">Hoạt động</Select.Option><Select.Option value="INACTIVE">Ẩn</Select.Option></Select></Form.Item>
          )}
          <Form.Item className="text-right mb-0"><Space><Button onClick={() => setIsModalVisible(false)}>Hủy</Button><Button type="primary" htmlType="submit">Lưu</Button></Space></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// ==========================================
// TAB 2: COMPONENT QUẢN LÝ SẢN PHẨM
// ==========================================
const ProductsTab = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchText, setSearchText] = useState(''); // THÊM state tìm kiếm
  const [form] = Form.useForm();

  useEffect(() => { fetchProducts(); fetchCategories(); }, []);

  const fetchProducts = async () => { /* giữ nguyên */ 
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/commerce/products');
      const data = await res.json();
      setProducts(data.data);
    } catch (error) { message.error('Lỗi tải dữ liệu'); } finally { setLoading(false); }
  };

  const fetchCategories = async () => { /* giữ nguyên */ 
    try {
      const res = await fetch('http://localhost:4000/api/commerce/categories');
      const data = await res.json();
      setCategories(data.data.filter(c => c.status === 'ACTIVE'));
    } catch (error) {}
  };

  const openModal = async (record = null) => {
    await fetchCategories();
    setEditingItem(record);
    if (record) form.setFieldsValue(record); else form.resetFields();
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => { /* giữ nguyên */ 
    try {
      const token = localStorage.getItem('admin_token');
      const isUpdate = !!editingItem;
      const url = isUpdate ? `http://localhost:4000/api/commerce/products/${editingItem.id}` : 'http://localhost:4000/api/commerce/products';
      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error('Thất bại');
      message.success('Thành công!'); setIsModalVisible(false); fetchProducts();
    } catch (error) { message.error(error.message); }
  };

  const handleDelete = async (id) => { /* giữ nguyên */ 
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`http://localhost:4000/api/commerce/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã xóa!'); fetchProducts();
    } catch (error) {}
  };

  // Lọc sản phẩm theo từ khóa
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchText.toLowerCase()));

  const columns = [
    { title: 'Tên Sản phẩm/Vật tư', dataIndex: 'name', key: 'name', render: text => <b>{text}</b> },
    { 
      title: 'Danh mục', dataIndex: 'Category', key: 'category', 
      // THÊM: Bộ lọc tự động ăn theo danh sách Categories đang có
      filters: categories.map(c => ({ text: c.name, value: c.id })),
      onFilter: (value, record) => record.category_id === value || record.Category?.id === value,
      render: (cat) => <Tag color="blue">{cat?.name || 'Chưa phân loại'}</Tag> 
    },
    { 
      title: 'Loại', dataIndex: 'type', key: 'type',
      // THÊM: Bộ lọc Loại sản phẩm
      filters: [
        { text: 'Sản phẩm', value: 'PRODUCT' },
        { text: 'Vật tư', value: 'MATERIAL' },
      ],
      onFilter: (value, record) => record.type === value,
      render: (type) => <Tag color={type === 'PRODUCT' ? 'green' : 'orange'}>{type === 'PRODUCT' ? 'Sản phẩm' : 'Vật tư'}</Tag>
    },
    { title: 'Giá bán', dataIndex: 'price', key: 'price', render: (price) => Number(price).toLocaleString('vi-VN') + ' ₫' },
    { title: 'Tồn kho', dataIndex: 'stock_quantity', key: 'stock' },
    {
      title: 'Hành động', key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>Sửa</Button>
          <Popconfirm title="Xóa sản phẩm này?" onConfirm={() => handleDelete(record.id)} okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} size="small">Xóa</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="pt-2">
      <div className="flex justify-between items-center mb-4">
        <Space>
          <h3 className="text-lg font-semibold text-gray-700 m-0">Kho Hàng & Sản phẩm</h3>
          <Input.Search placeholder="Tìm tên sản phẩm..." allowClear onChange={e => setSearchText(e.target.value)} style={{ width: 250, marginLeft: 16 }} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>Thêm Sản Phẩm</Button>
      </div>
      <Table columns={columns} dataSource={filteredProducts} rowKey="id" loading={loading} />
      {/* ... Modal giữ nguyên ... */}
      <Modal title={editingItem ? "Sửa sản phẩm" : "Thêm sản phẩm mới"} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="Tên sản phẩm" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Space className="w-full justify-between">
            <Form.Item label="Danh mục" name="category_id" className="w-[220px]" rules={[{ required: true }]}><Select>{categories.map(c => (<Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>))}</Select></Form.Item>
            <Form.Item label="Phân loại" name="type" className="w-[220px]" rules={[{ required: true }]}><Select><Select.Option value="PRODUCT">Sản phẩm bán</Select.Option><Select.Option value="MATERIAL">Vật tư nội bộ</Select.Option></Select></Form.Item>
          </Space>
          <Space className="w-full justify-between">
            <Form.Item label="Giá bán (VNĐ)" name="price" className="w-[220px]" rules={[{ required: true }]}><InputNumber className="w-full" min={0} step={1000} /></Form.Item>
            <Form.Item label="Tồn kho" name="stock_quantity" className="w-[220px]" rules={[{ required: true }]}><InputNumber className="w-full" min={0} /></Form.Item>
          </Space>
          <Form.Item className="text-right mb-0 mt-4"><Space><Button onClick={() => setIsModalVisible(false)}>Hủy</Button><Button type="primary" htmlType="submit">Lưu</Button></Space></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// ==========================================
// COMPONENT CHÍNH BỌC BÊN NGOÀI
// ==========================================
export default function InventoryPage() {
  const items = [
    { key: '1', label: '📦 Quản lý Sản phẩm', children: <ProductsTab /> },
    { key: '2', label: '🏷️ Danh mục Dược mỹ phẩm', children: <CategoriesTab /> },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <Tabs defaultActiveKey="1" items={items} />
    </div>
  );
}