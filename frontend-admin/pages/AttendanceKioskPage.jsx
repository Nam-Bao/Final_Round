import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCode, Button, Input, Progress, Result, Popconfirm, Form, message } from 'antd';
import { ScanOutlined, CheckCircleFilled, FullscreenOutlined, PoweroffOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ATT_API, QR_PREFIX } from '../components/attendance/attendanceApi';

// Máy chấm công đặt tại quầy (tablet / màn hình). Không cần đăng nhập nhân viên: dùng token máy do quản lý kích hoạt.
// Bấm "Chấm công" => hiện QR 20 giây (mỗi lần bấm 1 mã mới, dùng 1 lần) => nhân viên quét bằng điện thoại.
const TOKEN_KEY = 'attendance_kiosk_token';
const NAME_KEY = 'attendance_kiosk_name';

// Gọi API bằng fetch (không qua axios) để lỗi 401 của máy không làm đăng xuất phiên quản lý trên cùng trình duyệt
const kioskFetch = async (path, options = {}) => {
  const res = await fetch(`${ATT_API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Kiosk ${localStorage.getItem(TOKEN_KEY)}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || 'Lỗi kết nối'), { status: res.status });
  return json.data;
};

const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];
const sessionManagerToken = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
    return MANAGER_ROLES.includes(user.role) ? sessionStorage.getItem('admin_token') : null;
  } catch { return null; }
};

// Kích hoạt ngay trên trang này: quản lý đăng nhập (hoặc dùng phiên đang mở trong tab) để tạo máy chấm công.
// Token quản lý chỉ dùng cho bước này, không lưu lại trên thiết bị đặt ở quầy.
function Activation({ onDone }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const sessionToken = sessionManagerToken();

  const activate = async (values) => {
    setBusy(true);
    try {
      let token = sessionToken;
      if (!token) {
        const login = await fetch('http://localhost:4000/api/identity/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: values.email, password: values.password }),
        });
        const data = await login.json().catch(() => ({}));
        if (!login.ok) throw new Error(data.message || 'Đăng nhập thất bại');
        if (!MANAGER_ROLES.includes(data.user?.role)) throw new Error('Chỉ tài khoản quản lý mới kích hoạt được máy chấm công');
        token = data.token;
      }
      const res = await fetch(`${ATT_API}/kiosks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: values.name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Không kích hoạt được');
      localStorage.setItem(TOKEN_KEY, json.data.token);
      localStorage.setItem(NAME_KEY, json.data.name);
      message.success(json.message);
      onDone();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-sky-50 p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full space-y-4">
        <div className="text-center space-y-2">
          <ScanOutlined className="text-5xl text-teal-600" />
          <h1 className="text-2xl font-bold !mb-0">Kích hoạt máy chấm công</h1>
          <p className="text-gray-500 !mb-0">Thiết bị này (tablet / màn hình đặt tại quầy) sẽ hiện mã QR để nhân viên chấm công. Chỉ cần kích hoạt 1 lần.</p>
        </div>
        <Form form={form} layout="vertical" onFinish={activate} initialValues={{ name: 'Máy chấm công quầy lễ tân' }} requiredMark={false}>
          <Form.Item name="name" label="Tên máy" rules={[{ required: true, message: 'Nhập tên máy' }, { max: 100 }]}>
            <Input size="large" maxLength={100} />
          </Form.Item>
          {!sessionToken && (
            <>
              <Form.Item name="email" label="Email quản lý" rules={[{ required: true, message: 'Nhập email' }, { type: 'email', message: 'Email không hợp lệ' }]}>
                <Input size="large" autoComplete="username" />
              </Form.Item>
              <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
                <Input.Password size="large" autoComplete="current-password" />
              </Form.Item>
            </>
          )}
          <Button type="primary" htmlType="submit" size="large" block loading={busy} className="!bg-teal-600">Kích hoạt thiết bị này</Button>
        </Form>
        <p className="text-xs text-gray-400 text-center !mb-0">Tài khoản quản lý chỉ dùng để xác nhận, không được lưu trên máy này.</p>
      </div>
    </div>
  );
}

