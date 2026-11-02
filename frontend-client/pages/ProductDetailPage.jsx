import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  Star, Minus, Plus, ShoppingBag, Zap, ShieldCheck, Truck, Undo2, Stethoscope, ChevronRight, CheckCircle, PackageX,
} from 'lucide-react';
import ProductIngredients, { parseIngredients } from '../components/ProductIngredients';

// Hạn sử dụng tính từ ngày sản xuất đến ngày hết hạn, hiển thị dạng "24 tháng" như trên bao bì
const shelfLife = (start, end) => {
  if (!start || !end) return null;
  const months = Math.round(dayjs(end).diff(dayjs(start), 'month', true));
  if (months >= 1) return `${months} tháng kể từ ngày sản xuất`;
  const days = dayjs(end).diff(dayjs(start), 'day');
  return days > 0 ? `${days} ngày kể từ ngày sản xuất` : null;
};

const productUrl = (p) => `/shops/${p.ProductDetail?.slug || p.id}`;
import { useAuthStore } from '../store/authStore';

const API = 'http://localhost:4000/api/commerce';
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
const PLACEHOLDER = 'https://placehold.co/600x600?text=No+Image';
const MAX_QTY = 20;

// image_url có thể là mảng, chuỗi JSON hoặc 1 URL
const getImages = (img) => {
  if (!img) return [PLACEHOLDER];
  if (Array.isArray(img)) return img.length ? img : [PLACEHOLDER];
  try {
    const parsed = JSON.parse(img);
    return Array.isArray(parsed) ? (parsed.length ? parsed : [PLACEHOLDER]) : [parsed];
  } catch {
    return [img];
  }
};

