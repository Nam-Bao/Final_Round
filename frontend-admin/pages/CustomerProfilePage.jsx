import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Avatar, Typography, Input, Space, Tag, Timeline, Descriptions, Divider, Spin, Empty } from 'antd';
import { UserOutlined, SearchOutlined, HistoryOutlined, CalendarOutlined, MedicineBoxOutlined, FileTextOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Search } = Input;

export default function CustomerProfilePage() {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1. Kéo danh sách toàn bộ khách hàng khi mở trang
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const res = await axios.get('http://localhost:4000/api/identity/users/customers', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = res.data?.data || [];
        setCustomers(data);
        setFilteredCustomers(data);
      } catch (error) {
        console.error('Lỗi lấy danh sách khách hàng:', error);
      }
    };
    fetchCustomers();
  }, []);

  // 2. Tìm kiếm khách hàng theo Tên hoặc Số điện thoại
  const handleSearch = (value) => {
    const keyword = (value || '').toLowerCase().trim();
    const filtered = customers.filter(c => 
      (c.Profile?.full_name || '').toLowerCase().includes(keyword) || 
      (c.Profile?.phone || '').includes(keyword)
    );
    setFilteredCustomers(filtered);
  };

  // 3. Kéo lịch sử khám bệnh khi click chọn 1 khách hàng
  const handleSelectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get(`http://localhost:4000/api/identity/medical-records/${customer.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setHistory(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (error) {
      console.error('Lỗi lấy lịch sử y tế:', error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  // 4. Chuẩn hóa dữ liệu Timeline dạng items (Chuẩn Ant Design v5)
  const timelineItems = history.map((record, index) => {
    const isLatest = index === 0;
    const dateFormatted = record.exam_date ? dayjs(record.exam_date).format('DD/MM/YYYY HH:mm') : '--/--/----';
    const doctorName = record.Doctor?.Profile?.full_name || 'Không xác định';

    return {
      key: record.id || index,
      color: isLatest ? 'blue' : 'gray',
      dot: isLatest ? <MedicineBoxOutlined className="text-lg text-blue-600" /> : undefined,
      children: (
        <div className={`p-4 rounded-lg border shadow-sm mb-4 ${isLatest ? 'bg-white border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex justify-between items-center mb-3 border-b pb-2">
            <Title level={5} className="m-0 text-blue-700">
              Lần khám: {dateFormatted}
            </Title>
            <Tag color="cyan">BS. {doctorName}</Tag>
          </div>

          <Descriptions column={1} size="small" labelStyle={{ fontWeight: 'bold', color: '#555', width: '140px' }}>
            <Descriptions.Item label="Chẩn đoán">
              <Text strong className="text-red-600">{record.diagnosis || 'Chưa có chẩn đoán'}</Text>
            </Descriptions.Item>

            <Descriptions.Item label="Ghi nhận (CSKH & BS)">
              {record.symptoms ? (
                <div className="bg-gray-50 p-2 rounded border border-gray-200 text-sm w-full whitespace-pre-line">
                  {record.symptoms}
                </div>
              ) : (
                <Text type="secondary italic">Không có dữ liệu</Text>
              )}
            </Descriptions.Item>

            {record.doctor_notes && (
              <Descriptions.Item label="Dặn dò">
                <Text className="text-gray-700 italic"><FileTextOutlined className="mr-1" />{record.doctor_notes}</Text>
              </Descriptions.Item>
            )}

            {record.follow_up_date && (
              <Descriptions.Item label="Lịch Tái khám">
                <Tag color="error">{dayjs(record.follow_up_date).format('DD/MM/YYYY')}</Tag>
                <Text type="secondary" className="text-xs ml-2">(Hệ thống tự động nhắc lịch)</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>
      )
    };
  });

  return (
    <Row gutter={16} className="h-[85vh]">
      {/* CỘT TRÁI: DANH SÁCH KHÁCH HÀNG */}
      <Col span={7} className="h-full">
        <Card className="h-full shadow-sm flex flex-col" styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <Title level={5} className="mt-0 mb-3 text-blue-800">Quản Lý Hồ Sơ & Chăm Sóc</Title>
            <Search 
              placeholder="Tìm tên hoặc SĐT khách..." 
              allowClear 
              onChange={(e) => handleSearch(e.target.value)} 
              prefix={<SearchOutlined />}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <List
              itemLayout="horizontal"
              dataSource={filteredCustomers}
              locale={{ emptyText: 'Không tìm thấy khách hàng nào.' }}
              renderItem={(item) => (
                <List.Item 
                  onClick={() => handleSelectCustomer(item)}
                  className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedCustomer?.id === item.id ? 'bg-blue-100 border-l-4 border-l-blue-600' : ''}`}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} className={selectedCustomer?.id === item.id ? 'bg-blue-600' : 'bg-gray-400'} />}
                    title={<b className="text-gray-800">{item.Profile?.full_name || 'Khách hàng'}</b>}
                    description={item.Profile?.phone || 'Chưa cập nhật SĐT'}
                  />
                </List.Item>
              )}
            />
          </div>
        </Card>
      </Col>

      {/* CỘT PHẢI: CHI TIẾT HỒ SƠ Y BẠ */}
      <Col span={17} className="h-full">
        <Card className="h-full shadow-sm flex flex-col" styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          {!selectedCustomer ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <HistoryOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn khách hàng</Title>
              <Text>Chọn một khách hàng từ danh sách bên trái để tra cứu sổ y bạ.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* HEADER THÔNG TIN KHÁCH */}
              <div className="p-4 border-b border-gray-200 bg-white shadow-sm flex justify-between items-center">
                <Space size="middle">
                  <Avatar size={54} icon={<UserOutlined />} className="bg-blue-600" />
                  <div>
                    <Title level={4} className="m-0 text-gray-800">{selectedCustomer.Profile?.full_name || 'Khách hàng'}</Title>
                    <Space className="mt-1 text-gray-500 text-sm">
                      <span><UserOutlined /> SĐT: {selectedCustomer.Profile?.phone || 'Chưa có'}</span>
                      <Divider type="vertical" />
                      <span><CalendarOutlined /> Lần khám gần nhất: {history[0]?.exam_date ? dayjs(history[0].exam_date).format('DD/MM/YYYY') : 'Chưa có'}</span>
                    </Space>
                  </div>
                </Space>
                <Tag color="blue" className="px-3 py-1 text-sm border-blue-200">
                  Tổng lượt khám: <b>{history.length}</b>
                </Tag>
              </div>

              {/* BODY: TIMELINE LỊCH SỬ KHÁM */}
              <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
                <Spin spinning={loading} tip="Đang tải dữ liệu hồ sơ...">
                  {history.length === 0 ? (
                    <Empty description="Khách hàng này chưa có hồ sơ y tế nào." className="mt-10" />
                  ) : (
                    <Timeline mode="left" items={timelineItems} className="mt-2" />
                  )}
                </Spin>
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}