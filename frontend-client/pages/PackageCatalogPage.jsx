import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Layers, CalendarRange, Hourglass, Repeat, Stethoscope, ClipboardCheck, CreditCard, CalendarCheck, Info, PackageCheck } from 'lucide-react';

const API = '/api';
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

const getImage = (img) => {
  if (!img) return null;
  try {
    const parsed = JSON.parse(img);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return img;
  }
};

// Gói chỉ được bán sau khi bác sĩ khám và chỉ định (CSKH chốt hóa đơn) => trang này chỉ để xem
const STEPS = [
  { icon: Stethoscope, title: 'Khám với bác sĩ', text: 'Bác sĩ đánh giá tình trạng da và chỉ định gói phù hợp.' },
  { icon: CreditCard, title: 'Thanh toán tại quầy', text: 'Nhân viên tư vấn lập hóa đơn; thời hạn gói tính từ ngày mua.' },
  { icon: ClipboardCheck, title: 'Buổi 1 ngay trong ngày', text: 'Kỹ thuật viên thực hiện buổi đầu tiên ngay sau khi thanh toán.' },
  { icon: CalendarCheck, title: 'Tự đặt các buổi sau', text: 'Đặt buổi tiếp theo trong mục Gói liệu trình của tôi.' },
];

function PackageCard({ pkg, productNames }) {
  const price = Number(pkg.price);
  // Khớp cách tính khi chốt hóa đơn (service-booking: promotional_price || price)
  const finalPrice = Number(pkg.promotional_price) > 0 ? Number(pkg.promotional_price) : price;
  const promo = finalPrice < price ? finalPrice : null;
  const sessions = pkg.total_sessions || 1;
  // Thời gian ngắn nhất để hoàn thành nếu đặt buổi sát nhất có thể
  const minDays = (sessions - 1) * (pkg.interval_days || 0);
  const products = (pkg.included_products || []).map((id) => productNames[id]).filter(Boolean);
  const image = getImage(pkg.thumbnail_url);

  return (
    <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <div className="relative h-44 bg-gradient-to-br from-teal-50 to-cyan-100">
        {image ? <img src={image} alt={pkg.name} className="w-full h-full object-cover" /> : <Layers className="w-12 h-12 text-teal-300 absolute inset-0 m-auto" />}
        {promo != null && (
          <span className="absolute top-3 left-3 bg-rose-500 text-white text-xs font-bold px-2 py-1 rounded-lg">
            -{Math.round((1 - promo / price) * 100)}%
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col gap-4 flex-1">
        <div>
          <h3 className="font-bold text-lg text-slate-800">{pkg.name}</h3>
          <p className="text-sm text-slate-500 mt-1 whitespace-pre-line">{pkg.description || 'Lộ trình trị liệu theo chỉ định của bác sĩ da liễu GlowSkin.'}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 rounded-xl p-2">
            <Repeat className="w-4 h-4 mx-auto text-teal-600" />
            <p className="font-bold text-slate-800 mt-1">{sessions} buổi</p>
            <p className="text-[11px] text-slate-500">Số buổi</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2">
            <CalendarRange className="w-4 h-4 mx-auto text-teal-600" />
            <p className="font-bold text-slate-800 mt-1">{pkg.interval_days || 0} ngày</p>
            <p className="text-[11px] text-slate-500">Cách nhau tối thiểu</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2">
            <Hourglass className="w-4 h-4 mx-auto text-teal-600" />
            <p className="font-bold text-slate-800 mt-1">{pkg.validity_days} ngày</p>
            <p className="text-[11px] text-slate-500">Hạn sử dụng</p>
          </div>
        </div>

        <ul className="text-sm text-slate-600 space-y-1">
          {sessions > 1 && <li>• Hoàn thành sớm nhất sau khoảng <b>{minDays} ngày</b> nếu đặt các buổi sát nhau.</li>}
          <li>• Phải dùng hết các buổi trong <b>{pkg.validity_days} ngày</b> kể từ ngày mua.</li>
          {sessions > 1 && <li>• Chi phí trung bình <b>{vnd(Math.round(finalPrice / sessions))}</b>/buổi.</li>}
        </ul>

        {products.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5" /> Dược mỹ phẩm sử dụng trong liệu trình</p>
            <div className="flex flex-wrap gap-1">
              {products.map((name) => <span key={name} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{name}</span>)}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4 border-t flex items-end justify-between">
          <div>
            {promo != null && <p className="text-sm text-slate-400 line-through">{vnd(price)}</p>}
            <p className="text-2xl font-bold text-teal-600">{vnd(finalPrice)}</p>
          </div>
          <span className="text-xs text-slate-500 text-right max-w-[140px]">Mua sau khi được bác sĩ chỉ định</span>
        </div>
      </div>
    </article>
  );
}

export default function PackageCatalogPage() {
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/booking/packages`),
      axios.get(`${API}/commerce/products`).catch(() => ({ data: { data: [] } })), // chỉ để hiện tên sản phẩm kèm gói
    ])
      .then(([pkgRes, productRes]) => {
        setPackages(pkgRes.data.data || []);
        setProducts(productRes.data.data || []);
      })
      .catch(() => setError('Không tải được danh sách gói liệu trình, vui lòng thử lại sau'))
      .finally(() => setLoading(false));
  }, []);

  const productNames = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-gradient-to-br from-teal-600 to-cyan-600 text-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
          <h1 className="text-3xl font-bold mb-2">Gói lộ trình trị liệu</h1>
          <p className="text-teal-50 max-w-2xl text-sm">
            Các lộ trình nhiều buổi được thiết kế cho từng vấn đề da. Mỗi gói cần được bác sĩ chỉ định sau khi thăm khám,
            vì cùng một vấn đề nhưng mỗi làn da cần một lộ trình khác nhau.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-sm text-amber-800">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <p>
            Trang này để bạn <b>tham khảo</b> nội dung và chi phí các gói. Gói <b>không bán trực tuyến</b>: bạn cần khám với bác sĩ để được chỉ định gói phù hợp,
            sau đó thanh toán tại phòng khám. Xem chi tiết quy định tại <Link to="/chinh-sach#lieu-trinh" className="underline font-semibold">Chính sách gói liệu trình</Link>.
          </p>
        </div>

        {/* Quy trình sử dụng gói */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <Icon className="w-4 h-4 text-teal-600" />
                <span className="font-semibold text-slate-800 text-sm">{title}</span>
              </div>
              <p className="text-xs text-slate-500">{text}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-500"><span className="loading loading-spinner loading-md"></span></div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : packages.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border text-slate-400">Hiện chưa có gói liệu trình nào.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} productNames={productNames} />)}
          </div>
        )}
      </div>
    </div>
  );
}
