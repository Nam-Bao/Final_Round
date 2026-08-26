import React from 'react'
import { Layout, Menu } from 'antd'
import { DashboardOutlined, CalendarOutlined, ShoppingOutlined, UserOutlined } from '@ant-design/icons'

const { Sider } = Layout

export default function AdminSidebar() {
  return (
    <Sider theme="light" className="shadow-md">
      <div className="h-16 flex items-center justify-center font-bold text-lg text-blue-600 border-b">
        O2O ADMIN
      </div>
      <Menu
        mode="inline"
        defaultSelectedKeys={['1']}
        items={[
          { key: '1', icon: <DashboardOutlined />, label: 'Tổng quan' },
          { key: '2', icon: <CalendarOutlined />, label: 'Lịch khám' },
          { key: '3', icon: <ShoppingOutlined />, label: 'Đơn hàng' },
          { key: '4', icon: <UserOutlined />, label: 'Khách hàng' },
        ]}
      />
    </Sider>
  )
}