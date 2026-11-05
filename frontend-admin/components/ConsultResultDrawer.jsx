import React, { useEffect, useState } from 'react';
import { Drawer, Form, Input, InputNumber, Checkbox, Select, Button, Alert, message, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const API = 'http://localhost:4000/api';
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;
const MAX_PRODUCTS = 10; // khớp server

// Kết quả buổi tư vấn: gửi xong buổi mới tính hoàn thành, khách đọc được trong Sổ lịch hẹn.
// Sản phẩm gợi ý chọn từ trang shops (không có thuốc kê đơn: chuyên gia không kê thuốc)
export default function ConsultResultDrawer({ consultation, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [shop, setShop] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!consultation) return;
    const r = consultation.result || {};
    form.setFieldsValue({
      assessment: r.assessment || '', advice: r.advice || consultation.expert_note || '', lifestyle: r.lifestyle || '',
      follow_up: r.follow_up || '', recommend_exam: !!consultation.recommend_exam,
    });
    setProducts(r.products || []);
    axios.get(`${API}/commerce/products/shop`).then((res) => setShop(res.data.data || [])).catch(() => message.error('Không tải được danh sách sản phẩm'));
  }, [consultation, form]);

  const addProduct = (id) => {
    const p = shop.find((x) => x.id === id);
    if (p) setProducts((list) => [...list, { product_id: p.id, name: p.name, price: Number(p.price), quantity: 1, usage: '' }]);
  };
  const updateProduct = (id, patch) => setProducts((list) => list.map((p) => (p.product_id === id ? { ...p, ...patch } : p)));

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await axios.put(`${API}/booking/consultations/${consultation.id}/result`, {
        ...values, products: products.map(({ product_id, quantity, usage }) => ({ product_id, quantity, usage })),
      }, { headers: headers() });
      message.success('Đã gửi kết quả tư vấn cho khách');
      onSaved();
    } catch (err) {
      message.error(err.response?.data?.message || 'Không gửi được kết quả');
    } finally { setSaving(false); }
  };

  const minText = (label) => [{ required: true, whitespace: true, message: `Nhập ${label}` }, { min: 20, message: 'Ít nhất 20 ký tự' }];

  return (
    <Drawer
      title={`Kết quả tư vấn - ${consultation?.customer_name || ''}`}
      open={!!consultation}
      onClose={onClose}
      size={640}
      destroyOnHidden
      extra={<Button type="primary" loading={saving} onClick={submit}>Gửi cho khách</Button>}
    >
      {consultation && (
        <>
          <Alert className="mb-4" type="info" showIcon message="Câu hỏi của khách" description={consultation.question} />
          <Form form={form} layout="vertical">
            <Form.Item name="assessment" label="Nhận định tình trạng" rules={minText('nhận định')}>
              <Input.TextArea rows={4} maxLength={3000} showCount placeholder="VD: Da hỗn hợp thiên dầu, mụn viêm vùng cằm mức độ nhẹ, hàng rào da hơi yếu do dùng tẩy tế bào chết nhiều" />
            </Form.Item>
            <Form.Item name="advice" label="Lời khuyên chăm sóc" rules={minText('lời khuyên')}>
              <Input.TextArea rows={4} maxLength={3000} showCount placeholder="VD: Sáng: rửa mặt dịu nhẹ, dưỡng ẩm, chống nắng. Tối: tẩy trang, rửa mặt, dưỡng ẩm. Ngưng tẩy tế bào chết 2 tuần" />
            </Form.Item>
            <Form.Item name="lifestyle" label="Chế độ ăn uống, sinh hoạt">
              <Input.TextArea rows={3} maxLength={2000} placeholder="VD: Hạn chế đồ ngọt, sữa; uống đủ 2 lít nước; ngủ trước 23h" />
            </Form.Item>
            <Form.Item name="follow_up" label="Hẹn theo dõi">
              <Input maxLength={1000} placeholder="VD: Theo dõi 4 tuần, nếu mụn không giảm thì đặt lịch khám" />
            </Form.Item>
            <Form.Item name="recommend_exam" valuePropName="checked">
              <Checkbox>Khuyên khách đặt lịch khám với bác sĩ da liễu</Checkbox>
            </Form.Item>
          </Form>

          <div className="font-semibold mb-1">Sản phẩm gợi ý</div>
          <Text type="secondary" className="text-xs block mb-2">Chỉ chọn được sản phẩm đang bán trên website. Không gợi ý thuốc kê đơn.</Text>
          <Select
            className="w-full mb-3" showSearch optionFilterProp="label" value={null} placeholder="Tìm và thêm sản phẩm"
            disabled={products.length >= MAX_PRODUCTS} onChange={addProduct}
            options={shop.filter((p) => !products.some((x) => x.product_id === p.id)).map((p) => ({ value: p.id, label: `${p.name} - ${money(p.price)}` }))}
          />
          {products.map((p) => (
            <div key={p.product_id} className="border rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-medium text-sm">{p.name}</span>
                <span className="flex items-center gap-1 shrink-0">
                  <InputNumber size="small" min={1} max={20} precision={0} value={p.quantity} onChange={(v) => updateProduct(p.product_id, { quantity: v || 1 })} className="!w-16" />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setProducts((list) => list.filter((x) => x.product_id !== p.product_id))} />
                </span>
              </div>
              <Input size="small" maxLength={300} value={p.usage} placeholder="Cách dùng (bắt buộc), VD: Thoa lớp mỏng buổi tối sau bước dưỡng ẩm"
                onChange={(e) => updateProduct(p.product_id, { usage: e.target.value })} />
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
}
