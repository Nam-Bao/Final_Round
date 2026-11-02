import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Switch, Row, Col, Alert, Tabs, message, Spin } from 'antd';
import axios from 'axios';

const API = 'http://localhost:4000/api/commerce/products';
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const SHOP_URL = 'http://localhost:3001/shops/';

// Thông tin hiển thị trên trang sản phẩm của khách + bật / tắt bán trên web.
// Sản phẩm mới nhập kho mặc định chưa bán web; phòng khám vẫn kê đơn / bán tại quầy bình thường.
export default function ProductWebInfoModal({ product, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skinOptions, setSkinOptions] = useState([]);
  const isPublished = Form.useWatch('is_published', form);
  const slug = Form.useWatch('slug', form);

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    axios.get(`${API}/${product.id}/detail`, authConfig())
      .then((res) => {
        setSkinOptions(res.data.skin_type_options || []);
        form.setFieldsValue({ ...res.data.data, skin_types: res.data.data.skin_types || [] });
      })
      .catch((err) => { message.error(err.response?.data?.message || 'Không tải được thông tin sản phẩm'); onClose(); })
      .finally(() => setLoading(false));
  }, [product]);

  const handleSave = async () => {
    await form.validateFields();
    // Lấy toàn bộ giá trị của form, kể cả các tab chưa mở (validateFields chỉ trả về ô đang hiển thị)
    const values = form.getFieldsValue(true);
    setSaving(true);
    try {
      const res = await axios.put(`${API}/${product.id}/detail`, values, authConfig());
      message.success(res.data.message);
      onSaved?.();
      onClose();
    } catch (err) {
      message.error(err.response?.data?.message || 'Không lưu được thông tin');
    } finally {
      setSaving(false);
    }
  };

  const text = (name, label, rows, max, placeholder, required) => (
    <Form.Item name={name} label={label} rules={required ? [{ required: true, message: 'Bắt buộc khi bán trên web' }] : []}>
      <Input.TextArea rows={rows} maxLength={max} showCount placeholder={placeholder} />
    </Form.Item>
  );

  return (
    <Modal title={product ? `Thông tin bán trên web: ${product.name}` : ''} open={!!product} onCancel={onClose} onOk={handleSave}
      okText="Lưu" confirmLoading={saving} width={760} destroyOnHidden centered
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 } }}>
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" className="[&_.ant-form-item]:mb-3">
          <div className="flex items-center justify-between bg-slate-50 border rounded-lg px-3 py-2 mb-3">
            <div>
              <div className="font-semibold">Bán trên web</div>
              <div className="text-xs text-gray-500">Bật để sản phẩm hiện ở cửa hàng online. Cần mô tả (từ 30 ký tự) và hướng dẫn sử dụng.</div>
            </div>
            <Form.Item name="is_published" valuePropName="checked" className="!mb-0"><Switch /></Form.Item>
          </div>
          <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
            <div>
              <div className="font-semibold text-rose-700">Thuốc kê đơn (Rx)</div>
              <div className="text-xs text-gray-500">Bật nếu bao bì ghi "Rx / Thuốc bán theo đơn": vẫn hiện trên web để tra cứu nhưng khách không mua online được; bác sĩ kê trong buổi khám và CSKH bán tại quầy.</div>
            </div>
            <Form.Item name="is_prescription" valuePropName="checked" className="!mb-0"><Switch /></Form.Item>
          </div>
          {product?.type === 'MATERIAL' && <Alert type="warning" showIcon className="mb-3" message="Vật tư nội bộ không được bán trên web." />}

          <Tabs items={[
            {
              key: 'general', label: 'Thông tin chung', forceRender: true, children: (
                <>
                  <Row gutter={12}>
                    <Col span={8}><Form.Item name="brand" label="Thương hiệu"><Input maxLength={100} placeholder="La Roche-Posay" /></Form.Item></Col>
                    <Col span={8}><Form.Item name="origin" label="Xuất xứ"><Input maxLength={100} placeholder="Pháp" /></Form.Item></Col>
                    <Col span={8}><Form.Item name="capacity" label="Dung tích / Khối lượng"><Input maxLength={50} placeholder="40ml" /></Form.Item></Col>
                  </Row>
                  <Form.Item name="skin_types" label="Loại da phù hợp">
                    <Select mode="multiple" allowClear options={skinOptions.map((s) => ({ value: s, label: s }))} placeholder="Chọn loại da" />
                  </Form.Item>
                  <Form.Item name="slug" label="Đường dẫn trên web" extra={slug ? `${SHOP_URL}${slug}` : 'Để trống sẽ tạo từ tên sản phẩm'}>
                    <Input maxLength={80} placeholder="sua-rua-mat-cetaphil" />
                  </Form.Item>
                  {text('short_description', 'Mô tả ngắn (hiện ở thẻ sản phẩm và trang chi tiết)', 2, 300, 'Một câu nêu điểm nổi bật của sản phẩm')}
                  {text('description', 'Mô tả chi tiết', 5, 5000, 'Giới thiệu sản phẩm, đặc điểm nổi bật...', isPublished)}
                </>
              ),
            },
            {
              key: 'content', label: 'Công dụng & Thành phần', forceRender: true, children: (
                <>
                  {text('benefits', 'Công dụng', 4, 3000, 'Mỗi công dụng một dòng')}
                  {text('ingredients', 'Thành phần', 8, 3000, 'Hoạt chất chính:\n- Niacinamide 5% | Giảm dầu, mờ thâm\n- Panthenol | Làm dịu, phục hồi\nBảng thành phần đầy đủ:\nAqua, Glycerin, Niacinamide, ...\nLưu ý: (nếu có)')}
                  <p className="text-xs text-gray-500 -mt-3 mb-4">
                    Nhập theo mẫu để trang khách hiện bảng hoạt chất (tên | công dụng) và bảng thành phần đầy đủ. Nhập tự do vẫn hiển thị nguyên văn.
                  </p>
                </>
              ),
            },
            {
              key: 'usage', label: 'Cách dùng & Lưu ý', forceRender: true, children: (
                <>
                  {text('usage', 'Hướng dẫn sử dụng', 4, 3000, 'Các bước sử dụng, tần suất', isPublished)}
                  {text('storage', 'Bảo quản', 2, 1000, 'Nơi khô ráo, tránh ánh nắng trực tiếp...')}
                  {text('warnings', 'Lưu ý / Chống chỉ định', 3, 2000, 'Đối tượng không nên dùng, cảnh báo...')}
                </>
              ),
            },
          ]} />
        </Form>
      </Spin>
    </Modal>
  );
}
