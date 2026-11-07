import React, { useEffect, useMemo, useState } from 'react';
import { Table, Tag, Button, Space, Input, Select, Modal, Form, Row, Col, Radio, Switch, DatePicker, Tooltip, Popconfirm, message, Spin } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, PushpinFilled, PushpinOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import ArticleFields, { toFormValues, fromFormValues } from './ArticleFields';
import { MEDIA_API, CLIENT_URL, authConfig, errorText, validateForm, ARTICLE_TYPES, ARTICLE_TYPE_OPTIONS } from './contentApi';

const STATUS = {
  PUBLISHED: { color: 'green', label: 'Đang đăng' },
  DRAFT: { color: 'default', label: 'Bản nháp' },
  HIDDEN: { color: 'red', label: 'Đã ẩn' },
};

const isScheduled = (a) => a.status === 'PUBLISHED' && dayjs(a.published_at).isAfter(dayjs());

// Quản lý toàn bộ bài viết trên web: tạo / sửa / ẩn / ghim / hẹn giờ đăng
export default function ArticleManager() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ q: '', status: '', type: '' });
  const [editing, setEditing] = useState(null); // null: đóng | {}: tạo mới | bài viết
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${MEDIA_API}/news/admin`, authConfig());
      setArticles(res.data.data || []);
    } catch (err) {
      message.error(errorText(err, 'Không tải được danh sách bài viết'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return articles.filter((a) =>
      (!q || a.title.toLowerCase().includes(q) || (a.author_name || '').toLowerCase().includes(q))
      && (!filters.status || (filters.status === 'SCHEDULED' ? isScheduled(a) : a.status === filters.status))
      && (!filters.type || a.article_type === filters.type));
  }, [articles, filters]);

  const openEditor = async (article) => {
    form.resetFields();
    if (!article) {
      setEditing({});
      form.setFieldsValue({ status: 'PUBLISHED', article_type: 'KNOWLEDGE', is_featured: false, author_name: 'Ban biên tập GlowSkin', tags: [] });
      return;
    }
    setEditing(article);
    setLoadingDetail(true);
    try {
      const res = await axios.get(`${MEDIA_API}/news/admin/${article.id}`, authConfig());
      const data = res.data.data;
      form.setFieldsValue({ ...toFormValues(data), published_at: data.published_at ? dayjs(data.published_at) : null });
    } catch (err) {
      message.error(errorText(err, 'Không tải được bài viết'));
      setEditing(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const save = async () => {
    if (!(await validateForm(form))) return;
    const values = fromFormValues(form.getFieldsValue(true));
    const payload = { ...values, published_at: values.published_at ? values.published_at.toISOString() : null };
    setSaving(true);
    try {
      const res = editing.id
        ? await axios.put(`${MEDIA_API}/news/${editing.id}`, payload, authConfig())
        : await axios.post(`${MEDIA_API}/news`, payload, authConfig());
      message.success(res.data.message);
      setEditing(null);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không lưu được bài viết'));
    } finally {
      setSaving(false);
    }
  };

  const quickUpdate = async (article, data, done) => {
    try {
      await axios.put(`${MEDIA_API}/news/${article.id}`, data, authConfig());
      message.success(done);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không cập nhật được'));
    }
  };

  const columns = [
    {
      title: 'Bài viết', key: 'title', render: (_, a) => (
        <div className="flex gap-3 items-center min-w-[260px]">
          {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" className="w-16 h-11 rounded object-cover shrink-0" /> : <div className="w-16 h-11 rounded bg-gray-100 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium line-clamp-2">{a.is_featured && <PushpinFilled className="text-orange-500 mr-1" />}{a.title}</div>
            <div className="text-xs text-gray-500">{a.author_name}{a.author_title ? ` · ${a.author_title}` : ''}</div>
          </div>
        </div>
      ),
    },
    { title: 'Loại bài', key: 'type', width: 150, render: (_, a) => { const t = ARTICLE_TYPES[a.article_type]; return t ? <Tag color={t.color}>{t.label}</Tag> : <Tag>{a.category}</Tag>; } },
    {
      title: 'Trạng thái', key: 'status', width: 120, render: (_, a) => isScheduled(a)
        ? <Tooltip title={`Tự đăng lúc ${dayjs(a.published_at).format('HH:mm DD/MM/YYYY')}`}><Tag color="gold">Hẹn giờ</Tag></Tooltip>
        : <Tag color={STATUS[a.status]?.color}>{STATUS[a.status]?.label || a.status}</Tag>,
    },
    { title: 'Lượt xem', dataIndex: 'view_count', width: 90, align: 'right', sorter: (a, b) => (a.view_count || 0) - (b.view_count || 0), render: (v) => (v || 0).toLocaleString('vi-VN') },
    { title: 'Ngày đăng', dataIndex: 'published_at', width: 110, sorter: (a, b) => dayjs(a.published_at).diff(dayjs(b.published_at)), render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : '—' },
    {
      title: '', key: 'actions', width: 150, fixed: 'right', render: (_, a) => (
        <Space size={0}>
          <Tooltip title="Sửa"><Button type="text" icon={<EditOutlined />} onClick={() => openEditor(a)} /></Tooltip>
          <Tooltip title={a.is_featured ? 'Bỏ ghim' : 'Ghim lên đầu trang Tin tức'}>
            <Button type="text" icon={a.is_featured ? <PushpinFilled className="text-orange-500" /> : <PushpinOutlined />}
              onClick={() => quickUpdate(a, { is_featured: !a.is_featured }, a.is_featured ? 'Đã bỏ ghim' : 'Đã ghim bài')} />
          </Tooltip>
          {a.status === 'PUBLISHED' && !isScheduled(a) && (
            <Tooltip title="Xem trên web"><Button type="text" icon={<EyeOutlined />} href={`${CLIENT_URL}/news/${a.slug}`} target="_blank" /></Tooltip>
          )}
          {a.status === 'PUBLISHED' ? (
            <Popconfirm title="Ẩn bài này khỏi website?" onConfirm={() => quickUpdate(a, { status: 'HIDDEN' }, 'Đã ẩn bài viết')}>
              <Tooltip title="Ẩn bài"><Button type="text" danger icon={<EyeInvisibleOutlined />} /></Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title="Đăng lại"><Button type="text" className="!text-green-600" icon={<EyeOutlined />} onClick={() => quickUpdate(a, { status: 'PUBLISHED' }, 'Đã đăng bài')} /></Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 justify-between">
        <Space wrap>
          <Input.Search allowClear placeholder="Tìm tiêu đề, tác giả" className="!w-64" onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
          <Select className="w-36" value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))}
            options={[{ value: '', label: 'Mọi trạng thái' }, { value: 'PUBLISHED', label: 'Đang đăng' }, { value: 'SCHEDULED', label: 'Hẹn giờ' }, { value: 'DRAFT', label: 'Bản nháp' }, { value: 'HIDDEN', label: 'Đã ẩn' }]} />
          <Select className="w-36" value={filters.type} onChange={(type) => setFilters((f) => ({ ...f, type }))}
            options={[{ value: '', label: 'Mọi loại bài' }, ...ARTICLE_TYPE_OPTIONS]} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>Viết bài mới</Button>
      </div>

      <Table rowKey="id" size="middle" loading={loading} dataSource={shown} columns={columns} scroll={{ x: 1000 }} pagination={{ pageSize: 10, showSizeChanger: false }} />

      <Modal title={editing?.id ? 'Sửa bài viết' : 'Viết bài mới'} open={!!editing} onCancel={() => setEditing(null)} onOk={save}
        okText={editing?.id ? 'Lưu thay đổi' : 'Tạo bài'} confirmLoading={saving} width={980} destroyOnHidden centered
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto', paddingRight: 8 } }}>
        <Spin spinning={loadingDetail}>
          <Form form={form} layout="vertical" scrollToFirstError className="[&_.ant-form-item]:mb-3">
            <div className="bg-slate-50 border rounded-lg p-3 mb-3">
              <Row gutter={12}>
                <Col xs={24} md={10}>
                  <Form.Item name="status" label="Trạng thái" className="!mb-0">
                    <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'PUBLISHED', label: 'Đăng' }, { value: 'DRAFT', label: 'Nháp' }, { value: 'HIDDEN', label: 'Ẩn' }]} />
                  </Form.Item>
                </Col>
                <Col xs={14} md={9}>
                  <Form.Item name="published_at" label="Ngày đăng / hẹn giờ" className="!mb-0" tooltip="Chọn thời điểm trong tương lai để bài tự đăng lúc đó">
                    <DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" className="w-full" placeholder="Đăng ngay" />
                  </Form.Item>
                </Col>
                <Col xs={10} md={5}>
                  <Form.Item name="is_featured" label="Ghim nổi bật" valuePropName="checked" className="!mb-0"><Switch /></Form.Item>
                </Col>
              </Row>
            </div>
            <Form.Item name="author_name" label="Tác giả hiển thị" rules={[{ max: 255 }]}>
              <Input placeholder="Ban biên tập GlowSkin" />
            </Form.Item>
            <ArticleFields seo />
          </Form>
        </Spin>
      </Modal>
    </div>
  );
}