export default function AttendanceKioskPage() {
  const [activated, setActivated] = useState(!!localStorage.getItem(TOKEN_KEY));
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(dayjs());
  const [qr, setQr] = useState(null); // { id, code, expires_at, ttl }
  const [left, setLeft] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await kioskFetch('/kiosk/status'));
      setError('');
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setActivated(false);
        message.error(err.message);
      } else setError('Mất kết nối tới máy chủ, đang thử lại...');
    }
  }, []);

  useEffect(() => {
    if (!activated) return undefined;
    loadStatus();
    const timer = setInterval(loadStatus, 15000);
    return () => clearInterval(timer);
  }, [activated, loadStatus]);

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(timer);
  }, []);

  const closeQr = () => {
    clearInterval(pollRef.current);
    setQr(null);
    setDone(false);
  };

  // Đếm ngược 20 giây; hết giờ thì đóng QR, quay về nút Chấm công
  useEffect(() => {
    if (!qr) return undefined;
    const tick = () => {
      const remain = Math.max(0, Math.ceil(dayjs(qr.expires_at).diff(dayjs(), 'millisecond') / 1000));
      setLeft(remain);
      if (remain <= 0 && !done) closeQr();
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [qr, done]);

  const showQr = async () => {
    setBusy(true);
    try {
      const data = await kioskFetch('/kiosk/qr', { method: 'POST' });
      setQr(data);
      setDone(false);
      // Có người quét => đóng mã ngay để người sau bấm lấy mã mới
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const state = await kioskFetch(`/kiosk/qr/${data.id}`);
          if (state.used) {
            clearInterval(pollRef.current);
            setDone(true);
            setTimeout(closeQr, 3000);
          }
        } catch { /* thử lại lần sau */ }
      }, 1200);
    } catch (err) {
      message.error(err.message);
      loadStatus();
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => () => clearInterval(pollRef.current), []);

  // Tới giờ mở khung tiếp theo => tải lại trạng thái ngay (không chờ 15 giây)
  const nextOpen = status?.next?.open_at;
  const reachedNext = !!nextOpen && !now.isBefore(dayjs(nextOpen));
  useEffect(() => { if (reachedNext) loadStatus(); }, [reachedNext, loadStatus]);

  if (!activated) return <Activation onDone={() => setActivated(true)} />;

  // Tự đóng / mở theo đồng hồ máy, không cần chờ lần tải trạng thái tiếp theo
  const win = status?.window && now.isBefore(dayjs(status.window.until)) ? status.window : null;
  const next = status?.next;


  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-sky-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="font-bold text-teal-700 text-lg">GlowSkin · {status?.name || localStorage.getItem(NAME_KEY) || 'Máy chấm công'}</div>
        <div className="flex gap-2">
          <Button icon={<FullscreenOutlined />} onClick={() => document.documentElement.requestFullscreen?.()}>Toàn màn hình</Button>
          <Popconfirm title="Gỡ kích hoạt máy chấm công trên thiết bị này?" onConfirm={() => { localStorage.removeItem(TOKEN_KEY); setActivated(false); }}>
            <Button icon={<PoweroffOutlined />} danger>Gỡ kích hoạt</Button>
          </Popconfirm>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-10 text-center">
        <div className="text-6xl md:text-7xl font-bold text-slate-800 tabular-nums">{now.format('HH:mm:ss')}</div>
        <div className="text-slate-500 mt-1 mb-8 capitalize">{now.toDate().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        {error && <p className="text-orange-500 mb-4">{error}</p>}

        {qr ? (
          done ? (
            <Result status="success" icon={<CheckCircleFilled className="!text-green-500" />} title="Đã nhận quét mã"
              subTitle="Mời bạn chụp ảnh xác nhận trên điện thoại để hoàn tất" />
          ) : (
            <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 space-y-4">
              <div className="text-lg font-semibold text-slate-700">Quét mã bằng mục "Chấm công" trên điện thoại</div>
              <QRCode value={`${QR_PREFIX}${qr.code}`} size={Math.min(320, window.innerWidth - 120)} errorLevel="M" bordered={false} />
              <Progress type="circle" size={64} percent={(left / qr.ttl) * 100} format={() => `${left}s`} strokeColor={left <= 5 ? '#ef4444' : '#0d9488'} />
              <div><Button onClick={closeQr}>Đóng</Button></div>
            </div>
          )
        ) : win ? (
          <div className="space-y-4">
            <div className={`inline-block rounded-full px-5 py-2 font-semibold ${win.kind === 'WORKING' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
              {win.kind === 'IN' ? `Đang mở chấm VÀO ${win.label} · đóng lúc ${dayjs(win.until).format('HH:mm')}`
                : win.kind === 'OUT' ? `Đang mở chấm RA ${win.label} · đóng lúc ${dayjs(win.until).format('HH:mm')}`
                  : `Đang trong ${win.label} · chỉ nhân viên đã gửi đơn Xin về sớm mới quét ra ca`}
            </div>
            <div>
              <Button type="primary" size="large" icon={<ScanOutlined />} loading={busy} onClick={showQr}
                className="!h-20 !px-14 !text-2xl !rounded-full !bg-teal-600 hover:!bg-teal-700 shadow-lg">
                Chấm công
              </Button>
            </div>
            <p className="text-slate-500">Mỗi lần bấm tạo 1 mã mới, mã chỉ có hiệu lực {status?.qr_ttl || 20} giây và dùng cho 1 người.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Button size="large" disabled className="!h-20 !px-14 !text-2xl !rounded-full">Chấm công</Button>
            <p className="text-slate-500 text-lg">
              Ngoài giờ chấm công.{next && <> Mở lại lúc <b>{dayjs(next.open_at).format('HH:mm')}</b> (chấm {next.kind === 'OUT' ? 'ra' : 'vào'} {next.label}{dayjs(next.open_at).isSame(dayjs(), 'day') ? '' : ', ngày mai'}).</>}
            </p>
            <p className="text-slate-400 text-sm">Đến trễ sau giờ đóng mã: vào mục Chấm công trên tài khoản để gửi giải trình cho quản lý.</p>
          </div>
        )}
      </main>
    </div>
  );
}
