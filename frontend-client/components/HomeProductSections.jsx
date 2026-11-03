import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, Flame, Sparkles, Tag } from 'lucide-react';
import ProductCard, { isOnSale } from './ProductCard';
import { listedAt } from './ShopFilters';

const PER_SECTION = 4;

// 3 mục mỹ phẩm trên trang chủ, lấy từ dữ liệu thật của cửa hàng web:
// - Đang giảm giá: khuyến mãi online quản lý đặt trong "Thông tin bán trên web"
// - Mới lên kệ: 10 sản phẩm mở bán trên web gần nhất (server gắn is_new, cũng là nhãn "MỚI" trên thẻ)
// - Bán chạy: theo số lượng đã bán trong các đơn đã hoàn thành
// Thuốc kê đơn không đưa lên các mục này (không quảng cáo thuốc kê đơn tới công chúng).
// Mục nào không có sản phẩm thì ẩn mục đó.
export default function HomeProductSections() {
  const [products, setProducts] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:4000/api/commerce/products/shop')
      .then((res) => setProducts(res.data.data || []))
      .catch(() => setProducts([]));
  }, []);

  const sections = useMemo(() => {
    if (!products) return [];
    const list = products.filter((p) => !p.ProductDetail?.is_prescription);
    const inStockFirst = (a, b) => (b.stock_quantity > 0) - (a.stock_quantity > 0);
    return [
      {
        key: 'sale', title: 'Đang giảm giá', icon: Tag, color: 'text-red-500 bg-red-50',
        desc: 'Ưu đãi khi mua online, có hạn theo từng đợt',
        link: '/shops?tab=sale',
        items: list.filter(isOnSale).sort((a, b) => inStockFirst(a, b) || b.discount_percent - a.discount_percent),
      },
      {
        key: 'new', title: 'Mới lên kệ', icon: Sparkles, color: 'text-teal-600 bg-teal-50',
        desc: 'Sản phẩm vừa mở bán tại GlowSkin',
        link: '/shops?tab=new',
        // is_new: server gắn cho 10 sản phẩm mở bán gần nhất
        items: list.filter((p) => p.is_new).sort((a, b) => inStockFirst(a, b) || listedAt(b) - listedAt(a)),
      },
      {
        key: 'best', title: 'Bán chạy', icon: Flame, color: 'text-orange-500 bg-orange-50',
        desc: 'Được khách hàng mua nhiều nhất',
        link: '/shops?tab=best',
        items: list.filter((p) => p.sold_count > 0).sort((a, b) => inStockFirst(a, b) || b.sold_count - a.sold_count),
      },
    ].filter((s) => s.items.length > 0);
  }, [products]);

  if (!products) {
    return <div className="text-center py-8"><span className="loading loading-spinner loading-md text-primary"></span></div>;
  }
  if (sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map(({ key, title, icon: Icon, color, desc, link, items }) => (
        <section key={key}>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-secondary">{title}</h2>
                <p className="text-sm text-base-content/60">{desc}</p>
              </div>
            </div>
            <Link to={link} className="btn btn-sm btn-ghost text-primary gap-1 shrink-0">
              Xem tất cả <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {items.slice(0, PER_SECTION).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
