// Quên mật khẩu: bước 1 nhập email nhận mã OTP, bước 2 nhập mã + mật khẩu mới
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API = '/api/identity/auth';
const post = async (path, body) => {
  const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Có lỗi xảy ra, vui lòng thử lại');
  return data;
};

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [wait, setWait] = useState(0); // giây chờ trước khi gửi lại mã

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const requestCode = async (e) => {
    e?.preventDefault();
    setError(''); setBusy(true);
    try {
      const data = await post('forgot-password', { email });
      setInfo(data.message);
      setWait(data.resend_after || 60);
      setStep(2);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Mật khẩu nhập lại không khớp');
    setBusy(true);
    try {
      const data = await post('reset-password', { email, otp, new_password: password });
      navigate('/login', { replace: true, state: { notice: data.message } });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl font-bold justify-center mb-1">Quên mật khẩu</h2>
          <ul className="steps steps-horizontal text-xs mb-3">
            <li className="step step-primary">Nhận mã qua email</li>
            <li className={`step ${step === 2 ? 'step-primary' : ''}`}>Đặt mật khẩu mới</li>
          </ul>
          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}

          {step === 1 ? (
            <form onSubmit={requestCode}>
              <p className="text-sm text-base-content/70 mb-3">Nhập email đã dùng để đăng ký. GlowSkin sẽ gửi mã xác nhận gồm 6 chữ số, có hiệu lực 15 phút.</p>
              <div className="form-control mb-4">
                <label className="label"><span className="label-text">Email</span></label>
                <input type="email" className="input input-bordered" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? <span className="loading loading-spinner loading-sm" /> : 'Gửi mã xác nhận'}</button>
            </form>
          ) : (
            <form onSubmit={reset}>
              {info && <div className="alert alert-info py-2 text-sm mb-2">{info}</div>}
              <p className="text-sm text-base-content/70 mb-2">Kiểm tra hộp thư <b>{email}</b> (cả mục Thư rác / Quảng cáo).</p>
              <div className="form-control mb-2">
                <label className="label"><span className="label-text">Mã xác nhận</span></label>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input input-bordered tracking-[0.5em] text-center text-lg" required
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" autoFocus />
              </div>
              <div className="form-control mb-2">
                <label className="label"><span className="label-text">Mật khẩu mới (ít nhất 6 ký tự)</span></label>
                <input type="password" className="input input-bordered" required minLength={6} maxLength={100} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="form-control mb-4">
                <label className="label"><span className="label-text">Nhập lại mật khẩu mới</span></label>
                <input type="password" className="input input-bordered" required minLength={6} maxLength={100} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={busy || otp.length !== 6}>{busy ? <span className="loading loading-spinner loading-sm" /> : 'Đặt lại mật khẩu'}</button>
              <div className="flex justify-between text-sm mt-3">
                <button type="button" className="link link-hover" onClick={() => { setStep(1); setOtp(''); setError(''); }}>Đổi email</button>
                <button type="button" className="link link-primary disabled:no-underline disabled:text-base-content/40" disabled={wait > 0 || busy} onClick={requestCode}>
                  {wait > 0 ? `Gửi lại mã sau ${wait} giây` : 'Gửi lại mã'}
                </button>
              </div>
            </form>
          )}
          <p className="text-center text-sm mt-4"><Link to="/login" className="text-primary hover:underline">Quay lại đăng nhập</Link></p>
        </div>
      </div>
    </div>
  );
}
