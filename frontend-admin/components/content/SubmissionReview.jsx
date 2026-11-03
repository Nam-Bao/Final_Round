import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Segmented, Drawer, Space, Modal, Input, Switch, Form, Alert, Tabs, message, Spin } from 'antd';
import { CheckOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { ArticlePreview, ReviewHistory } from './SubmissionView';
import { MEDIA_API, CLIENT_URL, authConfig, errorText, validateForm, SUBMISSION_STATUS, ARTICLE_TYPES } from './contentApi';

// Quản lý duyệt bài nghiên cứu bác sĩ gửi: duyệt => tự đăng lên web; không duyệt => bắt buộc ghi lý do / yêu cầu sửa
export default function SubmissionReview({ onPendingChange }) {
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState(null); // 'approve' | 'changes'
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${MEDIA_API}/news/submissions`, { ...authConfig(), params: status ? { status } : {} });
      setRows(res.data.data || []);
      onPendingChange?.(res.data.pending || 0);
    } catch (err) {
      message.error(errorText(err, 'Không tải được danh sách bài gửi duyệt'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]);

  const openDetail = async (id) => {
    setDetail({ id });
    setDetailLoading(true);
    try {
      const res = await axios.get(`${MEDIA_API}/news/submissions/${id}`, authConfig());
      setDetail(res.data.data);
    } catch (err) {
      message.error(errorText(err, 'Không tải được bài viết'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitAction = async () => {
    const values = await validateForm(form);
    if (!values) return;
    setBusy(true);
    try {
      const url = `${MEDIA_API}/news/submissions/${detail.id}/${action === 'approve' ? 'approve' : 'request-changes'}`;
      const res = await axios.post(url, values, authConfig());
      message.success(res.data.message);
      setAction(null);
      setDetail(null);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không thực hiện được'));
    } finally {
      setBusy(false);
    }
  };

  const openAction = (type) => {
    form.resetFields();
    form.setFieldsValue({ note: '', is_featured: false });
    setAction(type);
  };

  const columns = [
    {
      title: 'Bài viết', key: 'title', render: (_, s) => (
        <div className="flex gap-3 items-center min-w-[240px]">
          {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" className="w-16 h-11 rounded object-cover shrink-0" /> : <div className="w-16 h-11 rounded bg-gray-100 shrink-0" />}
          <div>
            <div className="font-medium line-clamp-2">{s.title}</div>
            <Tag color={ARTICLE_TYPES[s.article_type || 'RESEARCH']?.color} className="!mt-1">{ARTICLE_TYPES[s.article_type || 'RESEARCH']?.label}</Tag>
          </div>
        </div>
      ),
    },
    { title: 'Bác sĩ', key: 'author', width: 180, render: (_, s) => <div><div>{s.author_name}</div><div className="text-xs text-gray-500">{s.author_title}</div></div> },
    { title: 'Bản', dataIndex: 'version', width: 70, align: 'center', render: (v) => <Tag>v{v}</Tag> },
    { title: 'Gửi lúc', dataIndex: 'submitted_at', width: 140, render: (v) => v ? dayjs(v).format('HH:mm DD/MM/YYYY') : '—' },
    { title: 'Trạng thái', dataIndex: 'status', width: 140, render: (v) => <Tag color={SUBMISSION_STATUS[v]?.color}>{SUBMISSION_STATUS[v]?.label || v}</Tag> },
    { title: '', key: 'open', width: 110, render: (_, s) => <Button type={s.status === 'PENDING' ? 'primary' : 'default'} size="small" icon={<EyeOutlined />} onClick={() => openDetail(s.id)}>{s.status === 'PENDING' ? 'Duyệt' : 'Xem'}</Button> },
  ];

  return (
    <div className="space-y-3">
      <Segmented value={status} onChange={setStatus} options={[
        { value: 'PENDING', label: 'Chờ duyệt' },
        { value: 'CHANGES_REQUESTED', label: 'Đã yêu cầu sửa' },
        { value: 'APPROVED', label: 'Đã duyệt' },
        { value: '', label: 'Tất cả' },
      ]} />
      <Table rowKey="id" size="middle" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 900 }} pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: status === 'PENDING' ? 'Không có bài nào chờ duyệt' : 'Không có bài viết' }} />

      <Drawer open={!!detail} onClose={() => setDetail(null)} size={Math.min(980, window.innerWidth)} destroyOnHidden
        title={detail?.title ? <span>Bài của {detail.author_name} <Tag className="ml-1">v{detail.version}</Tag><Tag color={SUBMISSION_STATUS[detail.status]?.color}>{SUBMISSION_STATUS[detail.status]?.label}</Tag></span> : 'Đang tải...'}
        extra={detail?.status === 'PENDING' && (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => openAction('changes')}>Yêu cầu chỉnh sửa</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => openAction('approve')}>Duyệt & đăng</Button>
          </Space>
        )}>
        <Spin spinning={detailLoading}>
          {detail?.title && (
            <>
              {detail.article && (
                <Alert className="mb-4" type={detail.status === 'APPROVED' ? 'success' : 'info'} showIcon
                  message={detail.status === 'APPROVED' ? 'Bài đang hiển thị trên website' : 'Đây là bản sửa của bài đã đăng. Duyệt sẽ cập nhật bài trên website.'}
                  action={<Button size="small" href={`${CLIENT_URL}/news/${detail.article.slug}`} target="_blank">Xem trên web</Button>} />
              )}
              <Tabs items={[
                { key: 'content', label: 'Nội dung', children: <ArticlePreview article={detail} authorName={detail.author_name} authorAvatar={detail.author_avatar} /> },
                { key: 'history', label: `Lịch sử duyệt (${detail.reviews?.length || 0})`, children: <ReviewHistory submission={detail} /> },
              ]} />
            </>
          )}
        </Spin>
      </Drawer>

      <Modal open={!!action} onCancel={() => setAction(null)} onOk={submitAction} confirmLoading={busy} destroyOnHidden
        title={action === 'approve' ? 'Duyệt và đăng bài' : 'Yêu cầu bác sĩ chỉnh sửa'}
        okText={action === 'approve' ? 'Duyệt & đăng' : 'Gửi yêu cầu'} okButtonProps={{ danger: action === 'changes' }}>
        <Form form={form} layout="vertical">
          {action === 'approve' ? (
            <>
              <p className="text-gray-600">Bài sẽ được đăng ngay lên trang Tin tức, tab <b>{ARTICLE_TYPES[detail?.article_type || 'RESEARCH']?.label}</b>.</p>
              <Form.Item name="is_featured" label="Ghim lên đầu trang Tin tức" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="note" label="Nhận xét gửi bác sĩ (không bắt buộc)"><Input.TextArea rows={3} maxLength={2000} /></Form.Item>
            </>
          ) : (
            <Form.Item name="note" label="Lý do không duyệt / nội dung cần chỉnh sửa"
              rules={[{ required: true, message: 'Vui lòng ghi rõ yêu cầu' }, { min: 10, message: 'Ít nhất 10 ký tự' }]}
              extra="Bác sĩ sẽ thấy nội dung này và sửa bài theo yêu cầu. Bản đã gửi vẫn được lưu lại.">
              <Input.TextArea rows={5} maxLength={2000} showCount placeholder={'VD:\n- Bổ sung cỡ mẫu và thời gian nghiên cứu\n- Ghi nguồn cho số liệu ở mục 2'} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
