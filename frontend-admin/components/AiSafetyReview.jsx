import React, { useState } from 'react';
import { Alert, Button, Tag, Typography, message } from 'antd';
import { RobotOutlined, SwapOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
const TYPE = { CONTRAINDICATED: 'error', CAUTION: 'warning', INFO: 'info' };

// Rà soát đơn đang kê:
// - Sản phẩm thay thế: hệ thống chọn THEO QUY TẮC (cùng vấn đề da, không vướng cảnh báo với khách), xếp theo lịch sử kê đơn
// - AI: nhắc thêm điểm bảng quy tắc chưa có + câu nên hỏi khách (AI lỗi thì vẫn có sản phẩm thay thế)
// Chỉ để bác sĩ tham khảo; cảnh báo của bảng quy tắc (phía trên) vẫn là cảnh báo bắt buộc khi hoàn tất khám.
export default function AiSafetyReview({ patientProfileId, appointmentId, form, products }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    const v = form.getFieldsValue(['spa_services', 'treatment_package', 'prescriptions', 'diagnosis', 'symptoms']);
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:4000/api/booking/safety/ai-review', {
        patient_profile_id: patientProfileId, appointment_id: appointmentId,
        spa_services: v.spa_services || [], treatment_package: v.treatment_package,
        prescriptions: (v.prescriptions || []).filter((p) => p?.product_id), diagnosis: v.diagnosis, symptoms: v.symptoms,
      }, { headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` }, timeout: 150000 });
      setResult(res.data.data);
    } catch (error) {
      message.error(error.response?.data?.message || 'Không chạy được AI rà soát');
    } finally {
      setLoading(false);
    }
  };

  // Thay sản phẩm có tên trùng "replaces" bằng sản phẩm gợi ý; không tìm thấy thì thêm vào cuối đơn
  const applyAlternative = (alt) => {
    const list = [...(form.getFieldValue('prescriptions') || [])];
    const idx = list.findIndex((p) => products.find((x) => x.id === p?.product_id)?.name?.toLowerCase() === alt.replaces.toLowerCase());
    if (idx >= 0) list[idx] = { ...list[idx], product_id: alt.product_id };
    else list.push({ product_id: alt.product_id, quantity: 1 });
    form.setFieldsValue({ prescriptions: list });
    message.success(`Đã ${idx >= 0 ? 'thay' : 'thêm'} ${alt.name} vào đơn, bảng quy tắc sẽ kiểm tra lại`);
  };

  return (
    <div className="mb-4 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
      <div className="flex items-center justify-between gap-2">
        <Text strong className="text-indigo-800"><RobotOutlined /> AI rà soát đơn (tham khảo)</Text>
        <Button size="small" type="primary" ghost icon={<RobotOutlined />} loading={loading} onClick={run} disabled={!patientProfileId}>
          {result ? 'Rà soát lại' : 'Rà soát bằng AI'}
        </Button>
      </div>
      {!result && !loading && <Text type="secondary" className="block text-xs mt-1">Kê xong dịch vụ / sản phẩm rồi bấm để AI xem thêm theo chẩn đoán, thành phần và lưu ý của nhà sản xuất. Sản phẩm bị cảnh báo sẽ có gợi ý thay thế theo quy tắc và lịch sử kê đơn.</Text>}
      {loading && <Text type="secondary" className="block text-xs mt-1">AI đang phân tích, có thể mất 30 - 60 giây...</Text>}
      {result && (
        <div className="mt-2">
          {result.ai_error && <Alert className="mb-2" type="warning" showIcon message={`AI: ${result.ai_error}`} description="Sản phẩm thay thế bên dưới vẫn do hệ thống chọn theo quy tắc." />}
          {result.summary && <p className="text-sm mb-2">{result.summary}</p>}
          {result.warnings.map((w, i) => (
            <Alert key={i} className="mb-2" type={TYPE[w.severity]} showIcon
              message={<span><Tag color="geekblue">AI</Tag><b>{w.severity_label}</b>: {w.item}</span>}
              description={<div className="text-sm"><div>{w.message}</div>{w.basis && <div className="text-xs text-gray-500">Căn cứ: {w.basis}</div>}</div>} />
          ))}
          {!result.ai_error && result.warnings.length === 0 && <p className="text-xs text-gray-600 mb-2">AI không thấy thêm điểm cần lưu ý ngoài cảnh báo của hệ thống.</p>}
          {result.alternatives.length > 0 && (
            <div className="mb-2">
              <Text strong className="block text-sm mb-1">Sản phẩm thay thế (theo quy tắc & lịch sử kê đơn)</Text>
              {result.alternatives.map((a) => (
                <div key={a.product_id} className="flex items-start justify-between gap-2 p-2 mb-1 bg-white rounded border border-indigo-100">
                  <div className="text-sm">
                    <b>{a.name}</b> · {vnd(a.price)} {a.prescription && <Tag color="orange">Thuốc kê đơn</Tag>}
                    <div className="text-xs text-gray-500">Thay cho: {a.replaces}</div>
                    <div className="mt-0.5">
                      {a.shared_concerns?.map((c) => <Tag key={c} color="cyan" className="text-xs">{c}</Tag>)}
                      {a.history_count > 0 && <Tag color="green" className="text-xs">Đã kê {a.history_count} lần</Tag>}
                    </div>
                    <div className="text-xs">{a.reason}</div>
                  </div>
                  <Button size="small" icon={<SwapOutlined />} onClick={() => applyAlternative(a)}>Dùng</Button>
                </div>
              ))}
            </div>
          )}
          {result.untagged?.length > 0 && (
            <p className="text-xs text-amber-700 mb-2">Chưa tìm được sản phẩm thay thế cho: {result.untagged.join(', ')} (sản phẩm chưa gắn nhãn "Vấn đề da xử lý được" ở Kho & Sản phẩm).</p>
          )}
          {result.questions.length > 0 && (
            <div className="text-sm mb-1">
              <Text strong className="block">Nên hỏi thêm khách</Text>
              <ul className="list-disc pl-5">{result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
          {result.must_confirm && <Alert className="mb-2" type="warning" showIcon message="Cảnh báo AI mức Thận trọng / Chống chỉ định: khi hoàn tất khám, nếu vẫn giữ mục này trong đơn thì phải xác nhận và ghi lý do (giống cảnh báo của bảng quy tắc)." />}
          <Text type="secondary" className="block text-xs">{result.note}</Text>
        </div>
      )}
    </div>
  );
}
