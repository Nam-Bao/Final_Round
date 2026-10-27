import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

// Đổi version mỗi khi nội dung chính sách thay đổi, để biết khách đã đồng ý bản nào
export const CONSENT_VERSION = '2026-10-v1';

// TODO: chỉnh theo chính sách thực tế của GlowSkin và cho bộ phận pháp lý rà soát trước khi chạy thật
const POLICY = {
  retention: '30 ngày kể từ ngày tải lên',
  contactEmail: 'privacy@glowskin.vn',
  policyUrl: '/chinh-sach-bao-mat',
  processors: 'Cloudinary (lưu trữ ảnh) và Roboflow (phân tích hình ảnh)',
};

export default function PhotoConsentModal({ open, onAccept, onClose }) {
  const [agreed, setAgreed] = useState(false);
  const [allowTraining, setAllowTraining] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    setAgreed(false);
    setAllowTraining(false);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // khóa cuộn trang nền
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleAccept = () => {
    if (!agreed) return;
    onAccept({
      version: CONSENT_VERSION,
      accepted_at: new Date().toISOString(),
      allow_training: allowTraining,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()} // bấm nền mờ để đóng
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-consent-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col outline-none"
      >
        {/* Tiêu đề */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h3 id="photo-consent-title" className="text-lg font-bold text-slate-800">
                Cam kết sử dụng hình ảnh khách hàng
              </h3>
              <p className="text-sm text-slate-500">Vui lòng đọc trước khi tải ảnh lên</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung cuộn được */}
        <div className="p-5 overflow-y-auto text-sm text-slate-700 space-y-5">
          <section>
            <h4 className="font-semibold text-slate-800 mb-2">GlowSkin cam kết</h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Chỉ dùng ảnh của bạn để phân tích tình trạng da bằng AI và giúp chuyên viên tư vấn dịch vụ phù hợp.</li>
              <li>Không đăng tải, quảng cáo hay chia sẻ ảnh của bạn vì mục đích thương mại.</li>
              <li>Chỉ chuyển ảnh cho đơn vị kỹ thuật phục vụ việc phân tích: {POLICY.processors}.</li>
              <li>Lưu ảnh và kết quả phân tích trong {POLICY.retention}, sau đó xóa.</li>
              <li>Chỉ nhân sự được phân quyền mới xem được ảnh của bạn.</li>
              <li>
                Bạn có quyền yêu cầu xem, xóa ảnh hoặc rút lại đồng ý bất cứ lúc nào qua{' '}
                <a className="text-primary underline" href={`mailto:${POLICY.contactEmail}`}>
                  {POLICY.contactEmail}
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold text-slate-800 mb-2">Bạn lưu ý</h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Ảnh khuôn mặt và tình trạng da là dữ liệu cá nhân nhạy cảm.</li>
              <li>
                Hãy chỉ tải ảnh của chính bạn, hoặc ảnh của người đã đồng ý. Với người dưới 16 tuổi, cần có cha mẹ hoặc
                người giám hộ đồng ý.
              </li>
              <li>Kết quả AI chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ da liễu.</li>
            </ul>
          </section>

          <a href={POLICY.policyUrl} target="_blank" rel="noreferrer" className="inline-block text-primary underline">
            Xem chính sách bảo mật đầy đủ
          </a>

          {/* Xác nhận */}
          <div className="space-y-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-primary checkbox-sm mt-0.5"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                Tôi đã đọc và đồng ý cho GlowSkin xử lý ảnh của tôi theo các cam kết trên.{' '}
                <span className="text-red-500">(Bắt buộc)</span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-primary checkbox-sm mt-0.5"
                checked={allowTraining}
                onChange={(e) => setAllowTraining(e.target.checked)}
              />
              <span className="text-slate-600">
                Tôi đồng ý cho dùng ảnh đã được ẩn danh để cải thiện mô hình AI. Không đồng ý sẽ không ảnh hưởng đến kết
                quả phân tích của tôi. (Không bắt buộc)
              </span>
            </label>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-ghost">
            Hủy
          </button>
          <button onClick={handleAccept} disabled={!agreed} className="btn btn-primary">
            Đồng ý và chọn ảnh
          </button>
        </div>
      </div>
    </div>
  );
}