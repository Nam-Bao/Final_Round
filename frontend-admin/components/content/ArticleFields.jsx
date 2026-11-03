import React, { useRef, useState } from 'react';
import { Form, Input, Select, Button, Space, Tabs, Modal, Tooltip, message, Row, Col, Collapse } from 'antd';
import { PictureOutlined, VideoCameraOutlined, BoldOutlined, OrderedListOutlined, UnorderedListOutlined, LinkOutlined, UploadOutlined } from '@ant-design/icons';
import ArticleBody, { VideoEmbed } from './ArticleBody';
import { ARTICLE_TYPE_OPTIONS, DOCTOR_TYPE_OPTIONS, uploadImage, uploadVideo, pickFile } from './contentApi';

// Ô chọn ảnh / video: tải file từ máy hoặc dán đường dẫn https (YouTube với video)
export function MediaField({ value, onChange, kind = 'image', placeholder }) {
  const [busy, setBusy] = useState(false);
  const isVideo = kind === 'video';
  const handleUpload = async () => {
    const file = await pickFile(isVideo ? 'video/mp4,video/webm,video/quicktime' : 'image/*');
    if (!file) return;
    setBusy(true);
    try {
      onChange?.(await (isVideo ? uploadVideo(file) : uploadImage(file)));
      message.success(isVideo ? 'Đã tải video lên' : 'Đã tải ảnh lên');
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Tải lên thất bại');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Space.Compact className="w-full">
        <Input value={value || ''} onChange={(e) => onChange?.(e.target.value)} allowClear
          placeholder={placeholder || (isVideo ? 'Dán link YouTube hoặc tải video (mp4, tối đa 50MB)' : 'https://... hoặc tải ảnh lên')} />
        <Button icon={<UploadOutlined />} loading={busy} onClick={handleUpload}>{isVideo ? 'Tải video' : 'Tải ảnh'}</Button>
      </Space.Compact>
      {value && /^https:\/\//.test(value) && (
        isVideo
          ? <div className="max-w-md"><VideoEmbed url={value} /></div>
          : <img src={value} alt="" className="h-32 rounded-lg border object-cover" />
      )}
    </div>
  );
}

const SYNTAX_HELP = [
  ['## Tiêu đề mục', 'Tiêu đề lớn trong bài'],
  ['### Tiêu đề nhỏ', 'Tiêu đề con'],
  ['**chữ đậm**', 'In đậm'],
  ['- nội dung', 'Gạch đầu dòng (1. nội dung: danh sách số)'],
  ['> trích dẫn', 'Khung trích dẫn / lưu ý của bác sĩ'],
  ['[chữ](https://...)', 'Liên kết'],
  ['![chú thích](https://...)', 'Ảnh (nút Ảnh tự chèn)'],
  ['!video[chú thích](https://...)', 'Video YouTube / mp4 (nút Video tự chèn)'],
];

