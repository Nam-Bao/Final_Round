// Đếm vi phạm của 1 ca (dùng chung cho bảng công, phiếu lương, bảng lương).
// NORMAL  = vi phạm thường: chỉ tính để xét thưởng chuyên cần.
// SERIOUS = vi phạm nghiêm trọng: tính thưởng chuyên cần + căn cứ đề xuất kỷ luật.
const { RULES } = require('./attendanceRules');

const normal = (code, label) => ({ code, severity: 'NORMAL', label });
const serious = (code, label) => ({ code, severity: 'SERIOUS', label });

// view: { record, explanation, checkout_request } của 1 ca. Ca chưa có kết quả thì chưa tính.
const violationsOf = (view) => {
  const r = view.record;
  const req = view.checkout_request;
  const list = [];
  if (!r) return list;
  if (r.status === 'ABSENT') return [serious('ABSENT', 'Vắng')];

  // Vào ca
  if (r.status === 'LATE_REJECTED') list.push(serious('LATE_REJECTED', `Vào trễ ${r.minutes_late} phút, giải trình bị từ chối`));
  else if (r.minutes_late > 0) {
    list.push(normal(r.status === 'LATE' ? 'LATE_QR' : 'LATE_EXPLAINED',
      r.status === 'LATE' ? `Quét QR trễ ${r.minutes_late} phút` : `Vào trễ ${r.minutes_late} phút (giải trình được duyệt)`));
  }

  // Ra ca
  if (r.checkout_status === 'MISSING') list.push(serious('CHECKOUT_MISSING', 'Không chấm ra ca và không giải trình'));
  else if (req && req.status !== 'PENDING') {
    const early = r.checkout_status === 'EARLY';
    if (early && req.status === 'APPROVED') list.push(normal('EARLY_APPROVED', `Về sớm ${r.minutes_early} phút (được duyệt)`));
    else if (early) list.push(serious('EARLY_REJECTED', `Tự ý về sớm ${r.minutes_early} phút`));
    else if (req.kind === 'FORGOT' && req.status === 'REJECTED') list.push(serious('FORGOT_REJECTED', 'Quên chấm ra ca, giải trình bị từ chối'));
  }
  return list;
};

// Lý do ca chưa "chốt" (còn chờ giải trình / duyệt) => chưa tạo được bảng lương. null = đã chốt.
const unsettledReason = (view) => {
  const r = view.record;
  if (view.explanation?.status === 'PENDING') return 'Giải trình vào ca đang chờ duyệt';
  if (!r) return 'Chưa có kết quả vào ca';
  if (r.status === 'ABSENT') return null;
  if (view.checkout_request?.status === 'PENDING') return 'Đơn ra ca (về sớm / quên chấm) đang chờ duyệt';
  if (!r.checkout_status) return 'Chưa có kết quả ra ca';
  return null;
};

// Tổng hợp vi phạm + thưởng chuyên cần của 1 nhân viên trong tháng
const summarizeViolations = (views) => {
  const all = views.flatMap((v) => violationsOf(v).map((x) => ({ ...x, shift_id: v.id, date: v.date, shift_type: v.shift_type })));
  const seriousCount = all.filter((v) => v.severity === 'SERIOUS').length;
  const absent = all.some((v) => v.code === 'ABSENT');
  const worked = views.some((v) => v.record && v.record.status !== 'ABSENT');
  // Có thưởng khi: có đi làm, tổng vi phạm 0 - 3 lần và KHÔNG có vi phạm nghiêm trọng nào (vắng cũng là nghiêm trọng)
  const eligible = worked && !absent && seriousCount === 0 && all.length <= RULES.MAX_VIOLATIONS_FOR_BONUS;
  return {
    violations: all,
    normal_count: all.length - seriousCount,
    serious_count: seriousCount,
    total_count: all.length,
    bonus: eligible ? RULES.ATTENDANCE_BONUS : 0,
    // Phương án kỷ luật A: 1 lần => mất thưởng; 2 lần => khiển trách; từ 3 lần => kéo dài thời hạn nâng lương
    suggested_discipline: seriousCount >= 3 ? 'SALARY_RAISE_DELAY' : seriousCount === 2 ? 'REPRIMAND' : null,
  };
};

module.exports = { violationsOf, unsettledReason, summarizeViolations };
