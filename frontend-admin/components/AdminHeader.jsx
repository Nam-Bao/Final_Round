import React from 'react'
import { Layout } from 'antd'

const { Header } = Layout

export default function AdminHeader({ title = "Xin chào, Bác sĩ Da liễu" }) {
  return (
    <Header className="bg-white shadow-sm flex items-center px-6 text-lg font-semibold">
      {title}
    </Header>
  )
}