import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Tag, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const API = 'http://localhost:4000/api/booking/safety';
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });

// Sàng lọc an toàn của 1 hồ sơ người khám. Lưu = đã hỏi khách trong lần khám này.
// onStatus(true) khi đã xác nhận hôm nay và chưa sửa gì sau đó: trang đón khách chỉ cho chuyển hồ sơ lúc này
export default function PatientSafetyPanel({ patientProfileId, onSaved, onStatus }) {
  const [options, setOptions] = useState([]);
  const [flags, setFlags] = useState([]);
  const [allergies, setAllergies] = useState('');
  const [screenedAt, setScreenedAt] = useState(null);
  const [today, setToday] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [counter, setCounter] = useState(null); // khách khai khi mua tại quầy (chưa tính là sàng lọc của lần khám)

  useEffect(() => { onStatus?.(today && !dirty); }, [today, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!patientProfileId) return;
    axios.get(`${API}/flags`, { headers: headers() }).then((r) => setOptions(r.data.data)).catch(() => {});
    axios.get(`${API}/patients/${patientProfileId}`, { headers: headers() }).then((r) => {
      const d = r.data.data;
      setFlags(d.flags); setAllergies(d.allergies); setScreenedAt(d.screened_at); setToday(d.screened_today); setCounter(d.counter);
    }).catch(() => message.error('Không tải được sàng lọc an toàn'));
  }, [patientProfileId]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/patients/${patientProfileId}`, { flags, allergies }, { headers: headers() });
      setToday(true); setDirty(false); setScreenedAt(new Date().toISOString());
      message.success('Đã lưu sàng lọc an toàn');
      onSaved?.();
    } catch (error) { message.error(error.response?.data?.message || 'Không lưu được'); } finally { setSaving(false); }
  };

  if (!patientProfileId) return null;
  return (
    <div className="p-3 mb-4 rounded-lg border border-amber-200 bg-amber-50">
      <div className="flex items-center justify-between mb-2">
        <b>Sàng lọc an toàn</b>
        {today && dirty ? <Tag color="orange">Đã sửa, bấm xác nhận lại</Tag> : today ? <Tag color="green">Đã hỏi hôm nay</Tag> : <Tag color="orange">{screenedAt ? `Hỏi lần cuối ${dayjs(screenedAt).format('DD/MM/YYYY')}` : 'Chưa sàng lọc'}</Tag>}
      </div>
      {counter && (!screenedAt || dayjs(counter.reported_at).isAfter(dayjs(screenedAt))) && (
        <Alert className="mb-2" type="info" showIcon
          message={`Khách khai khi mua tại quầy ngày ${dayjs(counter.reported_at).format('DD/MM/YYYY')}`}
          description={(
            <div className="text-sm">
              <div>{counter.flags.length ? counter.flags.map((f) => options.find((o) => o.value === f)?.label || f).join(', ') : 'Không mang thai / cho con bú'}{counter.allergies ? `; dị ứng: ${counter.allergies}` : ''}</div>
              <Button size="small" className="mt-1" onClick={() => {
                setFlags((cur) => [...new Set([...cur, ...counter.flags])]);
                if (counter.allergies) setAllergies((cur) => (cur ? `${cur}, ${counter.allergies}` : counter.allergies));
                setDirty(true);
              }}>Điền vào form</Button>
              <span className="text-xs text-gray-500 ml-2">Vẫn phải hỏi lại khách rồi bấm xác nhận</span>
            </div>
          )} />
      )}
      <Checkbox.Group className="grid grid-cols-1 md:grid-cols-2 gap-1 mb-2" options={options} value={flags} onChange={(v) => { setFlags(v); setDirty(true); }} />
      <Input className="mb-2" maxLength={500} value={allergies} onChange={(e) => { setAllergies(e.target.value); setDirty(true); }} placeholder="Thành phần đã dị ứng, cách nhau bằng dấu phẩy. VD: Salicylic Acid, Niacinamide" />
      <div className="text-xs text-gray-600 mb-2">Hỏi khách từng mục (không có mục nào thì để trống), rồi bấm xác nhận. Phải xác nhận mới chuyển được hồ sơ cho bác sĩ.</div>
      <Button size="small" type="primary" loading={saving} onClick={save}>Xác nhận đã hỏi khách</Button>
    </div>
  );
}

// Danh sách cảnh báo kèm nguồn, dùng ở màn hình kê đơn và hộp xác nhận
export function SafetyWarnings({ warnings }) {
  const type = { CONTRAINDICATED: 'error', CAUTION: 'warning', INFO: 'info' };
  return (warnings || []).map((w, i) => (
    <Alert key={`${w.code}-${w.item}-${i}`} className="mb-2" type={type[w.severity]} showIcon
      message={<span><b>{w.severity_label}</b>{w.item ? `: ${w.item}` : ''}</span>}
      description={(
        <div className="text-sm">
          {w.condition && <div className="text-gray-500">{w.condition}</div>}
          <div>{w.message}</div>
          {w.sources?.map((s) => (
            <div key={s.label} className="text-xs">Nguồn: {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}</div>
          ))}
        </div>
      )} />
  ));
}
