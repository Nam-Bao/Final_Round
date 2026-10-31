import React from 'react';
import { Phone, MapPin, Clock, MessageCircle } from 'lucide-react';
import { HOTLINE, HOTLINE_DISPLAY, ZALO_URL, WORKING_HOURS } from '../utils/contact';

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-6">
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
          <span>343/5F Tô Hiến Thành, P.12, Q.10, TP.HCM</span>
        </div>
      </div>
    </div>
  );
}
