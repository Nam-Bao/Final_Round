import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Image, Empty, Input, InputNumber, Modal, Radio, Select, Switch, Table, Tag, Tooltip, message } from 'antd';
import { CheckOutlined, EditOutlined, ExpandOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE } from '../config';

const API = `${API_BASE}/api/ai/analyses`;
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });
const GROUPS = [
  ['inflammatory', 'Mụn viêm'], ['comedone', 'Mụn đầu đen/đầu trắng'], ['pih', 'Thâm sau mụn'], ['pigment_region', 'Nám/tàn nhang'],
];
const HAYASHI = [5, 20];
const hayashi = (n) => (n <= 0 ? 'Không thấy mụn viêm' : n <= HAYASHI[0] ? 'Nhẹ' : n <= HAYASHI[1] ? 'Trung bình' : 'Nặng');
const SEV_COLOR = { 'Nhẹ': 'green', 'Trung bình': 'orange', 'Nặng': 'red' };

// Ảnh + khung đánh số; mode 'draw' cho phép kéo chuột khoanh thêm vùng (toạ độ theo image_size của kết quả AI).
// Phóng to: tăng chiều rộng thật của ảnh (không dùng CSS scale) => trình duyệt vẽ lại từ ảnh gốc độ phân giải đầy đủ nên vẫn nét;
// canvas vẽ theo devicePixelRatio để khung không bị mờ. Kéo chuột để di chuyển khi đang phóng to, Ctrl + lăn chuột để phóng to / thu nhỏ.
const ZOOMS = [1, 1.5, 2, 3, 4];
function ScanCanvas({ url, size, boxes, onAdd, drawing, zoom = 1, onZoom }) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef(null);
  const panRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const redraw = () => {
    const img = imgRef.current; const cv = canvasRef.current;
    if (!img || !cv || !img.clientWidth) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = img.clientWidth * dpr; cv.height = img.clientHeight * dpr;
    cv.style.width = `${img.clientWidth}px`; cv.style.height = `${img.clientHeight}px`;
    const kx = img.clientWidth / (size?.width || img.naturalWidth); const ky = img.clientHeight / (size?.height || img.naturalHeight);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, img.clientWidth, img.clientHeight);
    const all = [...boxes, ...(drag ? [{ box: drag, color: '#2563eb', label: 'Mới' }] : [])];
    all.forEach(({ box, color, label, dashed }) => {
      if (!box) return;
      const x = box.left * kx; const y = box.top * ky; const w = box.width * kx; const h = box.height * ky;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.font = 'bold 12px sans-serif';
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - 16), tw, 16);
      ctx.fillStyle = '#fff'; ctx.fillText(label, x + 4, Math.max(12, y - 4));
    });
  };
  useEffect(() => { redraw(); window.addEventListener('resize', redraw); return () => window.removeEventListener('resize', redraw); });

  // Đổi mức phóng to nhưng giữ nguyên điểm đang xem ở giữa khung
  const setZoomKeep = (z) => {
    const v = viewRef.current;
    if (!v || !onZoom) return onZoom?.(z);
    const cx = (v.scrollLeft + v.clientWidth / 2) / v.scrollWidth; const cy = (v.scrollTop + v.clientHeight / 2) / v.scrollHeight;
    onZoom(z);
    requestAnimationFrame(() => { v.scrollLeft = cx * v.scrollWidth - v.clientWidth / 2; v.scrollTop = cy * v.scrollHeight - v.clientHeight / 2; });
  };
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return undefined;
    const wheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const i = ZOOMS.indexOf(zoom);
      setZoomKeep(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)))]);
    };
    v.addEventListener('wheel', wheel, { passive: false });
    return () => v.removeEventListener('wheel', wheel);
  });

  const toImage = (e) => {
    const img = imgRef.current; const r = img.getBoundingClientRect();
    const kx = (size?.width || img.naturalWidth) / img.clientWidth; const ky = (size?.height || img.naturalHeight) / img.clientHeight;
    return { x: (e.clientX - r.left) * kx, y: (e.clientY - r.top) * ky };
  };
  const start = (e) => {
    if (drawing) { const p = toImage(e); setDrag({ left: p.x, top: p.y, width: 0, height: 0, x0: p.x, y0: p.y }); return; }
    if (zoom > 1) panRef.current = { x: e.clientX, y: e.clientY, sl: viewRef.current.scrollLeft, st: viewRef.current.scrollTop };
  };
  const move = (e) => {
    if (panRef.current) { const p = panRef.current; viewRef.current.scrollLeft = p.sl - (e.clientX - p.x); viewRef.current.scrollTop = p.st - (e.clientY - p.y); return; }
    if (!drag) return;
    const p = toImage(e);
    setDrag({ ...drag, left: Math.min(drag.x0, p.x), top: Math.min(drag.y0, p.y), width: Math.abs(p.x - drag.x0), height: Math.abs(p.y - drag.y0) });
  };
  const end = () => {
    panRef.current = null;
    if (drag && drag.width > 6 && drag.height > 6) onAdd({ left: Math.round(drag.left), top: Math.round(drag.top), width: Math.round(drag.width), height: Math.round(drag.height) });
    setDrag(null);
  };
  return (
    <div>
      {onZoom && (
        <div className="flex flex-wrap items-center gap-1 mb-1 text-xs">
          <span className="text-gray-500 mr-1">Phóng to:</span>
          {ZOOMS.map((z) => <Button key={z} size="small" type={zoom === z ? 'primary' : 'default'} onClick={() => setZoomKeep(z)}>{z * 100}%</Button>)}
          <span className="text-gray-400 ml-1">Ctrl + lăn chuột · kéo ảnh để di chuyển</span>
        </div>
      )}
      <div ref={viewRef} className="overflow-auto rounded border bg-black/5" style={{ maxHeight: zoom > 1 ? '68vh' : undefined }}>
        <div className="relative select-none" style={{ width: `${zoom * 100}%`, cursor: drawing ? 'crosshair' : zoom > 1 ? 'grab' : 'default' }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={() => { panRef.current = null; setDrag(null); }}>
          <img ref={imgRef} src={url} alt="" className="w-full block" onLoad={redraw} draggable={false} />
          <canvas ref={canvasRef} className="absolute left-0 top-0 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

// Hộp xác nhận / hiệu chỉnh 1 lượt soi
export function ReviewModal({ scan, classes, severities, appointmentId, onClose, onSaved }) {
  const [openedAt] = useState(() => new Date().toISOString());
  const [showHidden, setShowHidden] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [verdicts, setVerdicts] = useState({}); // index -> { verdict, corrected_class }
  const [added, setAdded] = useState([]); // [{ raw_class, bounding_box }]
  const [missedImg, setMissedImg] = useState([]); // [{ inflammatory: 3, ... }] số nốt bỏ sót theo từng ảnh
  const [groups, setGroups] = useState({});
  const [severity, setSeverity] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [imgIdx, setImgIdx] = useState(0); // ảnh đang xem trong lượt soi (tối đa 3 góc chụp)
  const [trainingAnswer, setTrainingAnswer] = useState(scan.training_consent?.answer || null);
  const saveTrainingAnswer = async (answer) => {
    try {
      const res = await axios.put(`${API}/${scan.id}/training-consent`, { answer }, { headers: headers() });
      setTrainingAnswer(answer); message.success(res.data.message);
    } catch (e) { message.error(e.response?.data?.message || 'Không lưu được'); }
  };
  const [zoom, setZoom] = useState(1);
  const [wide, setWide] = useState(false); // mở rộng hộp xác nhận gần toàn màn hình để soi ảnh
  const issues = scan.ai.issues || [];
  const images = scan.images?.length ? scan.images : [{ url: scan.image_url, angle_name: 'Chính diện', image_size: scan.ai.image_size }];
  const onImage = (it) => (it.image_index || 0) === imgIdx;

  useEffect(() => {
    const r = scan.review?.status === 'CONFIRMED' ? scan.review : null; // sửa lại xác nhận cũ
    setVerdicts(Object.fromEntries((r?.boxes || []).map((b) => [b.index, { verdict: b.verdict, corrected_class: b.corrected_class }])));
    setAdded(r?.added_boxes || []); setMissedImg(r?.missed_images || (r?.missed ? [r.missed] : [])); setGroups(r?.groups || {}); setSeverity(r?.severity || null); setNote(r?.note || '');
  }, [scan.id]);

  const visible = issues.filter((it) => onImage(it) && (showHidden || it.draw !== false));
  const canvasBoxes = [
    ...visible.map((it) => {
      const v = verdicts[it.index]?.verdict;
      return { box: it.bounding_box, dashed: it.certainty === 'possible', label: `${it.index}`, color: v === 'NOT_LESION' ? '#94a3b8' : v === 'WRONG_CLASS' ? '#a855f7' : v === 'CORRECT' ? '#16a34a' : it.draw === false ? '#f59e0b' : '#ef4444' };
    }),
    ...added.map((a, k) => ((a.image_index || 0) === imgIdx ? { box: a.bounding_box, label: `+${k + 1}`, color: '#2563eb' } : null)).filter(Boolean),
  ];
  const groupOfClass = (key) => classes.find((c) => c.value === key)?.group;
  // Thang Hayashi đếm trên nửa mặt: ảnh có nhiều mụn viêm (đã xác nhận) nhất + số nốt bỏ sót
  // Số nốt đã xác nhận của 1 nhóm trên ảnh k: khung AI bác sĩ chọn Đúng / Sai loại (theo loại đúng) + khung bác sĩ khoanh thêm
  const verifiedOf = (k, group) => issues.filter((it) => {
    const v = verdicts[it.index];
    if ((it.image_index || 0) !== k || !v || v.verdict === 'NOT_LESION') return false;
    return (v.verdict === 'WRONG_CLASS' ? groupOfClass(v.corrected_class) : it.group) === group;
  }).length + added.filter((a) => (a.image_index || 0) === k && groupOfClass(a.raw_class) === group).length;
  const inflammatoryOf = (k) => verifiedOf(k, 'inflammatory');
  const missedAt = (k, g) => missedImg[k]?.[g] || 0;
  const groupTotal = (g) => images.reduce((n, _, k) => n + verifiedOf(k, g) + missedAt(k, g), 0);
  const perImage = images.map((_, k) => inflammatoryOf(k) + missedAt(k, 'inflammatory'));
  const inflammatoryCount = Math.max(...perImage); // nửa mặt nhiều mụn nhất (thang Hayashi)
  const inflammatoryTotal = perImage.reduce((a, b) => a + b, 0);
  const setMissedAt = (g, n) => setMissedImg((m) => images.map((_, k) => (k === imgIdx ? { ...(m[k] || {}), [g]: n || 0 } : m[k] || {})));
  const leftOn = (k) => issues.filter((it) => (it.image_index || 0) === k && it.draw !== false && !verdicts[it.index]).length;
  const autoSeverity = groups.inflammatory === false ? 'Không thấy mụn viêm' : hayashi(inflammatoryCount);
  const requiredLeft = issues.filter((it) => it.draw !== false && !verdicts[it.index]).length;

  // Lý do chưa lưu được (hiện cạnh nút lưu)
  const missingItems = [
    ...images.map((im, k) => (leftOn(k) ? `${leftOn(k)} vùng chưa xác nhận${images.length > 1 ? ` ở ảnh ${im.angle_name.toLowerCase()}` : ''}` : null)).filter(Boolean),
    ...(GROUPS.filter(([g]) => typeof groups[g] !== 'boolean').length ? [`chọn Có / Không cho ${GROUPS.filter(([g]) => typeof groups[g] !== 'boolean').map(([, n]) => n).join(', ')}`] : []),
    ...(added.some((a) => !a.raw_class) ? ['chọn loại cho vùng khoanh thêm'] : []),
  ];
  const setVerdict = (index, patch) => setVerdicts((v) => ({ ...v, [index]: { ...v[index], ...patch } }));
  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/${scan.id}/review`, {
        boxes: Object.entries(verdicts).map(([index, v]) => ({ index: Number(index), ...v })), added_boxes: added, missed_images: images.map((_, k) => missedImg[k] || {}), groups,
        severity: severity || undefined, note, opened_at: openedAt, appointment_id: appointmentId,
      }, { headers: headers() });
      message.success(res.data.message);
      onSaved(); onClose();
    } catch (error) { message.error(error.response?.data?.message || 'Không lưu được'); } finally { setSaving(false); }
  };

  const columns = [
    { title: '#', dataIndex: 'index', width: 44 },
    { title: 'AI nhận định', width: 190, render: (_, it) => <span>{it.issue_name} <Tag className="ml-1">{Math.round(it.confidence)}%</Tag>{it.certainty === 'possible' && <Tag color="orange">nghi ngờ</Tag>}{it.draw === false && <Tooltip title="Nhóm này khách không thấy khung"><Tag>ẩn với khách</Tag></Tooltip>}</span> },
    { title: 'Bác sĩ', render: (_, it) => (
      <div className="flex flex-wrap items-center gap-2">
        <Radio.Group size="small" optionType="button" value={verdicts[it.index]?.verdict} onChange={(e) => setVerdict(it.index, { verdict: e.target.value, corrected_class: e.target.value === 'WRONG_CLASS' ? verdicts[it.index]?.corrected_class : null })}
          options={[{ value: 'CORRECT', label: 'Đúng' }, { value: 'WRONG_CLASS', label: 'Sai loại' }, { value: 'NOT_LESION', label: 'Không phải' }]} />
        {verdicts[it.index]?.verdict === 'WRONG_CLASS' && (
          <Select size="small" style={{ width: 170 }} placeholder="Loại đúng" value={verdicts[it.index]?.corrected_class} onChange={(c) => setVerdict(it.index, { corrected_class: c })}
            options={classes.filter((c) => c.value !== it.raw_class)} />
        )}
      </div>
    ) },
  ];

  return (
    <Modal open title={`Xác nhận kết quả soi da ${dayjs(scan.created_at).format('DD/MM/YYYY HH:mm')} · ${scan.source === 'clinic' ? 'ảnh chụp tại phòng khám' : 'khách tự soi trên web'}`} width={wide ? '96vw' : 1080} onCancel={onClose} destroyOnHidden
      okText="Lưu xác nhận" cancelText="Đóng" onOk={save} confirmLoading={saving} okButtonProps={{ disabled: missingItems.length > 0 }}
      footer={(_, { OkBtn, CancelBtn }) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {missingItems.length > 0 && <span className="text-xs text-red-500 mr-auto text-left">Còn thiếu: {missingItems.join(' · ')}</span>}
          <CancelBtn /><OkBtn />
        </div>
      )}
      styles={{ body: { maxHeight: wide ? '82vh' : '76vh', overflowY: 'auto' } }} style={wide ? { top: 16 } : undefined}>
      <div className={`grid grid-cols-1 gap-4 ${wide ? 'lg:grid-cols-[3fr_2fr]' : 'lg:grid-cols-2'}`}>
        <div>
          {images.length > 1 && (
            <Radio.Group size="small" className="mb-2" optionType="button" value={imgIdx} onChange={(e) => { setImgIdx(e.target.value); setDrawing(false); setZoom(1); }}
              options={images.map((im, k) => ({ value: k, label: <span>{im.angle_name}{leftOn(k) > 0 && <Tag color="red" className="ml-1 mr-0">{leftOn(k)}</Tag>}</span> }))} />
          )}
          <ScanCanvas key={imgIdx} url={images[imgIdx].url} size={images[imgIdx].image_size || scan.ai.image_size} boxes={canvasBoxes} drawing={drawing} zoom={zoom} onZoom={setZoom}
            onAdd={(box) => { setAdded((a) => [...a, { image_index: imgIdx, raw_class: undefined, bounding_box: box }]); setDrawing(false); }} />
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
            <span><Switch size="small" checked={showHidden} onChange={setShowHidden} /> Hiện cả vùng AI ẩn với khách</span>
            <Button size="small" type={drawing ? 'primary' : 'default'} onClick={() => setDrawing((d) => !d)}>{drawing ? 'Kéo chuột trên ảnh để khoanh…' : '+ Khoanh vùng AI bỏ sót'}</Button>
            <Button size="small" onClick={() => setWide((w) => !w)}>{wide ? 'Thu nhỏ hộp' : 'Mở rộng toàn màn hình'}</Button>
          </div>
          <div className="text-xs text-gray-500 mt-1">Số trên khung = số thứ tự trong bảng. Màu: đỏ chưa xác nhận · xanh lá đúng · tím sai loại · xám không phải tổn thương · xanh dương bác sĩ khoanh thêm. % là độ tin cậy của model, không phải xác suất đúng.</div>
          {scan.source === 'clinic' ? (
            <div className="mt-2 p-3 rounded border bg-blue-50 text-sm">
              <b className="block mb-1">Hỏi khách: có đồng ý cho dùng ảnh (làm mờ vùng mắt, bỏ thông tin định danh) để cải thiện AI?</b>
              <Radio.Group value={trainingAnswer} onChange={(e) => saveTrainingAnswer(e.target.value)} options={[{ value: 'YES', label: 'Khách đồng ý' }, { value: 'NO', label: 'Khách không đồng ý' }]} />
              {!trainingAnswer && <div className="text-xs text-gray-500 mt-1">Chưa hỏi: ảnh không được dùng để huấn luyện. Khách rút lại được trên website.</div>}
              {trainingAnswer === 'YES' && <div className="text-xs text-gray-500 mt-1">Muốn ảnh dùng được để huấn luyện, hãy khoanh đủ các nốt thay vì chỉ nhập số bỏ sót.</div>}
            </div>
          ) : scan.allow_training
            ? <Alert className="mt-2" type="info" showIcon message="Khách đồng ý cho dùng ảnh (ẩn danh) để cải thiện AI"
                description="Kết quả bạn xác nhận (vùng đúng / sai loại / không phải, vùng khoanh thêm) được ghi làm dữ liệu huấn luyện. Muốn ảnh dùng được để huấn luyện, hãy khoanh đủ các nốt thay vì chỉ nhập số bỏ sót." />
            : <Alert className="mt-2" type="warning" showIcon message="Khách không đồng ý dùng ảnh để huấn luyện AI: kết quả chỉ dùng để chăm sóc khách" />}
        </div>
        <div className="space-y-3">
          {issues.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <b>Vùng AI khoanh{images.length > 1 ? ` (ảnh ${images[imgIdx].angle_name.toLowerCase()})` : ''} {requiredLeft > 0 && <Tag color="red">còn {requiredLeft} vùng bắt buộc</Tag>}</b>
                <Button size="small" icon={<CheckOutlined />} onClick={() => setVerdicts((v) => ({ ...v, ...Object.fromEntries(issues.filter((it) => it.draw !== false && !v[it.index]).map((it) => [it.index, { verdict: 'CORRECT' }])) }))}>Các vùng còn lại đều đúng</Button>
              </div>
              <Table size="small" rowKey="index" pagination={false} dataSource={visible} columns={columns} scroll={{ y: 260 }} />
            </>
          ) : <Alert type="info" showIcon message="AI không khoanh vùng nào trong lượt soi này" />}
          {added.length > 0 && (
            <div>
              <b className="block mb-1">Vùng bác sĩ khoanh thêm</b>
              {added.map((a, k) => (
                <div key={k} className="flex items-center gap-2 mb-1">
                  <Tag color="blue">+{k + 1}</Tag>{images.length > 1 && <span className="text-xs text-gray-500">{images[a.image_index || 0]?.angle_name}</span>}
                  <Select size="small" style={{ width: 200 }} placeholder="Loại tổn thương" value={a.raw_class} options={classes}
                    onChange={(c) => setAdded((list) => list.map((x, i) => (i === k ? { ...x, raw_class: c } : x)))} />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setAdded((list) => list.filter((_, i) => i !== k))} />
                </div>
              ))}
            </div>
          )}
          <div>
            <b className="block mb-1">Kết luận theo nhóm (bắt buộc)</b>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 text-left">
                  <th className="font-normal py-1">Nhóm</th>
                  <th className="font-normal">Bác sĩ kết luận</th>
                  <th className="font-normal">AI</th>
                  <th className="font-normal whitespace-nowrap">Bỏ sót{images.length > 1 ? ` (${images[imgIdx].angle_name.toLowerCase()})` : ''}</th>
                  <th className="font-normal text-right">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map(([g, name]) => {
                  const aiGroup = (scan.ai.groups || []).find((x) => x.group === g);
                  return (
                    <tr key={g} className="border-t border-gray-100">
                      <td className="py-1 pr-2">{name}</td>
                      <td className="whitespace-nowrap pr-2">
                        <Radio.Group size="small" value={groups[g]} onChange={(e) => setGroups((x) => ({ ...x, [g]: e.target.value }))} options={[{ value: true, label: 'Có' }, { value: false, label: 'Không' }]} />
                      </td>
                      <td className="text-xs text-gray-400 pr-2">{aiGroup?.present ? 'có' : 'không'}</td>
                      <td><InputNumber size="small" min={0} max={200} value={missedAt(imgIdx, g)} onChange={(n) => setMissedAt(g, n)} style={{ width: 60 }} /></td>
                      <td className="text-right whitespace-nowrap">{groups[g] === false ? '—' : groupTotal(g) ? `${groupTotal(g)} nốt` : <span className="text-xs text-gray-400">chưa đếm</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-xs text-gray-400 mt-1">Tổng = khung AI chọn Đúng + khung khoanh thêm + bỏ sót{images.length > 1 ? ' của mọi ảnh (số bỏ sót nhập riêng cho ảnh đang xem)' : ''}. Mức độ chỉ tính theo mụn viêm.</div>
          </div>
          <div className="text-sm">
            <b>Mụn viêm:</b> tổng {inflammatoryTotal} nốt
            {images.length > 1 && <span className="text-gray-500"> ({images.map((im, k) => `${im.angle_name.toLowerCase()} ${perImage[k]}`).join(' · ')})</span>}
            <div className="mt-1">
              <b>Mức độ:</b> {images.length > 1 ? <>nửa mặt nhiều nhất {inflammatoryCount} nốt</> : <>{inflammatoryCount} nốt</>} → <Tag color={SEV_COLOR[autoSeverity]}>{autoSeverity}</Tag>
            <Select size="small" allowClear style={{ width: 200 }} placeholder="Bác sĩ chốt mức khác" value={severity} onChange={setSeverity} options={severities.map((s) => ({ value: s, label: s }))} />
            </div>
            {images.length > 1 && <div className="text-xs text-gray-400 mt-1">Thang Hayashi đếm trên nửa mặt nên mức độ lấy ảnh có nhiều mụn viêm nhất, không cộng các ảnh.</div>}
          </div>
          <Input.TextArea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú của bác sĩ cho khách (khách xem cùng kết quả đã hiệu chỉnh)" />
        </div>
      </div>
    </Modal>
  );
}

// Tiến triển qua các lượt soi (server tính: cần >= 3 lượt có kết luận mức độ; so mức Hayashi lần đầu - lần gần nhất)
const RANK_LABEL = ['Không thấy', 'Nhẹ', 'Trung bình', 'Nặng'];
function TrendChart({ points }) {
  if (!points || points.length < 2) return null;
  const W = 560; const H = 150; const L = 74; const R = 12; const T = 10; const B = 24;
  const t0 = new Date(points[0].created_at).getTime(); const t1 = new Date(points[points.length - 1].created_at).getTime();
  const x = (p, i) => (t1 > t0 ? L + ((new Date(p.created_at).getTime() - t0) / (t1 - t0)) * (W - L - R) : L + (i / (points.length - 1)) * (W - L - R));
  const y = (r) => T + ((3 - r) / 3) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxWidth: W }}>
      {RANK_LABEL.map((label, r) => (
        <g key={label}><line x1={L} x2={W - R} y1={y(r)} y2={y(r)} stroke="#e5e7eb" strokeDasharray={r ? '4 4' : ''} /><text x={L - 6} y={y(r) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{label}</text></g>
      ))}
      <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p, i)},${y(p.rank)}`).join(' ')} fill="none" stroke="#1677ff" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(p, i)} cy={y(p.rank)} r="4.5" fill={p.reviewed ? '#1677ff' : '#fff'} stroke="#1677ff" strokeWidth="2"><title>{`${dayjs(p.created_at).format('DD/MM/YYYY')}: ${p.severity}${p.reviewed ? ' (đã xác nhận)' : ' (AI)'}`}</title></circle>
          {(i === 0 || i === points.length - 1 || points.length <= 6) && <text x={x(p, i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b7280">{dayjs(p.created_at).format('DD/MM')}</text>}
        </g>
      ))}
    </svg>
  );
}

