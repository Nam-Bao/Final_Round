import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, DatePicker, Segmented, Table, Button, Space, Alert, Spin, Tag, message } from 'antd';
import { DownloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import StackedBarChart from '../components/StackedBarChart';
import { fetchRevenue, toChartData, SOURCES, GROUPS, groupRow, sumRow, vnd } from '../utils/revenue';

const PRESETS = [
  { label: '7 ngày', value: '7d', range: () => [dayjs().subtract(6, 'day'), dayjs()] },
  { label: '30 ngày', value: '30d', range: () => [dayjs().subtract(29, 'day'), dayjs()] },
  { label: 'Tháng này', value: 'month', range: () => [dayjs().startOf('month'), dayjs()] },
  { label: 'Năm nay', value: 'year', range: () => [dayjs().startOf('year'), dayjs()] },
];

// So sánh với kỳ trước cùng độ dài
const prevRange = ([from, to]) => {
  const len = to.startOf('day').diff(from.startOf('day'), 'day') + 1;
  return [from.subtract(len, 'day'), from.subtract(1, 'day')];
};

function Delta({ now, before }) {
  if (!before) return <span className="text-xs text-gray-400">Kỳ trước: 0đ</span>;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs ${up ? 'text-green-700' : 'text-red-600'}`}>
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(pct).toFixed(1)}% so với kỳ trước ({vnd(before)})
    </span>
  );
}

export default function RevenueReportPage() {
  const [preset, setPreset] = useState('30d');
  const [range, setRange] = useState(PRESETS[1].range());
  const [view, setView] = useState('chart');
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const [pf, pt] = prevRange(range);
    Promise.all([fetchRevenue(range[0], range[1]), fetchRevenue(pf, pt)])
      .then(([d, p]) => { setData(d); setPrev(p); })
      .catch((e) => message.error(e.response?.data?.message || 'Không tải được báo cáo doanh thu'))
      .finally(() => setLoading(false));
  }, [range]);

  const chart = useMemo(() => (data ? toChartData(data.days, range[0], range[1]) : { bars: [] }), [data, range]);
  const groupTotals = data ? groupRow(data.totals) : {};
  const prevGroups = prev ? groupRow(prev.totals) : {};

  const exportCsv = () => {
    const head = ['Thời gian', ...SOURCES.map((s) => s.label), 'Tổng'];
    const lines = chart.bars.map((b) => [b.label, ...SOURCES.map((s) => Math.round(b.row[s.key])), Math.round(sumRow(b.row))]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `doanh-thu_${range[0].format('YYYYMMDD')}-${range[1].format('YYYYMMDD')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Bộ lọc: 1 hàng phía trên biểu đồ */}
      <Card size="small">
        <Space wrap>
          <Segmented value={preset} onChange={(v) => { setPreset(v); setRange(PRESETS.find((p) => p.value === v).range()); }}
            options={[...PRESETS.map(({ label, value }) => ({ label, value })), { label: 'Tuỳ chọn', value: 'custom', disabled: true }]} />
          <DatePicker.RangePicker value={range} format="DD/MM/YYYY" allowClear={false} disabledDate={(d) => d && d.isAfter(dayjs(), 'day')}
            onChange={(v) => { if (v) { setPreset('custom'); setRange(v); } }} />
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data}>Xuất CSV</Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        {data && (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={6}>
                <Card size="small" className="h-full">
                  <div className="text-gray-500 text-sm">Tổng doanh thu</div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{vnd(data.total)}</div>
                  <Delta now={data.total} before={prev?.total} />
                </Card>
              </Col>
              {GROUPS.slice(0, 3).map((g) => (
                <Col xs={24} md={6} key={g.key}>
                  <Card size="small" className="h-full">
                    <div className="text-gray-500 text-sm flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: g.color }} />{g.label}</div>
                    <div className="text-xl font-semibold text-gray-900 tabular-nums">{vnd(groupTotals[g.key])}</div>
                    <Delta now={groupTotals[g.key]} before={prevGroups[g.key]} />
                  </Card>
                </Col>
              ))}
            </Row>

            <Card size="small" className="mt-4"
              title={`Doanh thu theo ${chart.byMonth ? 'tháng' : 'ngày'} (${range[0].format('DD/MM/YYYY')} – ${range[1].format('DD/MM/YYYY')})`}
              extra={<Segmented size="small" value={view} onChange={setView} options={[{ label: 'Biểu đồ', value: 'chart' }, { label: 'Bảng', value: 'table' }]} />}>
              {view === 'chart' ? (
                <StackedBarChart data={chart.bars} series={GROUPS} />
              ) : (
                <Table size="small" rowKey="key" dataSource={chart.bars.filter((b) => sumRow(b.row) !== 0)} pagination={{ pageSize: 15 }}
                  columns={[
                    { title: 'Thời gian', dataIndex: 'label' },
                    ...GROUPS.map((g) => ({ title: g.label, align: 'right', render: (_, b) => vnd(b.values[g.key]) })),
                    { title: 'Tổng', align: 'right', render: (_, b) => <b>{vnd(sumRow(b.row))}</b> },
                  ]} />
              )}
            </Card>

            <Row gutter={[16, 16]} className="mt-4">
              <Col xs={24} lg={12}>
                <Card size="small" title="Chi tiết theo nguồn">
                  <Table size="small" rowKey="key" pagination={false}
                    dataSource={SOURCES.map((s) => ({ ...s, value: data.totals[s.key] }))}
                    columns={[
                      { title: 'Nguồn', dataIndex: 'label', render: (v, s) => <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: GROUPS.find((g) => g.key === s.group).color }} />{v}</span> },
                      { title: 'Doanh thu', dataIndex: 'value', align: 'right', render: (v) => <span className={v < 0 ? 'text-red-600' : ''}>{vnd(v)}</span> },
                      { title: 'Tỉ trọng', align: 'right', render: (_, s) => (data.total > 0 && s.value > 0 ? `${((s.value / data.total) * 100).toFixed(1)}%` : '-') },
                    ]}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><b>Tổng</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right"><b>{vnd(data.total)}</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} />
                      </Table.Summary.Row>
                    )} />
                  <p className="text-xs text-gray-500 mt-2">
                    {data.counts.invoices} hoá đơn khám • {data.counts.orders} đơn mỹ phẩm • {data.counts.consultations} buổi tư vấn • {data.counts.forfeited} lịch huỷ giữ cọc.
                    Giảm giá đã được trừ vào từng nguồn; phí ship GHN không tính vào doanh thu.
                  </p>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="Dịch vụ & gói được chỉ định nhiều nhất">
                  <Table size="small" rowKey="id" pagination={false}
                    dataSource={[...data.top_services.map((s) => ({ ...s, kind: 'Dịch vụ' })), ...data.top_packages.map((p) => ({ ...p, kind: 'Gói' }))].sort((a, b) => b.revenue - a.revenue).slice(0, 8)}
                    columns={[
                      { title: 'Tên', dataIndex: 'name', render: (v, r) => <span>{v} <Tag className="ml-1">{r.kind}</Tag></span> },
                      { title: 'Lượt', dataIndex: 'count', align: 'right' },
                      { title: 'Giá trị (giá niêm yết)', dataIndex: 'revenue', align: 'right', render: vnd },
                    ]} />
                </Card>
                <Card size="small" title="Mỹ phẩm bán chạy (đơn đã giao)" className="mt-4">
                  <Table size="small" rowKey="id" pagination={false} dataSource={data.top_products.slice(0, 8)}
                    columns={[
                      { title: 'Sản phẩm', dataIndex: 'name' },
                      { title: 'SL', dataIndex: 'quantity', align: 'right' },
                      { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: vnd },
                    ]} />
                </Card>
              </Col>
            </Row>
            <Alert className="mt-4" type="info" showIcon
              message="Cách tính: doanh thu ghi nhận khi dịch vụ đã thực hiện / hàng đã giao. Tiền cọc của lịch chưa khám là khoản trả trước, chưa tính. Mỹ phẩm kê sau buổi khám nằm trong hoá đơn khám nên chỉ tính 1 lần." />
          </>
        )}
      </Spin>
    </div>
  );
}
