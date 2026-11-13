import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Statistic, Row, Col, Tabs, DatePicker, message, Typography, Empty } from 'antd';
import { VideoCameraOutlined, EditOutlined, CalendarOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import ConsultResultDrawer from '../components/ConsultResultDrawer';
import { openVideoCall } from '../utils/videoCall';
import { useTiming } from '../utils/timing';
import { useLiveRefresh } from '../components/Notifications';

const { Text, Paragraph } = Typography;
const API = 'http://localhost:4000/api';
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });

const STATUS = {
  CONFIRMED: { color: 'blue', text: 'Sắp diễn ra' },
  COMPLETED: { color: 'green', text: 'Hoàn thành' },
  NO_SHOW: { color: 'orange', text: 'Khách vắng' },
  EXPERT_ABSENT: { color: 'red', text: 'Bạn vắng mặt' },
  CANCELLED: { color: 'default', text: 'Đã hủy' },
};
const SHIFT_LABEL = { MORNING: 'Sáng (08:00 - 12:00)', AFTERNOON: 'Chiều (13:00 - 17:00)', EVENING: 'Tối (18:00 - 21:00)' };
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

// Trang làm việc của chuyên gia tư vấn thỉnh giảng: lịch tư vấn, vào phòng video (tab riêng), nhập kết quả cho khách, thống kê tháng
export default function ExpertWorkspacePage() {
  const timingCfg = useTiming();
  const [list, setList] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(dayjs());
  const [stats, setStats] = useState(null);
  const [fee, setFee] = useState(null);
  const [resultItem, setResultItem] = useState(null);

  const fetchList = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mine, sh] = await Promise.all([
        axios.get(`${API}/booking/consultations/expert/mine`, { headers: headers() }),
        axios.get(`${API}/booking/consultations/shifts`, { headers: headers() }),
      ]);
      setList(mine.data.data || []);
      setShifts(sh.data.data || []);
    } catch (err) {
      message.error(err.response?.data?.message || 'Không tải được lịch tư vấn');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchList();
    axios.get(`${API}/identity/users/me/professional-profile`, { headers: headers() })
      .then((res) => setFee(res.data.data?.session_fee ?? null)).catch(() => {});
  }, []);

  // Cuộc gọi chạy ở tab khác: cập nhật khi quay lại tab này và định kỳ để biết khách đã vào phòng
  useEffect(() => {
    const refresh = () => fetchList(true);
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { window.removeEventListener('focus', refresh); clearInterval(timer); };
  }, []);
  useLiveRefresh(['consultations'], () => fetchList(true));

  useEffect(() => {
    axios.get(`${API}/booking/consultations/expert/stats`, { headers: headers(), params: { month: month.format('YYYY-MM') } })
      .then((res) => setStats(res.data.data)).catch(() => setStats(null));
  }, [month, list]);

  const canJoin = (c) => {
    const start = dayjs(`${c.appointment_date} ${c.appointment_time}`);
    const now = dayjs();
    return ['CONFIRMED', 'COMPLETED'].includes(c.status)
      && !now.isBefore(start.subtract(timingCfg.expertOpenBeforeMinutes, 'minute')) && now.isBefore(dayjs(c.room_closes_at));
  };

  // Cả 2 bên đã vào phòng và còn hạn gửi kết quả
  const canSubmitResult = (c) => ['CONFIRMED', 'COMPLETED'].includes(c.status) && c.expert_joined && c.customer_joined && dayjs().isBefore(dayjs(c.result_deadline));

  const columns = [
    {
      title: 'Thời gian', key: 'time', width: 150,
      render: (_, c) => <><b>{c.appointment_time}</b><br />{dayjs(c.appointment_date).format('DD/MM/YYYY')}</>,
    },
    { title: 'Khách hàng', dataIndex: 'customer_name', width: 160 },
    {
      title: 'Câu hỏi của khách', dataIndex: 'question',
      render: (q) => <Paragraph className="mb-0" ellipsis={{ rows: 2, expandable: true, symbol: 'Xem thêm' }}>{q}</Paragraph>,
    },
    {
      title: 'Trạng thái', key: 'status', width: 150,
      render: (_, c) => (
        <>
          <Tag color={STATUS[c.status]?.color}>{STATUS[c.status]?.text || c.status}</Tag>
          {c.status === 'CONFIRMED' && c.customer_joined && <Tag color="cyan" className="mt-1">Khách đã vào</Tag>}
          {c.status === 'CONFIRMED' && c.customer_joined && c.expert_joined && (
            <Text type="warning" className="block text-xs mt-1">Chờ kết quả, hạn {dayjs(c.result_deadline).format('HH:mm DD/MM')}</Text>
          )}
        </>
      ),
    },
    {
      title: 'Thao tác', key: 'action', width: 200,
      render: (_, c) => (
        <div className="flex flex-col gap-1">
          {canJoin(c) && (
            <Button type="primary" icon={<VideoCameraOutlined />} className="bg-green-600" onClick={() => openVideoCall({ id: c.id, kind: 'consultation', name: c.customer_name })}>Vào phòng tư vấn</Button>
          )}
          {canSubmitResult(c) && (
            <Button icon={<EditOutlined />} onClick={() => setResultItem(c)}>{c.status === 'COMPLETED' ? 'Sửa kết quả' : 'Nhập kết quả tư vấn'}</Button>
          )}
          {c.status === 'COMPLETED' && c.rating && <Text type="secondary">Khách đánh giá {c.rating}/5</Text>}
        </div>
      ),
    },
  ];

  const now = dayjs();
  const upcoming = list.filter((c) => c.status === 'CONFIRMED' || (c.status === 'COMPLETED' && now.isBefore(dayjs(c.room_closes_at)))).reverse();
  const estimatedFee = fee == null ? null : (stats?.completed || 0) * fee;
  const past = list.filter((c) => !upcoming.includes(c));
  const futureShifts = shifts.filter((s) => !dayjs(s.date).isBefore(now, 'day'));

  return (
    <div className="space-y-4">
      <Card
        title="Thống kê của tôi"
        extra={<DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} format="MM/YYYY" allowClear={false} />}
      >
        <Row gutter={16}>
          <Col xs={12} md={6}><Statistic title="Lượt tư vấn hoàn thành" value={stats?.completed || 0} /></Col>
          <Col xs={12} md={6}><Statistic title="Thù lao mỗi lượt tư vấn" value={fee == null ? '—' : money(fee)} /></Col>
          <Col xs={12} md={6}><Statistic title="Thù lao dự kiến tháng" value={estimatedFee == null ? '—' : money(estimatedFee)} valueStyle={{ color: '#16a34a' }} /></Col>
          <Col xs={12} md={6}><Statistic title="Đánh giá trung bình" value={stats?.avg_rating ? `${stats.avg_rating}/5 (${stats.rating_count})` : 'Chưa có'} /></Col>
        </Row>
        <Text type="secondary" className="block mt-2">
          Thù lao tính theo từng lượt khách, không theo ca làm việc. Lượt hoàn thành là lượt cả 2 bên đã vào phòng và bạn đã gửi kết quả (hạn 24 giờ sau khi phòng đóng). Khách không vào phòng: không tính thù lao. Bạn vắng hoặc không gửi kết quả đúng hạn: khách được hoàn cọc và không tính thù lao.
        </Text>
      </Card>

      <Card title="Lịch tư vấn">
        <Tabs
          items={[
            { key: 'upcoming', label: `Sắp tới (${upcoming.length})`, children: <Table rowKey="id" loading={loading} columns={columns} dataSource={upcoming} pagination={false} locale={{ emptyText: 'Chưa có lịch tư vấn sắp tới' }} /> },
            { key: 'past', label: `Đã qua (${past.length})`, children: <Table rowKey="id" loading={loading} columns={columns} dataSource={past} pagination={{ pageSize: 10 }} /> },
            {
              key: 'shifts', label: <span><CalendarOutlined /> Ca được mở ({futureShifts.length})</span>,
              children: futureShifts.length ? (
                <div className="flex flex-wrap gap-2">
                  {futureShifts.map((s) => <Tag key={s.id} color="purple" className="py-1 px-2">{dayjs(s.date).format('DD/MM/YYYY')} · {SHIFT_LABEL[s.shift_type]}</Tag>)}
                </div>
              ) : <Empty description="Quản lý chưa mở ca tư vấn nào cho bạn. Hãy báo lịch rảnh cho phòng khám." />,
            },
          ]}
        />
      </Card>

      <ConsultResultDrawer consultation={resultItem} onClose={() => setResultItem(null)} onSaved={() => { setResultItem(null); fetchList(); }} />
    </div>
  );
}
