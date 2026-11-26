import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Modal, Form, Input, InputNumber, Select, Popconfirm, Tabs, Radio, Upload, Alert } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, UploadOutlined, GlobalOutlined } from '@ant-design/icons';
import ProductWebInfoModal from '../components/ProductWebInfoModal';
import dayjs from 'dayjs';
import { API_BASE } from '../config';
import { useLiveRefresh } from '../components/Notifications';

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
      const res = await fetch(`${API_BASE}/api/commerce/categories`);
      const data = await res.json();
      setCategories(data.data || []);
    } catch (error) {
      message.error('Lỗi tải danh mục');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (record = null) => {
    setEditingItem(record);
    if (record) form.setFieldsValue(record); else form.resetFields();
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const isUpdate = !!editingItem;
      const url = isUpdate ? `${API_BASE}/api/commerce/categories/${editingItem.id}` : `${API_BASE}/api/commerce/categories`;
      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(values)
      });

      const textData = await res.text();
      let resData;
      try { resData = JSON.parse(textData); } catch (e) { throw new Error(textData); }

      if (!res.ok) throw new Error(resData.message || 'Thao tác thất bại');
      message.success(isUpdate ? 'Cập nhật danh mục thành công!' : 'Thêm mới thành công!');
      setIsModalVisible(false);
      fetchCategories();
    } catch (error) { message.error(error.message); }
  };

  const handleDelete = async (id) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      await fetch(`${API_BASE}/api/commerce/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      message.success('Đã xóa danh mục!');
      fetchCategories();
    } catch (error) { message.error('Lỗi khi xóa'); }
  };

  const filteredCategories = categories.filter(c => c.name?.toLowerCase().includes(searchText.toLowerCase()));

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
      render: (status) => <Tag color={status === 'ACTIVE' ? 'success' : 'error'}>{status || 'ACTIVE'}</Tag>
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
          <Form.Item label="Tên danh mục" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên danh mục' }]}><Input /></Form.Item>
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
  const [webInfoProduct, setWebInfoProduct] = useState(null); // sản phẩm đang mở modal "Thông tin bán web"

  useEffect(() => { fetchProducts(); fetchCategories(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      // /admin: lấy cả vật tư nội bộ (API công khai chỉ còn trả mỹ phẩm bán cho khách)
      const res = await fetch(`${API_BASE}/api/commerce/products/admin`, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` } });
      const data = await res.json();
      setProducts(data.data || []);
    } catch (error) {
      message.error('Lỗi tải sản phẩm');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/commerce/categories`);
      const data = await res.json();
      if(data.data) {
        setCategories(data.data.filter(c => c.status === 'ACTIVE' || !c.status));
      }
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
        } catch (e) {
          parsedImages = [record.image_url];
        }
      }
      form.setFieldsValue({ ...record, min_stock: record.min_stock ?? 0, image_url: parsedImages });
      setImageMode('url');
    } else {
      form.resetFields();
      form.setFieldsValue({ type: 'PRODUCT', min_stock: 5 });
      setImageMode('url');
    }
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      let finalImages = values.image_url || [];

      if (imageMode === 'file' && fileList.length > 0) {
        const uploadedUrls = [];
        for (const file of fileList) {
          const formData = new FormData();
          formData.append('image', file.originFileObj || file);

          const uploadRes = await fetch(`${API_BASE}/api/media/upload`, {
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
        if (!Array.isArray(finalImages)) {
           finalImages = [finalImages];
        }
      }

      const isUpdate = !!editingItem;
      const url = isUpdate
        ? `${API_BASE}/api/commerce/products/${editingItem.id}`
        : `${API_BASE}/api/commerce/products`;

      // Tồn kho, NSX, HSD không nhập ở đây: hàng vào kho qua Nhập hàng (ghi theo lô)
      const payload = { ...values, image_url: finalImages };

      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resText = await res.text();
      let resData;
      try {
        resData = JSON.parse(resText);
      } catch(e) {
        throw new Error("Lỗi máy chủ: " + resText);
      }

      if (!res.ok) throw new Error(resData.message || 'Thao tác thất bại');

      message.success(isUpdate ? 'Đã cập nhật sản phẩm' : resData.message || 'Đã thêm sản phẩm');
      setIsModalVisible(false);
      fetchProducts();
    } catch (error) {
      console.error('Lỗi Submit Form:', error);
      message.error(error.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      await fetch(`${API_BASE}/api/commerce/products/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      message.success('Đã xóa sản phẩm!');
      fetchProducts();
    } catch (error) {
      message.error('Lỗi khi xóa sản phẩm');
    }
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

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchText.toLowerCase()));

  const columns = [
    { title: 'Tên Sản phẩm/Vật tư', dataIndex: 'name', key: 'name', width: 260, render: text => <b>{text}</b> },
    {
      title: 'Danh mục', dataIndex: 'Category', key: 'category',
      filters: categories.map(c => ({ text: c.name, value: c.id })),
      onFilter: (value, record) => record.category_id === value || record.Category?.id === value,
      render: (cat, record) => <Tag color="blue">{cat?.name || record.category || 'Dược Mỹ Phẩm'}</Tag>
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
    {
      title: 'Giá bán', dataIndex: 'price', key: 'price',
      render: (price, record) => {
        const d = record.ProductDetail;
        const end = d?.sale_end ? dayjs(d.sale_end) : null;
        // Khuyến mãi online (đặt trong "Thông tin web"): đang chạy / sắp chạy; hết hạn thì không hiện
        const sale = d?.sale_percent && end?.isAfter(dayjs())
          ? (dayjs(d.sale_start).isAfter(dayjs()) ? { color: 'gold', text: `Sắp giảm ${d.sale_percent}%` } : { color: 'red', text: `Online -${d.sale_percent}%` })
          : null;
        return (
          <div>
            <div>{Number(price || 0).toLocaleString('vi-VN')} ₫</div>
            {sale && <Tag color={sale.color} className="!mt-1" title={`Đến ${end.format('HH:mm DD/MM/YYYY')}`}>{sale.text}</Tag>}
          </div>
        );
      },
    },
    {
      title: 'Tồn kho', key: 'stock', sorter: (a, b) => a.stock_quantity - b.stock_quantity,
      render: (_, record) => (
        <div>
          <b className={record.min_stock > 0 && record.stock_quantity <= record.min_stock ? 'text-red-600' : ''}>{record.stock_quantity}</b>
          {record.min_stock > 0 && <div className="text-xs text-gray-500">tối thiểu {record.min_stock}</div>}
          {record.held_qty > 0 && <div className="text-xs text-red-600">{record.held_qty} hết hạn, chờ hủy</div>}
        </div>
      ),
    },
    {
      // Lô xuất trước (hết hạn trước bán trước), dùng chung cho bán web và bán tại quầy. Khách không thấy thông tin lô.
      title: 'Lô đang bán', key: 'lot', width: 210,
      render: (_, record) => {
        const l = record.selling_lot;
        if (!l) return <span className="text-gray-400">{record.stock_quantity > 0 ? '-' : 'Hết hàng'}</span>;
        const days = dayjs(l.expiry_date).diff(dayjs(), 'day');
        return (
          <div className="text-sm">
            <b>{l.lot_no}</b> <span className="text-gray-500">còn {l.quantity_left}</span>
            <div className={`text-xs ${days <= 90 ? 'text-orange-600' : 'text-gray-500'}`}>{l.manufacture_date ? `NSX ${dayjs(l.manufacture_date).format('DD/MM/YYYY')} • ` : ''}HSD {dayjs(l.expiry_date).format('DD/MM/YYYY')}</div>
            {record.type === 'PRODUCT' && <div className="text-xs text-gray-400">Bán web và tại quầy</div>}
          </div>
        );
      },
    },
    {
      title: 'Bán trên web', key: 'web',
      filters: [{ text: 'Đang bán web', value: true }, { text: 'Chưa bán web', value: false }],
      onFilter: (value, record) => Boolean(record.ProductDetail?.is_published) === value,
      render: (_, record) => record.type !== 'PRODUCT' ? <span className="text-gray-400">-</span>
        : record.ProductDetail?.is_published ? <Tag color="green">Đang bán</Tag> : <Tag>Chưa bán</Tag>
    },
    {
      title: 'Hành động', key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>Sửa</Button>
          {record.type === 'PRODUCT' && (
            <Button icon={<GlobalOutlined />} size="small" onClick={() => setWebInfoProduct(record)}>Thông tin web</Button>
          )}
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
      <Table columns={columns} dataSource={filteredProducts} rowKey="id" loading={loading} scroll={{ x: 1350 }}
        expandable={{
          rowExpandable: (r) => (r.lots || []).length > 0,
          expandedRowRender: (r) => (
            <Table size="small" rowKey="id" pagination={false} dataSource={r.lots}
              columns={[
                { title: 'Số lô', dataIndex: 'lot_no', render: (v, l) => <span>{v}{l.id === r.selling_lot?.id && <Tag color="green" className="ml-1">đang bán</Tag>}</span> },
                { title: 'NSX', dataIndex: 'manufacture_date', render: (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '-') },
                { title: 'HSD', dataIndex: 'expiry_date', render: (v) => dayjs(v).format('DD/MM/YYYY') },
                { title: 'Còn lại', dataIndex: 'quantity_left' },
                { title: 'Đã nhập', dataIndex: 'quantity_received' },
                { title: 'Giá nhập', dataIndex: 'unit_cost', render: (v) => (v != null ? `${Number(v).toLocaleString('vi-VN')} ₫` : '-') },
                { title: 'Trạng thái', render: (_, l) => (l.hold_reason ? <Tag color="red">Hết hạn, chờ hủy</Tag> : l.id === r.selling_lot?.id ? <Tag color="green">Đang bán</Tag> : <Tag>Chờ bán (xuất sau)</Tag>) },
              ]} />
          ),
        }} />
      
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

          <Form.Item label="Tên sản phẩm" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên sản phẩm' }]}><Input /></Form.Item>

          <div className="flex gap-4">
            <Form.Item label="Danh mục" name="category_id" className="flex-1" rules={[{ required: true }]}><Select>{categories.map(c => (<Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>))}</Select></Form.Item>
            <Form.Item label="Phân loại" name="type" className="flex-1" rules={[{ required: true }]}><Select><Select.Option value="PRODUCT">Sản phẩm bán</Select.Option><Select.Option value="MATERIAL">Vật tư nội bộ</Select.Option></Select></Form.Item>
          </div>

          {/* ĐÃ THÊM Ô NHẬP TRỌNG LƯỢNG VÀO ĐÂY, SẮP XẾP LẠI THÀNH 3 CỘT */}
          <div className="flex gap-4">
            <Form.Item label="Giá bán (VNĐ)" name="price" className="flex-1" rules={[{ required: true }]}><InputNumber className="w-full" min={0} step={1000} /></Form.Item>
            <Form.Item label="Trọng lượng (gram)" name="weight" initialValue={200} className="flex-1" rules={[{ required: true }]}><InputNumber className="w-full" min={0} /></Form.Item>
            <Form.Item label="Tồn tối thiểu" name="min_stock" className="flex-1" tooltip="Tồn kho xuống tới mức này thì hệ thống tự tạo đề xuất nhập hàng (0 = không tự đề xuất)"><InputNumber className="w-full" min={0} precision={0} /></Form.Item>
          </div>
          <Alert type="info" showIcon className="mb-2" message="Tồn kho, số lô, ngày sản xuất và hạn sử dụng ghi theo từng lô khi nhận hàng (trang Nhập hàng & Kiểm kho), không nhập ở đây." />

          <Form.Item className="text-right mb-0 mt-4">
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit">Lưu</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      <ProductWebInfoModal product={webInfoProduct} onClose={() => setWebInfoProduct(null)} onSaved={fetchProducts} />
    </div>
  );
};

// ==========================================
// TAB 3: COMPONENT SẢN PHẨM ĐẾN HẠN
// ==========================================
const ExpiringProductsTab = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [disposing, setDisposing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/commerce/products/admin`, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` } });
      const data = await res.json();
      const today = dayjs();
      // Theo lô: lô hết hạn (đã tách khỏi hàng bán) và lô còn hạn dưới 90 ngày
      setRows((data.data || []).flatMap((p) => (p.lots || []).map((l) => ({ ...l, product: p.name, type: p.type, daysLeft: dayjs(l.expiry_date).diff(today, 'day') })))
        .filter((l) => l.hold_reason || l.daysLeft <= 90).sort((a, b) => a.daysLeft - b.daysLeft));
    } catch (error) {
      message.error('Lỗi tải dữ liệu lô đến hạn');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveRefresh(['purchase-orders', 'stock-counts', 'goods-receipts'], load);

  const dispose = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/commerce/purchasing/lots/${disposing.lot.id}/dispose`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` }, body: JSON.stringify({ reason: disposing.reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      message.success(d.message); setDisposing(null); load();
    } catch (e) { message.error(e.message || 'Không hủy được'); }
  };

  const columns = [
    { title: 'Sản phẩm / Vật tư', dataIndex: 'product', key: 'product', render: (text, l) => <div><b>{text}</b><div className="text-xs text-gray-500">{l.type === 'PRODUCT' ? 'Mỹ phẩm' : 'Vật tư'}</div></div> },
    { title: 'Số lô', dataIndex: 'lot_no', key: 'lot_no' },
    { title: 'NSX', dataIndex: 'manufacture_date', key: 'mfg', render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '-') },
    { title: 'HSD', dataIndex: 'expiry_date', key: 'exp', render: (d) => dayjs(d).format('DD/MM/YYYY') },
    { title: 'Còn lại', dataIndex: 'quantity_left', key: 'left' },
    {
      title: 'Tình trạng', key: 'status',
      render: (_, l) => {
        if (l.hold_reason) return <Tag color="red">Hết hạn, đã ngừng bán, chờ hủy</Tag>;
        if (l.daysLeft < 0) return <Tag color="red">Đã hết hạn ({Math.abs(l.daysLeft)} ngày)</Tag>;
        if (l.daysLeft <= 30) return <Tag color="volcano">Sắp hết hạn (còn {l.daysLeft} ngày)</Tag>;
        return <Tag color="orange">Còn {l.daysLeft} ngày</Tag>;
      }
    },
    { title: '', key: 'act', render: (_, l) => l.hold_reason && <Button size="small" danger onClick={() => setDisposing({ lot: l, reason: '' })}>Hủy hàng</Button> },
  ];

  return (
    <div className="pt-2">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-700 m-0">Lô hàng hết hạn và còn hạn dưới 90 ngày</h3>
        <div className="text-sm text-gray-500">Mỹ phẩm hết hạn tự tách khỏi hàng bán; quản lý hủy hàng và ghi biên bản.</div>
      </div>
      <Table columns={columns} dataSource={rows} rowKey="id" loading={loading} />
      <Modal open={!!disposing} title={`Hủy lô ${disposing?.lot.lot_no} - ${disposing?.lot.product}`} onCancel={() => setDisposing(null)} onOk={dispose} okText="Ghi nhận hủy" okButtonProps={{ danger: true }} destroyOnHidden>
        <p>Hủy {disposing?.lot.quantity_left} sản phẩm của lô này (tồn kho lô về 0, có phiếu điều chỉnh).</p>
        <Input.TextArea rows={3} maxLength={500} placeholder="Lý do / biên bản hủy (bắt buộc)" value={disposing?.reason} onChange={(e) => setDisposing((d) => ({ ...d, reason: e.target.value }))} />
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
    { key: '3', label: '⚠️ Lô đến hạn / hết hạn', children: <ExpiringProductsTab /> },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <Tabs defaultActiveKey="1" items={items} />
    </div>
  );
}