// Soạn nội dung bài viết: thanh công cụ chèn định dạng / ảnh / video + xem trước
export function ContentEditor({ value = '', onChange }) {
  const ref = useRef(null);
  const [tab, setTab] = useState('write');
  const [busy, setBusy] = useState(false);
  const [videoModal, setVideoModal] = useState(false);
  const [video, setVideo] = useState({ url: '', caption: '' });

  const textarea = () => ref.current?.resizableTextArea?.textArea;
  const selection = () => {
    const ta = textarea();
    return ta ? [ta.selectionStart, ta.selectionEnd] : [value.length, value.length];
  };
  const focusAt = (start, end = start) => requestAnimationFrame(() => {
    const ta = textarea();
    if (ta) { ta.focus(); ta.setSelectionRange(start, end); }
  });

  // Bọc chữ đang chọn (vd. **đậm**)
  const wrap = (before, after, placeholder) => {
    const [start, end] = selection();
    const selected = value.slice(start, end) || placeholder;
    onChange?.(value.slice(0, start) + before + selected + after + value.slice(end));
    focusAt(start + before.length, start + before.length + selected.length);
  };
  // Thêm tiền tố vào đầu dòng đang đứng (tiêu đề, danh sách, trích dẫn)
  const prefixLine = (prefix) => {
    const [start] = selection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    onChange?.(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    focusAt(start + prefix.length);
  };
  // Chèn một khối riêng (ảnh / video) trên dòng riêng, cách đoạn trước và sau một dòng trống
  const insertBlock = (block) => {
    const [, end] = selection();
    const before = value.slice(0, end);
    const after = value.slice(end);
    const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const tail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    onChange?.(before + lead + block + tail + after);
    focusAt((before + lead + block).length);
  };

  const handleImage = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    setBusy(true);
    try {
      insertBlock(`![Chú thích ảnh](${await uploadImage(file)})`);
      message.success('Đã chèn ảnh, hãy sửa phần chú thích trong ngoặc vuông');
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Tải ảnh thất bại');
    } finally {
      setBusy(false);
    }
  };

  const confirmVideo = () => {
    if (!/^https:\/\//.test(video.url.trim())) return message.error('Vui lòng dán link https hoặc tải video lên');
    insertBlock(`!video[${video.caption.trim().replace(/[[\]]/g, '')}](${video.url.trim()})`);
    setVideoModal(false);
    setVideo({ url: '', caption: '' });
  };

  const tools = [
    ['Tiêu đề mục', <span className="font-bold">H2</span>, () => prefixLine('## ')],
    ['Tiêu đề nhỏ', <span className="font-semibold">H3</span>, () => prefixLine('### ')],
    ['In đậm', <BoldOutlined />, () => wrap('**', '**', 'chữ đậm')],
    ['Gạch đầu dòng', <UnorderedListOutlined />, () => prefixLine('- ')],
    ['Danh sách số', <OrderedListOutlined />, () => prefixLine('1. ')],
    ['Trích dẫn', <span className="font-serif font-bold">❝</span>, () => prefixLine('> ')],
    ['Liên kết', <LinkOutlined />, () => wrap('[', '](https://)', 'chữ hiển thị')],
  ];

  return (
    <div className="border rounded-lg overflow-hidden">
      <Tabs activeKey={tab} onChange={setTab} size="small" className="[&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:px-3 bg-slate-50"
        tabBarExtraContent={tab === 'write' && (
          <Space size={2} wrap>
            {tools.map(([title, icon, fn]) => <Tooltip key={title} title={title}><Button size="small" type="text" onClick={fn}>{icon}</Button></Tooltip>)}
            <Button size="small" icon={<PictureOutlined />} loading={busy} onClick={handleImage}>Ảnh</Button>
            <Button size="small" icon={<VideoCameraOutlined />} onClick={() => setVideoModal(true)}>Video</Button>
          </Space>
        )}
        items={[
          {
            key: 'write', label: 'Soạn thảo', children: (
              <Input.TextArea ref={ref} value={value} onChange={(e) => onChange?.(e.target.value)} variant="borderless"
                autoSize={{ minRows: 14, maxRows: 30 }} maxLength={50000} showCount className="!rounded-none font-mono !text-[13px] bg-white"
                placeholder={'Viết nội dung bài...\n\n## Tiêu đề mục\nĐoạn văn...\n\n- Ý 1\n- Ý 2'} />
            ),
          },
          {
            key: 'preview', label: 'Xem trước', children: (
              <div className="bg-white p-5 min-h-[320px] max-h-[640px] overflow-y-auto">
                {value.trim() ? <ArticleBody content={value} /> : <p className="text-gray-400">Chưa có nội dung</p>}
              </div>
            ),
          },
        ]} />
      <Collapse ghost size="small" className="border-t bg-slate-50" items={[{
        key: 'help', label: <span className="text-xs text-gray-500">Hướng dẫn định dạng</span>, children: (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {SYNTAX_HELP.map(([code, desc]) => <div key={code}><code className="bg-white border rounded px-1">{code}</code> <span className="text-gray-500">{desc}</span></div>)}
          </div>
        ),
      }]} />

      <Modal title="Chèn video" open={videoModal} onCancel={() => setVideoModal(false)} onOk={confirmVideo} okText="Chèn" destroyOnHidden>
        <div className="space-y-3">
          <MediaField kind="video" value={video.url} onChange={(url) => setVideo((v) => ({ ...v, url: url || '' }))} />
          <Input placeholder="Chú thích video (không bắt buộc)" maxLength={150} value={video.caption} onChange={(e) => setVideo((v) => ({ ...v, caption: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

// Các ô chung của bài viết (dùng cho quản lý và bác sĩ). sources nhập mỗi dòng 1 tài liệu.
// research = bài bác sĩ viết: chỉ chọn Nghiên cứu / Kiến thức da liễu / Chăm sóc da, bắt buộc ảnh bìa và nội dung từ 300 ký tự.
export default function ArticleFields({ research = false }) {
  return (
    <>
      <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }, { max: 200 }]}>
        <Input maxLength={200} showCount placeholder="Tiêu đề rõ ràng, nêu đúng nội dung chính" />
      </Form.Item>
      <Form.Item name="summary" label="Tóm tắt (sapo)" extra="Hiện ở thẻ bài viết và đầu bài, 1–3 câu">
        <Input.TextArea rows={2} maxLength={500} showCount />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item name="article_type" label="Loại bài viết" rules={[{ required: true, message: 'Chọn loại bài viết' }]} extra="Bài sẽ nằm trong tab tương ứng ở trang Tin tức">
            <Select options={research ? DOCTOR_TYPE_OPTIONS : ARTICLE_TYPE_OPTIONS} placeholder="Chọn loại bài" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="author_title" label="Chức danh tác giả" extra={research ? 'Hiện cạnh tên bạn, vd. BS.CKI Da liễu' : undefined}>
            <Input maxLength={120} placeholder="BS.CKI Da liễu" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="thumbnail_url" label="Ảnh bìa" rules={research ? [{ required: true, message: 'Vui lòng tải ảnh bìa' }] : []}
        extra="Tỉ lệ ngang 16:9, tối đa 5MB">
        <MediaField kind="image" />
      </Form.Item>
      <Form.Item name="video_url" label="Video đầu bài (không bắt buộc)">
        <MediaField kind="video" />
      </Form.Item>
      <Form.Item name="content" label="Nội dung" rules={[{ required: true, message: 'Vui lòng nhập nội dung' }, ...(research ? [{ min: 300, message: 'Nội dung cần ít nhất 300 ký tự' }] : [])]}>
        <ContentEditor />
      </Form.Item>
      <Form.Item name="tags" label="Thẻ (từ khóa)" extra="Nhấn Enter hoặc dấu phẩy sau mỗi thẻ, tối đa 10">
        <Select mode="tags" tokenSeparators={[',']} maxCount={10} placeholder="mụn, niacinamide, phục hồi da" open={false} suffixIcon={null} />
      </Form.Item>
      <Form.Item name="sources" label={research ? 'Tài liệu tham khảo' : 'Nguồn tham khảo (không bắt buộc)'} extra="Mỗi dòng một tài liệu / đường dẫn">
        <Input.TextArea rows={3} placeholder={'Draelos ZD. Niacinamide in dermatology. J Cosmet Dermatol, 2020.\nhttps://pubmed.ncbi.nlm.nih.gov/...'} />
      </Form.Item>
    </>
  );
}

// Chuyển dữ liệu bài viết từ API sang giá trị form và ngược lại
export const toFormValues = (a = {}) => ({ ...a, tags: a.tags || [], sources: (a.sources || []).join('\n') });
export const fromFormValues = (v) => ({
  ...v,
  sources: String(v.sources || '').split('\n').map((s) => s.trim()).filter(Boolean),
});
