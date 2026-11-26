// Sổ y bạ điện tử đầy đủ của 1 hồ sơ người khám (bác sĩ / quản lý) + AI tóm tắt hồ sơ.
// Dữ liệu: GET /api/booking/patient-record/:id (gom từ booking, identity, ai-analysis, commerce).
// Tóm tắt AI: POST /api/ai/patient-summary/:id, chỉ khi khách đã đồng ý (tick ở khung Sàng lọc an toàn), dữ liệu đã bỏ định danh;
// mỗi ý có nguồn, bấm để cuộn tới bản ghi gốc.
import React, { useEffect, useState } from 'react';
import { Drawer, Spin, Empty, Timeline, Tag, Image, Button, Alert, Typography } from 'antd';
import { HistoryOutlined, MedicineBoxOutlined, ScissorOutlined, ScanOutlined, VideoCameraOutlined, ShoppingOutlined, RobotOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE } from '../config';

const { Text } = Typography;
const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const GENDER = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
const STYLE = {
  EXAM: { color: 'blue', icon: <MedicineBoxOutlined className="text-blue-600" />, box: 'bg-blue-50 border-blue-200', head: 'text-blue-700' },
  TREATMENT: { color: 'green', icon: <ScissorOutlined className="text-green-600" />, box: 'bg-green-50 border-green-200', head: 'text-green-700' },
  SERVICE: { color: 'green', icon: <ScissorOutlined className="text-green-600" />, box: 'bg-green-50 border-green-200', head: 'text-green-700' },
  SKIN: { color: 'purple', icon: <ScanOutlined className="text-purple-600" />, box: 'bg-purple-50 border-purple-200', head: 'text-purple-700' },
  CONSULT: { color: 'cyan', icon: <VideoCameraOutlined className="text-cyan-600" />, box: 'bg-cyan-50 border-cyan-200', head: 'text-cyan-700' },
  ORDER: { color: 'gray', icon: <ShoppingOutlined className="text-gray-600" />, box: 'bg-gray-50 border-gray-200', head: 'text-gray-700' },
};
const Row = ({ label, children }) => (children ? <div className="mt-1 text-sm"><Text strong>{label}:</Text> <span className="whitespace-pre-line text-gray-700">{children}</span></div> : null);
const meds = (list) => (list || []).map((m) => `${m.name} x${m.quantity}${m.usage ? ` (${m.usage})` : ''}`).join('; ');

