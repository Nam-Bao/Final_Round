import React, { useEffect, useState } from 'react';
import { Button, Divider, Form, Input, Modal, Radio, Select, Switch, Tag, Timeline, message } from 'antd';
import { PlusOutlined, DeleteOutlined, ExperimentOutlined, LinkOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { SafetyWarnings } from './PatientSafetyPanel';
import VoucherProofUpload from './VoucherProofUpload';

export const RULE_API = 'http://localhost:4000/api/booking/safety-rules';
export const authHeaders = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
export const SEVERITY_COLOR = { CONTRAINDICATED: 'red', CAUTION: 'orange', INFO: 'blue' };
export const STATUS_COLOR = {
  DRAFT: 'default', PROPOSED: 'cyan', CHANGES_REQUESTED: 'gold', IN_REVIEW: 'processing', REVIEWED: 'purple',
  ACTIVE: 'green', REJECTED: 'red', SUPERSEDED: 'default', INACTIVE: 'default', APPLIED: 'default',
};
export const CHANGE_COLOR = { NEW: 'blue', EDIT: 'geekblue', DEACTIVATE: 'volcano' };
export const VERDICT_COLOR = { PENDING: 'default', AGREE: 'green', CHANGES: 'orange', DISAGREE: 'red' };
const ACTION_LABEL = {
  SEEDED: 'Nạp từ bộ quy tắc khởi tạo', CREATED: 'Soạn', EDITED: 'Sửa nội dung', SUBMITTED: 'Gửi bác sĩ xem xét',
  REVIEWER_REPLACED: 'Đổi bác sĩ xem xét', REVIEWED: 'Bác sĩ trả lời', APPROVED: 'Quản lý duyệt', REJECTED: 'Từ chối',
  PROPOSED: 'Bác sĩ gửi đề xuất cho quản lý', CHANGES_REQUESTED: 'Quản lý yêu cầu bác sĩ sửa', REVISION_CREATED: 'Tạo bản sửa / đề xuất ngưng',
  SUPERSEDED: 'Được thay bằng phiên bản mới', DEACTIVATED: 'Ngưng áp dụng',
};
const splitList = (v) => String(v || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
export const currentUser = () => { try { return JSON.parse(sessionStorage.getItem('admin_user') || '{}'); } catch { return {}; } };
export const useRuleMeta = () => {
  const [meta, setMeta] = useState(null);
  const load = () => axios.get(`${RULE_API}/meta`, authHeaders()).then((r) => setMeta(r.data.data)).catch(() => message.error('Không tải được dữ liệu quy tắc'));
  useEffect(() => { load(); }, []);
  return [meta, load];
};

// Sản phẩm / dịch vụ khớp với từ khóa (để biết từ khóa có bắt đúng không)
function TargetPreview({ kind, keywords, excludes, allOf }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!keywords?.length) { setData(null); return undefined; }
    const timer = setTimeout(() => {
      axios.post(`${RULE_API}/preview-target`, { kind, keywords, excludes, all_of: allOf }, authHeaders())
        .then((r) => setData(r.data.data)).catch(() => setData(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [kind, (keywords || []).join('|'), (excludes || []).join('|'), allOf]);
  if (!data) return null;
  const list = kind === 'PROCEDURE' ? data.services : data.products;
  return (
    <div className={`text-xs p-2 rounded border mb-2 ${list.length ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      {list.length
        ? <>Đang khớp {list.length} {kind === 'PROCEDURE' ? 'dịch vụ / gói' : `sản phẩm (trên ${data.total_products} sản phẩm có bảng thành phần)`}: {list.map((x) => x.name).join(', ')}</>
        : <>Chưa khớp {kind === 'PROCEDURE' ? 'dịch vụ / gói' : 'sản phẩm'} nào. Kiểm tra lại từ khóa (hoặc chưa có sản phẩm chứa hoạt chất này).</>}
    </div>
  );
}

// Form soạn / sửa quy tắc. mode 'MANAGER': lưu nháp. mode 'DOCTOR': lưu nháp hoặc gửi quản lý
export function RuleFormModal({ open, meta, rule, mode = 'MANAGER', onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [newSources, setNewSources] = useState([]);
  const targetMode = Form.useWatch('target_mode', form);
  const targetId = Form.useWatch('target_id', form);
  const ntKeywords = splitList(Form.useWatch('nt_keywords', form));
  const ntExcludes = splitList(Form.useWatch('nt_excludes', form));
  const ntAllOf = Form.useWatch('nt_all_of', form);
  const selectedTarget = meta?.targets.find((t) => t.id === targetId);
  const doctor = mode === 'DOCTOR';

  useEffect(() => {
    if (!open) return;
    setNewSources([]);
    const draftTarget = rule?.target?.status === 'DRAFT';
    form.setFieldsValue(rule ? {
      flag: rule.flag, severity: rule.severity, message: rule.message, source_ids: rule.source_ids, change_reason: rule.change_reason || '',
      target_mode: draftTarget ? 'NEW' : 'EXISTING', target_id: draftTarget ? undefined : rule.target_id,
      nt_label: draftTarget ? rule.target.label : '', nt_keywords: draftTarget ? rule.target.keywords.join(', ') : '',
      nt_excludes: draftTarget ? rule.target.excludes.join(', ') : '', nt_all_of: draftTarget ? rule.target.all_of : false,
    } : { target_mode: 'EXISTING', severity: 'CAUTION', source_ids: [], nt_all_of: false, change_reason: '' });
  }, [open, rule]);

  const save = async (submit) => {
    const v = await form.validateFields();
    const body = {
      flag: v.flag, severity: v.severity, message: v.message, source_ids: v.source_ids || [], change_reason: v.change_reason,
      new_sources: newSources.filter((s) => s.label || s.url),
      ...(v.target_mode === 'NEW'
        ? { new_target: { label: v.nt_label, keywords: splitList(v.nt_keywords), excludes: splitList(v.nt_excludes), all_of: !!v.nt_all_of } }
        : { target_id: v.target_id }),
    };
    setSaving(true);
    try {
      let res;
      if (rule) {
        res = await axios.put(`${RULE_API}/${rule.id}`, body, authHeaders());
        if (doctor && submit) res = await axios.post(`${RULE_API}/${rule.id}/propose`, {}, authHeaders());
      } else res = await axios.post(RULE_API, { ...body, submit: doctor && submit }, authHeaders());
      message.success(res.data.message);
      onSaved?.();
      onClose();
    } catch (error) { message.error(error.response?.data?.message || 'Không lưu được'); } finally { setSaving(false); }
  };

  const setSource = (i, patch) => setNewSources((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const title = rule?.change_type === 'EDIT'
    ? `Sửa nội dung bản mới (phiên bản ${rule.version})`
    : rule ? (doctor ? 'Sửa đề xuất' : 'Sửa quy tắc (sẽ về Nháp, phải gửi bác sĩ xem xét lại)') : (doctor ? 'Đề xuất quy tắc an toàn' : 'Soạn quy tắc an toàn');
  return (
    <Modal title={title} open={open} onCancel={onClose} width={720} destroyOnHidden styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      footer={[
        <Button key="c" onClick={onClose}>Hủy</Button>,
        <Button key="d" loading={saving} onClick={() => save(false)}>Lưu nháp</Button>,
        ...(doctor ? [<Button key="s" type="primary" loading={saving} onClick={() => save(true)}>Lưu và gửi quản lý</Button>] : []),
      ]}>
      {meta && (
        <Form form={form} layout="vertical" size="small">
          {rule?.change_type === 'EDIT' && <div className="mb-3 p-2 rounded bg-blue-50 border border-blue-200 text-sm">Đây là bản sửa của quy tắc đang áp dụng. Bản cũ vẫn áp dụng cho tới khi bản này được duyệt.</div>}
          <Form.Item name="flag" label="Tình trạng của khách (câu sàng lọc)" rules={[{ required: true, message: 'Chọn tình trạng' }]}>
            <Select showSearch optionFilterProp="label" options={meta.flags} placeholder="VD: Đang mang thai" />
          </Form.Item>
          <Form.Item name="target_mode" label="Đối tượng">
            <Radio.Group options={[{ value: 'EXISTING', label: 'Chọn hoạt chất / thủ thuật có sẵn' }, { value: 'NEW', label: 'Thêm hoạt chất mới' }]} />
          </Form.Item>
          {targetMode === 'NEW' ? (
            <div className="p-3 rounded border bg-slate-50 mb-3">
              <Form.Item name="nt_label" label="Tên hoạt chất" rules={[{ required: true, min: 3, message: 'Ít nhất 3 ký tự' }]}><Input placeholder="VD: Hydroquinone" maxLength={200} /></Form.Item>
              <Form.Item name="nt_keywords" label="Từ khóa nhận diện trong bảng thành phần (cách nhau bằng dấu phẩy)" rules={[{ required: true, message: 'Nhập ít nhất 1 từ khóa' }]}
                extra="So theo nguyên từ, không phân biệt hoa thường / dấu. Thêm * ở cuối để khớp cả từ dài hơn (VD peel* khớp peeling).">
                <Input placeholder="VD: hydroquinone" />
              </Form.Item>
              <Form.Item name="nt_excludes" label="Cụm loại trừ (không tính là hoạt chất này)" extra="VD: capryloyl salicylic acid là dẫn xuất khác salicylic acid">
                <Input placeholder="Để trống nếu không có" />
              </Form.Item>
              <Form.Item name="nt_all_of" label="Thuốc phối hợp: phải có đủ tất cả từ khóa" valuePropName="checked"><Switch size="small" /></Form.Item>
              <TargetPreview kind="INGREDIENT" keywords={ntKeywords} excludes={ntExcludes} allOf={!!ntAllOf} />
            </div>
          ) : (
            <>
              <Form.Item name="target_id" rules={[{ required: true, message: 'Chọn đối tượng' }]}>
                <Select showSearch optionFilterProp="label" placeholder="Chọn hoạt chất hoặc thủ thuật"
                  options={[
                    { label: 'Hoạt chất (trong bảng thành phần)', options: meta.targets.filter((t) => t.kind === 'INGREDIENT').map((t) => ({ value: t.id, label: t.label })) },
                    { label: 'Thủ thuật (theo tên dịch vụ / gói)', options: meta.targets.filter((t) => t.kind === 'PROCEDURE').map((t) => ({ value: t.id, label: t.label })) },
                  ]} />
              </Form.Item>
              {selectedTarget && (
                <>
                  <div className="text-xs text-gray-500 mb-1">Từ khóa: {selectedTarget.keywords.join(', ')}{selectedTarget.excludes.length ? ` · loại trừ: ${selectedTarget.excludes.join(', ')}` : ''}{selectedTarget.all_of ? ' · phải có đủ' : ''}</div>
                  <TargetPreview kind={selectedTarget.kind} keywords={selectedTarget.keywords} excludes={selectedTarget.excludes} allOf={selectedTarget.all_of} />
                </>
              )}
            </>
          )}
          <Form.Item name="severity" label="Mức độ" rules={[{ required: true }]}
            extra="Chống chỉ định: chặn kê đơn (bác sĩ phải ghi lý do) và bắt NVBH xác nhận khi bán. Thận trọng / Lưu ý: chỉ nhắc.">
            <Radio.Group optionType="button" buttonStyle="solid" options={meta.severities} />
          </Form.Item>
          <Form.Item name="message" label="Lời nhắc hiện cho bác sĩ / nhân viên" rules={[{ required: true, min: 10, message: 'Ít nhất 10 ký tự' }]}>
            <Input.TextArea rows={2} maxLength={500} showCount placeholder="VD: Hydroquinone chống chỉ định khi mang thai do thiếu dữ liệu an toàn." />
          </Form.Item>
          {(doctor || rule?.change_type === 'EDIT') && (
            <Form.Item name="change_reason" label={rule?.change_type === 'EDIT' ? 'Lý do sửa' : 'Lý do đề xuất (gửi quản lý)'}>
              <Input.TextArea rows={2} maxLength={1000} placeholder="VD: Gặp ca khách mang thai dùng sản phẩm chứa hydroquinone, hệ thống chưa cảnh báo" />
            </Form.Item>
          )}
          <Divider titlePlacement="start" plain className="!my-2">Nguồn (bắt buộc ít nhất 1)</Divider>
          <Form.Item name="source_ids" label="Chọn nguồn có sẵn">
            <Select mode="multiple" allowClear optionFilterProp="label" options={meta.sources.map((s) => ({ value: s.id, label: s.label }))} placeholder="Chọn tài liệu đã có trong hệ thống" />
          </Form.Item>
          {newSources.map((s, i) => (
            <div key={i} className="p-2 mb-2 rounded border bg-slate-50">
              <div className="flex gap-2 mb-2">
                <Select size="small" value={s.kind} onChange={(kind) => setSource(i, { kind, url: '' })} style={{ width: 170 }}
                  options={[{ value: 'LINK', label: 'Link tài liệu' }, { value: 'DOCUMENT', label: 'Tài liệu tải lên' }, { value: 'CLINIC', label: 'Quy định phòng khám' }]} />
                <Input size="small" value={s.label} onChange={(e) => setSource(i, { label: e.target.value })} placeholder="Tên tài liệu, tác giả / đơn vị, năm" maxLength={500} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setNewSources((l) => l.filter((_, idx) => idx !== i))} />
              </div>
              {s.kind === 'LINK' && <Input size="small" prefix={<LinkOutlined />} value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} placeholder="https://..." />}
              {s.kind === 'DOCUMENT' && <VoucherProofUpload value={s.url || null} onChange={(url) => setSource(i, { url: url || '' })} />}
            </div>
          ))}
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setNewSources((l) => [...l, { kind: 'LINK', label: '', url: '' }])}>Thêm nguồn mới</Button>
        </Form>
      )}
    </Modal>
  );
}

// Sửa / ngưng quy tắc đang áp dụng: tạo bản mới (phiên bản +1), bản cũ vẫn áp dụng tới khi bản mới được duyệt
export function ReviseModal({ rule, type, onClose, onCreated }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(''); }, [rule?.id, type]);
  const create = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${RULE_API}/${rule.id}/revise`, { change_type: type, reason }, authHeaders());
      message.success(res.data.message);
      onCreated?.(res.data.data);
      onClose();
    } catch (error) { message.error(error.response?.data?.message || 'Không tạo được'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!rule} onCancel={onClose} onOk={create} confirmLoading={busy} okText="Tạo"
      title={type === 'DEACTIVATE' ? 'Ngưng áp dụng quy tắc' : 'Sửa quy tắc đang áp dụng'}>
      <div className="text-sm mb-2">
        {type === 'DEACTIVATE'
          ? 'Tạo đề xuất ngưng. Đề xuất đi qua cùng quy trình (bác sĩ xem xét / quản lý chung duyệt). Quy tắc vẫn áp dụng tới khi đề xuất được duyệt.'
          : 'Tạo bản sửa (phiên bản mới) ở trạng thái Nháp, sửa nội dung rồi gửi đi. Bản hiện tại vẫn áp dụng tới khi bản mới được duyệt.'}
      </div>
      <Input.TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
        placeholder={type === 'DEACTIVATE' ? 'Lý do ngưng (ít nhất 10 ký tự), VD: nguồn đã cập nhật, hoạt chất được xác nhận an toàn...' : 'Lý do cần sửa (ít nhất 10 ký tự)'} />
    </Modal>
  );
}

// Thử quy tắc với 1 tình huống: tình trạng khách + sản phẩm / dịch vụ
export function RuleTester({ meta, rule }) {
  const [catalog, setCatalog] = useState({ products: [], services: [], packages: [] });
  const [flags, setFlags] = useState(rule ? [rule.flag] : []);
  const [productIds, setProductIds] = useState([]);
  const [serviceIds, setServiceIds] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    Promise.allSettled([
      axios.get('http://localhost:4000/api/commerce/products'),
      axios.get('http://localhost:4000/api/booking/spa-services'),
      axios.get('http://localhost:4000/api/booking/packages'),
    ]).then(([p, s, k]) => setCatalog({
      products: p.status === 'fulfilled' ? p.value.data.data || [] : [],
      services: s.status === 'fulfilled' ? s.value.data.data || s.value.data || [] : [],
      packages: k.status === 'fulfilled' ? k.value.data.data || k.value.data || [] : [],
    }));
  }, []);
  useEffect(() => { setFlags(rule ? [rule.flag] : []); setResult(null); }, [rule?.id]);
  const run = async () => {
    setLoading(true);
    try {
      const pending = rule && !['ACTIVE', 'SUPERSEDED', 'INACTIVE', 'APPLIED', 'REJECTED'].includes(rule.status);
      const draftRule = pending && { flag: rule.flag, severity: rule.severity, message: rule.message, ...(rule.target?.status === 'DRAFT' ? { new_target: rule.target } : { target_id: rule.target_id }) };
      const res = await axios.post(`${RULE_API}/test`, {
        rule: draftRule || null, replaces_rule_id: pending ? rule.replaces_rule_id : null, change_type: pending ? rule.change_type : null,
        scenario: { flags, product_ids: productIds, service_ids: serviceIds.filter((x) => x.startsWith('s:')).map((x) => x.slice(2)), package_ids: serviceIds.filter((x) => x.startsWith('p:')).map((x) => x.slice(2)) },
      }, authHeaders());
      setResult(res.data.data);
    } catch (error) { message.error(error.response?.data?.message || 'Không thử được'); } finally { setLoading(false); }
  };
  if (!meta) return null;
  return (
    <div className="p-3 rounded border border-indigo-200 bg-indigo-50">
      <b className="block mb-1"><ExperimentOutlined /> Thử quy tắc</b>
      <div className="text-xs text-gray-600 mb-2">{rule?.change_type === 'DEACTIVATE' ? 'Chạy bảng quy tắc khi đã NGƯNG quy tắc này.' : rule?.change_type === 'EDIT' ? 'Chạy bảng quy tắc với bản sửa thay cho bản đang áp dụng.' : 'Chạy bảng quy tắc đang dùng cùng quy tắc này.'}</div>
      <Select mode="multiple" size="small" className="w-full mb-2" value={flags} onChange={setFlags} options={meta.flags} placeholder="Tình trạng của khách" />
      <Select mode="multiple" size="small" className="w-full mb-2" value={productIds} onChange={setProductIds} optionFilterProp="label" placeholder="Sản phẩm"
        options={catalog.products.map((p) => ({ value: p.id, label: p.name }))} />
      <Select mode="multiple" size="small" className="w-full mb-2" value={serviceIds} onChange={setServiceIds} optionFilterProp="label" placeholder="Dịch vụ / gói"
        options={[...(Array.isArray(catalog.services) ? catalog.services : []).map((s) => ({ value: `s:${s.id}`, label: `Dịch vụ: ${s.name}` })), ...(Array.isArray(catalog.packages) ? catalog.packages : []).map((p) => ({ value: `p:${p.id}`, label: `Gói: ${p.name}` }))]} />
      <Button size="small" type="primary" ghost loading={loading} onClick={run} disabled={!productIds.length && !serviceIds.length}>Chạy thử</Button>
      {result && (
        <div className="mt-2">
          {result.items.map((i) => (
            <div key={i.name} className="text-xs text-gray-600">{i.name}: {i.no_ingredients ? 'chưa có bảng thành phần' : i.targets.length ? `nhận ra ${i.targets.join(', ')}` : 'không có hoạt chất / thủ thuật nào trong bảng quy tắc'}</div>
          ))}
          <div className="mt-2">
            {result.warnings.length === 0 ? <div className="text-sm text-green-700">Không có cảnh báo.</div> : result.warnings.map((w, idx) => (
              <div key={idx}>{w.from_draft && <Tag color="purple" className="mb-1">Do quy tắc đang soạn</Tag>}<SafetyWarnings warnings={[w]} /></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const RuleContent = ({ rule }) => (
  <>
    <div><b>Khi khách:</b> {rule.condition}</div>
    <div><b>Với:</b> {rule.target?.label} <span className="text-xs text-gray-500">({rule.target?.kind === 'PROCEDURE' ? 'thủ thuật' : 'hoạt chất'}{rule.target?.keywords ? `; từ khóa: ${rule.target.keywords.join(', ')}` : ''}{rule.target?.excludes?.length ? `; loại trừ: ${rule.target.excludes.join(', ')}` : ''}{rule.target?.all_of ? '; phải có đủ' : ''})</span>{rule.target?.status === 'DRAFT' && <Tag color="purple" className="ml-1">Hoạt chất mới</Tag>}</div>
    <div><b>Mức độ:</b> <Tag color={SEVERITY_COLOR[rule.severity]}>{rule.severity_label}</Tag></div>
    <div><b>Lời nhắc:</b> {rule.message}</div>
  </>
);

// Nội dung + bản cũ (nếu là bản sửa) + ý kiến bác sĩ + nhật ký
export function RuleDetail({ rule }) {
  if (!rule) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Tag color={STATUS_COLOR[rule.status]}>{rule.status_label}</Tag>
        <Tag color={CHANGE_COLOR[rule.change_type]}>{rule.change_label}</Tag>
        <Tag>Phiên bản {rule.version || 1}</Tag>
        <span className="text-xs text-gray-500">{rule.origin === 'DOCTOR' ? 'Đề xuất bởi' : 'Soạn bởi'} {rule.created_by_name}{rule.decided_by_name ? ` · xử lý bởi ${rule.decided_by_name}` : ''}</span>
      </div>
      {rule.open_revision && <div className="p-2 rounded bg-amber-50 border border-amber-200 text-sm">Quy tắc đang có {rule.open_revision.change_type === 'DEACTIVATE' ? 'đề xuất ngưng' : 'bản sửa'} chưa xử lý xong. Quy tắc này vẫn áp dụng cho tới khi bản đó được duyệt.</div>}
      {rule.change_reason && <div className="p-2 rounded bg-slate-50 border text-sm"><b>{rule.change_type === 'DEACTIVATE' ? 'Lý do ngưng' : rule.change_type === 'EDIT' ? 'Lý do sửa' : 'Lý do đề xuất'}:</b> {rule.change_reason}</div>}
      {['CHANGES_REQUESTED', 'REJECTED'].includes(rule.status) && rule.decision_note && (
        <div className="p-2 rounded bg-amber-50 border border-amber-200 text-sm"><b>{rule.status === 'REJECTED' ? 'Lý do từ chối' : 'Quản lý yêu cầu sửa'}:</b> {rule.decision_note}</div>
      )}
      {rule.replaces && rule.change_type !== 'NEW' && (
        <div className="p-3 rounded border border-dashed bg-gray-50 text-sm">
          <div className="text-xs text-gray-500 mb-1">Bản đang áp dụng (phiên bản {rule.replaces.version || 1}, {rule.replaces.status_label})</div>
          <RuleContent rule={rule.replaces} />
        </div>
      )}
      {rule.change_type !== 'DEACTIVATE' && (
        <div className="p-3 rounded border bg-white">
          {rule.change_type === 'EDIT' && <div className="text-xs text-gray-500 mb-1">Nội dung mới (phiên bản {rule.version})</div>}
          <RuleContent rule={rule} />
          <div className="mt-1"><b>Nguồn:</b>
            <ul className="list-disc pl-5 text-sm">{rule.sources.map((s) => <li key={s.id}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}{s.kind === 'CLINIC' && <Tag className="ml-1">Quy định phòng khám</Tag>}</li>)}</ul>
          </div>
          {rule.status === 'ACTIVE' && rule.decision_note && <div className="mt-1 text-sm"><b>Ghi chú khi duyệt:</b> {rule.decision_note}</div>}
        </div>
      )}
      {rule.reviews?.length > 0 && (
        <div>
          <b className="block mb-1">Ý kiến bác sĩ (vòng {rule.review_round})</b>
          {rule.reviews.map((v) => (
            <div key={v.id} className={`p-2 mb-1 rounded border ${v.replaced ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{v.reviewer_name}</span><Tag color={VERDICT_COLOR[v.verdict]}>{v.verdict_label}</Tag>{v.replaced && <Tag>Không còn xem xét</Tag>}{v.responded_at && <span className="text-xs text-gray-500">{dayjs(v.responded_at).format('DD/MM/YYYY HH:mm')}</span>}</div>
              {v.comment && <div className="text-sm mt-1">{v.comment}</div>}
            </div>
          ))}
        </div>
      )}
      {rule.past_reviews?.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer text-gray-600">Ý kiến các vòng trước ({rule.past_reviews.length})</summary>
          {rule.past_reviews.map((v) => <div key={v.id} className="pl-3 mt-1">Vòng {v.round} · {v.reviewer_name}: <Tag color={VERDICT_COLOR[v.verdict]}>{v.verdict_label}</Tag>{v.comment}</div>)}
        </details>
      )}
      {rule.events?.length > 0 && (
        <div>
          <b className="block mb-2">Nhật ký</b>
          <Timeline items={rule.events.map((e) => ({ content: <div className="text-sm"><b>{ACTION_LABEL[e.action] || e.action}</b> · {e.actor_name} · <span className="text-gray-500">{dayjs(e.createdAt).format('DD/MM/YYYY HH:mm')}</span>{e.note && <div className="text-gray-600">{e.note}</div>}</div> }))} />
        </div>
      )}
    </div>
  );
}
