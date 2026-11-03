import React, { useEffect, useState } from 'react';
import { Select, Empty, Result, Tag, Spin, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { PAYROLL_API, authConfig, errorText, money, fmtTime, SHIFT_LABEL, STAFF_ROLES } from '../components/attendance/attendanceApi';

// Phiếu lương của nhân viên: chỉ xem được tháng quản lý đã duyệt & khóa
export default function MyPayslipPage() {
  const [data, setData] = useState(null);
  const [months, setMonths] = useState([]);
  const [meta, setMeta] = useState({ categories: {}, discipline_actions: {} });
  const [month, setMonth] = useState(undefined);
  const [loading, setLoading] = useState(true);
  let role = '';
  try { role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi */ }

  useEffect(() => {
    if (!STAFF_ROLES.includes(role)) return;
    setLoading(true);
    axios.get(`${PAYROLL_API}/me`, { ...authConfig(), params: month ? { month } : {} })
      .then((res) => {
        setData(res.data.data);
        setMonths(res.data.months || []);
        setMeta({ categories: res.data.categories || {}, discipline_actions: res.data.discipline_actions || {} });
      })
      .catch((err) => message.error(errorText(err, 'Không tải được phiếu lương')))
      .finally(() => setLoading(false));
  }, [month]);

  if (!STAFF_ROLES.includes(role)) return <Result status="403" title="Chức năng dành cho bác sĩ, CSKH, NVBH, KTV" />;

  const item = data?.item;
  const rows = item ? [
    { label: `Lương ca (${item.worked_shifts}/${item.scheduled_shifts} ca có công)`, value: Number(item.shift_pay) },
    { label: 'Thưởng chuyên cần', value: Number(item.attendance_bonus), hint: Number(item.attendance_bonus) ? null : 'Không đạt (vi phạm quá 3 lần hoặc có vi phạm nghiêm trọng)' },
    ...data.adjustments.map((a) => ({ label: `${meta.categories[a.type]?.[a.category] || 'Khoản khác'}: ${a.reason}`, value: a.type === 'PLUS' ? Number(a.amount) : -Number(a.amount) })),
  ] : [];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-xl font-bold !mb-0">Phiếu lương</h2>
        {months.length > 0 && (
          <Select className="w-36" value={data?.month} onChange={setMonth}
            options={months.map((m) => ({ value: m, label: `Tháng ${dayjs(`${m}-01`).format('MM/YYYY')}` }))} />
        )}
      </div>

      <Spin spinning={loading}>
        {!item ? (
          !loading && <Empty description="Chưa có phiếu lương nào được duyệt" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-white bg-gradient-to-br from-teal-500 to-teal-700 shadow-md">
              <div className="text-sm text-white/80">Thực nhận tháng {dayjs(`${data.month}-01`).format('MM/YYYY')}</div>
              <div className="text-3xl font-bold">{money(item.total)}</div>
              <div className="text-sm text-white/80">{item.employee_name} · đã làm tròn đến 1.000đ</div>
            </div>

            <div className="bg-white border rounded-xl divide-y">
              {rows.map((r, i) => (
                <div key={i} className="flex justify-between gap-3 p-3 text-sm">
                  <div>
                    <div className="text-slate-700">{r.label}</div>
                    {r.hint && <div className="text-xs text-gray-500">{r.hint}</div>}
                  </div>
                  <b className={r.value < 0 ? 'text-red-600' : 'text-slate-800'}>{r.value < 0 ? '−' : ''}{money(Math.abs(r.value))}</b>
                </div>
              ))}
              <div className="flex justify-between p-3 bg-slate-50 font-semibold"><span>Tổng nhận</span><span>{money(item.total)}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white border rounded-xl py-3 text-center"><div className="text-xl font-bold text-orange-500">{item.normal_violations}</div><div className="text-xs text-gray-500">Vi phạm thường</div></div>
              <div className="bg-white border rounded-xl py-3 text-center"><div className="text-xl font-bold text-red-600">{item.serious_violations}</div><div className="text-xs text-gray-500">Vi phạm nghiêm trọng</div></div>
            </div>

            {data.discipline.length > 0 && (
              <div className="border border-red-200 bg-red-50 rounded-xl p-3 space-y-1 text-sm">
                <div className="font-semibold text-red-700">Quyết định kỷ luật</div>
                {data.discipline.map((d, i) => (
                  <div key={i}>{meta.discipline_actions[d.action]}{d.delay_months ? ` ${d.delay_months} tháng` : ''} · {dayjs(d.decided_at).format('DD/MM/YYYY')}: {d.reason}</div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold text-gray-700 !mb-0">Chi tiết từng ca</h3>
              <div className="bg-white border rounded-xl divide-y">
                {item.details.map((d) => (
                  <div key={d.shift_id} className="flex gap-3 items-center p-3">
                    <div className="w-11 text-center shrink-0">
                      <div className="text-lg font-bold text-slate-800 leading-none">{dayjs(d.date).format('DD')}</div>
                      <div className="text-[11px] text-gray-500">{['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayjs(d.date).day()]}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">{SHIFT_LABEL[d.shift_type]}</div>
                      <div className="text-xs text-gray-500">{d.worked ? `Vào ${fmtTime(d.check_in_at)} · ra ${fmtTime(d.check_out_at)}` : 'Vắng'}</div>
                      {d.violations.map((v) => <div key={v.code} className={`text-xs ${v.severity === 'SERIOUS' ? 'text-red-600' : 'text-orange-500'}`}>• {v.label}</div>)}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-semibold ${d.worked ? 'text-slate-800' : 'text-red-600'}`}>{money(d.paid)}</div>
                      {!d.worked && <Tag color="red" className="!mr-0">Vắng</Tag>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Spin>
    </div>
  );
}