const Stars = ({ value, size = 'w-4 h-4' }) => (
  <span className="inline-flex">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`${size} ${n <= Math.round(value) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
    ))}
  </span>
);

// Thẻ sản phẩm thu gọn cho phần "Sản phẩm liên quan"
function MiniProductCard({ product }) {
  const outOfStock = !(product.stock_quantity > 0);
  return (
    <Link to={productUrl(product)} className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md hover:border-teal-200 transition group flex flex-col">
      <div className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden mb-3">
        <img src={getImages(product.image_url)[0]} alt={product.name} className={`w-full h-full object-cover transition duration-300 group-hover:scale-105 ${outOfStock ? 'opacity-50 grayscale' : ''}`} />
        {outOfStock && <span className="absolute top-2 left-2 bg-slate-800 text-white text-xs font-semibold px-2 py-0.5 rounded-lg">Hết hàng</span>}
      </div>
      {product.Category && <p className="text-xs text-teal-600 line-clamp-1">{product.Category.name}</p>}
      <p className="font-semibold text-slate-800 text-sm line-clamp-2 min-h-[2.5rem]">{product.name}</p>
      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
        {product.review_count > 0 ? <><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {Number(product.avg_rating).toFixed(1)}</> : <span>Chưa có đánh giá</span>}
      </div>
      <div className="flex items-end justify-between mt-auto pt-2">
        <span className="text-primary font-bold">{vnd(product.price)}</span>
        <span className="text-[11px] text-slate-400">Đã bán {Number(product.sold_count || 0).toLocaleString('vi-VN')}</span>
      </div>
    </Link>
  );
}

export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);

  const [product, setProduct] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [reviews, setReviews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [starFilter, setStarFilter] = useState(0);
  const [activeTab, setActiveTab] = useState('description');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setActiveImage(0);
    setQty(1);
    setStarFilter(0);
    window.scrollTo({ top: 0 });
    setActiveTab('description');
    (async () => {
      try {
        const [pRes, listRes] = await Promise.all([
          axios.get(`${API}/products/shop/${encodeURIComponent(slug)}`),
          axios.get(`${API}/products/shop`).catch(() => ({ data: { data: [] } })),
        ]);
        const data = pRes.data.data;
        const reviewRes = await axios.get(`${API}/reviews/product/${data.id}`)
          .catch(() => ({ data: { data: { avg_rating: 0, review_count: 0, reviews: [] } } }));
        if (cancelled) return;
        // Link cũ dạng /shops/<id> hoặc slug đã đổi => thay URL bằng slug hiện tại (tên sản phẩm)
        if (data.ProductDetail?.slug && data.ProductDetail.slug !== slug) navigate(`/shops/${data.ProductDetail.slug}`, { replace: true });
        setProduct(data);
        setAllProducts(listRes.data.data || []);
        setReviews(reviewRes.data.data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Liên quan: ưu tiên cùng danh mục, sau đó sản phẩm có giá gần nhất; hàng còn bán xếp trước
  const related = useMemo(() => {
    if (!product) return [];
    const price = Number(product.price);
    return allProducts
      .filter((p) => p.id !== product.id)
      .map((p) => ({
        p,
        score: (p.Category?.id && p.Category.id === product.Category?.id ? 0 : 1),
        diff: Math.abs(Number(p.price) - price),
      }))
      .sort((a, b) => a.score - b.score || (b.p.stock_quantity > 0) - (a.p.stock_quantity > 0) || a.diff - b.diff)
      .slice(0, 8)
      .map((x) => x.p);
  }, [allProducts, product]);

  // Phân bố số sao từ danh sách đánh giá
  const distribution = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    (reviews?.reviews || []).forEach((r) => { counts[r.rating] = (counts[r.rating] || 0) + 1; });
    return counts;
  }, [reviews]);
  const shownReviews = (reviews?.reviews || []).filter((r) => !starFilter || r.rating === starFilter);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // Giỏ hàng cần đăng nhập; server tự kiểm tra tồn kho và báo nếu vượt số lượng còn lại
  const addToCart = async (buyNow) => {
    if (!user?.id) {
      alert('Vui lòng đăng nhập để mua hàng');
      return navigate('/login');
    }
    setBusy(true);
    try {
      await axios.post(`${API}/carts/add`, { product_id: product.id, quantity: qty }, { headers: { Authorization: `Bearer ${token}` } });
      if (buyNow) navigate('/shops', { state: { openCart: true } });
      else showToast(`Đã thêm ${qty} sản phẩm vào giỏ hàng`);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thêm được vào giỏ hàng');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="py-32 text-center text-slate-400"><span className="loading loading-spinner loading-lg"></span></div>;
  }
  if (notFound || !product) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center space-y-4">
        <PackageX className="w-14 h-14 mx-auto text-slate-300" />
        <p className="text-slate-500">Sản phẩm không tồn tại hoặc đã ngừng kinh doanh.</p>
        <Link to="/shops" className="btn btn-primary btn-sm">Quay lại cửa hàng</Link>
      </div>
    );
  }

  const images = getImages(product.image_url);
  const outOfStock = !(product.stock_quantity > 0);
  const maxQty = Math.max(1, Math.min(MAX_QTY, product.stock_quantity || 1));
  const shelfLifeText = shelfLife(product.start_date, product.end_date);

  const detail = product.ProductDetail || {};
  // Tên các hoạt chất chính (hiện ngay dưới giá, bấm để mở tab Thành phần)
  const keyActives = (parseIngredients(detail.ingredients)?.actives || [])
    .map((a) => (a.concentration ? `${a.name} ${a.concentration}` : a.name)).slice(0, 4);
  const specs = [
    ['Thương hiệu', detail.brand],
    ['Xuất xứ', detail.origin],
    ['Dung tích / Khối lượng', detail.capacity],
    ['Loại da phù hợp', detail.skin_types?.length ? detail.skin_types.join(', ') : null],
    ['Danh mục', product.Category?.name || 'Chưa phân loại'],
    ['Trọng lượng (đóng gói)', product.weight ? `${product.weight} g` : null],
    ['Hạn sử dụng', shelfLifeText],
    ['Tình trạng', outOfStock ? 'Tạm hết hàng' : 'Còn hàng'],
  ].filter(([, v]) => v);

  // Tab nội dung: chỉ những phần quản lý đã nhập; luôn có Thông số và Bảo quản & lưu ý
  const infoTabs = [
    { key: 'description', label: 'Mô tả sản phẩm' },
    { key: 'benefits', label: 'Công dụng' },
    { key: 'ingredients', label: 'Thành phần' },
    { key: 'usage', label: 'Hướng dẫn sử dụng' },
  ].filter((t) => detail[t.key]).concat([{ key: 'specs', label: 'Thông số' }, { key: 'care', label: 'Bảo quản & lưu ý' }]);
  // Tab đang chọn không có nội dung (sản phẩm chưa nhập mô tả) => mở tab đầu tiên
  const currentTab = infoTabs.some((t) => t.key === activeTab) ? activeTab : infoTabs[0].key;

  return (
    <div className="bg-slate-50 min-h-screen pb-16">
      {toast && (
        <div className="fixed top-20 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-400" /> {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Đường dẫn */}
        <nav className="flex items-center gap-1 text-sm text-slate-500 flex-wrap">
          <Link to="/" className="hover:text-teal-600">Trang chủ</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/shops" className="hover:text-teal-600">Mỹ phẩm</Link>
          {product.Category && (
            <>
              <ChevronRight className="w-4 h-4" />
              <Link to={`/shops?cat=${product.Category.id}`} className="hover:text-teal-600">{product.Category.name}</Link>
            </>
          )}
          <ChevronRight className="w-4 h-4" />
          <span className="text-slate-700 line-clamp-1">{product.name}</span>
        </nav>

        {/* Thông tin chính */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8">
          {/* Ảnh */}
          <div>
            <div className="relative aspect-square bg-slate-100 rounded-2xl overflow-hidden">
              <img src={images[activeImage]} alt={product.name} className={`w-full h-full object-cover ${outOfStock ? 'opacity-60 grayscale' : ''}`} />
              {outOfStock && <span className="absolute top-3 left-3 bg-slate-800 text-white text-sm font-semibold px-3 py-1 rounded-lg">Tạm hết hàng</span>}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {images.map((url, i) => (
                  <button key={url + i} onClick={() => setActiveImage(i)}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 ${i === activeImage ? 'border-teal-500' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mua hàng */}
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              {product.Category && <Link to={`/shops?cat=${product.Category.id}`} className="text-sm text-teal-600 font-medium hover:underline">{product.Category.name}</Link>}
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mt-1">{product.name}</h1>
              {detail.brand && <p className="text-sm text-slate-500 mt-1">Thương hiệu: <b className="text-slate-700">{detail.brand}</b>{detail.origin ? ` · Xuất xứ: ${detail.origin}` : ''}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
                <a href="#danh-gia" className="flex items-center gap-1.5 hover:text-teal-600">
                  {product.review_count > 0
                    ? <><span className="font-semibold text-slate-800 underline">{Number(product.avg_rating).toFixed(1)}</span> <Stars value={product.avg_rating} /> <span>({product.review_count} đánh giá)</span></>
                    : <span>Chưa có đánh giá</span>}
                </a>
                <span className="hidden sm:inline text-slate-300">|</span>
                <span>Đã bán <b className="text-slate-800">{Number(product.sold_count || 0).toLocaleString('vi-VN')}</b></span>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl px-4 py-3">
              <span className="text-3xl font-bold text-primary">{vnd(product.price)}</span>
              <p className="text-xs text-slate-500 mt-1">Phí vận chuyển GHN được tính theo địa chỉ nhận hàng khi đặt.</p>
            </div>

            {detail.short_description && <p className="text-sm text-slate-600 leading-relaxed">{detail.short_description}</p>}
            {keyActives.length > 0 && (
              <div className="text-sm">
                <span className="text-slate-500">Hoạt chất chính: </span>
                {keyActives.map((a, i) => (
                  <button key={a} type="button" onClick={() => { setActiveTab('ingredients'); document.getElementById('thong-tin')?.scrollIntoView({ behavior: 'smooth' }); }}
                    className="font-medium text-teal-700 hover:underline">
                    {a}{i < keyActives.length - 1 ? ', ' : ''}
                  </button>
                ))}
              </div>
            )}
            {detail.skin_types?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.skin_types.map((t) => <span key={t} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}

            <div className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <span className="text-slate-500">Vận chuyển</span>
              <span className="text-slate-700">Giao Hàng Nhanh (GHN), thanh toán COD hoặc chuyển khoản</span>
              <span className="text-slate-500">Hạn sử dụng</span>
              <span className="text-slate-700">{shelfLifeText || 'Đang cập nhật'}</span>
              {!detail.is_prescription && <span className="text-slate-500">Số lượng</span>}
              {!detail.is_prescription && <div className="flex items-center gap-3">
                <div className="flex items-center border border-slate-200 rounded-lg">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={outOfStock || qty <= 1} className="p-2 disabled:opacity-30" aria-label="Giảm"><Minus className="w-4 h-4" /></button>
                  <input value={qty} disabled={outOfStock} inputMode="numeric" aria-label="Số lượng"
                    onChange={(e) => setQty(Math.min(maxQty, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="w-12 text-center outline-none font-semibold disabled:bg-transparent" />
                  <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={outOfStock || qty >= maxQty} className="p-2 disabled:opacity-30" aria-label="Tăng"><Plus className="w-4 h-4" /></button>
                </div>
                <span className={`text-xs font-medium ${outOfStock ? 'text-red-500' : 'text-green-600'}`}>{outOfStock ? 'Tạm hết hàng' : 'Còn hàng'}</span>
              </div>}
            </div>

            {detail.is_prescription ? (
              // Thuốc kê đơn: chỉ tra cứu, không bán online (server cũng chặn thêm vào giỏ / đặt hàng)
              <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3">
                <p className="font-semibold text-rose-700">Thuốc kê đơn – không bán online</p>
                <p className="text-sm text-rose-800/80">
                  Theo quy định, thuốc kê đơn chỉ được bán khi có chỉ định của bác sĩ. Bác sĩ GlowSkin sẽ thăm khám và kê đơn nếu phù hợp,
                  bạn nhận thuốc tại quầy của phòng khám ngay sau buổi khám.
                </p>
                <Link to="/booking" className="btn btn-sm bg-rose-600 hover:bg-rose-700 text-white border-none">Đặt lịch khám với bác sĩ</Link>
              </div>
            ) : (
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <button onClick={() => addToCart(false)} disabled={outOfStock || busy}
                className="flex-1 py-3 rounded-xl border-2 border-teal-600 text-teal-700 font-semibold flex items-center justify-center gap-2 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <ShoppingBag className="w-5 h-5" /> Thêm vào giỏ hàng
              </button>
              <button onClick={() => addToCart(true)} disabled={outOfStock || busy}
                className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                <Zap className="w-5 h-5" /> Mua ngay
              </button>
            </div>
            )}

            {/* Cam kết */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" /> Được kiểm tra hàng khi nhận</div>
              <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-teal-600 shrink-0" /> Giao toàn quốc qua GHN</div>
              <Link to="/chinh-sach#hoan-tra" className="flex items-center gap-2 hover:text-teal-700"><Undo2 className="w-4 h-4 text-teal-600 shrink-0" /> Đổi trả 7 ngày nếu hàng lỗi</Link>
              <Link to="/booking" className="flex items-center gap-2 hover:text-teal-700"><Stethoscope className="w-4 h-4 text-teal-600 shrink-0" /> Bác sĩ da liễu tư vấn</Link>
            </div>
          </div>
        </div>

        {/* Thông tin chi tiết: các tab chỉ hiện khi quản lý đã nhập nội dung */}
        <section id="thong-tin" className="scroll-mt-24 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex overflow-x-auto border-b border-slate-200 px-2 sm:px-4">
            {infoTabs.map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition ${currentTab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4 sm:p-6 text-sm text-slate-600">
            {currentTab === 'specs' ? (
              <table className="w-full max-w-2xl">
                <tbody>
                  {specs.map(([label, value]) => (
                    <tr key={label} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4 text-slate-500 w-48 align-top">{label}</td>
                      <td className="py-2.5 text-slate-800">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : currentTab === 'care' ? (
              <div className="space-y-4 max-w-3xl">
                {detail.storage && <div><p className="font-semibold text-slate-700 mb-1">Bảo quản</p><p className="whitespace-pre-line leading-relaxed">{detail.storage}</p></div>}
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-amber-800">
                  <p className="font-semibold mb-1">Lưu ý khi sử dụng</p>
                  {detail.warnings
                    ? <p className="whitespace-pre-line leading-relaxed">{detail.warnings}</p>
                    : (
                      <ul className="list-disc pl-5 space-y-0.5">
                        <li>Thử sản phẩm trên vùng da nhỏ trước khi dùng cho toàn mặt.</li>
                        <li>Ngưng sử dụng nếu có dấu hiệu kích ứng và liên hệ bác sĩ.</li>
                        <li>Bảo quản nơi khô ráo, tránh ánh nắng trực tiếp; dùng trước hạn sử dụng.</li>
                      </ul>
                    )}
                  <p className="mt-2">Da đang điều trị hoặc nhạy cảm nên <Link to="/booking" className="underline font-medium">đặt lịch khám</Link> để bác sĩ tư vấn sản phẩm phù hợp.</p>
                </div>
              </div>
            ) : currentTab === 'ingredients' ? (
              <ProductIngredients text={detail.ingredients} capacity={detail.capacity} />
            ) : (
              <p className="whitespace-pre-line leading-relaxed max-w-3xl">{detail[currentTab]}</p>
            )}
          </div>
        </section>

        {/* Đánh giá */}
        <section id="danh-gia" className="scroll-mt-24 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Đánh giá sản phẩm</h2>
          {reviews?.review_count > 0 ? (
            <>
              <div className="flex flex-col sm:flex-row gap-6 bg-teal-50/60 border border-teal-100 rounded-xl p-4 mb-4">
                <div className="text-center sm:w-40 shrink-0">
                  <p className="text-4xl font-bold text-teal-700">{Number(reviews.avg_rating).toFixed(1)}<span className="text-lg text-slate-400">/5</span></p>
                  <Stars value={reviews.avg_rating} size="w-5 h-5" />
                  <p className="text-xs text-slate-500 mt-1">{reviews.review_count} đánh giá</p>
                </div>
                <div className="flex-1 space-y-1">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const count = distribution[n] || 0;
                    const pct = reviews.reviews.length ? (count / reviews.reviews.length) * 100 : 0;
                    return (
                      <button key={n} onClick={() => setStarFilter(starFilter === n ? 0 : n)}
                        className={`w-full flex items-center gap-2 text-xs rounded px-1 ${starFilter === n ? 'bg-white' : ''}`}>
                        <span className="w-10 text-slate-600 flex items-center gap-0.5">{n} <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /></span>
                        <span className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden"><span className="block h-full bg-yellow-400" style={{ width: `${pct}%` }} /></span>
                        <span className="w-6 text-right text-slate-500">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {starFilter > 0 && (
                <p className="text-sm text-slate-500 mb-2">Đang lọc đánh giá {starFilter} sao · <button onClick={() => setStarFilter(0)} className="text-teal-600 underline">Xem tất cả</button></p>
              )}
              <div className="divide-y divide-slate-100">
                {shownReviews.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Chưa có đánh giá {starFilter} sao.</p>}
                {shownReviews.map((r) => (
                  <div key={r.id} className="py-4 flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 font-bold flex items-center justify-center shrink-0">{(r.customer_name || 'K').charAt(0)}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{r.customer_name || 'Khách hàng'}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Stars value={r.rating} size="w-3 h-3" /> {dayjs(r.createdAt).format('DD/MM/YYYY')}
                        <span className="text-green-600">· Đã mua hàng</span>
                      </div>
                      {r.comment && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line break-words">{r.comment}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-6 text-center">Sản phẩm chưa có đánh giá. Chỉ khách đã nhận hàng mới có thể đánh giá sản phẩm.</p>
          )}
        </section>

        {/* Sản phẩm liên quan */}
        {related.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-800">Sản phẩm liên quan</h2>
              <Link to={product.Category ? `/shops?cat=${product.Category.id}` : '/shops'} className="text-sm text-teal-600 hover:underline flex items-center">
                Xem thêm <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {related.map((p) => <MiniProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
