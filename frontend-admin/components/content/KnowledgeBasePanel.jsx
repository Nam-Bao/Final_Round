// Kho kiến thức AI (RAG): tình trạng nạp + nút nạp lại ngay cho quản lý.
// Kho tự nạp mỗi 30 phút; sau khi sửa giá, sản phẩm, bài viết, chính sách hay quy tắc an toàn mà muốn chatbot / trợ lý AI
// cập nhật ngay thì bấm "Nạp lại ngay" (chỉ tạo lại embedding cho phần đã đổi).
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Table, Tag, message } from 'antd';
import { ReloadOutlined, DatabaseOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE } from '../../config';

const API = `${API_BASE}/api/ai/knowledge`;
const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const NS = {
  CHAT: { label: 'Chatbot khách hàng', note: 'Dịch vụ, gói liệu trình, sản phẩm, bài viết, bác sĩ, chuyên gia, chính sách, thông tin phòng khám' },
  SAFETY: { label: 'AI rà soát đơn kê', note: 'Quy tắc an toàn đang áp dụng kèm nguồn y khoa' },
  HANDBOOK: { label: 'Trợ lý nhân viên (Hỏi quy trình)', note: 'Sổ tay quy trình nội bộ + chính sách khách hàng' },
};

export default function KnowledgeBasePanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = () => {
    setLoading(true);
    axios.get(`${API}/status`, auth()).then((r) => setStatus(r.data.data)).catch(() => message.error('Không tải được tình trạng kho kiến thức')).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const reindex = async () => {
    setRunning(true);
    try {
      const r = await axios.post(`${API}/reindex`, {}, { ...auth(), timeout: 300000 });
      const errs = r.data.data.filter((x) => x.error || x.failed_sources?.length);
      if (errs.length) message.warning('Đã nạp, nhưng có nguồn bị lỗi (xem bảng)'); else message.success(r.data.message);
      load();
    } catch (e) { message.error(e.response?.data?.message || 'Không nạp được kho kiến thức'); } finally { setRunning(false); }
  };

  const rows = Object.entries(NS).map(([key, meta]) => ({ key, ...meta, ...(status?.[key] || {}) }));
  return (
    <Card title={<span><DatabaseOutlined /> Kho kiến thức AI</span>}
      extra={<Button type="primary" icon={<ReloadOutlined />} loading={running} onClick={reindex}>Nạp lại ngay</Button>}>
      <Alert className="mb-3" type="info" showIcon
        title="Chatbot và trợ lý AI chỉ trả lời theo kho này, kho tự cập nhật mỗi 30 phút."
        description="Vừa sửa giá, sản phẩm, bài viết, chính sách hoặc duyệt quy tắc an toàn mà cần AI biết ngay thì bấm Nạp lại ngay. Hệ thống chỉ tạo lại phần đã thay đổi." />
      <Table size="small" rowKey="key" loading={loading} pagination={false} dataSource={rows} columns={[
        { title: 'Kho', dataIndex: 'label', render: (v, r) => <div><b>{v}</b><div className="text-xs text-gray-500">{r.note}</div></div> },
        { title: 'Số đoạn', dataIndex: 'total', align: 'right', render: (v) => v ?? '-' },
        { title: 'Lần nạp gần nhất', dataIndex: 'at', render: (v, r) => (v ? <div>{dayjs(v).format('HH:mm DD/MM/YYYY')}<div className="text-xs text-gray-500">+{r.added || 0} mới · {r.updated || 0} sửa · {r.removed || 0} xóa</div></div> : 'Chưa nạp từ khi khởi động') },
        { title: 'Tình trạng', key: 's', render: (_, r) => (r.error ? <Tag color="red">Lỗi: {r.error}</Tag> : r.failed_sources?.length ? <Tag color="orange">Lỗi nguồn: {r.failed_sources.join('; ')}</Tag> : r.at ? <Tag color="green">Bình thường</Tag> : <Tag>Đang chờ</Tag>) },
      ]} />
    </Card>
  );
}
