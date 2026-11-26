import React, { useEffect, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Tag, message } from 'antd';
import { RobotOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_BASE } from '../config';

const API = `${API_BASE}/api`;
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;

// NVBH tư vấn tại quầy: nhập nhu cầu + tình trạng khách => AI gợi ý tối đa 3 sản phẩm còn hàng, đã lọc theo bảng quy tắc an toàn.
// Chỉ là gợi ý: thêm vào đơn rồi vẫn phải qua bước "Sàng lọc an toàn" bắt buộc bên dưới như bình thường.
export default function ProductAdvisor({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [need, setNeed] = useState('');
  const [budget, setBudget] = useState(null);
  const [flags, setFlags] = useState([]);
  const [allergies, setAllergies] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open || questions.length) return;
    axios.post(`${API}/booking/safety/counter-check`, { product_ids: [] }, authConfig())
      .then((res) => setQuestions(res.data.data.questions || [])).catch(() => {});
  }, [open]);

  const run = async () => {
    if (need.trim().length < 5) return message.warning('Nhập nhu cầu của khách (vd: da dầu, mụn ẩn, cần sữa rửa mặt)');
    setLoading(true);
    try {
      const res = await axios.post(`${API}/ai/assist/product-advice`, { need, budget, flags, allergies }, { ...authConfig(), timeout: 60000 });
      setResult(res.data.data);
    } catch (error) {
      message.error(error.response?.data?.message || 'Không gợi ý được, vui lòng thử lại');
    } finally { setLoading(false); }
  };

  if (!open) {
    return (
      <Button size="small" icon={<RobotOutlined />} className="mb-2" onClick={() => setOpen(true)}>Gợi ý sản phẩm theo nhu cầu (AI)</Button>
    );
  }
  return (
    <div className="mb-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
      <div className="flex justify-between items-center mb-2">
        <b className="text-sm text-indigo-800"><RobotOutlined /> Gợi ý sản phẩm theo nhu cầu (AI)</b>
        <Button size="small" type="text" onClick={() => setOpen(false)}>Thu gọn</Button>
      </div>
      <Input.TextArea rows={2} maxLength={500} value={need} onChange={(e) => setNeed(e.target.value)} className="mb-2"
        placeholder="Nhu cầu của khách, vd: da dầu, mụn ẩn vùng trán, cần sữa rửa mặt và kem trị mụn nhẹ" />
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs">Ngân sách mỗi sản phẩm tối đa</span>
        <InputNumber size="small" min={0} step={50000} value={budget} onChange={setBudget} placeholder="Không giới hạn" style={{ width: 150 }}
          formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')} parser={(v) => v.replace(/\./g, '')} />
      </div>
      {questions.length > 0 && (
        <>
          <div className="text-xs text-slate-600 mb-1">Tình trạng của khách (hỏi khách, không có thì để trống):</div>
          <Checkbox.Group className="flex flex-col gap-0.5 mb-2 text-xs" options={questions} value={flags} onChange={setFlags} />
        </>
      )}
      <Input size="small" maxLength={500} value={allergies} onChange={(e) => setAllergies(e.target.value)} className="mb-2"
        placeholder="Thành phần khách từng dị ứng (nếu có)" />
      <Button size="small" type="primary" icon={<RobotOutlined />} loading={loading} onClick={run}>Gợi ý</Button>

      {result && (
        <div className="mt-3 space-y-2">
          {result.advice && <div className="text-sm">{result.advice}</div>}
          {result.picks.map((p) => (
            <div key={p.id} className="p-2 bg-white rounded border border-indigo-100 text-sm">
              <div className="flex justify-between items-start gap-2">
                <div><b>{p.name}</b> · {vnd(p.price)}</div>
                <Button size="small" icon={<PlusOutlined />} onClick={() => onAdd(p.id)}>Thêm vào đơn</Button>
              </div>
              <div className="text-xs text-slate-700 mt-1">{p.reason}</div>
              {p.usage && <div className="text-xs text-slate-500">Cách dùng: {p.usage}</div>}
              {p.cautions?.map((c, i) => <div key={i} className="text-xs text-amber-700">Thận trọng: {c}</div>)}
            </div>
          ))}
          {result.excluded?.length > 0 && (
            <div className="text-xs text-red-700">
              <b>Đã loại vì chống chỉ định với khách:</b>
              {result.excluded.map((x) => <div key={x.id}>- {x.name}: {x.reasons.join('; ')}</div>)}
            </div>
          )}
          {result.questions?.length > 0 && (
            <div className="text-xs text-slate-600"><b>Nên hỏi thêm khách:</b>{result.questions.map((q, i) => <div key={i}>- {q}</div>)}</div>
          )}
          <div className="text-xs text-slate-400">Gợi ý chỉ để tham khảo. Sản phẩm thêm vào đơn vẫn qua bước sàng lọc an toàn bên dưới.</div>
          {result.flags?.length > 0 && <div className="text-xs"><Tag color="orange">Đã lọc theo</Tag>{result.flags.join(', ')}</div>}
        </div>
      )}
    </div>
  );
}
