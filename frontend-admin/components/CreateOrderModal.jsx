import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, InputNumber, Select, Radio, Button, Row, Col, Checkbox, Tag, message } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import VoucherProofUpload from './VoucherProofUpload';
import { SafetyWarnings } from './PatientSafetyPanel';

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
  const [voucherProof, setVoucherProof] = useState(null); // ảnh xác thực bắt buộc khi áp mã cho khách
  // Sàng lọc an toàn tại quầy: chỉ hiện khi đơn có hoạt chất cần lưu ý (server quyết định)
  const [screening, setScreening] = useState(null); // kết quả /safety/counter-check
  const [answers, setAnswers] = useState({ flags: [], allergies: '' });
  const [answersTouched, setAnswersTouched] = useState(false); // NVBH đã sửa câu trả lời => kiểm tra lại cảnh báo
  const [asked, setAsked] = useState(false); // NVBH xác nhận đã hỏi khách
  const [acknowledged, setAcknowledged] = useState(false); // có chống chỉ định: đã tư vấn, khách vẫn mua

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
    setVoucherProof(null);
    setVoucherError('');
    setScreening(null); setAnswers({ flags: [], allergies: '' }); setAnswersTouched(false); setAsked(false); setAcknowledged(false);
    fetchCustomers();
    // Thuốc kê đơn chỉ bán theo đơn bác sĩ: không hiện trong danh sách của NVBH (server cũng chặn)
    axios.get(`${API}/commerce/products`).then(res => setProducts((res.data.data || []).filter(p => !p.is_prescription))).catch(() => setProducts([]));
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

  // Đơn hoặc khách đổi => hỏi lại server: có cần sàng lọc không, câu trả lời điền sẵn từ hồ sơ khách
  const productKey = validItems.map(i => i.product_id).sort().join(',');
  const screeningCustomer = customerType === 'EXISTING' ? customerId : undefined;
  useEffect(() => {
    setAsked(false); setAcknowledged(false); setAnswersTouched(false);
    if (!productKey) { setScreening(null); return; }
    let cancelled = false;
    axios.post(`${API}/booking/safety/counter-check`, { customer_id: screeningCustomer, product_ids: productKey.split(',') }, authConfig())
      .then(res => { if (cancelled) return; setScreening(res.data.data); setAnswers(res.data.data.answers || { flags: [], allergies: '' }); })
      .catch(() => { if (!cancelled) setScreening({ error: true }); });
    return () => { cancelled = true; };
  }, [productKey, screeningCustomer]);

  // NVBH sửa câu trả lời => tính lại cảnh báo
  useEffect(() => {
    if (!answersTouched || !productKey) return;
    setAcknowledged(false);
    const timer = setTimeout(() => {
      axios.post(`${API}/booking/safety/counter-check`, { customer_id: screeningCustomer, product_ids: productKey.split(','), answers }, authConfig())
        .then(res => setScreening(res.data.data)).catch(() => setScreening({ error: true }));
    }, 400);
    return () => clearTimeout(timer);
  }, [answers, answersTouched]);

  const changeAnswers = (patch) => { setAnswers(a => ({ ...a, ...patch })); setAnswersTouched(true); setAsked(false); };

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
    if (voucher && !voucherProof) return message.warning('Áp mã cho khách phải tải ảnh xác thực');
    if (screening?.error) return message.warning('Chưa kiểm tra được an toàn sản phẩm, hãy chọn lại sản phẩm để thử lại');
    if (screening?.needs_screening && !asked) return message.warning('Đơn có sản phẩm cần lưu ý: hỏi khách các câu sàng lọc rồi tick "Đã hỏi khách"');
    if (screening?.has_contraindication && !acknowledged) return message.warning('Có cảnh báo chống chỉ định: tư vấn cho khách rồi xác nhận, hoặc bỏ sản phẩm khỏi đơn');
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
        voucher_proof_url: voucher ? voucherProof : undefined,
        safety_screening: screening?.needs_screening ? { ...answers, acknowledged } : undefined,
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

        {screening?.error && <div className="mt-3 text-sm text-red-600">Không kiểm tra được an toàn sản phẩm. Chọn lại sản phẩm để thử lại.</div>}
        {screening?.needs_screening && (
          <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
            <div className="flex items-center justify-between mb-1">
              <b className="text-sm">Sàng lọc an toàn</b>
              <Tag color="orange">Bắt buộc với đơn này</Tag>
            </div>
            <div className="text-xs text-slate-600 mb-2">Đơn có sản phẩm chứa hoạt chất cần lưu ý. Hỏi khách từng câu (không có thì để trống).</div>
            {screening.prefill && !answersTouched && (
              <div className="text-xs text-blue-700 mb-2">Đã điền sẵn theo "{screening.prefill.source}" ngày {dayjs(screening.prefill.at).format('DD/MM/YYYY')}. Hỏi lại khách để xác nhận.</div>
            )}
            <Checkbox.Group className="flex flex-col gap-1 mb-2" options={screening.questions} value={answers.flags}
              onChange={(v) => changeAnswers({ flags: v })} />
            <Input size="small" maxLength={500} value={answers.allergies} onChange={(e) => changeAnswers({ allergies: e.target.value })}
              placeholder="Thành phần khách đã dị ứng (cách nhau bằng dấu phẩy), không có thì để trống" className="mb-2" />
            <SafetyWarnings warnings={screening.warnings} />
            {screening.missing_ingredients?.length > 0 && (
              <div className="text-xs text-slate-500 mb-2">Chưa có bảng thành phần, chưa kiểm tra được: {screening.missing_ingredients.join(', ')}</div>
            )}
            <Checkbox checked={asked} onChange={(e) => setAsked(e.target.checked)}>Đã hỏi khách các câu trên</Checkbox>
            {screening.has_contraindication && (
              <div className="mt-1">
                <Checkbox checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)}>
                  <span className="text-red-600">Đã tư vấn chống chỉ định, khách vẫn muốn mua</span>
                </Checkbox>
                <div className="text-xs text-slate-500 ml-6">Hoặc bỏ sản phẩm đó khỏi đơn và gợi ý khách đặt lịch khám.</div>
              </div>
            )}
          </div>
        )}

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
          {voucher && <div className="mt-2"><VoucherProofUpload value={voucherProof} onChange={setVoucherProof} /></div>}
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
