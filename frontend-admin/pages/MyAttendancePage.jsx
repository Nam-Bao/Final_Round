import React, { useEffect, useState } from 'react';
import { Tag, Button, Modal, Steps, Result, DatePicker, Image, Empty, Spin, Alert, message } from 'antd';
import { ScanOutlined, FileTextOutlined, ReloadOutlined, LogoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import QrScanner from '../components/attendance/QrScanner';
import FaceCapture from '../components/attendance/FaceCapture';
import ExplanationModal from '../components/attendance/ExplanationModal';
import CheckoutRequestModal from '../components/attendance/CheckoutRequestModal';
import {
  ATT_API, authConfig, errorText, uploadPhoto, shiftStatus, checkoutStatus, fmtTime, fmtDateTime, money,
  SHIFT_LABEL, EXPLANATION_STATUS, STAFF_ROLES,
} from '../components/attendance/attendanceApi';

// Quét QR -> chụp ảnh xác nhận -> hoàn tất (server tự biết là vào ca hay ra ca)
function CheckInFlow({ onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [ticket, setTicket] = useState(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Đếm ngược thời gian còn lại để chụp ảnh sau khi quét
  useEffect(() => {
    if (!ticket || step !== 1) return undefined;
    const tick = () => setLeft(Math.max(0, ticket.ttl - dayjs().diff(ticket.at, 'second')));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [ticket, step]);

  const handleScan = async (code) => {
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${ATT_API}/scan`, { code }, authConfig());
      setTicket({ ...res.data.data, ttl: res.data.data.ticket_ttl, at: dayjs() });
      setStep(1);
    } catch (err) {
      setError(errorText(err, 'Quét mã thất bại'));
    } finally {
      setBusy(false);
    }
  };

  const handleCapture = async ({ blob, faceCount, preview }) => {
    setPhoto(preview);
    setBusy(true);
    setError('');
    try {
      const url = await uploadPhoto(blob);
      const res = await axios.post(`${ATT_API}/check-in`, { ticket: ticket.ticket, photo_url: url, face_count: faceCount }, authConfig());
      setResult(res.data);
      setStep(2);
      onDone();
    } catch (err) {
      setError(errorText(err, 'Chấm công thất bại'));
      setPhoto(null);
    } finally {
      setBusy(false);
    }
  };

  const isOut = ticket?.kind === 'OUT';
  return (
    <Modal open title="Chấm công" onCancel={onClose} footer={null} width={460} destroyOnHidden centered maskClosable={false}>
      <Steps size="small" current={step} className="mb-4" items={[{ title: 'Quét QR' }, { title: 'Chụp ảnh' }, { title: 'Hoàn tất' }]} />
      {error && <Alert type="error" showIcon className="mb-3" message={error} />}
      {step === 0 && (
        <Spin spinning={busy} description="Đang kiểm tra mã...">
          {/* Lỗi (mã hết hạn / đã dùng) => quét lại mã mới */}
          <QrScanner key={error} onResult={handleScan} />
        </Spin>
      )}
      {step === 1 && (
        left > 0 ? (
          <Spin spinning={busy} description="Đang gửi ảnh...">
            <div className="text-center mb-2 text-sm">
              <Tag color={isOut ? 'purple' : 'cyan'}>{isOut ? 'RA CA' : 'VÀO CA'}</Tag> {ticket.label}
              {ticket.minutes_late > 0 && <Tag color="orange" className="ml-1">Trễ {ticket.minutes_late} phút</Tag>}
              {ticket.minutes_early > 0 && <Tag color="orange" className="ml-1">Về sớm {ticket.minutes_early} phút</Tag>}
              <div className={left <= 30 ? 'text-red-500 font-semibold' : 'text-gray-500'}>Còn {left} giây để chụp ảnh xác nhận</div>
            </div>
            {photo ? <img src={photo} alt="" className="w-full rounded-xl" /> : <FaceCapture onCapture={handleCapture} disabled={busy} />}
          </Spin>
        ) : (
          <Result status="warning" title="Hết thời gian chụp ảnh" subTitle="Bấm Chấm công trên máy ở quầy để lấy mã mới và quét lại"
            extra={<Button type="primary" onClick={() => { setStep(0); setTicket(null); setError(''); }}>Quét lại</Button>} />
        )
      )}
      {step === 2 && (
        <Result status="success" title={result?.message} subTitle={`Lúc ${fmtTime(result?.data?.time)}`}
          extra={<Button type="primary" onClick={onClose}>Xong</Button>} />
      )}
    </Modal>
  );
}

// Một dòng nhãn trạng thái vào / ra ca
function StatusTags({ view }) {
  const inSt = shiftStatus(view);
  const outSt = checkoutStatus(view);
  return (
    <div className="flex flex-wrap gap-1 justify-end">
      <Tag color={inSt.color} className="!mr-0">{inSt.label.replace(' - cần giải trình', '')}</Tag>
      {outSt && <Tag color={outSt.color} className="!mr-0">{outSt.label.replace(' - cần giải trình', '').replace(' - quét QR ra ca', '')}</Tag>}
    </div>
  );
}

export default function MyAttendancePage() {
  const [today, setToday] = useState([]);
  const [reasons, setReasons] = useState({});
  const [earlyReasons, setEarlyReasons] = useState({});
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(dayjs());
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [scan, setScan] = useState(false);
  const [explainShift, setExplainShift] = useState(null);
  const [checkoutForm, setCheckoutForm] = useState(null); // { shift, kind }
  let role = '';
  try { role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi */ }

  const loadToday = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${ATT_API}/me/today`, authConfig());
      setToday(res.data.data || []);
      setReasons(res.data.reasons || {});
      setEarlyReasons(res.data.early_reasons || {});
    } catch (err) {
      message.error(errorText(err, 'Không tải được ca hôm nay'));
    } finally {
      setLoading(false);
    }
  };
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${ATT_API}/me`, { ...authConfig(), params: { month: month.format('YYYY-MM') } });
      setHistory(res.data.data || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      message.error(errorText(err, 'Không tải được lịch sử chấm công'));
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => { if (STAFF_ROLES.includes(role)) loadToday(); }, []);
  useEffect(() => { if (STAFF_ROLES.includes(role)) { setHistoryLimit(10); loadHistory(); } }, [month]);
  // Cập nhật giai đoạn (mở / đóng QR) mỗi phút
  useEffect(() => {
    const timer = setInterval(loadToday, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!STAFF_ROLES.includes(role)) return <Result status="403" title="Chức năng dành cho bác sĩ, CSKH, NVBH, KTV" />;

  const refresh = () => { loadToday(); loadHistory(); };
  const past = history.filter((s) => s.record || s.explanation || s.phase !== 'UPCOMING').reverse(); // mới nhất lên đầu
  // Việc cần làm ngay, theo thứ tự ưu tiên
  const scanOut = today.find((s) => s.checkout === 'OPEN' || s.checkout === 'EARLY_LEAVE_READY');
  const scanIn = today.find((s) => s.phase === 'OPEN');
  const needCheckoutExplain = today.find((s) => s.checkout === 'NEED_EXPLANATION');
  const needExplain = today.find((s) => s.phase === 'NEED_EXPLANATION');
  const working = today.find((s) => s.checkout === 'WORKING');
  const upcoming = today.find((s) => s.phase === 'UPCOMING');

  const hero = (() => {
    if (scanOut || scanIn) {
      const s = scanOut || scanIn;
      const out = !!scanOut;
      return (
        <div className={`rounded-2xl p-5 text-white shadow-md space-y-3 bg-gradient-to-br ${out ? 'from-indigo-500 to-indigo-700' : 'from-teal-500 to-teal-700'}`}>
          <div>
            <div className="text-sm text-white/80">{out ? (s.checkout === 'EARLY_LEAVE_READY' ? 'Đã gửi đơn xin về sớm' : 'Đang mở chấm ra ca') : 'Đang mở chấm vào ca'}</div>
            <div className="text-2xl font-bold">{s.label}</div>
            <div className="text-sm text-white/90">
              {out ? <>Mã QR ra ca đóng lúc <b>{fmtTime(s.checkout_close_at)}</b></> : <>Mã QR đóng lúc <b>{fmtTime(s.close_at)}</b> · vào ca {fmtTime(s.start)}</>}
            </div>
          </div>
          <Button size="large" block icon={<ScanOutlined />} onClick={() => setScan(true)}
            className={`!h-14 !text-lg !font-semibold !rounded-xl !bg-white !border-0 ${out ? '!text-indigo-700' : '!text-teal-700'}`}>
            {out ? 'Quét QR ra ca' : 'Quét QR vào ca'}
          </Button>
        </div>
      );
    }
    const pending = needCheckoutExplain || needExplain;
    if (pending) {
      const out = !!needCheckoutExplain;
      return (
        <div className="rounded-2xl p-5 bg-amber-50 border border-amber-200 space-y-3">
          <div>
            <div className="text-sm text-amber-700">{out ? 'Bạn chưa chấm ra ca' : 'Bạn chưa chấm vào ca'}</div>
            <div className="text-xl font-bold text-amber-900">{pending.label} · {dayjs(pending.date).format('DD/MM')}</div>
            <div className="text-sm text-amber-800">Đã đóng mã QR. Hạn gửi giải trình: <b>{fmtDateTime(pending.explain_until)}</b></div>
          </div>
          <Button size="large" block icon={<FileTextOutlined />} className="!h-12 !rounded-xl !bg-amber-500 !text-white !border-0 !font-semibold"
            onClick={() => (out ? setCheckoutForm({ shift: pending, kind: 'FORGOT' }) : setExplainShift(pending))}>
            {out ? 'Giải trình quên chấm ra ca' : 'Gửi giải trình'}
          </Button>
        </div>
      );
    }
    if (working) {
      return (
        <div className="rounded-2xl p-5 bg-teal-50 border border-teal-100 space-y-3">
          <div>
            <div className="text-sm text-teal-700">Đang trong ca</div>
            <div className="text-xl font-bold text-teal-900">{working.label} · vào lúc {fmtTime(working.record?.check_in_at)}</div>
            <div className="text-sm text-teal-800">Chấm ra ca tại máy ở quầy từ <b>{fmtTime(working.checkout_open_at)}</b> đến {fmtTime(working.checkout_close_at)}</div>
          </div>
          <Button block icon={<LogoutOutlined />} className="!h-11 !rounded-xl" onClick={() => setCheckoutForm({ shift: working, kind: 'EARLY_LEAVE' })}>
            Xin về sớm
          </Button>
        </div>
      );
    }
    if (upcoming) {
      return (
        <div className="rounded-2xl p-5 bg-slate-50 border space-y-1">
          <div className="text-sm text-gray-500">Ca tiếp theo hôm nay</div>
          <div className="text-xl font-bold text-slate-800">{upcoming.label} · {fmtTime(upcoming.start)}</div>
          <div className="text-sm text-gray-600">Máy chấm công mở mã QR lúc <b>{fmtTime(upcoming.open_at)}</b> và đóng lúc {fmtTime(upcoming.close_at)}</div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl p-5 bg-slate-50 border text-center">
        <div className="text-lg font-semibold text-slate-700">{today.length ? 'Bạn đã hoàn tất chấm công hôm nay' : 'Hôm nay bạn không có ca làm'}</div>
        <div className="text-sm text-gray-500">Mở QR vào ca 20' trước đến 10' sau giờ vào ca · ra ca từ giờ kết thúc đến 30' sau.</div>
      </div>
    );
  })();

  const stats = summary ? [
    { label: 'Vi phạm thường', value: summary.normal_count, color: 'text-orange-500' },
    { label: 'Vi phạm nghiêm trọng', value: summary.serious_count, color: 'text-red-600' },
    { label: 'Thưởng chuyên cần', value: summary.bonus ? '500k' : '0', color: summary.bonus ? 'text-teal-600' : 'text-gray-400' },
  ] : [];

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-xl font-bold !mb-0">Chấm công</h2>
        <Button shape="circle" icon={<ReloadOutlined />} onClick={refresh} loading={loading} aria-label="Tải lại" />
      </div>

      {loading && !today.length ? <div className="rounded-2xl bg-gray-100 h-36 animate-pulse" /> : hero}

      {/* Các ca hôm nay */}
      {today.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-gray-700 !mb-0">Ca của bạn</h3>
          {today.map((s) => (
            <div key={s.id} className="bg-white border rounded-xl p-3 flex gap-3 items-center">
              {s.record?.photo_url
                ? <Image src={s.record.photo_url} width={48} height={48} className="rounded-lg object-cover" />
                : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-semibold shrink-0">{dayjs(s.date).format('DD/MM')}</div>}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">{s.label}</div>
                <div className="text-xs text-gray-500">
                  {fmtTime(s.start)} – {fmtTime(s.end)}
                  {s.record?.check_in_at && <> · vào <b className="text-slate-700">{fmtTime(s.record.check_in_at)}</b></>}
                  {s.record?.check_out_at && <> · ra <b className="text-slate-700">{fmtTime(s.record.check_out_at)}</b></>}
                </div>
                {s.violations?.length > 0 && <div className="text-xs text-orange-600 truncate">{s.violations.map((v) => v.label).join(' · ')}</div>}
              </div>
              <StatusTags view={s} />
            </div>
          ))}
        </section>
      )}

      {/* Thống kê + lịch sử theo tháng */}
      <section className="space-y-3">
        <div className="flex justify-between items-center gap-2">
          <h3 className="font-semibold text-gray-700 !mb-0">Lịch sử</h3>
          <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} allowClear={false} format="MM/YYYY" inputReadOnly className="w-32" />
        </div>
        {summary && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {stats.map((st) => (
                <div key={st.label} className="bg-white border rounded-xl py-3 px-1 text-center">
                  <div className={`text-xl font-bold ${st.color}`}>{st.value}</div>
                  <div className="text-[11px] text-gray-500 leading-tight">{st.label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 !mb-0">
              Thưởng chuyên cần {money(500000)} khi tổng vi phạm không quá 3 lần và không có vi phạm nghiêm trọng (kể cả vắng). Số liệu tạm tính, chốt khi quản lý khóa bảng lương.
            </p>
          </>
        )}
        {historyLoading ? <div className="rounded-xl bg-gray-100 h-24 animate-pulse" /> : past.length === 0 ? (
          <Empty description="Chưa có dữ liệu chấm công tháng này" />
        ) : (
          <div className="bg-white border rounded-xl divide-y">
            {past.slice(0, historyLimit).map((s) => {
              const d = dayjs(s.date);
              return (
                <div key={s.id} className="flex gap-3 items-center p-3">
                  <div className="w-11 text-center shrink-0">
                    <div className="text-lg font-bold text-slate-800 leading-none">{d.format('DD')}</div>
                    <div className="text-[11px] text-gray-500">{['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.day()]}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700">{SHIFT_LABEL[s.shift_type]}</div>
                    <div className="text-xs text-gray-500">
                      {s.record?.check_in_at ? `Vào ${fmtTime(s.record.check_in_at)}` : 'Không chấm vào'}
                      {s.record?.check_out_at && ` · ra ${fmtTime(s.record.check_out_at)}`}
                      {s.explanation && <> · giải trình {EXPLANATION_STATUS[s.explanation.status]?.label.toLowerCase()}</>}
                    </div>
                    {s.violations?.map((v) => (
                      <div key={v.code} className={`text-xs ${v.severity === 'SERIOUS' ? 'text-red-600' : 'text-orange-500'}`}>• {v.label}</div>
                    ))}
                  </div>
                  <StatusTags view={s} />
                </div>
              );
            })}
            {past.length > historyLimit && (
              <button className="w-full py-2.5 text-sm text-teal-700 font-medium" onClick={() => setHistoryLimit((n) => n + 10)}>
                Xem thêm ({past.length - historyLimit})
              </button>
            )}
          </div>
        )}
      </section>

      {scan && <CheckInFlow onClose={() => setScan(false)} onDone={refresh} />}
      {explainShift && (
        <ExplanationModal shift={explainShift} reasons={reasons} onClose={() => setExplainShift(null)}
          onDone={() => { setExplainShift(null); refresh(); }} />
      )}
      {checkoutForm && (
        <CheckoutRequestModal shift={checkoutForm.shift} kind={checkoutForm.kind} reasons={earlyReasons} onClose={() => setCheckoutForm(null)}
          onDone={() => { setCheckoutForm(null); refresh(); }} />
      )}
    </div>
  );
}
