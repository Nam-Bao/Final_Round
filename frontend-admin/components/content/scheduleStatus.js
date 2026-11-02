import dayjs from 'dayjs';

// Trạng thái hiển thị thực tế của banner / popup theo công tắc bật và khung thời gian
export const scheduleStatus = (item) => {
  if (!item.is_active) return { color: 'default', label: 'Đang tắt' };
  if (item.start_at && dayjs(item.start_at).isAfter(dayjs())) return { color: 'gold', label: 'Chưa tới lịch' };
  if (item.end_at && !dayjs(item.end_at).isAfter(dayjs())) return { color: 'red', label: 'Hết hạn' };
  return { color: 'green', label: 'Đang hiển thị' };
};

export const periodText = (item) => {
  if (!item.start_at && !item.end_at) return 'Không giới hạn';
  const f = (d) => dayjs(d).format('DD/MM/YY HH:mm');
  return `${item.start_at ? f(item.start_at) : 'Ngay'} → ${item.end_at ? f(item.end_at) : 'Không hạn'}`;
};

// RangePicker <-> start_at / end_at
export const toPeriod = (item) => [item.start_at ? dayjs(item.start_at) : null, item.end_at ? dayjs(item.end_at) : null];
export const fromPeriod = (period) => ({
  start_at: period?.[0] ? period[0].toISOString() : null,
  end_at: period?.[1] ? period[1].toISOString() : null,
});
