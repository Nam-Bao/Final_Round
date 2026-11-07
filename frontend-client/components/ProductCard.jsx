import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';

const PLACEHOLDER = 'https://placehold.co/600x600?text=No+Image';

export const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
export const productUrl = (p) => `/shops/${p.ProductDetail?.slug || p.id}`;

// image_url có thể là mảng, chuỗi JSON hoặc 1 URL
export const getImages = (img) => {
  if (!img) return [PLACEHOLDER];
  if (Array.isArray(img)) return img.length ? img : [PLACEHOLDER];
  try {
    const parsed = JSON.parse(img);
    return Array.isArray(parsed) ? (parsed.length ? parsed : [PLACEHOLDER]) : [parsed];
  } catch {
    return [img];
  }
};

// Server trả price = giá đang bán online; có khuyến mãi thì kèm original_price và discount_percent
export const isOnSale = (p) => Number(p?.original_price) > Number(p?.price);

// Nhãn dạng bong bóng (đuôi nhọn góc dưới phải) cho "MỚI" và "GIẢM X%"
function Bubble({ className, children }) {
  return (
    <span className={`relative inline-block rounded-lg px-2 py-0.5 text-white text-[11px] md:text-sm font-extrabold italic tracking-wide shadow-md ${className}`}>
      {children}
      <span className={`absolute -bottom-1.5 right-3 w-3 h-3 rotate-45 -z-10 ${className}`} aria-hidden />
    </span>
  );
}

// Nhãn góc trên phải ảnh: MỚI (10 sản phẩm mở bán gần nhất, server gắn is_new) và GIẢM X% (đang khuyến mãi online)
export function ProductBadges({ product, className = 'absolute top-2 right-2' }) {
  const sale = isOnSale(product);
  if (!product.is_new && !sale) return null;
  return (
    <div className={`${className} z-10 flex flex-col items-end gap-2.5 pointer-events-none`}>
      {product.is_new && <Bubble className="bg-gradient-to-br from-emerald-400 to-teal-500">MỚI</Bubble>}
      {sale && <Bubble className="bg-gradient-to-br from-rose-500 to-red-600">GIẢM {product.discount_percent}%</Bubble>}
    </div>
  );
}

// Giá bán + giá gốc gạch ngang khi đang khuyến mãi
export function ProductPrice({ product, className = 'text-primary font-bold', originalClassName = 'text-xs text-slate-400 line-through' }) {
  return (
    <span className="inline-flex items-baseline gap-2 flex-wrap">
      <span className={className}>{vnd(product.price)}</span>
      {isOnSale(product) && <span className={originalClassName}>{vnd(product.original_price)}</span>}
    </span>
  );
}

// Thẻ sản phẩm thu gọn (sản phẩm liên quan, các mục sản phẩm trên trang chủ)
export default function ProductCard({ product }) {
  const outOfStock = !(product.stock_quantity > 0);
  return (
    <Link to={productUrl(product)} className="bg-white rounded-2xl p-2.5 md:p-3 border border-slate-100 shadow-sm hover:shadow-md hover:border-teal-200 transition group flex flex-col">
      <div className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden mb-3">
        <img src={getImages(product.image_url)[0]} alt={product.name} loading="lazy" className={`w-full h-full object-cover transition duration-300 group-hover:scale-105 ${outOfStock ? 'opacity-50 grayscale' : ''}`} />
        {outOfStock && <span className="absolute top-2 left-2 bg-slate-800 text-white text-xs font-semibold px-2 py-0.5 rounded-lg">Hết hàng</span>}
        <ProductBadges product={product} />
        {product.ProductDetail?.is_prescription && <span className="absolute bottom-2 left-2 bg-rose-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-lg">Thuốc kê đơn</span>}
      </div>
      {product.Category && <p className="text-xs text-teal-600 line-clamp-1">{product.Category.name}</p>}
      <p className="font-semibold text-slate-800 text-sm line-clamp-2 min-h-[2.5rem]">{product.name}</p>
      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
        {product.review_count > 0 ? <><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {Number(product.avg_rating).toFixed(1)}</> : <span>Chưa có đánh giá</span>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-2 mt-auto pt-2">
        <ProductPrice product={product} />
        <span className="text-[11px] text-slate-400 whitespace-nowrap">Đã bán {Number(product.sold_count || 0).toLocaleString('vi-VN')}</span>
      </div>
    </Link>
  );
}
