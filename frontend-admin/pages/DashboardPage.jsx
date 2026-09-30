import { Row, Col, Card, Statistic } from 'antd';
import { UserOutlined, ShoppingCartOutlined, CalendarOutlined } from '@ant-design/icons';

export default function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Tổng quan hệ thống</h2>
      
      <Row gutter={16}>
        <Col span={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Khách hàng mới" value={112} prefix={<UserOutlined />} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Đơn hàng chờ duyệt" value={15} prefix={<ShoppingCartOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Lịch hẹn hôm nay" value={9} prefix={<CalendarOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
      </Row>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
        Khu vực này sau này sẽ chứa các biểu đồ báo cáo doanh thu và tình trạng khám da liễu.
      </div>
    </div>
  );
}