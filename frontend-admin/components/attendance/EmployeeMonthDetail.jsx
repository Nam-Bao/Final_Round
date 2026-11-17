// Chi tiết chấm công 1 nhân viên trong tháng (mở từ tab "Báo cáo tháng")
import React, { useMemo, useState } from 'react';
import { Drawer, Tag, Table, Collapse, Segmented, Button, Empty, Tooltip, Alert } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { shiftStatus, checkoutStatus, fmtTime, money, REQUEST_KIND, EXPLANATION_STATUS } from './attendanceApi';
import { FaceBadge, FLAGGED } from './FaceAdmin';

const DISCIPLINE = { REPRIMAND: 'Đề xuất khiển trách', SALARY_RAISE_DELAY: 'Đề xuất kéo dài thời hạn nâng lương' };
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const SHORT = { MORNING: 'Sáng', AFTERNOON: 'Chiều', EVENING: 'Tối' };
const ORDER = { MORNING: 0, AFTERNOON: 1, EVENING: 2 };

// Phân loại 1 ca để tô màu lịch và gom nhóm
const kindOf = (s) => {
  const r = s.record;
  if (r?.status === 'ABSENT') return 'absent';
  if (!r) return s.phase === 'UPCOMING' ? 'upcoming' : 'pending';
  if ((s.violations || []).some((v) => v.severity === 'SERIOUS')) return 'serious';
  if ((s.violations || []).length) return 'minor';
  return 'ok';
};
const KIND = {
  ok: { label: 'Đủ công, không vi phạm', cls: 'bg-green-100 text-green-800 border-green-300' },
  minor: { label: 'Có vi phạm thường (trễ / về sớm có duyệt)', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  serious: { label: 'Vi phạm nghiêm trọng', cls: 'bg-red-100 text-red-800 border-red-300' },
  absent: { label: 'Vắng', cls: 'bg-red-500 text-white border-red-600' },
  pending: { label: 'Chờ giải trình / chưa chốt', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  upcoming: { label: 'Chưa tới', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};
const ddmm = (d) => dayjs(d).format('DD/MM');
const dayName = (d) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayjs(d).day()];

const downloadCsv = (filename, header, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
};

function Stat({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

// Lịch tháng: mỗi ô 1 ngày, mỗi ca 1 vạch màu
function MonthGrid({ month, shifts, onPick }) {
  const first = month.startOf('month');
  const lead = (first.day() + 6) % 7; // thứ 2 đầu tuần
  const byDate = {};
  for (const s of shifts) (byDate[s.date] ||= []).push(s);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: month.daysInMonth() }, (_, i) => first.add(i, 'day'))];
  const today = dayjs().format('YYYY-MM-DD');
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const key = d.format('YYYY-MM-DD');
          const list = byDate[key] || [];
          return (
            <div key={key} className={`min-h-[52px] rounded border p-1 text-xs ${list.length ? 'border-gray-300 cursor-pointer hover:shadow' : 'border-gray-100 text-gray-300'} ${key === today ? 'ring-2 ring-blue-400' : ''}`}
              onClick={() => list.length && onPick(key)}>
              <div className="font-medium">{d.date()}</div>
              {list.map((s) => (
                <Tooltip key={s.id} title={`${s.label}: ${shiftStatus(s).label}${s.violations?.length ? ` · ${s.violations.map((v) => v.label).join('; ')}` : ''}`}>
                  <div className={`mt-0.5 rounded border px-1 leading-4 truncate ${KIND[kindOf(s)].cls}`}>{SHORT[s.shift_type]}</div>
                </Tooltip>
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {Object.entries(KIND).map(([k, v]) => <span key={k} className={`text-xs rounded border px-2 ${v.cls}`}>{v.label}</span>)}
      </div>
    </div>
  );
}

// Danh sách ngày gọn trong từng nhóm
const DayList = ({ items, render }) => (items.length
  ? <div className="flex flex-wrap gap-1.5">{items.map((s) => <Tag key={s.id} className="!m-0">{dayName(s.date)} {ddmm(s.date)} · {SHORT[s.shift_type]}{render ? ` · ${render(s)}` : ''}</Tag>)}</div>
  : <span className="text-gray-400 text-sm">Không có</span>);

export default function EmployeeMonthDetail({ open, onClose, person, summary, shifts, month }) {
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState(null);
  const list = useMemo(() => [...shifts].sort((a, b) => a.date.localeCompare(b.date) || (ORDER[a.shift_type] ?? 9) - (ORDER[b.shift_type] ?? 9)), [shifts]);
  if (!summary) return null;

  const done = list.filter((s) => s.record);
  const worked = list.filter((s) => s.record && s.record.status !== 'ABSENT');
  const absent = list.filter((s) => s.record?.status === 'ABSENT');
  const late = worked.filter((s) => s.record.minutes_late > 0);
  const early = worked.filter((s) => s.record.minutes_early > 0);
  const missingOut = worked.filter((s) => s.record.checkout_status === 'MISSING');
  const explained = list.filter((s) => s.explanation);
  const requests = list.filter((s) => s.checkout_request);
  const faces = worked.filter((s) => FLAGGED.includes(s.record.face_check?.status) || FLAGGED.includes(s.record.checkout_face_check?.status));
  const adjusted = list.filter((s) => s.adjusted);
  const unsettled = list.filter((s) => s.unsettled && s.phase !== 'UPCOMING');
  const upcoming = list.filter((s) => !s.record && s.phase === 'UPCOMING');
  const violations = list.flatMap((s) => (s.violations || []).map((v) => ({ ...v, s })));
  const onTimeRate = worked.length ? Math.round((100 * worked.filter((s) => !s.record.minutes_late).length) / worked.length) : null;
  const attendRate = done.length ? Math.round((100 * worked.length) / done.length) : null;
  const hours = worked.reduce((sum, s) => {
    const r = s.record;
    if (!r.check_in_at || !r.check_out_at) return sum;
    return sum + Math.max(0, dayjs(r.check_out_at).diff(dayjs(r.check_in_at), 'minute'));
  }, 0);
  const avgLate = late.length ? Math.round(late.reduce((n, s) => n + s.record.minutes_late, 0) / late.length) : 0;
  const weekdayLate = late.reduce((m, s) => ({ ...m, [dayName(s.date)]: (m[dayName(s.date)] || 0) + 1 }), {});
  const lateDay = Object.entries(weekdayLate).sort((a, b) => b[1] - a[1])[0];
  const totalViolations = summary.normal_violations + summary.serious_violations;

  const rows = list.filter((s) => (filter === 'all' ? true
    : filter === 'absent' ? s.record?.status === 'ABSENT'
      : filter === 'late' ? s.record?.minutes_late > 0
        : filter === 'early' ? s.record?.minutes_early > 0
          : filter === 'violation' ? (s.violations || []).length
            : filter === 'pending' ? s.unsettled && s.phase !== 'UPCOMING' : true))
    .filter((s) => !picked || s.date === picked);

  const exportOne = () => downloadCsv(`cham-cong-${(person?.name || 'nhan-vien').replace(/\s+/g, '-')}-${month.format('MM-YYYY')}.csv`,
    ['Ngày', 'Thứ', 'Ca', 'Vào ca', 'Giờ vào', 'Phút trễ', 'Ra ca', 'Giờ ra', 'Phút về sớm', 'Vi phạm', 'Giải trình', 'Đơn ra ca', 'Ghi chú'],
    list.map((s) => [dayjs(s.date).format('DD/MM/YYYY'), dayName(s.date), s.label, shiftStatus(s).label, fmtTime(s.record?.check_in_at), s.record?.minutes_late || 0,
      checkoutStatus(s)?.label || '', fmtTime(s.record?.check_out_at), s.record?.minutes_early || 0,
      (s.violations || []).map((v) => `${v.severity === 'SERIOUS' ? '[Nghiêm trọng] ' : ''}${v.label}`).join('; '),
      s.explanation ? `${EXPLANATION_STATUS[s.explanation.status]?.label}: ${s.explanation.description}` : '',
      s.checkout_request ? `${REQUEST_KIND[s.checkout_request.kind]} (${EXPLANATION_STATUS[s.checkout_request.status]?.label})` : '',
      s.record?.note || '']));

  const columns = [
    { title: 'Ngày', key: 'd', width: 92, render: (_, s) => <div><div className="font-medium">{dayName(s.date)} {ddmm(s.date)}</div><div className="text-xs text-gray-500">{SHORT[s.shift_type]}{s.adjusted ? ' · giờ chỉnh' : ''}</div></div> },
    { title: 'Giờ ca', key: 'h', width: 100, render: (_, s) => `${dayjs(s.start).format('HH:mm')} - ${dayjs(s.end).format('HH:mm')}` },
    { title: 'Vào ca', key: 'in', render: (_, s) => { const st = shiftStatus(s); return <div><Tag color={st.color}>{st.label}</Tag><div className="text-xs text-gray-500">{fmtTime(s.record?.check_in_at)}{s.record?.minutes_late ? ` · trễ ${s.record.minutes_late}p` : ''}</div>{s.record && <FaceBadge check={s.record.face_check} review={s.record.face_review} />}</div>; } },
    { title: 'Ra ca', key: 'out', render: (_, s) => { const st = checkoutStatus(s); return st ? <div><Tag color={st.color}>{st.label}</Tag><div className="text-xs text-gray-500">{fmtTime(s.record?.check_out_at)}{s.record?.minutes_early ? ` · sớm ${s.record.minutes_early}p` : ''}</div></div> : '—'; } },
    { title: 'Vi phạm / ghi chú', key: 'v', render: (_, s) => (
      <div className="text-xs space-y-0.5">
        {(s.violations || []).map((v) => <div key={v.code} className={v.severity === 'SERIOUS' ? 'text-red-600 font-medium' : 'text-orange-600'}>{v.label}</div>)}
        {s.explanation && <div className="text-gray-600">Giải trình vào ca ({EXPLANATION_STATUS[s.explanation.status]?.label}): {s.explanation.description}</div>}
        {s.checkout_request && <div className="text-gray-600">{REQUEST_KIND[s.checkout_request.kind]} ({EXPLANATION_STATUS[s.checkout_request.status]?.label}): {s.checkout_request.description}</div>}
        {s.unsettled && s.phase !== 'UPCOMING' && <div className="text-yellow-700">Chưa chốt: {s.unsettled}</div>}
        {s.record?.note && <div className="text-gray-500">{s.record.note}</div>}
      </div>
    ) },
  ];

  return (
    <Drawer open={open} onClose={() => { setPicked(null); setFilter('all'); onClose(); }} width={Math.min(1100, window.innerWidth - 40)}
      title={<div><div>{person?.name || summary.employee_id}</div><div className="text-xs font-normal text-gray-500">{person?.roleLabel} · Chấm công tháng {month.format('MM/YYYY')}</div></div>}
      extra={<Button icon={<DownloadOutlined />} onClick={exportOne}>Xuất Excel</Button>}>
      <div className="space-y-4">
        {summary.suggested_discipline && <Alert type="error" showIcon message={`${DISCIPLINE[summary.suggested_discipline]} (${summary.serious_violations} vi phạm nghiêm trọng trong tháng)`} />}
        {upcoming.length > 0 && <Alert type="info" showIcon message={`Còn ${upcoming.length} ca chưa tới trong tháng, số liệu sẽ thay đổi.`} />}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <Stat label="Ca có công" value={`${worked.length} / ${list.length}`} sub={attendRate !== null ? `Đi làm ${attendRate}% số ca đã có kết quả` : 'Chưa có ca nào qua'} tone="text-teal-700" />
          <Stat label="Vắng" value={absent.length} sub={absent.length ? absent.map((s) => ddmm(s.date)).join(', ') : 'Không vắng'} tone={absent.length ? 'text-red-600' : 'text-gray-900'} />
          <Stat label="Đi trễ" value={`${late.length} lần`} sub={late.length ? `${summary.late_minutes} phút · TB ${avgLate} phút/lần` : `Đúng giờ ${onTimeRate ?? 0}%`} tone={late.length ? 'text-orange-600' : 'text-gray-900'} />
          <Stat label="Về sớm" value={`${early.length} lần`} sub={`${summary.early_minutes} phút`} tone={early.length ? 'text-orange-600' : 'text-gray-900'} />
          <Stat label="Vi phạm" value={totalViolations} sub={`${summary.normal_violations} thường · ${summary.serious_violations} nghiêm trọng`} tone={summary.serious_violations ? 'text-red-600' : totalViolations ? 'text-orange-600' : 'text-gray-900'} />
          <Stat label="Thưởng chuyên cần" value={summary.bonus ? money(summary.bonus) : '0đ'} sub={summary.bonus ? 'Đủ điều kiện (tạm tính)' : summary.serious_violations ? 'Mất do vi phạm nghiêm trọng' : totalViolations > 3 ? 'Mất do quá 3 vi phạm' : worked.length ? 'Chưa đủ điều kiện' : 'Chưa có công'} tone="text-teal-700" />
          <Stat label="Giờ làm thực tế" value={`${Math.floor(hours / 60)}h${String(hours % 60).padStart(2, '0')}`} sub="Từ giờ vào tới giờ ra" />
          <Stat label="Không chấm ra ca" value={missingOut.length} tone={missingOut.length ? 'text-red-600' : 'text-gray-900'} />
          <Stat label="Giải trình / đơn ra ca" value={explained.length + requests.length} sub={`${[...explained.map((s) => s.explanation), ...requests.map((s) => s.checkout_request)].filter((x) => x.status === 'REJECTED').length} bị từ chối`} />
          <Stat label="Ảnh chấm công gắn cờ" value={faces.length} sub={faces.length ? `${faces.filter((s) => !s.record.face_review && FLAGGED.includes(s.record.face_check?.status)).length} chưa xác nhận` : 'Khớp ảnh gốc'} tone={faces.length ? 'text-orange-600' : 'text-gray-900'} />
          <Stat label="Ca chưa chốt" value={unsettled.length} tone={unsettled.length ? 'text-yellow-700' : 'text-gray-900'} sub={unsettled.length ? 'Chặn tạo bảng lương' : 'Đã chốt hết'} />
          <Stat label="Hay trễ vào" value={lateDay ? lateDay[0] : '—'} sub={lateDay ? `${lateDay[1]} lần trễ vào thứ này` : 'Không có'} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-2">Lịch công tháng <span className="text-xs text-gray-500 font-normal">(bấm 1 ngày để lọc bảng bên dưới)</span></div>
            <MonthGrid month={month} shifts={list} onPick={(d) => setPicked(picked === d ? null : d)} />
          </div>
          <Collapse size="small" defaultActiveKey={['worked', 'absent', 'late']} items={[
            { key: 'worked', label: `Ngày có công (${worked.length} ca)`, children: <DayList items={worked} render={(s) => `${fmtTime(s.record.check_in_at)}-${fmtTime(s.record.check_out_at)}`} /> },
            { key: 'absent', label: <span className={absent.length ? 'text-red-600' : ''}>Ngày vắng ({absent.length})</span>, children: <DayList items={absent} render={(s) => (s.record.face_review?.verdict === 'NOT_SAME' ? 'ảnh không phải NV' : s.record.method === 'AUTO' ? 'không chấm, không giải trình' : 'vắng')} /> },
            { key: 'late', label: `Đi trễ (${late.length} lần, ${summary.late_minutes} phút)`, children: <DayList items={late} render={(s) => `${s.record.minutes_late}p`} /> },
            { key: 'early', label: `Về sớm (${early.length} lần, ${summary.early_minutes} phút)`, children: <DayList items={early} render={(s) => `${s.record.minutes_early}p`} /> },
            { key: 'out', label: `Không chấm ra ca (${missingOut.length})`, children: <DayList items={missingOut} /> },
            { key: 'vio', label: `Vi phạm (${violations.length})`, children: violations.length ? <ul className="text-sm space-y-1">{violations.map((v, i) => <li key={i}><Tag color={v.severity === 'SERIOUS' ? 'red' : 'orange'}>{v.severity === 'SERIOUS' ? 'Nghiêm trọng' : 'Thường'}</Tag>{ddmm(v.s.date)} {SHORT[v.s.shift_type]}: {v.label}</li>)}</ul> : <span className="text-gray-400 text-sm">Không có</span> },
            { key: 'exp', label: `Giải trình & đơn ra ca (${explained.length + requests.length})`, children: <DayList items={[...explained, ...requests.filter((s) => !explained.includes(s))]} render={(s) => [s.explanation && `vào ca: ${EXPLANATION_STATUS[s.explanation.status]?.label}`, s.checkout_request && `${REQUEST_KIND[s.checkout_request.kind]}: ${EXPLANATION_STATUS[s.checkout_request.status]?.label}`].filter(Boolean).join(', ')} /> },
            { key: 'pending', label: `Ca chưa chốt (${unsettled.length})`, children: <DayList items={unsettled} render={(s) => s.unsettled} /> },
            { key: 'adj', label: `Ca được điều chỉnh giờ (${adjusted.length})`, children: <DayList items={adjusted} render={(s) => `${dayjs(s.start).format('HH:mm')}-${dayjs(s.end).format('HH:mm')}`} /> },
            { key: 'face', label: `Ảnh chấm công gắn cờ (${faces.length})`, children: <DayList items={faces} render={(s) => (s.record.face_review ? (s.record.face_review.verdict === 'SAME' ? 'đã xác nhận đúng người' : 'không phải NV') : 'chờ xác nhận')} /> },
          ]} />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="font-medium">Từng ca {picked && <Tag closable onClose={() => setPicked(null)} color="blue">Ngày {dayjs(picked).format('DD/MM')}</Tag>}</div>
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: `Tất cả (${list.length})` }, { value: 'absent', label: `Vắng (${absent.length})` }, { value: 'late', label: `Trễ (${late.length})` },
              { value: 'early', label: `Về sớm (${early.length})` }, { value: 'violation', label: 'Có vi phạm' }, { value: 'pending', label: `Chưa chốt (${unsettled.length})` },
            ]} />
          </div>
          <Table rowKey="id" size="small" dataSource={rows} columns={columns} pagination={false} scroll={{ x: 800 }}
            locale={{ emptyText: <Empty description="Không có ca phù hợp" /> }}
            rowClassName={(s) => (s.record?.status === 'ABSENT' ? 'bg-red-50' : '')} />
        </div>
      </div>
    </Drawer>
  );
}
