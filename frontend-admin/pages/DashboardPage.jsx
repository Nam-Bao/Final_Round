import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Alert, List, Table, Tag, Button, Spin, Space } from 'antd';
import { CalendarOutlined, ShoppingCartOutlined, DollarOutlined, WarningOutlined, InboxOutlined, LineChartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import StackedBarChart from '../components/StackedBarChart';
import { fetchRevenue, toChartData, GROUPS, vnd } from '../utils/revenue';
import { ARTICLE_TYPES } from '../components/content/contentApi';

const API = 'http://localhost:4000/api';
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const MATERIAL_STATUS = { OUT: 'Hết hàng', LOW: 'Dưới tồn tối thiểu', SHORT: 'Không đủ cho lịch 14 ngày' };

const CLICK_COLUMNS = [
  { title: 'Nội dung', dataIndex: 'name', key: 'name', render: (name, row) => <span>{name}{!row.is_active && <Tag className="ml-2">Đang tắt</Tag>}</span> },
  { title: 'Loại', dataIndex: 'kind', key: 'kind', render: (kind) => (kind === 'BANNER' ? 'Banner' : 'Popup') },
  { title: 'Lượt bấm', dataIndex: 'clicks', key: 'clicks', align: 'right', render: (n) => n.toLocaleString('vi-VN') },
];
const ARTICLE_COLUMNS = [
  { title: 'Loại bài', dataIndex: 'type', key: 'type', render: (type) => ARTICLE_TYPES[type]?.label || type },
  { title: 'Số bài', dataIndex: 'articles', key: 'articles', align: 'right' },
  { title: 'Lượt xem', dataIndex: 'views', key: 'views', align: 'right', render: (n) => n.toLocaleString('vi-VN') },
  { title: 'Xem nhiều nhất', dataIndex: 'top', key: 'top', render: (top) => (top ? `${top.title} (${top.view_count.toLocaleString('vi-VN')})` : '-') },
];

function Tile({ icon, title, value, sub, onClick }) {
  return (
    <Card size="small" className={`shadow-sm h-full ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`} onClick={onClick}>
      <div className="flex items-center gap-2 text-gray-500 text-sm">{icon}{title}</div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </Card>
  );
}

// Tổng quan cho quản lý (ADMIN / GEN_MANAGER): số liệu thật hôm nay, doanh thu 14 ngày, cảnh báo kho, việc cần duyệt
function ManagerDashboard() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const today = dayjs();
    const from14 = today.subtract(13, 'day');
    Promise.all([
      fetchRevenue(from14, today),
      fetchRevenue(today.startOf('month'), today),
      axios.get(`${API}/booking/reports/today`, authConfig()),
      axios.get(`${API}/commerce/reports/overview`, authConfig()),
      axios.get(`${API}/commerce/materials`, authConfig()),
      axios.get(`${API}/media/pages/stats`, authConfig()).catch(() => null), // số liệu nội dung lỗi thì vẫn hiện phần còn lại
    ]).then(([rev14, revMonth, todayRes, overview, materials, contentStats]) => {
      const todayKey = today.format('YYYY-MM-DD');
      const todayRow = rev14.days.find((d) => d.date === todayKey);
      setState({
        chart: toChartData(rev14.days, from14, today).bars,
        revenueToday: todayRow ? Object.entries(todayRow).filter(([k]) => k !== 'date').reduce((s, [, v]) => s + v, 0) : 0,
        revenueMonth: revMonth.total,
        today: todayRes.data.data,
        overview: overview.data.data,
        materialAlerts: (materials.data.data || []).filter((m) => m.status !== 'OK'),
        content: contentStats?.data?.data || null,
      });
    }).catch((e) => setError(e.response?.data?.message || 'Không tải được số liệu tổng quan'));
  }, []);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (!state) return <div className="flex justify-center py-16"><Spin size="large" /></div>;
  const { overview, today } = state;
  const stockAlerts = [
    ...state.materialAlerts.map((m) => ({ key: m.id, kind: 'Vật tư', name: m.name, detail: `Còn ${m.stock} ${m.unit} • ${MATERIAL_STATUS[m.status]}`, pending: m.purchase_pending, out: m.status === 'OUT' })),
    ...overview.product_alerts.map((p) => ({ key: p.id, kind: 'Mỹ phẩm', name: p.name, detail: `Còn ${p.stock} • bán ${p.sold_30d}/30 ngày${p.days_left !== null ? ` • đủ ~${p.days_left} ngày` : ''}`, pending: p.purchase_pending, out: p.status === 'OUT' })),
  ];

  return (
    <div className="space-y-4">
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><Tile icon={<DollarOutlined />} title="Doanh thu hôm nay" value={vnd(state.revenueToday)} sub={`Tháng này: ${vnd(state.revenueMonth)}`} onClick={() => navigate('/reports')} /></Col>
        <Col xs={12} lg={6}><Tile icon={<CalendarOutlined />} title="Lịch hẹn hôm nay" value={today.appointments_today} sub={`${today.waiting_checkout} khách chờ thu tiền`} /></Col>
        <Col xs={12} lg={6}><Tile icon={<ShoppingCartOutlined />} title="Đơn mỹ phẩm cần xử lý" value={overview.pending_orders} sub="Chờ thanh toán / duyệt / đóng gói" /></Col>
        <Col xs={12} lg={6}><Tile icon={<InboxOutlined />} title="Đề xuất nhập hàng chờ duyệt" value={overview.pending_purchase} sub={`${overview.approved_not_received} đã duyệt, chờ hàng về`} onClick={() => navigate('/materials?tab=purchase')} /></Col>
      </Row>

      {stockAlerts.length > 0 ? (
        <Card size="small" title={<span className="text-red-600"><WarningOutlined /> Sắp hết hàng – cần nhập ({stockAlerts.length})</span>}
          extra={<Button size="small" type="primary" onClick={() => navigate('/materials?tab=purchase')}>Xem đề xuất nhập</Button>}>
          <List size="small" dataSource={stockAlerts}
            renderItem={(a) => (
              <List.Item>
                <Space wrap>
                  <Tag color={a.out ? 'red' : 'orange'}>{a.out ? 'Hết hàng' : 'Sắp hết'}</Tag>
                  <Tag>{a.kind}</Tag>
                  <b>{a.name}</b>
                  <span className="text-gray-500 text-sm">{a.detail}</span>
                  {a.pending ? <Tag color="blue">Đã có đề xuất nhập</Tag> : <Tag color="gold">Chưa có đề xuất</Tag>}
                </Space>
              </List.Item>
            )} />
        </Card>
      ) : <Alert type="success" showIcon message="Kho vật tư và mỹ phẩm đủ dùng, chưa có mặt hàng nào sắp hết." />}

      <Card size="small" title={<span><LineChartOutlined /> Doanh thu 14 ngày gần nhất</span>} extra={<Button size="small" onClick={() => navigate('/reports')}>Báo cáo chi tiết</Button>}>
        <StackedBarChart data={state.chart} series={GROUPS} height={220} />
      </Card>

      {state.content && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <Card size="small" className="h-full" title="Lượt bấm banner và popup" extra={<Button size="small" onClick={() => navigate('/content?tab=banners')}>Quản lý trang</Button>}>
              <Table size="small" rowKey="id" pagination={false} columns={CLICK_COLUMNS} dataSource={state.content.clicks} locale={{ emptyText: 'Chưa có banner hoặc popup' }} />
            </Card>
          </Col>
          <Col xs={24} lg={14}>
            <Card size="small" className="h-full" title="Bài viết theo loại">
              <Table size="small" rowKey="type" pagination={false} columns={ARTICLE_COLUMNS} dataSource={state.content.by_type} scroll={{ x: 520 }} locale={{ emptyText: 'Chưa có bài viết đã đăng' }} />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const user = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
  const isManager = ['ADMIN', 'GEN_MANAGER'].includes(user.role);
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Tổng quan hệ thống</h2>
      {isManager ? <ManagerDashboard /> : (
        <Alert type="info" showIcon message={`Xin chào ${user.Profile?.full_name || ''}! Chọn chức năng ở menu bên trái để bắt đầu làm việc.`} />
      )}
    </div>
  );
}
