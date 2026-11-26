import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Modal, Popconfirm, Spin, Steps, message } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import FaceCapture from './FaceCapture';
import { authConfig, errorText } from './attendanceApi';
import { API_BASE } from '../../config';

// Ảnh gốc khuôn mặt để hệ thống so với ảnh chấm công (dữ liệu sinh trắc học: lưu riêng tư, quản lý duyệt, xoá khi nghỉ việc)
const FACE_API = `${API_BASE}/api/ai/faces`;
const FACE_UPLOAD = `${API_BASE}/api/media/upload/face`;
const POSES = ['Nhìn thẳng vào camera', 'Quay mặt nhẹ sang TRÁI', 'Quay mặt nhẹ sang PHẢI'];

function EnrollModal({ onClose, onDone }) {
  const [step, setStep] = useState(0); // 0: đồng ý, 1-3: chụp, 4: gửi
  const [consent, setConsent] = useState(false);
  const [ids, setIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (list) => {
    setStep(4); setBusy(true);
    try {
      const res = await axios.post(`${FACE_API}/enroll`, { public_ids: list, consent: true }, authConfig());
      message.success(res.data.message); onDone(); onClose();
    } catch (err) {
      setError(errorText(err, 'Không gửi được ảnh')); setIds([]); setStep(1); // chụp lại từ đầu
    } finally { setBusy(false); }
  };
  const handleCapture = async ({ blob }) => {
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('image', new File([blob], 'khuon-mat.jpg', { type: 'image/jpeg' }));
      const res = await axios.post(FACE_UPLOAD, form, authConfig());
      const next = [...ids, res.data.public_id];
      setIds(next);
      if (next.length === POSES.length) await submit(next); else setStep(next.length + 1);
    } catch (err) { setError(errorText(err, 'Không tải được ảnh')); } finally { setBusy(false); }
  };

  return (
    <Modal open title="Đăng ký ảnh gốc khuôn mặt" onCancel={onClose} footer={null} width={460} destroyOnHidden centered maskClosable={false}>
      <Steps size="small" current={Math.min(step, 4)} className="mb-4" items={[{ title: 'Đồng ý' }, { title: 'Thẳng' }, { title: 'Trái' }, { title: 'Phải' }, { title: 'Gửi' }]} />
      {error && <Alert type="error" showIcon className="mb-3" message={error} />}
      {step === 0 && (
        <div className="space-y-3 text-sm">
          <p>Hệ thống lưu <b>3 ảnh khuôn mặt</b> của bạn để so với ảnh chụp mỗi lần chấm công, tránh chấm công hộ.</p>
          <ul className="list-disc pl-5 text-gray-600 space-y-1">
            <li>Ảnh và dữ liệu khuôn mặt chỉ dùng cho chấm công, lưu riêng tư (không có đường dẫn công khai), chỉ quản lý được xem.</li>
            <li>Quản lý duyệt ảnh trước khi dùng. Ảnh chấm công không khớp chỉ được đánh dấu để quản lý kiểm tra, không tự động trừ công.</li>
            <li>Dữ liệu bị xoá khi bạn nghỉ việc hoặc khi bạn rút lại đồng ý (lúc đó quản lý xem ảnh chấm công bằng mắt như trước).</li>
          </ul>
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)}>Tôi đồng ý cho phòng khám xử lý dữ liệu khuôn mặt của tôi cho mục đích chấm công</Checkbox>
          <Button type="primary" block disabled={!consent} onClick={() => setStep(1)}>Bắt đầu chụp</Button>
        </div>
      )}
      {step >= 1 && step <= 3 && (
        <Spin spinning={busy} description="Đang tải ảnh...">
          <p className="text-center font-semibold mb-2">Ảnh {step}/3: {POSES[step - 1]}</p>
          <FaceCapture key={step} onCapture={handleCapture} disabled={busy} />
          <p className="text-xs text-gray-500 mt-2">Chụp nơi đủ sáng, không đeo khẩu trang / kính râm. Đeo kính cận thì giữ như khi đi làm.</p>
        </Spin>
      )}
      {step === 4 && <Spin spinning description="Đang kiểm tra 3 ảnh có cùng một người..."><div className="h-24" /></Spin>}
    </Modal>
  );
}

export default function FaceEnrollCard() {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => axios.get(`${FACE_API}/me`, authConfig()).then((r) => setState(r.data.data)).catch(() => setState(null));
  useEffect(() => { load(); }, []);
  if (!state) return null;
  const revoke = async () => {
    try { const r = await axios.delete(`${FACE_API}/me`, authConfig()); message.success(r.data.message); load(); } catch (e) { message.error(errorText(e, 'Không xoá được')); }
  };
  const box = {
    NONE: ['warning', 'Bạn chưa có ảnh gốc khuôn mặt', 'Đăng ký 3 ảnh để hệ thống xác thực ảnh chấm công là đúng bạn.'],
    REJECTED: ['error', 'Quản lý yêu cầu chụp lại ảnh gốc', `Lý do: ${state.rejected_note || ''}`],
    PENDING: ['info', 'Ảnh gốc đang chờ quản lý duyệt', `Gửi lúc ${dayjs(state.pending_since).format('HH:mm DD/MM/YYYY')}${state.has_active ? '. Trong lúc chờ, hệ thống vẫn so với ảnh gốc cũ.' : ''}`],
    APPROVED: ['success', 'Đã có ảnh gốc khuôn mặt', `Quản lý duyệt ngày ${dayjs(state.active_since).format('DD/MM/YYYY')}. Ảnh chấm công được so với ảnh gốc.`],
  }[state.status];
  return (
    <>
      <Alert type={box[0]} showIcon icon={<SafetyCertificateOutlined />} message={box[1]} description={
        <div className="space-y-2">
          <div>{box[2]}</div>
          <div className="flex flex-wrap gap-2">
            <Button size="small" type={state.status === 'NONE' || state.status === 'REJECTED' ? 'primary' : 'default'} onClick={() => setOpen(true)}>
              {state.status === 'NONE' ? 'Đăng ký khuôn mặt' : 'Chụp lại / đăng ký lại'}
            </Button>
            {(state.has_active || state.status === 'PENDING') && (
              <Popconfirm title="Xoá ảnh gốc và rút lại đồng ý?" description="Ảnh chấm công sau đó không được so tự động." onConfirm={revoke} okText="Xoá" cancelText="Không">
                <Button size="small" danger type="link">Rút lại đồng ý</Button>
              </Popconfirm>
            )}
          </div>
        </div>
      } />
      {open && <EnrollModal onClose={() => setOpen(false)} onDone={load} />}
    </>
  );
}
