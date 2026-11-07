import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, message, Space, Table, Tabs, Tag } from 'antd';
import { PhoneOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import CallResultModal, { ADHERENCE, authConfig, BOOKING_API, SKIN_STATUS } from '../components/CallResultModal';

const CALL_TYPE = { REMINDER: 'Nhắc lịch hẹn', REVISIT: 'Nhắc tái khám', AFTERCARE: 'Thăm hỏi sau khám' };
const OUTCOME = {
  CAN_COME: { label: 'Đến được', color: 'green' },
  CANNOT_COME: { label: 'Không đến được', color: 'orange' },
  RESCHEDULED: { label: 'Đã đổi lịch', color: 'blue' },
  CANCELLED: { label: 'Đã hủy', color: 'red' },
  ANSWERED: { label: 'Đã thăm hỏi', color: 'green' },
  NO_ANSWER: { label: 'Không nghe máy', color: 'default' },
};

const formatDate = (date) => dayjs(date).format('DD/MM/YYYY');
const daysUntil = (date) => dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');

const customerColumn = {
  title: 'Khách hàng',
  key: 'customer',
  render: (_, row) => (
    <div>
      <div className="font-semibold">{row.customer_name}</div>
      <div className="text-xs text-gray-500 whitespace-nowrap"><PhoneOutlined /> {row.customer_phone || 'Chưa có SĐT'}</div>
    </div>
  ),
};
const doctorColumn = { title: 'Bác sĩ', dataIndex: 'doctor_name', key: 'doctor', render: (name) => name || 'Chưa xếp' };
const attemptsTag = (row) => row.attempts > 0 && <Tag>Đã gọi {row.attempts} lần không nghe máy</Tag>;

const dueTag = (date) => {
  const days = daysUntil(date);
  if (days < 0) return <Tag color="red">Quá hẹn {-days} ngày</Tag>;
  if (days === 0) return <Tag color="red">Hôm nay</Tag>;
  return <Tag color={days === 1 ? 'red' : 'orange'}>Còn {days} ngày</Tag>;
};

const callDetail = (log) => {
  const care = log.aftercare;
  const parts = [];
  if (care) {
    parts.push(`Da: ${SKIN_STATUS[care.skin_status]}`, ADHERENCE[care.adherence], `Hài lòng ${care.satisfaction}/5`);
    if (care.symptoms?.length) parts.push(`Biểu hiện: ${care.symptoms.join(', ')}`);
  }
  if (log.reason) parts.push(`Lý do: ${log.reason}`);
  if (log.call_note) parts.push(log.call_note);
  return parts.join(' • ') || '-';
};

// CSKH gọi cho khách: nhắc lịch hẹn, nhắc tái khám, thăm hỏi sau khám
export default function CustomerCarePage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState({ reminders: [], revisits: [], aftercare: [] });
  const [warning, setWarning] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('reminders');
  const [call, setCall] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [callsRes, historyRes] = await Promise.all([
        axios.get(`${BOOKING_API}/follow-ups/calls`, authConfig()),
        axios.get(`${BOOKING_API}/follow-ups/calls/history`, authConfig()),
      ]);
      setLists(callsRes.data.data);
      setWarning(callsRes.data.warning);
      setHistory(historyRes.data.data);
    } catch (error) {
      message.error(error.response?.data?.message || 'Không tải được danh sách cần gọi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAppointment = (appointmentId) => navigate('/appointment-management', { state: { editAppointmentId: appointmentId } });

  const finishCall = (needsReschedule) => {
    const appointmentId = call.item.appointment_id;
    setCall(null);
    if (needsReschedule) openAppointment(appointmentId);
    else load();
  };

  const callButton = (type, row) => (
    <Button type="primary" size="small" icon={<PhoneOutlined />} onClick={() => setCall({ type, item: row })}>Ghi kết quả gọi</Button>
  );

  const reminderColumns = [
    customerColumn,
    { title: 'Lịch hẹn', key: 'slot', render: (_, row) => <span className="whitespace-nowrap">{row.time} {formatDate(row.date)}</span> },
    doctorColumn,
    {
      title: 'Tình trạng',
      key: 'state',
      render: (_, row) => (
        <Space wrap size={4}>
          {dueTag(row.date)}
          {row.waiting_change && <Tag color="orange">Không đến được, chờ đổi lịch</Tag>}
          {attemptsTag(row)}
          {row.reason && <span className="text-xs text-gray-500">Lý do: {row.reason}</span>}
        </Space>
      ),
    },
    {
      title: '',
      key: 'action',
      align: 'right',
      render: (_, row) => (row.waiting_change
        ? <Button size="small" type="primary" onClick={() => openAppointment(row.appointment_id)}>Đổi lịch</Button>
        : callButton('REMINDER', row)),
    },
  ];

  const revisitColumns = [
    customerColumn,
    {
      title: 'Ngày tái khám',
      key: 'slot',
      render: (_, row) => (
        <div className="whitespace-nowrap">
          {row.time ? `${row.time} ` : ''}{formatDate(row.date)}
          {row.kind === 'RECORD' && <div className="text-xs text-red-500">Chưa xếp giờ</div>}
        </div>
      ),
    },
    doctorColumn,
    { title: 'Chẩn đoán lần trước', dataIndex: 'diagnosis', key: 'diagnosis', render: (text) => text || '-' },
    { title: 'Tình trạng', key: 'state', render: (_, row) => <Space wrap size={4}>{dueTag(row.date)}{attemptsTag(row)}</Space> },
    { title: '', key: 'action', align: 'right', render: (_, row) => callButton('REVISIT', row) },
  ];

  const aftercareColumns = [
    customerColumn,
    { title: 'Ngày khám', key: 'date', render: (_, row) => <span className="whitespace-nowrap">{formatDate(row.date)}</span> },
    doctorColumn,
    { title: 'Chẩn đoán', dataIndex: 'diagnosis', key: 'diagnosis', render: (text) => text || '-' },
    {
      title: 'Tình trạng',
      key: 'state',
      render: (_, row) => <Space wrap size={4}><Tag>{-daysUntil(row.date)} ngày sau khám</Tag>{attemptsTag(row)}</Space>,
    },
    { title: '', key: 'action', align: 'right', render: (_, row) => callButton('AFTERCARE', row) },
  ];

  const historyColumns = [
    { title: 'Thời gian', dataIndex: 'createdAt', key: 'time', render: (value) => <span className="whitespace-nowrap">{dayjs(value).format('HH:mm DD/MM/YYYY')}</span> },
    customerColumn,
    {
      title: 'Loại cuộc gọi',
      dataIndex: 'call_type',
      key: 'type',
      render: (value) => CALL_TYPE[value],
      filters: Object.entries(CALL_TYPE).map(([value, text]) => ({ value, text })),
      onFilter: (value, row) => row.call_type === value,
    },
    {
      title: 'Kết quả',
      key: 'outcome',
      render: (_, row) => (
        <Space wrap size={4}>
          <Tag color={OUTCOME[row.outcome]?.color}>{OUTCOME[row.outcome]?.label}</Tag>
          {row.call_status === 'COMPLAINT' && <Tag color="red">Cần lưu ý</Tag>}
        </Space>
      ),
    },
    { title: 'Nội dung', key: 'detail', render: (_, row) => <span className="text-sm">{callDetail(row)}</span> },
    { title: 'Người gọi', dataIndex: 'consultant_name', key: 'caller' },
  ];

  const table = (rows, columns, emptyText) => (
    <Table rowKey="key" size="middle" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 800 }}
      pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText }} />
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold m-0">Gọi chăm sóc khách</h2>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Tải lại</Button>
      </div>
      <p className="text-gray-500 mb-4">Gọi xong, ghi lại kết quả để khách rời khỏi danh sách. Khách không nghe máy vẫn ở lại để gọi lại sau.</p>
      {warning && <Alert type="warning" showIcon className="mb-3" title={warning} />}

      <Card size="small" className="shadow-sm">
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: 'reminders', label: `Nhắc lịch hẹn (${lists.reminders.length})`, children: table(lists.reminders, reminderColumns, 'Không có lịch hẹn nào cần nhắc trong 3 ngày tới') },
          { key: 'revisits', label: `Nhắc tái khám (${lists.revisits.length})`, children: table(lists.revisits, revisitColumns, 'Không có khách nào sắp đến ngày tái khám') },
          { key: 'aftercare', label: `Thăm hỏi sau khám (${lists.aftercare.length})`, children: table(lists.aftercare, aftercareColumns, 'Không có khách nào cần thăm hỏi') },
          {
            key: 'history',
            label: 'Lịch sử cuộc gọi',
            children: <Table rowKey="id" size="middle" loading={loading} dataSource={history} columns={historyColumns} scroll={{ x: 900 }}
              pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: 'Chưa có cuộc gọi nào được lưu' }} />,
          },
        ]} />
      </Card>

      {call && <CallResultModal call={call} onClose={() => setCall(null)} onDone={finishCall} />}
    </div>
  );
}
