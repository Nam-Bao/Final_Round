import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Select, Button, Space, Avatar, Typography, message, Divider, Input, Alert, Radio } from 'antd';
import { UserOutlined, DollarOutlined, SolutionOutlined, MedicineBoxOutlined, PercentageOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

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
      const token = localStorage.getItem('admin_token');
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
      medicines: customer.prescribed_medicines || []
    });
  };

  // Phí khám do server chốt lúc đặt lịch (khách cũ = 0đ); cọc đã trả sẽ được trừ ở dòng "Đã cọc"
  const examFee = Number(selectedCustomer?.exam_fee) || 0;
  const depositPaid = Number(selectedCustomer?.deposit_paid) || 0;

  const getSubtotal = () => {
    let sub = examFee;
    selectedItems.services.forEach(id => { const item = spaServices.find(s => s.id === id); if (item) sub += Number(item.price); });
    selectedItems.packages.forEach(id => { const item = packages.find(p => p.id === id); if (item) sub += Number(item.promotional_price || item.price); });
    selectedItems.medicines.forEach(id => { const item = products.find(p => p.id === id); if (item) sub += Number(item.price); });
    return sub;
  };

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    try {
      const res = await axios.post('http://localhost:4000/api/commerce/promotions/apply', {
        code: voucherCode,
        order_value: getSubtotal(),
        customer_id: selectedCustomer.customer_id // Kiểm tra khách này đã dùng mã chưa
      });
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
    const currentSubtotal = getSubtotal();
    const currentFinalTotal = Math.max(0, currentSubtotal - discountAmount);

    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/checkout`, {
        selected_services: selectedItems.services,
        selected_packages: selectedItems.packages,
        selected_medicines: selectedItems.medicines,
        discount_amount: discountAmount,
        voucher_code: appliedVoucher ? appliedVoucher.code : null, // Gửi đúng mã đã được xác nhận
        total_bill: currentFinalTotal,
        payment_method: paymentMethod
      }, { headers: { 'Authorization': `Bearer ${token}` } });

      const collected = Number(res.data?.data?.collected) || 0;
      message.success(`Chốt Sale & Xuất hóa đơn thành công! Đã thu: ${collected.toLocaleString('vi-VN')} ₫`);
      setSelectedCustomer(null);
      fetchData(); 
    } catch (error) { message.error(error.response?.data?.message || 'Lỗi khi chốt hóa đơn!'); }
    finally { setLoading(false); }
  };

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
                          value={selectedItems.medicines} onChange={(vals) => setSelectedItems(prev => ({...prev, medicines: vals}))}
                       >
                          {products.map(p => (
                             <Select.Option key={p.id} value={p.id}>{p.name} - <span className="text-red-500 font-medium">{Number(p.price).toLocaleString('vi-VN')}đ</span></Select.Option>
                          ))}
                       </Select>
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
                       <div className="flex justify-between mb-2">
                          <Text>Đã cọc khi đặt lịch:</Text>
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