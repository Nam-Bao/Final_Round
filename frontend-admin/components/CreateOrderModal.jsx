import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, InputNumber, Select, Radio, Button, Row, Col, message } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const API = 'http://localhost:4000/api';
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;

// Khớp cách tính cân nặng của server khi báo giá GHN
const DEFAULT_ITEM_WEIGHT = 200;
const PACKAGING_WEIGHT = 300;

// NVBH tạo đơn hộ khách: nhận tại quầy (hoàn thành ngay) hoặc giao GHN (vào luồng duyệt như đơn online)
export default function CreateOrderModal({ open, onClose, onCreated }) {
  const [form] = Form.useForm();
  const [customerType, setCustomerType] = useState('EXISTING');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [shippingFee, setShippingFee] = useState(0);
  const [feeLoading, setFeeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucher, setVoucher] = useState(null); // { code, discount } sau khi kiểm tra hợp lệ
  const [voucherError, setVoucherError] = useState('');
  const [checkingVoucher, setCheckingVoucher] = useState(false);

  const deliveryMethod = Form.useWatch('delivery_method', form);
  const items = Form.useWatch('items', form);
  const districtId = Form.useWatch('district_id', form);
  const wardCode = Form.useWatch('ward_code', form);
  const isDelivery = deliveryMethod === 'DELIVERY';

  const fetchCustomers = () =>
    axios.get(`${API}/identity/users/customers`, authConfig()).then(res => setCustomers(res.data.data || [])).catch(() => setCustomers([]));

  useEffect(() => {
    if (!open) return; // Form tự về giá trị ban đầu vì Modal huỷ nội dung khi đóng (destroyOnHidden)
    setCustomerType('EXISTING');
    setShippingFee(0);
    setDistricts([]);
    setWards([]);
    setVoucherInput('');
    setVoucher(null);
    setVoucherError('');
    fetchCustomers();
    axios.get(`${API}/commerce/products`).then(res => setProducts(res.data.data || [])).catch(() => setProducts([]));
  }, [open]);

  // Danh mục tỉnh GHN chỉ tải khi chọn giao hàng
  useEffect(() => {
    if (open && isDelivery && provinces.length === 0) {
      axios.get(`${API}/commerce/orders/ghn/province`).then(res => setProvinces(res.data.data || [])).catch(() => message.error('Không tải được danh sách Tỉnh/Thành GHN'));
    }
  }, [open, isDelivery]);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const validItems = (items || []).filter(i => i?.product_id && i?.quantity > 0);
  const subtotal = validItems.reduce((sum, i) => sum + Number(productMap[i.product_id]?.price || 0) * i.quantity, 0);
  const totalWeight = validItems.reduce((sum, i) => sum + i.quantity * (productMap[i.product_id]?.weight || DEFAULT_ITEM_WEIGHT), PACKAGING_WEIGHT);

  // Phí ship chỉ để NVBH báo khách; server tự tính lại khi tạo đơn
  useEffect(() => {
    if (!isDelivery || !districtId || !wardCode || validItems.length === 0) { setShippingFee(0); return; }
    let cancelled = false;
    setFeeLoading(true);
    axios.post(`${API}/commerce/orders/ghn/fee`, { to_district_id: districtId, to_ward_code: wardCode, weight: totalWeight })
      .then(res => { if (!cancelled) setShippingFee(Number(res.data.data?.total || 0)); })
      .catch(() => { if (!cancelled) setShippingFee(0); })
      .finally(() => { if (!cancelled) setFeeLoading(false); });
    return () => { cancelled = true; };
  }, [isDelivery, districtId, wardCode, totalWeight]);

  // Số tiền giảm phụ thuộc tiền hàng và khách (mỗi khách dùng 1 lần) => đổi một trong hai thì phải kiểm tra lại
  const customerId = Form.useWatch('customer_id', form);
  useEffect(() => {
    if (voucher) { setVoucher(null); setVoucherError('Giỏ hàng hoặc khách đã thay đổi, vui lòng kiểm tra lại mã'); }
  }, [subtotal, customerId, customerType]);

  const handleCheckVoucher = async () => {
    const code = voucherInput.trim().toUpperCase();
    if (!code) return setVoucherError('Nhập mã voucher');
    if (subtotal <= 0) return setVoucherError('Chọn sản phẩm trước khi áp mã');
    if (customerType === 'EXISTING' && !customerId) return setVoucherError('Chọn khách hàng trước khi áp mã');
    setCheckingVoucher(true);
    setVoucherError('');
    try {
      const res = await axios.post(`${API}/commerce/promotions/apply`, {
        code, order_value: subtotal, scope_values: { PRODUCT: subtotal },
        customer_id: customerType === 'EXISTING' ? customerId : undefined,
      }, authConfig());
      setVoucher({ code: res.data.data.code, discount: Number(res.data.data.discount_amount || 0) });
    } catch (error) {
      setVoucher(null);
      setVoucherError(error.response?.data?.message || 'Mã không hợp lệ');
    } finally {
      setCheckingVoucher(false);
    }
  };

  const handleSelectCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    form.setFieldsValue({ recipient_name: c?.Profile?.full_name, shipping_phone: c?.Profile?.phone });
  };

  const handleProvinceChange = async (pId) => {
    form.setFieldsValue({ district_id: undefined, ward_code: undefined });
    setDistricts([]);
    setWards([]);
    try {
      const res = await axios.get(`${API}/commerce/orders/ghn/district?province_id=${pId}`);
      setDistricts(res.data.data || []);
    } catch { message.error('Không tải được Quận/Huyện'); }
  };

  const handleDistrictChange = async (dId) => {
    form.setFieldsValue({ ward_code: undefined });
    setWards([]);
    try {
      const res = await axios.get(`${API}/commerce/orders/ghn/ward?district_id=${dId}`);
      setWards(res.data.data || []);
    } catch { message.error('Không tải được Phường/Xã'); }
  };

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      let customerId = values.customer_id;
      if (customerType === 'NEW') {
        const resNew = await axios.post(`${API}/identity/users/quick-customer`, {
          email: values.new_email, full_name: values.new_full_name, phone: values.new_phone
        }, authConfig());
        customerId = resNew.data.data.userId;
        // Tài khoản đã tạo: nếu bước tạo đơn lỗi thì NVBH sửa và gửi lại mà không tạo trùng tài khoản
        await fetchCustomers();
        setCustomerType('EXISTING');
        form.setFieldsValue({ customer_id: customerId, recipient_name: values.recipient_name || values.new_full_name, shipping_phone: values.shipping_phone || values.new_phone });
        message.success('Đã tạo tài khoản khách (mật khẩu mặc định 12345)');
      }

      const address = isDelivery
        ? [values.house_number,
            wards.find(w => w.WardCode === values.ward_code)?.WardName,
            districts.find(d => d.DistrictID === values.district_id)?.DistrictName,
            provinces.find(p => p.ProvinceID === values.province_id)?.ProvinceName].filter(Boolean).join(', ')
        : undefined;

      await axios.post(`${API}/commerce/orders/admin`, {
        customer_id: customerId,
        recipient_name: values.recipient_name || values.new_full_name,
        shipping_phone: values.shipping_phone || values.new_phone,
        delivery_method: values.delivery_method,
        payment_method: values.payment_method,
        note: values.note,
        promotion_code: voucher?.code,
        items: validItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        shipping_address: address,
        shipping_district_id: isDelivery ? values.district_id : undefined,
        shipping_ward_code: isDelivery ? values.ward_code : undefined,
      }, authConfig());

      message.success(isDelivery ? 'Đã tạo đơn giao hàng, đơn đang chờ duyệt' : 'Đã tạo đơn tại quầy (đã hoàn thành)');
      onCreated?.();
      onClose();
    } catch (error) {
      message.error(error.response?.data?.message || 'Không tạo được đơn hàng');
    } finally {
      setSubmitting(false);
    }
  };

  const discount = voucher?.discount || 0;
  const total = Math.max(0, subtotal - discount) + (isDelivery ? shippingFee : 0);

  return (
    <Modal title="Tạo đơn hàng mới" open={open} onCancel={onClose} footer={null} width={620} centered destroyOnHidden
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto', paddingRight: 8 } }}>
      <Form form={form} layout="vertical" size="small" className="[&_.ant-form-item]:mb-3" onFinish={handleSubmit}
        initialValues={{ delivery_method: 'PICKUP', payment_method: 'COD', items: [{ quantity: 1 }] }}>

        <div className="mb-3 text-center">
          <Radio.Group size="small" value={customerType} onChange={e => setCustomerType(e.target.value)} buttonStyle="solid">
            <Radio.Button value="EXISTING">Khách đã có tài khoản</Radio.Button>
            <Radio.Button value="NEW">Khách mới (tạo nhanh)</Radio.Button>
          </Radio.Group>
        </div>

        {customerType === 'EXISTING' ? (
          <Form.Item name="customer_id" label="Tài khoản khách hàng" rules={[{ required: true, message: 'Hãy chọn khách hàng' }]}>
            <Select
              showSearch placeholder="Tìm theo tên / SĐT / email"
              onChange={handleSelectCustomer}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={customers.map(c => ({ value: c.id, label: `${c.Profile?.full_name || 'Khách'} - ${c.Profile?.phone || ''} - ${c.email}` }))}
            />
          </Form.Item>
        ) : (
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="new_full_name" label="Họ và tên khách" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input placeholder="Nhập họ tên đầy đủ" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="new_phone" label="Số điện thoại" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input placeholder="Nhập số điện thoại" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="new_email" label="Email đăng nhập" rules={[{ required: true, type: 'email', message: 'Phải là Email hợp lệ' }]}>
                <Input placeholder="khachhang@gmail.com" />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="delivery_method" label="Hình thức nhận hàng">
              <Radio.Group>
                <Radio value="PICKUP">Nhận tại quầy</Radio>
                <Radio value="DELIVERY">Giao hàng (GHN)</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="payment_method" label="Thanh toán">
              <Radio.Group>
                <Radio value="COD">{isDelivery ? 'Thu khi giao (COD)' : 'Tiền mặt'}</Radio>
                <Radio value="VIETQR_SEPAY">Chuyển khoản</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        {customerType === 'EXISTING' || isDelivery ? (
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="recipient_name" label={isDelivery ? 'Người nhận' : 'Tên khách mua'} rules={[{ required: customerType === 'EXISTING' || isDelivery, message: 'Bắt buộc' }]}>
                <Input placeholder={customerType === 'NEW' ? 'Bỏ trống = tên khách mới' : ''} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shipping_phone" label="Số điện thoại" rules={[{ required: customerType === 'EXISTING' || isDelivery, message: 'Bắt buộc' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
        ) : null}

        {isDelivery && (
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="province_id" label="Tỉnh / Thành" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Select showSearch optionFilterProp="label" onChange={handleProvinceChange}
                  options={provinces.map(p => ({ value: p.ProvinceID, label: p.ProvinceName }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="district_id" label="Quận / Huyện" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Select showSearch optionFilterProp="label" onChange={handleDistrictChange} disabled={!districts.length}
                  options={districts.map(d => ({ value: d.DistrictID, label: d.DistrictName }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ward_code" label="Phường / Xã" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Select showSearch optionFilterProp="label" disabled={!wards.length}
                  options={wards.map(w => ({ value: w.WardCode, label: w.WardName }))} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="house_number" label="Số nhà, tên đường" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input placeholder="Ví dụ: 12 Nguyễn Văn Bảo" />
              </Form.Item>
            </Col>
          </Row>
        )}

        <div className="font-semibold text-slate-700 text-sm mb-1.5 mt-1">Sản phẩm</div>
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <Row gutter={8} key={key} align="top">
                  <Col flex="auto">
                    <Form.Item name={[name, 'product_id']} rules={[{ required: true, message: 'Chọn sản phẩm' }]}>
                      <Select showSearch optionFilterProp="label" placeholder="Chọn sản phẩm"
                        options={products.map(p => ({
                          value: p.id,
                          label: `${p.name} — ${vnd(p.price)} (còn ${p.stock_quantity ?? 0})`,
                          disabled: !(p.stock_quantity > 0),
                        }))} />
                    </Form.Item>
                  </Col>
                  <Col flex="90px">
                    <Form.Item name={[name, 'quantity']} rules={[{ required: true, message: 'SL' }]}>
                      <InputNumber min={1} max={50} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col flex="24px">
                    {fields.length > 1 && <MinusCircleOutlined className="mt-1.5 text-red-500" onClick={() => remove(name)} />}
                  </Col>
                </Row>
              ))}
              <Button type="dashed" size="small" onClick={() => add({ quantity: 1 })} block icon={<PlusOutlined />}>Thêm sản phẩm</Button>
            </>
          )}
        </Form.List>

        <div className="mt-3">
          <div className="font-semibold text-slate-700 text-sm mb-1.5">Voucher</div>
          <div className="flex gap-2">
            <Input value={voucherInput} placeholder="Nhập mã giảm giá"
              onChange={e => { setVoucherInput(e.target.value.toUpperCase()); setVoucher(null); setVoucherError(''); }}
              onPressEnter={e => { e.preventDefault(); handleCheckVoucher(); }} />
            <Button onClick={handleCheckVoucher} loading={checkingVoucher}>Kiểm tra</Button>
            {voucher && <Button danger onClick={() => { setVoucher(null); setVoucherInput(''); }}>Bỏ mã</Button>}
          </div>
          {voucher && <div className="text-green-600 text-sm mt-1">Mã {voucher.code} hợp lệ: giảm {vnd(voucher.discount)}</div>}
          {voucherError && <div className="text-red-500 text-sm mt-1">{voucherError}</div>}
        </div>

        <Form.Item name="note" label="Ghi chú" className="mt-3">
          <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} />
        </Form.Item>

        <div className="bg-slate-50 border rounded-lg px-3 py-2 space-y-0.5 text-sm mb-3">
          <div className="flex justify-between"><span>Tiền hàng</span><span>{vnd(subtotal)}</span></div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600"><span>Giảm giá (Voucher {voucher.code})</span><span>- {vnd(discount)}</span></div>
          )}
          {isDelivery && (
            <div className="flex justify-between"><span>Phí vận chuyển (GHN, tạm tính)</span><span>{feeLoading ? 'Đang tính...' : vnd(shippingFee)}</span></div>
          )}
          <div className="flex justify-between font-bold text-blue-600"><span>Khách cần trả</span><span>{vnd(total)}</span></div>
        </div>

        <div className="flex justify-end gap-2">
          <Button size="middle" onClick={onClose}>Hủy</Button>
          <Button size="middle" type="primary" htmlType="submit" loading={submitting}>Tạo đơn</Button>
        </div>
      </Form>
    </Modal>
  );
}
