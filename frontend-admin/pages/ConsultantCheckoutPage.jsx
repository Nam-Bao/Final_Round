import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Select, Button, Space, Avatar, Typography, message, Divider, Input, InputNumber, Alert, Radio } from 'antd';
import { UserOutlined, DollarOutlined, SolutionOutlined, MedicineBoxOutlined, PercentageOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

// Đơn thuốc: [{ product_id, quantity }]; dữ liệu cũ là mảng mã sản phẩm (mỗi mã = 1 sản phẩm)
const toMedicineLines = (list) => (list || []).map(m => (typeof m === 'string' ? { product_id: m, quantity: 1 } : { product_id: m.product_id, quantity: m.quantity || 1 }));

export default function ConsultantCheckoutPage() {
  const [hotLeads, setHotLeads] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]); 
  const [spaServices, setSpaServices] = useState([]);

  const [selectedItems, setSelectedItems] = useState({ services: [], packages: [], medicines: [] });
  
  const [voucherCode, setVoucherCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState(null); // Trạng thái lưu mã đã áp dụng thành công
  const [paymentMethod, setPaymentMethod] = useState('CASH');

  const fetchData = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      fetch('http://localhost:4000/api/booking/packages').then(res => res.json()).then(data => setPackages(data.data || []));
      fetch('http://localhost:4000/api/booking/spa-services').then(res => res.json()).then(data => setSpaServices(data.data || []));
      fetch('http://localhost:4000/api/commerce/products').then(res => res.json()).then(data => setProducts((data.data || []).filter(item => item.type === 'PRODUCT')));
      
      const res = await axios.get('http://localhost:4000/api/booking/appointments/consultant-queues', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data.data) setHotLeads(res.data.data.hotLeads || []);
    } catch (error) { console.error('Lỗi tải dữ liệu', error); }
  };

  useEffect(() => { fetchData(); }, []);

  // Hủy mã nếu giỏ hàng thay đổi
  useEffect(() => {
    if (appliedVoucher) {
       setDiscountAmount(0);
       setAppliedVoucher(null);
       setVoucherCode('');
       message.info('Giỏ hàng thay đổi, hệ thống đã gỡ mã giảm giá để tính toán lại.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems.services, selectedItems.packages, selectedItems.medicines]);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setDiscountAmount(0); 
    setVoucherCode('');
    setAppliedVoucher(null);
    setPaymentMethod('CASH');
    setSelectedItems({
      services: customer.prescribed_services || [],
      packages: customer.prescribed_packages || [],
      medicines: toMedicineLines(customer.prescribed_medicines)
    });
  };

  // Tiền theo từng nhóm — voucher có phạm vi riêng chỉ giảm trên nhóm tương ứng
  const getScopeValues = () => {
    const sum = (ids, list, priceOf) => ids.reduce((s, id) => { const item = list.find(x => x.id === id); return item ? s + Number(priceOf(item)) : s; }, 0);
    return {
      SPA_SERVICE: sum(selectedItems.services, spaServices, i => i.price),
      TREATMENT_PACKAGE: sum(selectedItems.packages, packages, i => i.promotional_price || i.price),
      PRODUCT: selectedItems.medicines.reduce((s, m) => {
        const product = products.find(p => p.id === m.product_id);
        return product ? s + Number(product.price) * m.quantity : s;
      }, 0),
    };
  };

  // Phí khám = tiền cọc lúc đặt lịch (server trả về exam_fee); tổng hóa đơn = phí khám + dịch vụ/sản phẩm
  const getSubtotal = () => {
    const scopes = getScopeValues();
    return Number(selectedCustomer?.exam_fee || 0) + scopes.SPA_SERVICE + scopes.TREATMENT_PACKAGE + scopes.PRODUCT;
  };

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await axios.post('http://localhost:4000/api/commerce/promotions/apply', {
        code: voucherCode,
        order_value: getSubtotal(),
        scope_values: getScopeValues(),
        customer_id: selectedCustomer?.customer_id // Kiểm tra khách đã dùng mã này chưa
      }, { headers: { Authorization: `Bearer ${token}` } });
      const amount = res.data.data.discount_amount;
      setDiscountAmount(amount);
      setAppliedVoucher({ code: voucherCode.toUpperCase(), amount }); // Lưu trạng thái thành công
      message.success('Áp dụng mã giảm giá thành công!');
    } catch (error) {
      message.error(error.response?.data?.message || 'Mã giảm giá không hợp lệ');
      setDiscountAmount(0);
      setAppliedVoucher(null);
    }
  };

  const handleSubmitCheckout = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      // Server tự tính lại tổng tiền và kiểm tra lại voucher, không gửi số tiền lên
      const res = await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/checkout`, {
        selected_services: selectedItems.services,
        selected_packages: selectedItems.packages,
        selected_medicines: selectedItems.medicines,
        voucher_code: appliedVoucher ? appliedVoucher.code : null, // Gửi đúng mã đã được xác nhận
        payment_method: paymentMethod
      }, { headers: { 'Authorization': `Bearer ${token}` } });

      message.success(`Chốt Sale thành công! Đã thu: ${Number(res.data.bill?.amount_due_now || 0).toLocaleString('vi-VN')} ₫`);
      setSelectedCustomer(null);
      fetchData();
    } catch (error) { message.error(error.response?.data?.message || 'Lỗi khi chốt hóa đơn!'); }
    finally { setLoading(false); }
  };

  const examFee = Number(selectedCustomer?.exam_fee || 0);
  const depositPaid = Number(selectedCustomer?.deposit_paid || 0);
  const subtotal = getSubtotal();
  const finalTotal = Math.max(0, subtotal - discountAmount);
  const amountDue = Math.max(0, finalTotal - depositPaid);

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={7} className="h-full">
        <Card title={`Khách Chờ Chốt Sale (${hotLeads.length})`} variant="borderless" className="h-full shadow-sm" styles={{ body: { padding: 0, height: 'calc(100% - 55px)', overflowY: 'auto' } }}>
          <List
            itemLayout="horizontal" dataSource={hotLeads} locale={{ emptyText: 'Không có khách chờ thanh toán.' }}
            renderItem={(item) => (
              <List.Item onClick={() => handleSelectCustomer(item)} className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-green-50 ${selectedCustomer?.id === item.id ? 'bg-green-100 border-l-4 border-l-green-500' : ''}`}>
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} className="bg-green-500" />}
                  title={<b className="text-gray-800">{item.customer_name}</b>}
                  description={<Tag color="success" className="mt-1">Vừa ra khỏi phòng khám</Tag>}
                />
              </List.Item>
            )}
          />
        </Card>
      </Col>

      <Col span={17} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm flex flex-col" styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          {!selectedCustomer ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <DollarOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn khách hàng</Title>
              <Text>Chọn khách hàng để xem toa bác sĩ và tính tiền.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-start">
                <Space size="middle" align="start">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-green-600 mt-1" />
                  <div>
                    <Title level={4} className="m-0 text-gray-800">{selectedCustomer.customer_name}</Title>
                    <Text type="secondary">SĐT: {selectedCustomer.customer_phone}</Text>
                    <div className="mt-2 text-sm text-gray-600">
                        <Text strong>Chẩn đoán của BS:</Text> {selectedCustomer.diagnosis || 'Không có'}
                    </div>
                  </div>
                </Space>
                <Tag color="purple" className="text-sm px-3 py-1"><SolutionOutlined/> Trạng thái: Chốt Hóa Đơn</Tag>
              </div>

              <div className="flex-1 p-6 overflow-y-auto flex gap-6">
                 <div className="flex-1">
                    <Title level={5} className="text-blue-700 border-b pb-2"><MedicineBoxOutlined/> Giỏ hàng / Dịch vụ</Title>
                    
                    <div className="mb-4">
                       <Text strong className="block mb-2 text-gray-700">1. Dịch vụ Spa (Làm ngay)</Text>
                       <Select
                          mode="multiple" className="w-full" placeholder="-- Chọn thêm dịch vụ --"
                          value={selectedItems.services} onChange={(vals) => setSelectedItems(prev => ({...prev, services: vals}))}
                       >
                          {spaServices.map(s => (
                             <Select.Option key={s.id} value={s.id}>{s.name} - <span className="text-red-500 font-medium">{Number(s.price).toLocaleString('vi-VN')}đ</span></Select.Option>
                          ))}
                       </Select>
                    </div>

                    <div className="mb-4">
                       <Text strong className="block mb-2 text-gray-700">2. Gói Lộ Trình (VIP)</Text>
                       <Select
                          mode="multiple" className="w-full" placeholder="-- Chọn thêm gói --"
                          value={selectedItems.packages} onChange={(vals) => setSelectedItems(prev => ({...prev, packages: vals}))}
                       >
                          {packages.map(p => (
                             <Select.Option key={p.id} value={p.id}>{p.name} - <span className="text-red-500 font-medium">{Number(p.promotional_price || p.price).toLocaleString('vi-VN')}đ</span></Select.Option>
                          ))}
                       </Select>
                    </div>

                    <div className="mb-4">
                       <Text strong className="block mb-2 text-gray-700">3. Dược Mỹ Phẩm (Mang về)</Text>
                       <Select
                          mode="multiple" className="w-full" placeholder="-- Chọn thêm sản phẩm --"
                          value={selectedItems.medicines.map(m => m.product_id)}
                          onChange={(ids) => setSelectedItems(prev => ({
                             ...prev,
                             // giữ số lượng của sản phẩm đã chọn, sản phẩm mới mặc định 1
                             medicines: ids.map(id => prev.medicines.find(m => m.product_id === id) || { product_id: id, quantity: 1 })
                          }))}
                       >
                          {products.map(p => (
                             <Select.Option key={p.id} value={p.id}>{p.name} - <span className="text-red-500 font-medium">{Number(p.price).toLocaleString('vi-VN')}đ</span></Select.Option>
                          ))}
                       </Select>

                       {/* Số lượng từng sản phẩm, đối chiếu tồn kho */}
                       {selectedItems.medicines.map(m => {
                          const product = products.find(p => p.id === m.product_id);
                          const stock = Number(product?.stock_quantity || 0);
                          return (
                             <div key={m.product_id} className="flex items-center justify-between gap-3 mt-2 px-3 py-2 bg-gray-50 rounded border border-gray-100">
                                <div className="min-w-0">
                                   <Text className="block truncate">{product?.name || 'Sản phẩm không còn bán'}</Text>
                                   <Text type={m.quantity > stock ? 'danger' : 'secondary'} className="text-xs">
                                      Còn {stock} trong kho{m.quantity > stock ? ' — không đủ hàng' : ''}
                                   </Text>
                                </div>
                                <InputNumber
                                   min={1} max={20} value={m.quantity} addonAfter="SL" style={{ width: 120 }}
                                   onChange={(qty) => setSelectedItems(prev => ({
                                      ...prev,
                                      medicines: prev.medicines.map(x => x.product_id === m.product_id ? { ...x, quantity: qty || 1 } : x)
                                   }))}
                                />
                             </div>
                          );
                       })}
                    </div>
                 </div>

                 <div className="w-[350px] bg-gray-50 border border-gray-200 rounded-lg p-5 flex flex-col">
                    <Title level={5} className="text-gray-800 border-b pb-2">Tổng kết Hóa đơn</Title>
                    
                    <div className="flex justify-between mb-2 mt-2">
                       <Text>Tiền Dịch vụ/Sản phẩm:</Text>
                       <Text strong>{(subtotal - examFee).toLocaleString('vi-VN')} ₫</Text>
                    </div>

                    <div className="flex justify-between mb-2">
                       <Text>Phí khám bác sĩ:</Text>
                       <Text strong>{examFee > 0 ? `${examFee.toLocaleString('vi-VN')} ₫` : 'Miễn phí (khách cũ)'}</Text>
                    </div>

                    <div className="flex justify-between mb-4 border-t border-gray-200 pt-2">
                       <Text>Tạm tính:</Text>
                       <Text strong>{subtotal.toLocaleString('vi-VN')} ₫</Text>
                    </div>

                    <div className="mb-4">
                       <Text className="block mb-1"><PercentageOutlined/> Mã giảm giá:</Text>
                       <Space.Compact className="w-full">
                          <Input 
                            placeholder="Nhập mã voucher..." 
                            value={voucherCode} 
                            allowClear
                            onChange={e => {
                               const val = e.target.value.toUpperCase();
                               setVoucherCode(val);
                               if (!val) {
                                  setDiscountAmount(0);
                                  setAppliedVoucher(null);
                               }
                            }} 
                          />
                          <Button type="primary" onClick={handleApplyVoucher}>Áp dụng</Button>
                       </Space.Compact>
                       
                       {/* HIỂN THỊ RÕ RÀNG TRẠNG THÁI MÃ KHI THÀNH CÔNG */}
                       {appliedVoucher && (
                          <Alert 
                            message={<span className="font-bold">{appliedVoucher.code}</span>} 
                            description={`Đã giảm: ${appliedVoucher.amount.toLocaleString('vi-VN')} ₫`} 
                            type="success" 
                            showIcon 
                            icon={<CheckCircleOutlined />} 
                            className="mt-3 py-1 px-3" 
                          />
                       )}
                    </div>

                    <Divider className="my-2"/>

                    <div className="flex justify-between mb-2">
                       <Text>Tổng hóa đơn:</Text>
                       <Text strong>{finalTotal.toLocaleString('vi-VN')} ₫</Text>
                    </div>
                    {depositPaid > 0 && (
                       <div className="flex justify-between mb-2 text-green-600">
                          <Text className="text-green-600">Đã cọc khi đặt lịch:</Text>
                          <Text strong className="text-green-600">- {depositPaid.toLocaleString('vi-VN')} ₫</Text>
                       </div>
                    )}

                    <div className="flex justify-between mb-4 bg-blue-50 p-3 border border-blue-200 rounded">
                       <Text strong className="text-blue-700 text-lg">TỔNG CẦN THU:</Text>
                       <Text strong className="text-2xl text-blue-700">{amountDue.toLocaleString('vi-VN')} ₫</Text>
                    </div>

                    <div className="mb-6">
                       <Text className="block mb-1">Hình thức thu:</Text>
                       <Radio.Group value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} optionType="button" buttonStyle="solid">
                          <Radio.Button value="CASH">Tiền mặt</Radio.Button>
                          <Radio.Button value="VIETQR">Chuyển khoản</Radio.Button>
                       </Radio.Group>
                    </div>

                    <Button type="primary" size="large" block className="mt-auto bg-green-600 hover:bg-green-500" loading={loading} onClick={handleSubmitCheckout}>
                       XÁC NHẬN & THANH TOÁN
                    </Button>
                 </div>
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}