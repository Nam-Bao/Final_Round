import React, { useState } from 'react';
import { Phone, Copy, Check, X } from 'lucide-react';
import { HOTLINE, HOTLINE_DISPLAY, ZALO_URL, WORKING_HOURS, canPhoneCall } from '../utils/contact';

// Hai nút nổi Hotline + Zalo, đặt phía trên nút chat.
// Hotline: điện thoại bấm là gọi; máy tính không gọi được nên hiện số kèm nút sao chép.
export default function ContactButtons() {
  const [showHotline, setShowHotline] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleHotlineClick = (e) => {
    if (canPhoneCall()) return; // để link tel: mở màn hình gọi
    e.preventDefault();
    setShowHotline((v) => !v);
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(HOTLINE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // trình duyệt chặn clipboard: khách vẫn đọc được số trên màn hình
    }
  };

  return (
    <div className="flex flex-col items-end gap-3 mb-4">
      {showHotline && (
        <div className="card bg-base-100 shadow-xl border border-base-200 p-4 w-64 animate-fade-in-up">
          <div className="flex justify-between items-start">
            <span className="text-xs text-base-content/60">Hotline tư vấn & đặt lịch</span>
            <button onClick={() => setShowHotline(false)} className="btn btn-ghost btn-xs btn-circle" aria-label="Đóng">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-2xl font-extrabold text-primary tracking-wide">{HOTLINE_DISPLAY}</p>
          <p className="text-xs text-base-content/60 mb-3">{WORKING_HOURS}</p>
          <button onClick={copyNumber} className="btn btn-sm btn-outline btn-primary gap-1">
            {copied ? <><Check className="w-4 h-4" /> Đã sao chép</> : <><Copy className="w-4 h-4" /> Sao chép số</>}
          </button>
        </div>
      )}

      <a
        href={ZALO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-circle shadow-lg border-0 bg-[#0068FF] hover:bg-[#0055d4] text-white text-xs font-bold tracking-tight transition-transform hover:scale-110"
        title="Chat Zalo với phòng khám"
        aria-label="Chat Zalo với phòng khám"
      >
        Zalo
      </a>

      <a
        href={`tel:${HOTLINE}`}
        onClick={handleHotlineClick}
        className="btn btn-circle btn-success text-white shadow-lg transition-transform hover:scale-110"
        title={`Gọi hotline ${HOTLINE_DISPLAY}`}
        aria-label={`Gọi hotline ${HOTLINE_DISPLAY}`}
      >
        <Phone className="w-5 h-5" />
      </a>
    </div>
  );
}
