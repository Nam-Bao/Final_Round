import React, { useEffect, useState } from 'react';
import { Tabs, Badge, Result } from 'antd';
import { FileTextOutlined, AuditOutlined, PictureOutlined, NotificationOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ArticleManager from '../components/content/ArticleManager';
import SubmissionReview from '../components/content/SubmissionReview';
import BannerManager from '../components/content/BannerManager';
import PopupManager from '../components/content/PopupManager';
import { MEDIA_API, authConfig } from '../components/content/contentApi';

const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];

// Quản lý trang web khách hàng: bài viết, duyệt bài bác sĩ, banner trang chủ, popup quảng cáo
export default function ContentManagementPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'articles';
  const [pending, setPending] = useState(0);
  let role = '';
  try { role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi => không có quyền */ }

  useEffect(() => {
    if (!MANAGER_ROLES.includes(role)) return;
    axios.get(`${MEDIA_API}/news/submissions`, { ...authConfig(), params: { status: 'PENDING' } })
      .then((res) => setPending(res.data.pending || 0))
      .catch(() => {});
  }, [role]);

  if (!MANAGER_ROLES.includes(role)) return <Result status="403" title="Chỉ quản lý được truy cập trang này" />;

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Quản lý trang</h2>
      <p className="text-gray-500 mb-4">Nội dung hiển thị trên website khách hàng.</p>
      <Tabs activeKey={tab} onChange={(key) => setParams({ tab: key })} destroyOnHidden items={[
        { key: 'articles', label: <span><FileTextOutlined /> Bài viết & tin tức</span>, children: <ArticleManager /> },
        {
          key: 'review', label: <Badge count={pending} size="small" offset={[10, -2]}><span><AuditOutlined /> Duyệt bài bác sĩ</span></Badge>,
          children: <SubmissionReview onPendingChange={setPending} />,
        },
        { key: 'banners', label: <span><PictureOutlined /> Banner trang chủ</span>, children: <BannerManager /> },
        { key: 'popups', label: <span><NotificationOutlined /> Popup quảng cáo</span>, children: <PopupManager /> },
      ]} />
    </div>
  );
}
