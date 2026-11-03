import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Form, Alert, Input, Modal, Popconfirm, Tooltip, Spin, Collapse, Result, message } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, RollbackOutlined, DeleteOutlined, ArrowLeftOutlined, SendOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import ArticleFields, { toFormValues, fromFormValues } from '../components/content/ArticleFields';
import { ArticlePreview, ReviewHistory } from '../components/content/SubmissionView';
import { MEDIA_API, CLIENT_URL, authConfig, errorText, validateForm, SUBMISSION_STATUS, ARTICLE_TYPES } from '../components/content/contentApi';

const API = `${MEDIA_API}/news/submissions`;
const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED', 'APPROVED'];

// Bác sĩ viết bài nghiên cứu và gửi quản lý duyệt. Bị yêu cầu chỉnh sửa thì sửa theo góp ý rồi gửi lại;
// mọi bản đã gửi được lưu trong lịch sử duyệt.
export default function MyArticlesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null: danh sách | {}: bài mới | bài đang sửa (kèm lịch sử)
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState('');
  const [submitNote, setSubmitNote] = useState(null); // ghi chú gửi kèm khi gửi lại
  const [viewing, setViewing] = useState(null);
  const [form] = Form.useForm();
  let role = '';
  try { role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi */ }

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/mine`, authConfig());
      setRows(res.data.data || []);
    } catch (err) {
      message.error(errorText(err, 'Không tải được bài viết của bạn'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (role === 'DOCTOR') load(); }, [role]);

  const fetchDetail = async (id) => (await axios.get(`${API}/${id}`, authConfig())).data.data;

  const openEditor = async (row) => {
    form.resetFields();
    if (!row) {
      setEditing({});
      // Lấy lại chức danh đã dùng ở bài gần nhất cho đỡ phải nhập
      form.setFieldsValue({ article_type: 'RESEARCH', tags: [], author_title: rows.find((r) => r.author_title)?.author_title });
      return;
    }
    setEditing({ id: row.id, status: row.status });
    setLoadingDetail(true);
    try {
      const data = await fetchDetail(row.id);
      setEditing(data);
      form.setFieldsValue(toFormValues(data));
    } catch (err) {
      message.error(errorText(err, 'Không tải được bài viết'));
      setEditing(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openView = async (row) => {
    setViewing({ id: row.id });
    try {
      setViewing(await fetchDetail(row.id));
    } catch (err) {
      message.error(errorText(err, 'Không tải được bài viết'));
      setViewing(null);
    }
  };

  const save = async (submit, note = '') => {
    if (!(await validateForm(form, submit ? undefined : ['title']))) return;
    const payload = { ...fromFormValues(form.getFieldsValue(true)), submit, note };
    setSaving(submit ? 'submit' : 'draft');
    try {
      const res = editing.id ? await axios.put(`${API}/${editing.id}`, payload, authConfig()) : await axios.post(API, payload, authConfig());
      message.success(res.data.message);
      setSubmitNote(null);
      if (submit) {
        setEditing(null);
      } else {
        const data = await fetchDetail(res.data.data.id);
        setEditing(data);
      }
      load();
    } catch (err) {
      message.error(errorText(err, 'Không lưu được bài viết'));
    } finally {
      setSaving('');
    }
  };

  const act = async (request, done) => {
    try {
      await request();
      message.success(done);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không thực hiện được'));
    }
  };

  if (role !== 'DOCTOR') return <Result status="403" title="Chỉ bác sĩ được viết bài nghiên cứu" />;

  // ===== Màn hình soạn bài =====
  if (editing) {
    const resubmit = editing.version > 0;
    return (
      <Spin spinning={loadingDetail}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setEditing(null)}>Danh sách</Button>
            <h2 className="text-xl font-bold !mb-0">{editing.id ? 'Sửa bài viết' : 'Bài viết mới'}</h2>
            {editing.status && <Tag color={SUBMISSION_STATUS[editing.status]?.color}>{SUBMISSION_STATUS[editing.status]?.label}</Tag>}
            {editing.version > 0 && <Tag>Đã gửi {editing.version} lần</Tag>}
          </Space>
          {EDITABLE.includes(editing.status || 'DRAFT') && (
            <Space>
              <Button icon={<SaveOutlined />} loading={saving === 'draft'} onClick={() => save(false)}>Lưu nháp</Button>
              <Button type="primary" icon={<SendOutlined />} loading={saving === 'submit'} onClick={() => (resubmit ? setSubmitNote('') : save(true))}>
                {resubmit ? 'Gửi duyệt lại' : 'Gửi quản lý duyệt'}
              </Button>
            </Space>
          )}
        </div>

        {editing.status === 'CHANGES_REQUESTED' && editing.review_note && (
          <Alert type="warning" showIcon className="mb-4" message="Quản lý yêu cầu chỉnh sửa"
            description={<div className="whitespace-pre-line">{editing.review_note}</div>} />
        )}
        {editing.status === 'PENDING' && <Alert type="info" showIcon className="mb-4" message="Bài đang chờ duyệt. Rút bài về ở danh sách nếu cần sửa tiếp." />}
        {editing.article && editing.status !== 'PENDING' && (
          <Alert type="info" showIcon className="mb-4"
            message="Bài này đang hiển thị trên website. Chỉnh sửa sẽ cần quản lý duyệt lại; trong lúc chờ, website vẫn hiện bản đã duyệt."
            action={<Button size="small" href={`${CLIENT_URL}/news/${editing.article.slug}`} target="_blank">Xem trên web</Button>} />
        )}

        <Form form={form} layout="vertical" scrollToFirstError className="[&_.ant-form-item]:mb-3 max-w-5xl" disabled={editing.status === 'PENDING'}>
          <ArticleFields research />
        </Form>

        {editing.reviews?.length > 0 && (
          <Collapse className="max-w-5xl mt-4" items={[{ key: 'h', label: `Lịch sử duyệt (${editing.reviews.length})`, children: <ReviewHistory submission={editing} /> }]} />
        )}

        <Modal title="Gửi duyệt lại" open={submitNote !== null} onCancel={() => setSubmitNote(null)} okText="Gửi" confirmLoading={saving === 'submit'}
          onOk={() => save(true, submitNote)}>
          <p className="text-gray-600 mb-2">Ghi chú cho quản lý về những gì đã chỉnh sửa (không bắt buộc):</p>
          <Input.TextArea rows={4} maxLength={1000} showCount value={submitNote || ''} onChange={(e) => setSubmitNote(e.target.value)}
            placeholder="VD: Đã bổ sung cỡ mẫu ở mục 2 và thêm 2 tài liệu tham khảo" />
        </Modal>
      </Spin>
    );
  }

  // ===== Danh sách bài của tôi =====
  const columns = [
    {
      title: 'Bài viết', key: 'title', render: (_, s) => (
        <div className="flex gap-3 items-center min-w-[240px]">
          {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" className="w-16 h-11 rounded object-cover shrink-0" /> : <div className="w-16 h-11 rounded bg-gray-100 shrink-0" />}
          <div>
            <div className="font-medium line-clamp-2">{s.title}</div>
            {s.status === 'CHANGES_REQUESTED' && s.review_note && <div className="text-xs text-orange-600 line-clamp-1">Yêu cầu: {s.review_note}</div>}
          </div>
        </div>
      ),
    },
    { title: 'Loại bài', dataIndex: 'article_type', width: 150, render: (v) => { const t = ARTICLE_TYPES[v || 'RESEARCH']; return <Tag color={t?.color}>{t?.label}</Tag>; } },
    { title: 'Trạng thái', dataIndex: 'status', width: 150, render: (v) => <Tag color={SUBMISSION_STATUS[v]?.color}>{SUBMISSION_STATUS[v]?.label || v}</Tag> },
    { title: 'Số lần gửi', dataIndex: 'version', width: 100, align: 'center' },
    { title: 'Cập nhật', dataIndex: 'updatedAt', width: 140, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
    {
      title: '', key: 'actions', width: 170, render: (_, s) => (
        <Space size={0}>
          <Tooltip title="Xem"><Button type="text" icon={<EyeOutlined />} onClick={() => openView(s)} /></Tooltip>
          {EDITABLE.includes(s.status) && <Tooltip title="Sửa"><Button type="text" icon={<EditOutlined />} onClick={() => openEditor(s)} /></Tooltip>}
          {s.status === 'PENDING' && (
            <Popconfirm title="Rút bài về bản nháp để sửa?" onConfirm={() => act(() => axios.post(`${API}/${s.id}/withdraw`, {}, authConfig()), 'Đã rút bài về bản nháp')}>
              <Tooltip title="Rút bài"><Button type="text" icon={<RollbackOutlined />} /></Tooltip>
            </Popconfirm>
          )}
          {s.status === 'DRAFT' && s.version === 0 && (
            <Popconfirm title="Xóa bản nháp này?" onConfirm={() => act(() => axios.delete(`${API}/${s.id}`, authConfig()), 'Đã xóa bản nháp')}>
              <Tooltip title="Xóa nháp"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const needFix = rows.filter((r) => r.status === 'CHANGES_REQUESTED').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="text-xl font-bold !mb-0">Bài viết của tôi</h2>
          <p className="text-gray-500 !mb-0">Bài nghiên cứu, kiến thức da liễu, chăm sóc da được quản lý duyệt sẽ tự động đăng lên trang Tin tức.</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>Viết bài mới</Button>
      </div>
      {needFix > 0 && <Alert type="warning" showIcon message={`Có ${needFix} bài quản lý yêu cầu chỉnh sửa`} />}
      <Table rowKey="id" size="middle" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 800 }} pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: 'Bạn chưa có bài viết nào' }} />

      <Modal open={!!viewing} onCancel={() => setViewing(null)} footer={null} width={900} centered destroyOnHidden
        title={viewing?.title ? <Space>Xem bài <Tag color={SUBMISSION_STATUS[viewing.status]?.color}>{SUBMISSION_STATUS[viewing.status]?.label}</Tag></Space> : 'Đang tải...'}
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}>
        {viewing?.title ? (
          <>
            <ArticlePreview article={viewing} authorName={viewing.author_name} authorAvatar={viewing.author_avatar} />
            {viewing.reviews?.length > 0 && (
              <div className="max-w-3xl mx-auto mt-6 border-t pt-4">
                <div className="font-semibold mb-3">Lịch sử duyệt</div>
                <ReviewHistory submission={viewing} />
              </div>
            )}
          </>
        ) : <div className="py-16 flex justify-center"><Spin /></div>}
      </Modal>
    </div>
  );
}
