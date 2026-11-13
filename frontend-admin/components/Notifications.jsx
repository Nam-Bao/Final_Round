import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Badge, Button, Dropdown, Empty, Tooltip } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

// THÔNG BÁO REAL-TIME
// - Việc đang chờ (số trên chuông và menu) đếm từ dữ liệu thật ở từng service (GET /tasks/mine):
//   tải lại trang không mất, xử lý xong thì tự hết.
// - Socket /notify (service-identity) báo "chủ đề đã thay đổi" => tải lại số việc + báo các trang đang mở tự cập nhật (useLiveRefresh).
const TASK_URLS = ['booking', 'commerce', 'media'].map((s) => `http://localhost:4000/api/${s}/tasks/mine`);
const SOCKET_URL = 'http://localhost:4001/notify';
const FALLBACK_REFRESH_MS = 2 * 60 * 1000; // dự phòng khi mất kết nối socket

const TaskContext = createContext({ tasks: [], countFor: () => 0, connected: false, reload: () => {} });

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [connected, setConnected] = useState(false);

  const reload = useCallback(async () => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) return;
    const results = await Promise.allSettled(TASK_URLS.map((url) => axios.get(url, { headers: { Authorization: `Bearer ${token}` } })));
    setTasks(results.flatMap((r) => (r.status === 'fulfilled' ? r.value.data.data || [] : [])));
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) return undefined;
    reload();
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => { setConnected(true); reload(); }); // kết nối lại: lấy lại số việc phòng khi lỡ thông báo
    socket.on('disconnect', () => setConnected(false));
    socket.on('changed', ({ topics = [] }) => {
      reload();
      window.dispatchEvent(new CustomEvent('o2o:changed', { detail: { topics } }));
    });
    const timer = setInterval(reload, FALLBACK_REFRESH_MS);
    return () => { socket.disconnect(); clearInterval(timer); };
  }, [reload]);

  const countFor = useCallback((path) => tasks.filter((t) => t.path === path).reduce((s, t) => s + (t.count || 0), 0), [tasks]);
  return <TaskContext.Provider value={{ tasks, countFor, connected, reload }}>{children}</TaskContext.Provider>;
}

export const useTasks = () => useContext(TaskContext);

// Trang đang mở tự tải lại dữ liệu khi có thay đổi thuộc các chủ đề này (không cần bấm F5)
export function useLiveRefresh(topics, callback) {
  const cb = useRef(callback);
  cb.current = callback;
  const key = topics.join(',');
  useEffect(() => {
    const handler = (e) => { if ((e.detail?.topics || []).some((t) => key.split(',').includes(t))) cb.current?.(); };
    window.addEventListener('o2o:changed', handler);
    return () => window.removeEventListener('o2o:changed', handler);
  }, [key]);
}

export function NotificationBell() {
  const { tasks, connected } = useTasks();
  const navigate = useNavigate();
  const open = tasks.filter((t) => t.count > 0);
  const total = open.reduce((s, t) => s + t.count, 0);
  const content = (
    <div className="bg-white rounded-lg shadow-lg border w-80 max-w-[90vw]">
      <div className="px-4 py-2 border-b flex items-center justify-between">
        <b>Việc cần xử lý</b>
        <span className={`text-xs ${connected ? 'text-green-600' : 'text-gray-400'}`}>{connected ? '● Đang cập nhật trực tiếp' : '○ Mất kết nối, tự thử lại'}</span>
      </div>
      {open.length === 0 ? <Empty className="py-6" image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có việc nào đang chờ" /> : (
        <div className="max-h-96 overflow-y-auto">
          {open.map((t) => (
            <button key={t.key} type="button" onClick={() => navigate(t.path)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-blue-50 border-b last:border-b-0">
              <span className="text-sm text-gray-700">{t.label}</span>
              <Badge count={t.count} overflowCount={99} />
            </button>
          ))}
        </div>
      )}
      <div className="px-4 py-2 text-xs text-gray-500 border-t">Thông báo tự hết khi việc đã được xử lý.</div>
    </div>
  );
  return (
    <Dropdown popupRender={() => content} trigger={['click']} placement="bottomRight">
      <Tooltip title="Việc cần xử lý">
        <Button type="text" shape="circle" className="!w-10 !h-10" aria-label="Thông báo"
          icon={<Badge count={total} size="small" overflowCount={99}><BellOutlined className="text-lg" /></Badge>} />
      </Tooltip>
    </Dropdown>
  );
}