export default function PatientRecordDrawer({ open, profileId, onClose }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null); // { loading, data, error, code }
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!open || !profileId) return;
    setLoading(true); setError(''); setSummary(null);
    axios.get(`${API_BASE}/api/booking/patient-record/${profileId}`, auth())
      .then((r) => setRecord(r.data.data))
      .catch((e) => { setRecord(null); setError(e.response?.data?.message || 'Không tải được sổ y bạ'); })
      .finally(() => setLoading(false));
  }, [open, profileId]);

  const runSummary = async (refresh = false) => {
    setSummary({ loading: true });
    try {
      const r = await axios.post(`${API_BASE}/api/ai/patient-summary/${profileId}`, { refresh }, { ...auth(), timeout: 90000 });
      setSummary({ data: r.data.data });
    } catch (e) { setSummary({ error: e.response?.data?.message || 'AI đang bận, vui lòng thử lại', code: e.response?.data?.code }); }
  };
  const goTo = (ref) => {
    const id = ref.id || (ref.type === 'SAFETY' ? 'muc-sang-loc' : ref.type === 'PACKAGE' ? 'muc-goi' : ref.type === 'VISIT' ? 'muc-lan-kham' : null);
    const el = id && document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFlash(id); setTimeout(() => setFlash(null), 1600); }
  };
  const ring = (id) => (flash === id ? 'ring-2 ring-amber-400' : '');
  const p = record?.profile || {};
  const age = p.dob ? dayjs().diff(dayjs(p.dob), 'year') : null;

  return (
    <Drawer title={<span className="text-blue-700"><HistoryOutlined className="mr-2" /> Sổ y bạ điện tử</span>} placement="right" width={620} onClose={onClose} open={open}>
      <Spin spinning={loading} description="Đang tải dữ liệu...">
        {error && <Alert type="error" showIcon title={error} />}
        {record && (
          <>
            {/* Tóm tắt AI */}
            <div className="mb-4 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
              <div className="flex items-center justify-between gap-2">
                <Text strong className="text-indigo-800"><RobotOutlined /> Tóm tắt hồ sơ (AI)</Text>
                {record.ai_summary_consent ? (
                  <Button size="small" type="primary" ghost icon={summary?.data ? <ReloadOutlined /> : <RobotOutlined />} loading={summary?.loading} onClick={() => runSummary(!!summary?.data)}>
                    {summary?.data ? 'Tóm tắt lại' : 'Tóm tắt hồ sơ'}
                  </Button>
                ) : <Tag>Khách chưa đồng ý</Tag>}
              </div>
              {!record.ai_summary_consent && <div className="text-xs text-gray-600 mt-1">Hỏi khách và tick "Khách đồng ý cho AI tóm tắt hồ sơ" ở khung Sàng lọc an toàn, rồi mở lại Sổ y bạ.</div>}
              {record.ai_summary_consent && !summary && <div className="text-xs text-gray-600 mt-1">AI đọc toàn bộ sổ y bạ (đã bỏ tên, SĐT, ngày sinh, ảnh) và tóm tắt trong vài dòng, mỗi ý có nguồn để đối chiếu.</div>}
              {summary?.error && <div className="text-xs text-red-600 mt-1">{summary.error}</div>}
              {summary?.data && (
                <div className="mt-2">
                  {summary.data.empty && <div className="text-sm text-gray-600">{summary.data.note}</div>}
                  <ul className="list-disc pl-5 space-y-1">
                    {summary.data.items.map((it, i) => (
                      <li key={i} className="text-sm">
                        {it.text}{' '}
                        {(() => {
                          // Gộp nguồn trùng nhãn, hiện tối đa 4 nguồn (mới nhất trước), còn lại ghi +n
                          const label = (r) => (r.date ? dayjs(r.date).format('DD/MM/YY') : { SAFETY: 'Sàng lọc', PACKAGE: 'Gói', VISIT: 'Lần khám này' }[r.type] || r.code);
                          const refs = it.refs.filter((r, k, arr) => arr.findIndex((x) => label(x) === label(r)) === k);
                          return (
                            <>
                              {refs.slice(0, 4).map((r) => (
                                <button key={r.code} type="button" onClick={() => goTo(r)} className="text-xs text-indigo-600 hover:underline bg-transparent border-0 p-0 cursor-pointer mr-1">[{label(r)}]</button>
                              ))}
                              {refs.length > 4 && <span className="text-xs text-gray-400">+{refs.length - 4}</span>}
                            </>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                  <div className="text-xs text-gray-400 mt-1">
                    {summary.data.cached ? 'Hồ sơ chưa đổi, dùng lại bản tóm tắt trước' : 'Vừa tóm tắt'}{summary.data.generated_at ? ` · ${dayjs(summary.data.generated_at).format('HH:mm DD/MM/YYYY')}` : ''}. Chỉ để đọc nhanh, đối chiếu với bản ghi gốc bên dưới.
                  </div>
                </div>
              )}
            </div>

            {/* Thông tin chung */}
            <div className="mb-3 text-sm">
              <div className="font-semibold text-base">{p.full_name || 'Người khám'}</div>
              <div className="text-gray-600">{[GENDER[p.gender], age != null ? `${age} tuổi` : null, p.relationship].filter(Boolean).join(' · ')}</div>
            </div>
            {record.current_visit && (
              <div id="muc-lan-kham" className={`mb-3 p-2 rounded border border-amber-200 bg-amber-50 text-sm ${ring('muc-lan-kham')}`}>
                <Text strong>Lần khám {dayjs(record.current_visit.date).format('DD/MM/YYYY')} {String(record.current_visit.time || '').slice(0, 5)}:</Text> {record.current_visit.reason || 'Chưa ghi lý do'}
              </div>
            )}
            <div id="muc-sang-loc" className={`mb-3 p-2 rounded border border-orange-200 bg-orange-50 text-sm ${ring('muc-sang-loc')}`}>
              <Text strong>Sàng lọc an toàn</Text>{record.safety.screened_at ? ` (hỏi ${dayjs(record.safety.screened_at).format('DD/MM/YYYY')})` : ' (chưa sàng lọc)'}:{' '}
              {record.safety.flags.length ? record.safety.flags.map((f) => <Tag key={f} color="orange">{f}</Tag>) : 'Không có tình trạng đặc biệt'}
              <div>Dị ứng: {record.safety.allergies || 'Không ghi nhận'}</div>
              {record.safety.counter && <div className="text-xs text-gray-600">Khai khi mua tại quầy {dayjs(record.safety.counter.at).format('DD/MM/YYYY')}: {record.safety.counter.flags.join(', ') || 'không'}{record.safety.counter.allergies ? `; dị ứng ${record.safety.counter.allergies}` : ''}</div>}
            </div>
            {record.packages.length > 0 && (
              <div id="muc-goi" className={`mb-3 p-2 rounded border border-green-200 bg-green-50 text-sm ${ring('muc-goi')}`}>
                <Text strong>Gói liệu trình</Text>
                {record.packages.map((g, i) => <div key={i}>{g.name}: còn {g.remaining}/{g.total} buổi {g.status !== 'ACTIVE' && <Tag>{g.status === 'COMPLETED' ? 'Đã xong' : 'Đã hủy'}</Tag>}</div>)}
              </div>
            )}

            {/* Dòng thời gian đầy đủ */}
            {record.events.length === 0 ? <Empty description="Chưa có lịch sử khám, dịch vụ hay soi da." /> : (
              <Timeline className="mt-4" items={record.events.map((e) => {
                const st = STYLE[e.type] || STYLE.ORDER;
                return {
                  color: st.color, dot: st.icon,
                  children: (
                    <div id={e.id} className={`mb-3 p-3 rounded-lg border ${st.box} ${ring(e.id)}`}>
                      <div className={`font-bold ${st.head} border-b pb-1 mb-1`}>{e.title} · {dayjs(e.date).format('DD/MM/YYYY')}</div>
                      {e.type === 'EXAM' && (
                        <>
                          <Row label="Bác sĩ">{e.doctor}</Row>
                          <Row label="Lý do khám">{e.reason}</Row>
                          <Row label="Triệu chứng">{e.symptoms}</Row>
                          <Row label="Chẩn đoán"><span className="text-red-600">{e.diagnosis || 'Chưa có'}</span></Row>
                          <Row label="Ghi chú bác sĩ">{e.notes}</Row>
                          <Row label="Đơn kê">{meds(e.prescribed.medicines)}</Row>
                          <Row label="Chỉ định dịch vụ">{e.prescribed.services.join(', ')}</Row>
                          <Row label="Chỉ định gói">{e.prescribed.packages.join(', ')}</Row>
                          {e.purchased && <Row label="Khách mua khi thanh toán">{[meds(e.purchased.medicines), ...e.purchased.services, ...e.purchased.packages].filter(Boolean).join('; ') || 'Không mua'}</Row>}
                          <Row label="Hẹn tái khám">{e.follow_up_date && dayjs(e.follow_up_date).format('DD/MM/YYYY')}</Row>
                          {e.overrides.map((o, i) => <div key={i} className="mt-1 text-xs p-1.5 rounded bg-white border border-red-200"><b className="text-red-600">Vẫn kê dù có cảnh báo:</b> {o.reason}<div className="text-gray-500">{o.warnings.join('; ')}</div></div>)}
                          {e.ai_review.length > 0 && <Row label="AI rà soát cảnh báo">{e.ai_review.join('; ')}</Row>}
                        </>
                      )}
                      {(e.type === 'TREATMENT' || e.type === 'SERVICE') && <Row label="KTV ghi chú">{e.note || 'Không có'}</Row>}
                      {e.type === 'SKIN' && (
                        <>
                          <div className="text-sm">{e.reviewed ? <Tag color="green">Bác sĩ đã xác nhận</Tag> : <Tag>AI tự đánh giá</Tag>} Mức độ: <b>{e.severity || 'không rõ'}</b>{e.inflammatory_count != null ? ` · ${e.inflammatory_count} nốt mụn viêm` : ''}</div>
                          <Row label="Có">{e.groups.join(', ')}</Row>
                          <Row label="Bác sĩ ghi">{e.note}</Row>
                        </>
                      )}
                      {e.type === 'CONSULT' && (
                        <>
                          <Row label="Chuyên gia">{e.expert}</Row>
                          <Row label="Trạng thái">{{ COMPLETED: 'Hoàn thành', NO_SHOW: 'Khách vắng', EXPERT_ABSENT: 'Chuyên gia vắng' }[e.status] || e.status}</Row>
                          <Row label="Câu hỏi">{e.question}</Row>
                          {e.result && <><Row label="Nhận định">{e.result.assessment}</Row><Row label="Lời khuyên">{e.result.advice}</Row><Row label="Gợi ý sản phẩm">{e.result.products.join(', ')}</Row></>}
                          {e.recommend_exam && <Tag color="orange" className="mt-1">Chuyên gia khuyên đi khám</Tag>}
                        </>
                      )}
                      {e.type === 'ORDER' && (
                        <>
                          <Row label="Trạng thái">{e.status}</Row>
                          <Row label="Sản phẩm">{(e.items || []).join(', ')}</Row>
                          {e.returns?.map((r, i) => <div key={i} className="mt-1 text-xs p-1.5 rounded bg-white border border-amber-200"><b>Trả hàng ({r.reason}):</b> {r.description}</div>)}
                        </>
                      )}
                      {e.images?.length > 0 && <div className="mt-2 flex gap-2 flex-wrap">{e.images.map((img, i) => <Image key={i} src={img} width={48} height={48} className="rounded object-cover" />)}</div>}
                    </div>
                  ),
                };
              })} />
            )}
          </>
        )}
      </Spin>
    </Drawer>
  );
}
