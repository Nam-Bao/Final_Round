import { useEffect, useState } from 'react';
import axios from 'axios';

// Mốc thời gian chờ đang áp dụng ở server (đổi được qua .env khi demo). Dùng chung 1 lần tải cho mọi trang.
const DEFAULTS = { noShowGraceMinutes: 15, expertOpenBeforeMinutes: 15, rescheduleMinMinutes: 24 * 60 };
let cached = null;
let loading = null;

const load = () => {
  loading ||= axios.get('http://localhost:4000/api/booking/config/timing')
    .then((res) => { cached = { ...DEFAULTS, ...(res.data?.data || {}) }; return cached; })
    .catch(() => { loading = null; return DEFAULTS; });
  return loading;
};

export const useTiming = () => {
  const [value, setValue] = useState(cached || DEFAULTS);
  useEffect(() => {
    let active = true;
    load().then((t) => active && setValue(t));
    return () => { active = false; };
  }, []);
  return value;
};
