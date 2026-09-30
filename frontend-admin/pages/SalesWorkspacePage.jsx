import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Button, Space, Avatar, Typography, message, Table, Divider, InputNumber } from 'antd';
import { ShoppingOutlined, DollarOutlined, InboxOutlined, AlertOutlined, CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

export default function SalesWorkspacePage() {
  const [activeTab, setActiveTab] = useState('cashier');
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // State hứng dữ liệu thật
  const [unpaidOrders, setUnpaidOrders] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);

  // 1. KÉO DỮ LIỆU TỪ API (HÓA ĐƠN & TỒN KHO)
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // Kéo đơn chờ thu tiền
      const orderRes = await axios.get('http://localhost:4000/api/commerce/orders/unpaid', { headers });
      if (orderRes.data.data) {
        setUnpaidOrders(orderRes.data.data);
      }

      // Kéo danh sách sản phẩm để lọc tồn kho thấp (< 10)
      const productRes = await axios.get('http://localhost:4000/api/commerce/products', { headers });
      if (productRes.data.data) {
        const lowStock = productRes.data.data.filter(p => p.stock_quantity < 10);
        setLowStockProducts(lowStock);
      }
    } catch (error) {
      console.error('Lỗi tải dữ liệu Bán hàng:', error);
      message.error('Không thể tải dữ liệu mới nhất.');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectItem = (item) => {
    setSelectedItem(item);
    form.resetFields();
  };

  // 2. HÀM XỬ LÝ THANH TOÁN (GỌI API THẬT)
  const handlePayOrder = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/commerce/orders/${selectedItem.id}/pay`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      message.success('Thanh toán thành công! Đã cập nhật tồn kho.');
      setSelectedItem(null);
      fetchData(); // Load lại toàn bộ đơn và kho
    } catch (error) {
      message.error(error.response?.data?.message || 'Lỗi khi thanh toán!');
    } finally {
      setLoading(false);
    }
  };

  // 3. HÀM TẠO YÊU CẦU NHẬP HÀNG (Sẽ nối API sau)
  const handleRequestInventory = (values) => {
    message.info(`Đã tạo yêu cầu nhập ${values.quantity} sản phẩm. Tính năng đang kết nối API.`);
    setSelectedItem(null);
    form.resetFields();
  };

  // Cấu hình định dạng tiền tệ VNĐ
  const formatVND = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Cấu hình bảng hiển thị chi tiết món hàng trong Hóa đơn
  const columns = [
    { title: 'Tên SP/Dịch vụ', dataIndex: ['Product', 'name'], key: 'name' },
    { title: 'SL', dataIndex: 'quantity', key: 'qty', width: 60, align: 'center' },
    { title: 'Đơn giá', dataIndex: 'price', key: 'price', render: (val) => formatVND(val) },
    { title: 'Thành tiền', key: 'total', render: (_, record) => <b>{formatVND(record.price * record.quantity)}</b> }
  ];

  const queueTabs = [
    { key: 'cashier', label: <span className="text-orange-600 font-bold">💰 Thu Ngân ({unpaidOrders.length})</span> },
    { key: 'online', label: `📦 Đơn Online (0)` }, // Tạm giữ cấu trúc cho luồng E-commerce
    { key: 'inventory', label: <span className="text-red-600 font-bold">⚠️ Sắp hết hàng ({lowStockProducts.length})</span> }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      {/* CỘT TRÁI: DANH SÁCH CHỜ XỬ LÝ */}
      <Col span={8} className="h-full">
        <Card className="h-full shadow-sm" styles={{ body: { padding: '0 0 10px 0', height: '100%', display: 'flex', flexDirection: 'column' } }}>
          <div className="px-4 pt-2 border-b border-gray-200">
            <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); setSelectedItem(null); }} items={queueTabs} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'cashier' && (
              <List
                itemLayout="horizontal"
                dataSource={unpaidOrders}
                locale={{ emptyText: 'Hiện không có khách chờ thanh toán.' }}
                renderItem={(item) => (
                  <List.Item onClick={() => handleSelectItem(item)} className={`cursor-pointer px-4 py-3 border-b hover:bg-orange-50 ${selectedItem?.id === item.id ? 'bg-orange-100 border-l-4 border-l-orange-500' : ''}`}>
                    <List.Item.Meta
                      avatar={<Avatar icon={<ShoppingOutlined />} className="bg-orange-500" />}
                      title={<b className="text-gray-800">{item.customer_name}</b>}
                      description={
                        <Space direction="vertical" size={0} className="w-full mt-1">
                          <Text className="font-bold text-orange-600">{formatVND(item.total_amount)}</Text>
                          <Tag color="warning" className="mt-1">Chờ thu tiền</Tag>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}

            {activeTab === 'inventory' && (
              <List
                itemLayout="horizontal"
                dataSource={lowStockProducts}
                locale={{ emptyText: 'Kho hàng đang ổn định.' }}
                renderItem={(item) => (
                  <List.Item onClick={() => handleSelectItem(item)} className={`cursor-pointer px-4 py-3 border-b hover:bg-red-50 ${selectedItem?.id === item.id ? 'bg-red-100 border-l-4 border-l-red-500' : ''}`}>
                    <List.Item.Meta
                      avatar={<Avatar icon={<AlertOutlined />} className="bg-red-500" />}
                      title={<b className="text-gray-800">{item.name}</b>}
                      description={
                        <Space direction="vertical" size={0} className="w-full mt-1">
                          <Text type="secondary">Phân loại: {item.type}</Text>
                          <Text className="text-red-600 font-bold mt-1">Tồn kho: {item.stock_quantity}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        </Card>
      </Col>

      {/* CỘT PHẢI: BÀN LÀM VIỆC */}
      <Col span={16} className="h-full">
        <Card className="h-full shadow-sm flex flex-col" styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          {!selectedItem ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <InboxOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn nghiệp vụ</Title>
              <Text>Chọn một đơn hàng hoặc sản phẩm bên trái để thao tác.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              
              {/* GIAO DIỆN XỬ LÝ THU NGÂN */}
              {activeTab === 'cashier' && (
                <>
                  <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div>
                      <Title level={4} className="m-0 text-gray-800">Hóa Đơn: {selectedItem.customer_name}</Title>
                      <Text type="secondary">SĐT: {selectedItem.customer_phone}</Text>
                    </div>
                  </div>
                  <div className="flex-1 p-6 overflow-y-auto">
                    <Table 
                      dataSource={selectedItem.OrderItems || []} 
                      columns={columns} 
                      rowKey="id" 
                      pagination={false} 
                      bordered
                    />
                    <div className="mt-6 flex justify-end">
                      <div className="text-right bg-orange-50 p-4 rounded-lg border border-orange-200 min-w-[300px]">
                        <div className="flex justify-between mb-2">
                          <Text>Tổng cộng:</Text>
                          <Text strong>{formatVND(selectedItem.total_amount)}</Text>
                        </div>
                        <Divider className="my-2" />
                        <div className="flex justify-between items-center mb-4">
                          <Title level={5} className="m-0 text-orange-700">Khách Cần Trả:</Title>
                          <Title level={4} className="m-0 text-orange-700">{formatVND(selectedItem.total_amount)}</Title>
                        </div>
                        <Space className="w-full justify-end">
                          <Button icon={<PrinterOutlined />}>In Tạm Tính</Button>
                          <Button type="primary" size="large" icon={<DollarOutlined />} onClick={handlePayOrder} loading={loading}>
                            Xác Nhận Đã Thu Tiền
                          </Button>
                        </Space>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* GIAO DIỆN TẠO YÊU CẦU NHẬP HÀNG */}
              {activeTab === 'inventory' && (
                <>
                  <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div>
                      <Title level={4} className="m-0 text-red-700">Cảnh Báo Thiếu Hàng</Title>
                      <Text className="text-lg font-bold">{selectedItem.name}</Text>
                    </div>
                  </div>
                  <div className="flex-1 p-6">
                    <div className="bg-red-50 p-4 rounded-lg mb-6 border border-red-200">
                      <Title level={5} className="text-red-700 m-0"><AlertOutlined className="mr-2"/> Trạng thái kho</Title>
                      <p className="mt-2 text-base text-gray-800">Sản phẩm này chỉ còn lại <b>{selectedItem.stock_quantity}</b> đơn vị trong kho. Vui lòng lập yêu cầu nhập hàng để gửi cho Quản lý chung phê duyệt.</p>
                    </div>
                    
                    <Form form={form} layout="vertical" onFinish={handleRequestInventory}>
                      <Form.Item name="quantity" label="Số lượng cần nhập thêm" rules={[{ required: true, message: 'Vui lòng nhập số lượng!' }]}>
                        <InputNumber className="w-full" min={1} placeholder="Nhập số lượng..." />
                      </Form.Item>
                      <Form.Item name="reason" label="Lý do / Ghi chú (Cho Quản lý)">
                        <Input.TextArea rows={3} placeholder="VD: Gần tới đợt khuyến mãi nên cần nhập nhiều hơn..." />
                      </Form.Item>
                      <div className="text-right">
                        <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />} size="large">
                          Gửi Yêu Cầu Nhập Kho
                        </Button>
                      </div>
                    </Form>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}