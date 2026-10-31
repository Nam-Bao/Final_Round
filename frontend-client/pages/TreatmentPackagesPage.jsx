import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { Layers, CalendarCheck, CheckCircle2, Clock, CalendarX, Info } from 'lucide-react';

const API = 'http://localhost:4000/api/booking/packages/mine';
const authHeaders = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } });
const formatDate = (d) => dayjs(d).format('DD/MM/YYYY');
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const SESSION_STATUS = {
  SCHEDULED: { label: 'Đã đặt lịch', className: 'badge-info text-white' },
  WAITING: { label: 'Chờ thực hiện', className: 'badge-warning' },
  IN_PROGRESS: { label: 'Đang thực hiện', className: 'badge-primary' },
  COMPLETED: { label: 'Hoàn thành', className: 'badge-success text-white' },
};

const PACKAGE_STATUS = {
  ACTIVE: { label: 'Đang sử dụng', className: 'badge-primary' },
  COMPLETED: { label: 'Đã hoàn thành', className: 'badge-success text-white' },
  CANCELLED: { label: 'Đã hủy', className: 'badge-ghost' },
};

// Một gói liệu trình đã mua: tiến độ, lịch sử buổi, đặt / hủy buổi tiếp theo
function PackageCard({ pkg, onChanged }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const percent = Math.round((pkg.completed_sessions / pkg.total_sessions) * 100);

  const book = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${API}/${pkg.id}/sessions`, { session_date: selectedDate }, authHeaders());
      alert(res.data.message);
      setSelectedDate('');
      onChanged();
    } catch (err) {
      setError(err.response?.data?.message || 'Không đặt được buổi hẹn, vui lòng thử lại');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm(`Hủy buổi ${pkg.upcoming.session_number} ngày ${formatDate(pkg.upcoming.session_date)}?`)) return;
    setBusy(true);
    try {
      await axios.delete(`${API}/sessions/${pkg.upcoming.id}`, authHeaders());
      onChanged();
    } catch (err) {
      alert(err.response?.data?.message || 'Không hủy được buổi hẹn');
    } finally {
      setBusy(false);
    }
  };

  const status = PACKAGE_STATUS[pkg.status] || PACKAGE_STATUS.ACTIVE;

  return (
    <div className="card bg-base-100 shadow-md border border-base-200 p-6 space-y-5">
      {/* Tiêu đề & tiến độ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-secondary">{pkg.name}</h2>
          <p className="text-sm text-base-content/60">
            Mua ngày {formatDate(pkg.purchased_at)} · Hạn sử dụng đến {formatDate(pkg.expires_at)}
            {pkg.interval_days > 0 && ` · Mỗi buổi cách nhau tối thiểu ${pkg.interval_days} ngày`}
          </p>
        </div>
        <span className={`badge ${status.className}`}>{status.label}</span>
      </div>

      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Đã hoàn thành <b>{pkg.completed_sessions}/{pkg.total_sessions}</b> buổi</span>
          <span className="text-base-content/60">Còn {pkg.remaining_sessions} buổi</span>
        </div>
        <progress className="progress progress-primary w-full" value={percent} max="100"></progress>
      </div>

      {/* Lịch sử các buổi */}
      {pkg.sessions.length > 0 && (
        <ul className="space-y-2">
          {pkg.sessions.map((s) => {
            const st = SESSION_STATUS[s.status] || { label: s.status, className: 'badge-ghost' };
            return (
              <li key={s.id} className="flex items-center justify-between bg-base-200/50 rounded-lg px-4 py-2 text-sm">
                <span className="flex items-center gap-2">
                  {s.status === 'COMPLETED' ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Clock className="w-4 h-4 text-primary" />}
                  Buổi {s.session_number} · {formatDate(s.session_date)}
                </span>
                <span className={`badge badge-sm ${st.className}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Buổi sắp tới */}
      {pkg.upcoming && (
        <div className="alert bg-primary/5 border border-primary/20 text-sm flex-wrap">
          <CalendarCheck className="w-5 h-5 text-primary" />
          <span className="flex-1">
            Buổi {pkg.upcoming.session_number} của bạn vào <b>{formatDate(pkg.upcoming.session_date)}</b>.
            Vui lòng đến phòng khám trong giờ làm việc, kỹ thuật viên sẽ thực hiện cho bạn.
          </span>
          {pkg.upcoming.status === 'SCHEDULED' && (
            <button onClick={cancel} disabled={busy} className="btn btn-sm btn-outline btn-error gap-1">
              <CalendarX className="w-4 h-4" /> Hủy để đổi ngày
            </button>
          )}
        </div>
      )}

      {/* Đặt buổi tiếp theo */}
      {pkg.can_book ? (
        <div className="space-y-3 border-t border-base-200 pt-4">
          <h3 className="font-semibold">Đặt buổi {pkg.sessions.length + 1}: chọn ngày có kỹ thuật viên làm việc</h3>
          <div className="flex flex-wrap gap-2">
            {pkg.available_dates.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`btn btn-sm flex-col h-auto py-1 ${selectedDate === d ? 'btn-primary' : 'btn-outline btn-primary'}`}
              >
                <span className="text-[10px] font-normal">{WEEKDAYS[dayjs(d).day()]}</span>
                {dayjs(d).format('DD/MM')}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <button onClick={book} disabled={!selectedDate || busy} className="btn btn-primary btn-sm gap-1">
            <CalendarCheck className="w-4 h-4" /> {selectedDate ? `Đặt ngày ${formatDate(selectedDate)}` : 'Chọn ngày để đặt'}
          </button>
        </div>
      ) : (
        pkg.status === 'ACTIVE' && !pkg.upcoming && pkg.block_reason && (
          <p className="text-sm text-base-content/60 flex items-center gap-2 border-t border-base-200 pt-4">
            <Info className="w-4 h-4" /> {pkg.block_reason}
          </p>
        )
      )}
    </div>
  );
}

export default function TreatmentPackagesPage() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchPackages = async () => {
    try {
      const res = await axios.get(API, authHeaders());
      setPackages(res.data.data || []);
      setLoadError('');
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Không tải được gói liệu trình');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPackages(); }, []);

  if (loading) {
    return <div className="text-center py-20"><span className="loading loading-spinner loading-lg text-primary"></span></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="text-primary" /> Lộ Trình Trị Liệu O2O</h1>

      {loadError ? (
        <div className="alert alert-error">{loadError}</div>
      ) : packages.length === 0 ? (
        <div className="text-center py-10 bg-base-100 rounded-xl border border-base-200 space-y-3">
          <p className="text-base-content/60">Bạn chưa đăng ký gói liệu trình nào.</p>
          <p className="text-sm text-base-content/50">Gói liệu trình được bác sĩ chỉ định sau buổi khám, phù hợp với tình trạng da của bạn.</p>
          <Link to="/booking" className="btn btn-primary btn-sm">Đặt lịch khám</Link>
        </div>
      ) : (
        packages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} onChanged={fetchPackages} />)
      )}
    </div>
  );
}
