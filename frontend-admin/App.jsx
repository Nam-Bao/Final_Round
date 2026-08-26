import React from 'react'
import { Layout, Card, Statistic, Row, Col } from 'antd'
import { CalendarOutlined, ShoppingOutlined, UserOutlined } from '@ant-design/icons'

// Import components
import AdminSidebar from './components/AdminSidebar'
import AdminHeader from './components/AdminHeader'

const { Content } = Layout

export default function App() {
  return (
    <Layout className="min-h-screen">
      <AdminSidebar />
      <Layout>
        <AdminHeader title="Bảng điều khiển Trung tâm" />
        <Content className="p-6 bg-slate-50">
          <Row gutter={16}>
            <Col span={8}>
              <Card bordered={false} className="shadow-sm">
                <Statistic title="Lịch hẹn hôm nay" value={12} prefix={<CalendarOutlined />} />
              </Card>
            </Col>
            <Col span={8}>
              <Card bordered={false} className="shadow-sm">
                <Statistic title="Đơn hàng chờ" value={5} prefix={<ShoppingOutlined />} valueStyle={{ color: '#cf1322' }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card bordered={false} className="shadow-sm">
                <Statistic title="Khách hàng mới" value={112} prefix={<UserOutlined />} valueStyle={{ color: '#3f8600' }} />
              </Card>
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  )
}