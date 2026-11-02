// Cấu hình Giao Hàng Nhanh (GHN) đọc từ .env của service-commerce.
// Đọc mỗi lần gọi hàm (không đọc lúc require) => luôn lấy đúng giá trị sau khi dotenv đã nạp.

// Thông tin kho GlowSkin: điểm lấy hàng của đơn giao đi và điểm nhận hàng của đơn hoàn trả
const WAREHOUSE_KEYS = ['GHN_FROM_NAME', 'GHN_FROM_PHONE', 'GHN_FROM_ADDRESS', 'GHN_FROM_WARD_CODE', 'GHN_FROM_DISTRICT_ID'];
const REQUIRED_KEYS = ['GHN_TOKEN', 'GHN_SHOP_ID', ...WAREHOUSE_KEYS];

// Môi trường production mặc định; đặt GHN_API_BASE_URL=https://dev-online-gateway.ghn.vn/shiip/public-api để chạy thử
const ghnUrl = (path) => `${(process.env.GHN_API_BASE_URL || 'https://online-gateway.ghn.vn/shiip/public-api').replace(/\/+$/, '')}${path}`;

const missingGhnConfig = () => REQUIRED_KEYS.filter((key) => !String(process.env[key] || '').trim());

const shopWarehouse = () => {
  const missing = WAREHOUSE_KEYS.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) throw new Error(`Thiếu cấu hình kho GHN trong .env: ${missing.join(', ')}`);
  return {
    name: process.env.GHN_FROM_NAME,
    phone: process.env.GHN_FROM_PHONE,
    address: process.env.GHN_FROM_ADDRESS,
    ward_code: String(process.env.GHN_FROM_WARD_CODE),
    district_id: Number(process.env.GHN_FROM_DISTRICT_ID),
  };
};

const ghnHeaders = () => ({
  'Content-Type': 'application/json',
  'Token': process.env.GHN_TOKEN,
  'ShopId': process.env.GHN_SHOP_ID,
});

module.exports = { ghnUrl, shopWarehouse, ghnHeaders, missingGhnConfig };
