import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Collapse, Avatar, Typography, Input, Space, Tag, Timeline, Descriptions, Spin, Empty, Image } from 'antd';
import { UserOutlined, SearchOutlined, HistoryOutlined, MedicineBoxOutlined, PictureOutlined, ScissorOutlined, ShoppingOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Search } = Input;

export default function CustomerProfilePage() {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [catalogs, setCatalogs] = useState({ services: [], packages: [], products: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const [custRes, srvRes, pkgRes, prodRes] = await Promise.all([
          axios.get('http://localhost:4000/api/identity/users/customers', { headers: { 'Authorization': `Bearer ${token}` } }),
          axios.get('http://localhost:4000/api/booking/spa-services'),
          axios.get('http://localhost:4000/api/booking/packages'),
          axios.get('http://localhost:4000/api/commerce/products')
        ]);
        setCustomers(custRes.data?.data || []);
        setFilteredCustomers(custRes.data?.data || []);
        setCatalogs({
          services: srvRes.data?.data || [],
          packages: pkgRes.data?.data || [],
          products: prodRes.data?.data || []
        });
      } catch (error) { console.error(error); }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) return setFilteredCustomers(customers);
    const keyword = searchTerm.toLowerCase();
    setFilteredCustomers(customers.filter(user => user.Profile?.full_name?.toLowerCase().includes(keyword) || user.PatientProfiles?.some(p => p.full_name?.toLowerCase().includes(keyword))));
  }, [searchTerm, customers]);

  const handleSelectProfile = async (profile) => {
    if (profile.id === 'mock') return;
    setSelectedProfile(profile);
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [medRes, sessionRes, aptRes] = await Promise.all([
        axios.get(`http://localhost:4000/api/identity/medical-records/${profile.id}`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`http://localhost:4000/api/booking/sessions/patient/${profile.id}`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`http://localhost:4000/api/booking/appointments/patient/${profile.id}`, { headers }).catch(() => ({ data: { data: [] } }))
      ]);

      const medData = Array.isArray(medRes.data?.data) ? medRes.data.data : [];
      const sessionData = Array.isArray(sessionRes.data?.data) ? sessionRes.data.data : [];
      const aptData = Array.isArray(aptRes.data?.data) ? aptRes.data.data : [];

      const combinedHistory = [
        ...medData.map(r => {
          const apt = aptData.find(a => a.id === r.appointment_id);
          return { type: 'EXAM', date: r.exam_date, data: { ...r, prescribed_services: apt?.prescribed_services, prescribed_packages: apt?.prescribed_packages, prescribed_medicines: apt?.prescribed_medicines }, id: `exam_${r.id}` }
        }),
        ...sessionData.map(s => ({ type: 'TREATMENT', date: s.session_date, data: s, id: `session_${s.id}` }))
      ].sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

      setHistory(combinedHistory);
    } catch (error) {} finally { setLoading(false); }
  };

  const timelineItems = history.map((item, index) => {
    const isLatest = index === 0;
    if (item.type === 'EXAM') {
      const record = item.data;
      return {
        key: item.id, color: 'blue', dot: <MedicineBoxOutlined className="text-lg text-blue-600" />,
        children: (
          <div className={`p-4 rounded-lg border shadow-sm mb-4 ${isLatest ? 'bg-white border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <Title level={5} className="m-0 text-blue-700">Khám bác sĩ: {dayjs(item.date).format('DD/MM/YYYY')}</Title>
              <Tag color="cyan">BS. {record.Doctor?.Profile?.full_name || 'Chưa cập nhật'}</Tag>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ fontWeight: 'bold' }}>
              <Descriptions.Item label="Triệu chứng"><Text className="whitespace-pre-line">{record.symptoms || 'Không ghi nhận'}</Text></Descriptions.Item>
              <Descriptions.Item label="Chẩn đoán"><Text strong className="text-red-600">{record.diagnosis || 'Chưa có chẩn đoán'}</Text></Descriptions.Item>
              <Descriptions.Item label="Dặn dò">{record.doctor_notes || 'Không có dặn dò'}</Descriptions.Item>
            </Descriptions>
            
            {(record.prescribed_services?.length > 0 || record.prescribed_packages?.length > 0 || record.prescribed_medicines?.length > 0) && (
              <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
                <Text strong className="text-purple-700 mb-2 block"><ShoppingOutlined/> Dịch vụ & Sản phẩm đã mua:</Text>
                {record.prescribed_services?.length > 0 && <div><Text strong>Dịch vụ:</Text> {record.prescribed_services.map(id => catalogs.services.find(s=>s.id === id)?.name).join(', ')}</div>}
                {record.prescribed_packages?.length > 0 && <div><Text strong>Lộ trình:</Text> {record.prescribed_packages.map(id => catalogs.packages.find(p=>p.id === id)?.name).join(', ')}</div>}
                {record.prescribed_medicines?.length > 0 && <div><Text strong>Thuốc/Mỹ phẩm:</Text> {record.prescribed_medicines.map(id => catalogs.products.find(p=>p.id === id)?.name).join(', ')}</div>}
              </div>
            )}

            <div className="mt-3 pt-3 border-t">
               <Text type="secondary" className="block mb-2 text-xs uppercase"><PictureOutlined/> Hình ảnh trước khám (Before)</Text>
               {record.pre_exam_images?.length > 0 ? (
                 <Image.PreviewGroup><Space size={[8, 8]} wrap>{record.pre_exam_images.map((img, i) => <Image key={i} width={60} height={60} src={img} className="rounded object-cover border" />)}</Space></Image.PreviewGroup>
               ) : <Text type="secondary" className="text-xs italic">Không có ảnh</Text>}
            </div>
          </div>
        )
      };
    } else {
      const session = item.data;
      return {
        key: item.id, color: 'green', dot: <ScissorOutlined className="text-lg text-green-600" />,
        children: (
          <div className="p-4 rounded-lg border shadow-sm mb-4 bg-green-50 border-green-200">
            <div className="flex justify-between items-center mb-3 border-b border-green-200 pb-2">
              <Title level={5} className="m-0 text-green-700">Làm dịch vụ: {dayjs(item.date).format('DD/MM/YYYY')}</Title>
              <Tag color="green">{session.type === 'PACKAGE' ? 'GÓI LỘ TRÌNH' : 'DỊCH VỤ LẺ'}</Tag>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ fontWeight: 'bold' }}>
              <Descriptions.Item label="Dịch vụ thực hiện"><Text strong>{session.service_name}</Text> {session.type === 'PACKAGE' && `(Buổi ${session.session_number})`}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú KTV"><Text className="whitespace-pre-line text-gray-700">{session.technician_note || 'Không có ghi chú'}</Text></Descriptions.Item>
            </Descriptions>
            <div className="mt-3 pt-3 border-t border-green-200">
               <Text type="secondary" className="block mb-2 text-xs uppercase text-green-700"><PictureOutlined/> Hình ảnh sau dịch vụ (After)</Text>
               {session.post_treatment_images?.length > 0 ? (
                 <Image.PreviewGroup><Space size={[8, 8]} wrap>{session.post_treatment_images.map((img, i) => <Image key={i} width={60} height={60} src={img} className="rounded border-green-400" />)}</Space></Image.PreviewGroup>
               ) : <Text type="secondary" className="text-xs italic">Không có ảnh</Text>}
            </div>
          </div>
        )
      };
    }
  });

  const collapseItems = filteredCustomers.map(user => ({
    key: user.id, label: <Space><UserOutlined/> <b className="text-gray-800">{user.Profile?.full_name}</b></Space>,
    children: (
      <>
         {(user.PatientProfiles?.length > 0 ? user.PatientProfiles : [{ id: 'mock', full_name: user.Profile?.full_name, relationship: 'Bản thân' }]).map(profile => (
            <div key={profile.id} onClick={() => handleSelectProfile(profile)} className={`p-2 mb-1 rounded cursor-pointer border hover:bg-blue-50 ${selectedProfile?.id === profile.id ? 'bg-blue-100 border-blue-400' : 'border-transparent'}`}>
               <Text className="block text-sm">{profile.full_name} <Tag className="ml-1 text-[10px]">{profile.relationship}</Tag></Text>
            </div>
         ))}
      </>
    )
  }));

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={7} className="h-full">
        <Card className="h-full shadow-sm" styles={{ body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' } }}>
          <div className="p-4 bg-gray-50 border-b"><Search placeholder="Tìm theo tên khách hàng/người thân..." allowClear onChange={e => setSearchTerm(e.target.value)} /></div>
          <div className="flex-1 overflow-y-auto p-2"><Collapse ghost expandIconPlacement="end" items={collapseItems} /></div>
        </Card>
      </Col>
      <Col span={17} className="h-full">
        <Card className="h-full shadow-sm" styles={{ body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' } }}>
          {!selectedProfile ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><HistoryOutlined className="text-6xl mb-4" /><Title level={4} type="secondary">Chưa chọn hồ sơ</Title></div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
               <div className="p-4 bg-white border-b shadow-sm flex justify-between items-center"><Title level={4} className="m-0 text-gray-800">Hồ sơ: {selectedProfile.full_name}</Title><Tag color="blue">Tổng: {history.length} lượt tương tác</Tag></div>
               <div className="flex-1 p-6 overflow-y-auto bg-gray-50"><Spin spinning={loading}>{history.length > 0 ? <Timeline mode="left" items={timelineItems} /> : <Empty description="Hồ sơ chưa có lịch sử" />}</Spin></div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}