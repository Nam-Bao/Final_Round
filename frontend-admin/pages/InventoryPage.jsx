import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Modal, Form, Input, InputNumber, Select, Popconfirm, Tabs, DatePicker, Radio, Upload } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

// ==========================================
// TAB 1: COMPONENT QUẢN LÝ DANH MỤC
// ==========================================
const CategoriesTab = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchText, setSearchText] = useState(''); 
  const [form] = Form.useForm();

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => { 
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

  const handleSubmit = async (values) => { 
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

  const handleDelete = async (id) => { 
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`http://localhost:4000/api/commerce/categories/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã xóa danh mục!'); fetchCategories();
    } catch (error) { message.error('Lỗi khi xóa'); }
  };

  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(searchText.toLowerCase()));

  const columns = [
    { title: 'Tên danh mục', dataIndex: 'name', key: 'name', render: text => <b>{text}</b> },
    { title: 'Mô tả', dataIndex: 'description', key: 'description' },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status',
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
  const [searchText, setSearchText] = useState(''); 
  const [form] = Form.useForm();
  
  const [imageMode, setImageMode] = useState('url'); 
  const [fileList, setFileList] = useState([]);

  useEffect(() => { fetchProducts(); fetchCategories(); }, []);

  const fetchProducts = async () => { 
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/commerce/products');
      const data = await res.json();
      setProducts(data.data);
    } catch (error) { message.error('Lỗi tải dữ liệu'); } finally { setLoading(false); }
  };

  const fetchCategories = async () => { 
    try {
      const res = await fetch('http://localhost:4000/api/commerce/categories');
      const data = await res.json();
      setCategories(data.data.filter(c => c.status === 'ACTIVE'));
    } catch (error) {}
  };

  const openModal = async (record = null) => {
    await fetchCategories();
    setEditingItem(record);
    setFileList([]);
    
    if (record) {
      let parsedImages = [];
      if (record.image_url) {
        try {
          parsedImages = typeof record.image_url === 'string' ? JSON.parse(record.image_url) : record.image_url;
          if (!Array.isArray(parsedImages)) parsedImages = [record.image_url];
        } catch (e) { parsedImages = [record.image_url]; }
      }
      form.setFieldsValue({
        ...record,
        start_date: record.start_date ? dayjs(record.start_date) : null,
        end_date: record.end_date ? dayjs(record.end_date) : null,
        image_url: parsedImages 
      });
      setImageMode('url');
    } else { 
      form.resetFields(); 
      setImageMode('url');
    }
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => { 
    try {
      const token = localStorage.getItem('admin_token');
      
      let finalImages = values.image_url || [];

      if (imageMode === 'file' && fileList.length > 0) {
        const uploadedUrls = [];
        
        for (const file of fileList) {
          const formData = new FormData();
          formData.append('image', file.originFileObj || file);
          
          const uploadRes = await fetch('http://localhost:4000/api/media/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });
          
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) throw new Error('Không thể tải ảnh lên máy chủ!');
          uploadedUrls.push(uploadData.url);
        }
        
        finalImages = uploadedUrls;
      } else {
        if(!Array.isArray(finalImages)) {
           finalImages = [finalImages];
        }
      }

      const isUpdate = !!editingItem;
      const url = isUpdate ? `http://localhost:4000/api/commerce/products/${editingItem.id}` : 'http://localhost:4000/api/commerce/products';
      
      const payload = {
        ...values,
        start_date: values.start_date ? values.start_date.toISOString() : null,
        end_date: values.end_date ? values.end_date.toISOString() : null,
        image_url: finalImages 
      };

      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Thất bại');
      message.success('Thành công!'); setIsModalVisible(false); fetchProducts();
    } catch (error) { message.error(error.message); }
  };

  const handleDelete = async (id) => { 
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`http://localhost:4000/api/commerce/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã xóa!'); fetchProducts();
    } catch (error) {}
  };
  
  const uploadProps = {
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    beforeUpload: (file) => {
      if (fileList.length >= 5) {
         message.error('Chỉ được tải lên tối đa 5 hình ảnh!');
         return false;
      }
      setFileList([...fileList, file]);
      return false; 
    },
    fileList,
    multiple: true,
    maxCount: 5,
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchText.toLowerCase()));

  const columns = [
    { title: 'Tên Sản phẩm/Vật tư', dataIndex: 'name', key: 'name', render: text => <b>{text}</b> },
    { 
      title: 'Danh mục', dataIndex: 'Category', key: 'category', 
      filters: categories.map(c => ({ text: c.name, value: c.id })),
      onFilter: (value, record) => record.category_id === value || record.Category?.id === value,
      render: (cat) => <Tag color="blue">{cat?.name || 'Chưa phân loại'}</Tag> 
    },
    { 
      title: 'Loại', dataIndex: 'type', key: 'type',
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
      
      <Modal title={editingItem ? "Sửa sản phẩm" : "Thêm sản phẩm mới"} width={700} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          
          <div className="mb-4 p-3 bg-gray-50 border rounded">
             <div className="mb-2 font-medium">Hình ảnh sản phẩm (Tối đa 5 ảnh)</div>
             <Radio.Group 
                value={imageMode} 
                onChange={(e) => setImageMode(e.target.value)}
                className="mb-3"
              >
                <Radio value="url">Nhập/Dán URL</Radio>
                <Radio value="file">Tải lên từ máy tính</Radio>
             </Radio.Group>
             
             {imageMode === 'url' ? (
                <Form.Item name="image_url" noStyle>
                   <Select mode="tags" maxCount={5} placeholder="Dán đường dẫn ảnh và nhấn Enter" open={false} />
                </Form.Item>
             ) : (
                <Upload {...uploadProps} accept="image/*" listType="picture">
                  <Button icon={<UploadOutlined />}>Chọn File Ảnh</Button>
                </Upload>
             )}
          </div>

          <Form.Item label="Tên sản phẩm" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          
          <div className="flex gap-4">
            <Form.Item label="Danh mục" name="category_id" className="flex-1" rules={[{ required: true }]}><Select>{categories.map(c => (<Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>))}</Select></Form.Item>
            <Form.Item label="Phân loại" name="type" className="flex-1" rules={[{ required: true }]}><Select><Select.Option value="PRODUCT">Sản phẩm bán</Select.Option><Select.Option value="MATERIAL">Vật tư nội bộ</Select.Option></Select></Form.Item>
          </div>
          
          {/* ĐÃ THÊM Ô NHẬP TRỌNG LƯỢNG VÀO ĐÂY, SẮP XẾP LẠI THÀNH 3 CỘT */}
          <div className="flex gap-4">
            <Form.Item label="Giá bán (VNĐ)" name="price" className="flex-1" rules={[{ required: true }]}><InputNumber className="w-full" min={0} step={1000} /></Form.Item>
            <Form.Item label="Trọng lượng (gram)" name="weight" initialValue={200} className="flex-1" rules={[{ required: true }]}><InputNumber className="w-full" min={0} /></Form.Item>
            <Form.Item label="Tồn kho" name="stock_quantity" className="flex-1" rules={[{ required: true }]}><InputNumber className="w-full" min={0} /></Form.Item>
          </div>

          <div className="flex gap-4">
            <Form.Item label="Ngày sản xuất" name="start_date" className="flex-1" rules={[{ required: true }]}>
               <DatePicker format="DD/MM/YYYY" className="w-full" />
            </Form.Item>
            <Form.Item label="Hạn sử dụng" name="end_date" className="flex-1" rules={[{ required: true }]}>
               <DatePicker format="DD/MM/YYYY" className="w-full" />
            </Form.Item>
          </div>
          
          <Form.Item className="text-right mb-0 mt-4"><Space><Button onClick={() => setIsModalVisible(false)}>Hủy</Button><Button type="primary" htmlType="submit">Lưu</Button></Space></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// ==========================================
// TAB 3: COMPONENT SẢN PHẨM ĐẾN HẠN
// ==========================================
const ExpiringProductsTab = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchExpiringProducts(); }, []);

  const fetchExpiringProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/commerce/products');
      const data = await res.json();
      
      const today = dayjs();
      const expiring = data.data
        .filter(p => p.end_date)
        .map(p => {
          const daysLeft = dayjs(p.end_date).diff(today, 'day');
          return { ...p, daysLeft };
        })
        .filter(p => p.daysLeft <= 90)
        .sort((a, b) => a.daysLeft - b.daysLeft); 

      setProducts(expiring);
    } catch (error) {
      message.error('Lỗi tải dữ liệu sản phẩm đến hạn');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'Tên Sản phẩm/Vật tư', dataIndex: 'name', key: 'name', render: text => <b>{text}</b> },
    { title: 'Danh mục', dataIndex: 'Category', key: 'category', render: (cat) => <Tag color="blue">{cat?.name || 'Chưa phân loại'}</Tag> },
    { title: 'Tồn kho', dataIndex: 'stock_quantity', key: 'stock' },
    { title: 'Ngày sản xuất', dataIndex: 'start_date', key: 'start_date', render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : '-' },
    { title: 'Hạn sử dụng', dataIndex: 'end_date', key: 'end_date', render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : '-' },
    {
      title: 'Tình trạng', key: 'status',
      render: (_, record) => {
        if (record.daysLeft < 0) return <Tag color="red">Đã hết hạn ({Math.abs(record.daysLeft)} ngày)</Tag>;
        if (record.daysLeft <= 30) return <Tag color="volcano">Sắp hết hạn (Còn {record.daysLeft} ngày)</Tag>;
        return <Tag color="orange">Còn {record.daysLeft} ngày</Tag>;
      }
    }
  ];

  return (
    <div className="pt-2">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-700 m-0">Danh sách Cảnh báo (Còn hạn dưới 90 ngày)</h3>
      </div>
      <Table columns={columns} dataSource={products} rowKey="id" loading={loading} />
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
    { key: '3', label: '⚠️ Sản phẩm đến hạn', children: <ExpiringProductsTab /> },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <Tabs defaultActiveKey="1" items={items} />
    </div>
  );
}