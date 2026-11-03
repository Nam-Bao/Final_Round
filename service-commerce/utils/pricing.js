// Khuyến mãi online của mỹ phẩm: giảm ProductDetail.sale_percent % giá niêm yết, trong khoảng sale_start - sale_end.
// Chỉ áp dụng cho giỏ hàng và thanh toán trên web; đơn tại quầy / NVBH tạo hộ vẫn tính giá niêm yết.

const SALE_FIELDS = ['sale_percent', 'sale_start', 'sale_end'];

// % giảm đang chạy (1 - 90) hoặc null nếu không có / hết hạn / chưa tới ngày
const activeSalePercent = (product, now = new Date()) => {
  const detail = product?.ProductDetail;
  const percent = Number(detail?.sale_percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) return null;
  if (detail.sale_start && new Date(detail.sale_start) > now) return null;
  if (!detail.sale_end || new Date(detail.sale_end) <= now) return null;
  return percent;
};

// Giá khách trả khi mua online (làm tròn tới đồng)
const onlinePrice = (product, now) => {
  const price = Number(product.price);
  const percent = activeSalePercent(product, now);
  return percent === null ? price : Math.round(price * (100 - percent) / 100);
};

// JSON trả cho khách: price = giá đang bán; có khuyến mãi thì thêm original_price, discount_percent, sale_end.
// Bỏ các trường sale_* thô để không lộ lịch khuyến mãi chưa bắt đầu.
const withOnlinePrice = (json, now = new Date()) => {
  const percent = activeSalePercent(json, now);
  const out = { ...json };
  if (out.ProductDetail) {
    out.ProductDetail = { ...out.ProductDetail };
    SALE_FIELDS.forEach((f) => delete out.ProductDetail[f]);
  }
  if (percent === null) return out;
  return {
    ...out,
    price: onlinePrice(json, now).toFixed(2),
    original_price: Number(json.price).toFixed(2),
    discount_percent: percent,
    sale_end: json.ProductDetail.sale_end,
  };
};

module.exports = { SALE_FIELDS, activeSalePercent, onlinePrice, withOnlinePrice };