function ProgressPanel({ progress, scans }) {
  const ordered = useMemo(() => [...scans].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), [scans]);
  const [pair, setPair] = useState([]);
  useEffect(() => { setPair([progress?.first_id || ordered[0]?.id, progress?.last_id || ordered[ordered.length - 1]?.id]); }, [progress, ordered]);
  const [angle, setAngle] = useState('front');
  const sel = pair.map((id) => ordered.find((s) => String(s.id) === String(id)));
  const imgs = (s) => (s?.images?.length ? s.images : s ? [{ url: s.image_url, angle: 'front', angle_name: 'Chính diện' }] : []);
  const common = ['front', 'left', 'right'].filter((a) => sel.every((s) => imgs(s).some((im) => im.angle === a)));
  const shown = common.includes(angle) ? angle : common[0];
  const view = (s) => (s?.review?.status === 'CONFIRMED' && s.corrected ? s.corrected : s?.ai);
  const trendAlert = !progress ? null : !progress.enough
    ? <Alert type="info" showIcon message={`Chưa đủ dữ liệu xu hướng: cần ít nhất ${progress.min_sessions} lượt soi có kết luận (hiện ${progress.count}).`} />
    : <Alert type={progress.trend === 'improved' ? 'success' : progress.trend === 'worse' ? 'error' : 'info'} showIcon
        message={<span>{progress.message}{progress.resolved.length > 0 && <> Không còn thấy: <b>{progress.resolved.join(', ')}</b>.</>}{progress.appeared.length > 0 && <> Mới xuất hiện: <b>{progress.appeared.join(', ')}</b>.</>}</span>}
        description={<span className="text-xs">{!progress.last_reviewed && 'Lượt gần nhất chưa được xác nhận (kết quả AI). '}{progress.caveat}</span>} />;
  return (
    <div className="space-y-3">
      <b className="block">Diễn tiến qua các lần soi</b>
      {trendAlert}
      <TrendChart points={progress?.points} />
      {ordered.length >= 2 && (
        <div className="p-3 rounded border bg-white">
          <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
            <b>So sánh</b>
            {[0, 1].map((k) => (
              <Select key={k} size="small" style={{ width: 210 }} value={pair[k]} onChange={(v) => setPair((p) => (k ? [p[0], v] : [v, p[1]]))}
                options={ordered.map((s) => ({ value: s.id, label: `${dayjs(s.created_at).format('DD/MM/YYYY')} · ${view(s)?.severity || '—'}` }))} />
            ))}
            {common.length > 1 && <Radio.Group size="small" optionType="button" value={shown} onChange={(e) => setAngle(e.target.value)} options={common.map((a) => ({ value: a, label: { front: 'Chính diện', left: 'Má trái', right: 'Má phải' }[a] }))} />}
          </div>
          <div className="grid grid-cols-2 gap-3" style={{ maxWidth: 520 }}>
            {sel.map((s, k) => {
              const im = imgs(s).find((x) => x.angle === shown) || imgs(s)[0];
              return (
                <div key={k} className="text-xs">
                  {im && <img src={im.url} alt="" className="w-full rounded object-cover" style={{ aspectRatio: '4 / 5' }} />}
                  <div className="mt-1 flex justify-between"><span>{k ? 'Sau' : 'Trước'} · {s ? dayjs(s.created_at).format('DD/MM/YYYY') : ''}</span><Tag color={SEV_COLOR[view(s)?.severity]}>{view(s)?.severity || '—'}</Tag></div>
                  <div className="text-gray-500">{(view(s)?.groups || []).filter((g) => g.present).map((g) => g.name).join(', ') || 'Không thấy vấn đề rõ'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Ảnh của buổi khám: CSKH chụp tại quầy (quét AI được nếu khách đồng ý) + ảnh khách tự tải khi đặt lịch
const ANGLE_VI = { front: 'Chính diện', left: 'Má trái', right: 'Má phải' };
function ClinicPhotos({ appointment, scans, onScanned }) {
  const [busy, setBusy] = useState(false);
  const meta = appointment.pre_exam_image_meta || {};
  const imgs = (appointment.pre_exam_images || []).map((url) => ({ url, ...(meta[url] || { source: 'counter' }) }));
  const counter = imgs.filter((x) => !['customer', 'chat'].includes(x.source));
  const customer = imgs.filter((x) => ['customer', 'chat'].includes(x.source)); // khách tự tải khi đặt lịch / gửi qua chat CSKH (không quét AI)
  if (!imgs.length) return null;
  const clinicScan = scans.find((s) => s.source === 'clinic' && String(s.appointment_id) === String(appointment.id));
  const consent = appointment.ai_consent?.accepted === true;
  const newer = clinicScan && counter.some((x) => !(clinicScan.images || []).some((im) => im.url === x.url) && x.angle);
  const scan = async (force = false) => {
    setBusy(true);
    try {
      const res = await axios.put(`${API_BASE}/api/booking/appointments/${appointment.id}/ai-scan`, { force }, { headers: headers() });
      message.success(res.data.message);
      onScanned(res.data.data?.id);
    } catch (e) {
      const d = e.response?.data;
      if (d?.code === 'ALREADY_CONFIRMED') {
        Modal.confirm({ title: 'Quét lại ảnh tại phòng khám?', content: d.message, okText: 'Quét lại', cancelText: 'Đóng', onOk: () => scan(true) });
      } else message.error(d?.message || 'Không quét được');
    } finally { setBusy(false); }
  };
  const thumbs = (list) => (
    <Image.PreviewGroup>
      <div className="flex flex-wrap gap-2">
        {list.map((x) => (
          <div key={x.url} className="text-center">
            <Image src={x.url} width={72} height={72} className="rounded object-cover border" />
            <div className="text-[11px] text-gray-500">{x.source === 'chat' ? 'Qua chat' : x.angle ? ANGLE_VI[x.angle] : 'Ảnh khác'}</div>
          </div>
        ))}
      </div>
    </Image.PreviewGroup>
  );
  return (
    <div className="p-3 rounded border bg-white space-y-2">
      {counter.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <b>Ảnh CSKH chụp tại quầy</b>
            {consent ? <Tag color="green">Khách đồng ý phân tích AI</Tag> : <Tag>Khách chưa đồng ý phân tích AI</Tag>}
            {clinicScan && <Tag color="purple">Đã quét {dayjs(clinicScan.created_at).format('HH:mm DD/MM')}</Tag>}
            {newer && <Tag color="orange">Có ảnh mới chưa quét</Tag>}
            {consent && <Button size="small" type={clinicScan ? 'default' : 'primary'} loading={busy} onClick={() => scan(false)}>{clinicScan ? 'Quét lại' : 'Quét AI'}</Button>}
          </div>
          {thumbs(counter)}
          {consent && !counter.some((x) => x.angle) && <div className="text-xs text-gray-500 mt-1">Chưa có ảnh 3 góc: AI quét tối đa 3 ảnh đầu.</div>}
        </div>
      )}
      {customer.length > 0 && (
        <div>
          <b className="block mb-2">Ảnh khách gửi (tải khi đặt lịch / gửi qua chat CSKH)</b>
          {thumbs(customer)}
        </div>
      )}
    </div>
  );
}

// Tab "Soi da AI" ở màn khám: toàn bộ lượt soi của hồ sơ để theo dõi tiến triển; lượt mới nhất bắt buộc xác nhận trước khi hoàn tất khám
export default function SkinScanReview({ patientProfileId, appointmentId, appointment, openScanId, openSignal, onStatus }) {
  const [scans, setScans] = useState([]);
  const [classes, setClasses] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [progress, setProgress] = useState(null);
  const load = async () => {
    if (!patientProfileId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/profile/${patientProfileId}`, { headers: headers() });
      setScans(res.data.data); setProgress(res.data.progress || null); setClasses(res.data.class_options || []); setSeverities(res.data.severities || []);
      return res.data.data;
    } catch { setScans([]); return []; } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [patientProfileId]);
  useEffect(() => { onStatus?.({ count: scans.length, pending: scans[0]?.review?.status === 'PENDING', latestId: scans[0]?.id }); }, [scans]);
  const handledSignal = useRef(null); // chỉ mở 1 lần cho mỗi lần hoàn tất khám bị chặn (không mở lại sau khi lưu)
  useEffect(() => {
    if (!openSignal || handledSignal.current === openSignal || !scans.length) return;
    const s = scans.find((x) => String(x.id) === String(openScanId));
    if (s) { handledSignal.current = openSignal; setReviewing(s); }
  }, [openSignal, scans]);

  const view = (s) => (s.review?.status === 'CONFIRMED' && s.corrected ? s.corrected : s.ai);
  if (!patientProfileId) return null;
  if (!loading && !scans.length) return <Empty description="Khách chưa có lượt soi da AI nào" />;
  return (
    <div className="space-y-3">
      {scans[0]?.review?.status === 'PENDING' && <Alert type="warning" showIcon message="Lượt soi mới nhất chưa được xác nhận. Nên xác nhận / hiệu chỉnh để khách xem kết quả chính xác; nếu cần nhiều thời gian, bạn có thể hoàn tất khám rồi xác nhận sau." />}
      {appointment && <ClinicPhotos appointment={appointment} scans={scans} onScanned={async (id) => { const list = await load(); const s = (list || []).find((x) => String(x.id) === String(id)); if (s) setReviewing(s); }} />}
      <ProgressPanel progress={progress} scans={scans} />
      <Table size="small" rowKey="id" loading={loading} dataSource={scans} pagination={{ pageSize: 6 }}
        columns={[
          { title: 'Ảnh', width: 80, render: (_, s) => <div className="relative w-16"><img src={s.image_url} alt="" className="w-16 h-16 object-cover rounded" />{s.images?.length > 1 && <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[10px] px-1 rounded">{s.images.length} ảnh</span>}</div> },
          { title: 'Ngày soi', render: (_, s) => <span>{dayjs(s.created_at).format('DD/MM/YYYY HH:mm')}<br /><Tag color={s.source === 'clinic' ? 'purple' : 'default'}>{s.source === 'clinic' ? 'Tại phòng khám' : 'Khách tự soi (web)'}</Tag></span> },
          { title: 'Kết quả', render: (_, s) => { const v = view(s); return <span><Tag color={SEV_COLOR[v.severity]}>{v.severity || '—'}</Tag>{(v.groups || []).filter((g) => g.present).map((g) => g.name).join(', ')}</span>; } },
          { title: 'Trạng thái', render: (_, s) => (s.review?.status === 'SUPERSEDED' ? <Tooltip title="Đã có lượt soi tại phòng khám của buổi khám; không bắt buộc xác nhận lượt web này"><Tag>Đã đánh giá bằng ảnh tại phòng khám</Tag></Tooltip> : s.review?.status === 'CONFIRMED' ? <Tag color="green">Đã xác nhận {dayjs(s.review.reviewed_at).format('DD/MM')}</Tag> : <Tag color={s.assignment?.due_at && dayjs(s.assignment.due_at).isBefore(dayjs()) ? 'red' : 'orange'}>Chờ bác sĩ xác nhận{s.assignment?.due_at ? ` · hạn ${dayjs(s.assignment.due_at).format('DD/MM HH:mm')}` : ''}</Tag>) },
          { title: '', width: 120, render: (_, s) => <Button size="small" icon={s.review?.status === 'CONFIRMED' ? <EditOutlined /> : <ExpandOutlined />} onClick={() => setReviewing(s)}>{s.review?.status === 'CONFIRMED' ? 'Sửa' : 'Xác nhận'}</Button> },
        ]} />
      {reviewing && <ReviewModal scan={reviewing} classes={classes} severities={severities} appointmentId={appointmentId} onClose={() => setReviewing(null)} onSaved={load} />}
    </div>
  );
}
