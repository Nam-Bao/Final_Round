// Nhập hàng (kiểu Odoo rút gọn). Quản lý: đề xuất → đơn đặt hàng (email + PDF cho nhà cung cấp) → kiểm tra biên bản / kiểm kho, nhà cung cấp.
// NVBH: nhận hàng theo đơn, kiểm kho tuần, đề xuất nhập mỹ phẩm, xem biên bản của mình.
import React from 'react';
import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import RequestsTab from '../components/purchasing/RequestsTab';
import OrdersTab from '../components/purchasing/OrdersTab';
import ReceiveTab from '../components/purchasing/ReceiveTab';
import ReceiptsTab from '../components/purchasing/ReceiptsTab';
import StockCountTab from '../components/purchasing/StockCountTab';
import SuppliersTab from '../components/purchasing/SuppliersTab';
import { role, isManagerRole } from '../components/purchasing/common';

export default function PurchasingPage() {
  const manager = isManagerRole(role());
  const tabs = manager
    ? [
      { key: 'requests', label: 'Đề xuất nhập', children: <RequestsTab /> },
      { key: 'orders', label: 'Đơn đặt hàng', children: <OrdersTab /> },
      { key: 'receive', label: 'Nhận hàng', children: <ReceiveTab /> },
      { key: 'receipts', label: 'Biên bản nhận hàng', children: <ReceiptsTab /> },
      { key: 'counts', label: 'Kiểm kho', children: <StockCountTab /> },
      { key: 'suppliers', label: 'Nhà cung cấp', children: <SuppliersTab /> },
    ]
    : [
      { key: 'receive', label: 'Nhận hàng', children: <ReceiveTab /> },
      { key: 'counts', label: 'Kiểm kho tuần', children: <StockCountTab /> },
      { key: 'requests', label: 'Đề xuất nhập', children: <RequestsTab productType="PRODUCT" /> },
      { key: 'receipts', label: 'Biên bản của tôi', children: <ReceiptsTab /> },
    ];
  const [params, setParams] = useSearchParams();
  const active = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab') : tabs[0].key;
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-bold m-0 mb-4">{manager ? 'Nhập hàng & Kiểm kho' : 'Kho mỹ phẩm'}</h2>
      <Tabs activeKey={active} onChange={(k) => setParams({ tab: k }, { replace: true })} items={tabs} destroyOnHidden />
    </div>
  );
}
