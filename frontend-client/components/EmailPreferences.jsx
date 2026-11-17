// Hồ sơ cá nhân: bật / tắt email nhắc lịch. Email giao dịch (xác nhận lịch, đơn hàng, hoàn tiền) và bảo mật (mã OTP) luôn gửi.
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';

const URL = '/api/identity/users/me/email-preferences';
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('token')}` });

export default function EmailPreferences() {
  const [pref, setPref] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(URL, { headers: headers() }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPref(d.data)).catch(() => {});
  }, []);

  const toggle = async (value) => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(URL, { method: 'PUT', headers: headers(), body: JSON.stringify({ email_reminders: value }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setPref((p) => ({ ...p, email_reminders: value }));
      setMsg(d.message);
    } catch (e) { setMsg(e.message || 'Không lưu được'); } finally { setBusy(false); }
  };

  if (!pref) return null;
  return (
    <div className="card bg-base-100 shadow-sm border border-base-200 p-4 sm:p-6">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-2"><Mail className="text-primary" /> Email thông báo</h2>
      {pref.email ? (
        <>
          <p className="text-sm text-base-content/70 mb-3">Gửi tới <b>{pref.email}</b>. Email xác nhận lịch khám, đơn hàng, hoàn tiền và mã đặt lại mật khẩu luôn được gửi.</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={pref.email_reminders} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
            <span>
              <span className="font-medium">Nhận email nhắc lịch</span>
              <span className="block text-sm text-base-content/60">Nhắc trước giờ khám / tư vấn, nhắc tái khám theo hẹn của bác sĩ, nhắc buổi liệu trình còn dang dở.</span>
            </span>
          </label>
          {msg && <p className="text-sm text-success mt-2">{msg}</p>}
        </>
      ) : <p className="text-sm text-base-content/70">Tài khoản chưa có email nhận thông báo.</p>}
    </div>
  );
}
