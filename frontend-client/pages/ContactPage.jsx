import React from 'react';
import { Phone, MapPin, Clock, MessageCircle } from 'lucide-react';
import { HOTLINE, HOTLINE_DISPLAY, ZALO_URL, WORKING_HOURS, CLINIC_ADDRESS, MAP_EMBED_URL, MAP_DIRECTIONS_URL } from '../utils/contact';

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-2xl md:text-3xl font-extrabold text-secondary text-center">Liên hệ GlowSkin Clinic</h1>

      <div className="bg-base-100 rounded-2xl border border-base-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Phone className="w-5 h-5 text-primary shrink-0" />
          <span>Hotline: <a href={`tel:${HOTLINE}`} className="font-bold text-primary text-lg">{HOTLINE_DISPLAY}</a></span>
        </div>
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-primary shrink-0" />
          <span>Zalo: <a href={ZALO_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-primary">{HOTLINE_DISPLAY}</a></span>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary shrink-0" />
          <span>{WORKING_HOURS}</span>
        </div>
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-primary shrink-0" />
          <span>{CLINIC_ADDRESS}</span>
        </div>
      </div>

      <div className="bg-base-100 rounded-2xl border border-base-200 shadow-sm overflow-hidden">
        <iframe title="Bản đồ đường đến GlowSkin Clinic" src={MAP_EMBED_URL} className="w-full h-80 md:h-96 border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-base-content/70"><MapPin className="w-4 h-4 text-primary" /> {CLINIC_ADDRESS}</span>
          <a href={MAP_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">Chỉ đường</a>
        </div>
      </div>
    </div>
  );
}
