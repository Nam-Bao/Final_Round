const { Sequelize, DataTypes } = require('sequelize');
// Đọc từ .env; giá trị mặc định khớp docker-compose cho môi trường dev
const sequelize = new Sequelize(
  process.env.DB_NAME || 'commerce_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5434), dialect: 'postgres' }
);

const Category = sequelize.define('Category', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }
});

const Product = sequelize.define('Product', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('PRODUCT', 'MATERIAL'), allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  weight: { type: DataTypes.INTEGER, defaultValue: 200, comment: 'Cân nặng sản phẩm tính bằng gram' },
  stock_quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
  category_id: { type: DataTypes.UUID, allowNull: true },
  start_date: { type: DataTypes.DATE, allowNull: false },
  end_date: { type: DataTypes.DATE, allowNull: false },
  image_url: { type: DataTypes.JSONB }, 
});

// Thông tin hiển thị trên web cho mỹ phẩm (1 sản phẩm - 1 dòng). Bảng riêng vì sync thường không thêm cột vào Products.
// Sản phẩm mới nhập kho chưa có dòng này => chưa bán trên web cho tới khi quản lý điền thông tin và bật is_published.
const ProductDetail = sequelize.define('ProductDetail', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  product_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },      // đường dẫn /shops/<slug>
  is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  published_at: { type: DataTypes.DATE },
  brand: { type: DataTypes.STRING },
  origin: { type: DataTypes.STRING },                                     // xuất xứ
  capacity: { type: DataTypes.STRING },                                   // dung tích / khối lượng tịnh, vd "40ml"
  skin_types: { type: DataTypes.JSONB, defaultValue: [] },                // loại da phù hợp
  short_description: { type: DataTypes.STRING(300) },
  description: { type: DataTypes.TEXT },
  benefits: { type: DataTypes.TEXT },                                     // công dụng
  ingredients: { type: DataTypes.TEXT },                                  // thành phần
  usage: { type: DataTypes.TEXT },                                        // hướng dẫn sử dụng
  storage: { type: DataTypes.TEXT },                                      // bảo quản
  warnings: { type: DataTypes.TEXT },                                     // lưu ý / chống chỉ định
  updated_by: { type: DataTypes.UUID },
});

const Cart = sequelize.define('Cart', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false, unique: true } 
});

const CartItem = sequelize.define('CartItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
});

// Đánh giá sản phẩm từ đơn hàng đã nhận (mỗi sản phẩm trong 1 đơn được đánh giá 1 lần).
// customer_name là ảnh chụp tên thật từ service-identity lúc đánh giá.
const Review = sequelize.define('Review', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  order_id: { type: DataTypes.UUID },
  customer_name: { type: DataTypes.STRING },
  rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  comment: { type: DataTypes.TEXT },
  images: { type: DataTypes.JSONB },
  status: { type: DataTypes.ENUM('VISIBLE', 'HIDDEN'), defaultValue: 'VISIBLE' }
}, {
  indexes: [{ unique: true, fields: ['order_id', 'product_id'] }]
});

const Order = sequelize.define('Order', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false }, 
  appointment_id: { type: DataTypes.UUID, allowNull: true }, 
  consultant_id: { type: DataTypes.UUID }, 
  recipient_name: { type: DataTypes.STRING, allowNull: false }, 
  shipping_phone: { type: DataTypes.STRING(20), allowNull: false }, 
  shipping_address: { type: DataTypes.TEXT, allowNull: false }, 
  shipping_district_id: { type: DataTypes.INTEGER, allowNull: true }, // Mã Quận/Huyện của GHN
  shipping_ward_code: { type: DataTypes.STRING, allowNull: true },    // Mã Phường/Xã của GHN
  shipping_fee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },  // Phí vận chuyển
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true }, 
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true }, 
  note: { type: DataTypes.TEXT }, 
  total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  discount_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }, 
  tracking_code: { type: DataTypes.STRING, allowNull: true },
  status: { 
    type: DataTypes.ENUM(
      'UNPAID', 'PARTIAL_PAID', 'PAID', 'CONFIRMED', 'PROCESSING', 'SHIPPING', 'COMPLETED', 'CANCELLED', // CONFIRMED: NVBH đã duyệt đơn
      'RETURN_REQUESTED', 'RETURN_COMPLETED', 'RETURN_REJECTED', 'REFUND_PENDING' // <-- THÊM MỚI
    ), 
    defaultValue: 'UNPAID' 
  },
  payment_method: { type: DataTypes.ENUM('COD', 'VIETQR_SEPAY'), defaultValue: 'COD', allowNull: false } 
});

const OrderDetail = sequelize.define('OrderDetail', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  weight: { type: DataTypes.INTEGER, defaultValue: 200 } // Mặc định mỗi sp 200g, NVBH có thể sửa sau 
});

const InventoryRequest = sequelize.define('InventoryRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  requester_id: { type: DataTypes.UUID, allowNull: false }, 
  type: { type: DataTypes.ENUM('MATERIAL_USAGE', 'PURCHASE_ORDER') },
  items: { type: DataTypes.JSONB }, 
  reason: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), defaultValue: 'PENDING' },
  approver_id: { type: DataTypes.UUID }
});

const Promotion = sequelize.define('Promotion', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  code: { type: DataTypes.STRING, allowNull: false, unique: true }, 
  discount_type: { type: DataTypes.ENUM('PERCENTAGE', 'FIXED_AMOUNT'), allowNull: false },
  discount_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, 
  max_discount: { type: DataTypes.DECIMAL(10, 2) }, 
  min_order_value: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }, 
  usage_limit: { type: DataTypes.INTEGER }, 
  used_count: { type: DataTypes.INTEGER, defaultValue: 0 }, 
  start_date: { type: DataTypes.DATE, allowNull: false },
  end_date: { type: DataTypes.DATE, allowNull: false },
  image_url: { type: DataTypes.STRING }, 
  applicable_scope: { type: DataTypes.ENUM('ALL', 'SPA_SERVICE', 'PRODUCT', 'TREATMENT_PACKAGE'), defaultValue: 'ALL', allowNull: false },
  status: { type: DataTypes.ENUM('ACTIVE', 'HIDDEN'), defaultValue: 'ACTIVE' }
});

const UserAddress = sequelize.define('UserAddress', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false }, 
  recipient_name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING(20), allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: false },
  shipping_district_id: { type: DataTypes.INTEGER, allowNull: true },
  shipping_ward_code: { type: DataTypes.STRING, allowNull: true },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true }, // Tọa độ thật
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true }, // Tọa độ thật
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false } 
});

const SavedPromotion = sequelize.define('SavedPromotion', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false } // UUID của khách hàng
});

const PromotionUsage = sequelize.define('PromotionUsage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  promotion_id: { type: DataTypes.UUID, allowNull: false }
});

// Yêu cầu hoàn/trả hàng của khách sau khi đã nhận đơn giao GHN (NVBH xử lý).
// Bảng mới "OrderReturns" (bảng ReturnRequests cũ chưa từng dùng, sync thường không thêm cột nên không tái sử dụng)
const OrderReturn = sequelize.define('OrderReturn', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  order_id: { type: DataTypes.UUID, allowNull: false },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  items: { type: DataTypes.JSONB, allowNull: false }, // [{ order_detail_id, product_id, name, quantity, price }]
  reason: { type: DataTypes.ENUM('DAMAGED', 'WRONG_ITEM', 'DEFECTIVE', 'EXPIRED'), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  images: { type: DataTypes.JSONB, allowNull: false }, // URL ảnh bằng chứng (Cloudinary)
  bank_name: { type: DataTypes.STRING, allowNull: false },
  bank_account: { type: DataTypes.STRING(30), allowNull: false },
  bank_holder: { type: DataTypes.STRING, allowNull: false },
  refund_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, // server tự tính khi khách gửi yêu cầu
  status: {
    // PENDING: chờ NVBH duyệt -> APPROVED: đã duyệt -> PICKING: GHN đang lấy hàng về kho
    // -> RECEIVED: kho đã nhận, chờ kiểm tra -> REFUNDED: đã hoàn tiền
    // REJECTED: từ chối (khi duyệt hoặc khi kiểm tra hàng) | CANCELLED: khách tự hủy lúc còn chờ duyệt
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'PICKING', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'),
    defaultValue: 'PENDING'
  },
  reject_reason: { type: DataTypes.TEXT },
  tracking_code: { type: DataTypes.STRING }, // mã vận đơn GHN chiều khách -> kho
  ghn_status: { type: DataTypes.STRING },    // trạng thái thô GHN gửi qua webhook
  refund_ref: { type: DataTypes.STRING },    // mã giao dịch chuyển khoản hoàn tiền
  restocked: { type: DataTypes.BOOLEAN, defaultValue: false },
  handled_by: { type: DataTypes.UUID },      // NVBH thao tác gần nhất
  approved_at: { type: DataTypes.DATE },
  received_at: { type: DataTypes.DATE },
  refunded_at: { type: DataTypes.DATE },
});

// THIẾT LẬP QUAN HỆ
Category.hasMany(Product, { foreignKey: 'category_id', onDelete: 'SET NULL' });
Product.belongsTo(Category, { foreignKey: 'category_id' });

Cart.hasMany(CartItem, { foreignKey: 'cart_id', onDelete: 'CASCADE' });
CartItem.belongsTo(Cart, { foreignKey: 'cart_id' });
Product.hasOne(ProductDetail, { foreignKey: 'product_id', onDelete: 'CASCADE' });
ProductDetail.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(CartItem, { foreignKey: 'product_id', onDelete: 'CASCADE' });
CartItem.belongsTo(Product, { foreignKey: 'product_id' });

Product.hasMany(Review, { foreignKey: 'product_id', onDelete: 'CASCADE' });
Review.belongsTo(Product, { foreignKey: 'product_id' });

Order.hasMany(OrderDetail, { foreignKey: 'order_id', onDelete: 'CASCADE' });
OrderDetail.belongsTo(Order, { foreignKey: 'order_id' });
Product.hasMany(OrderDetail, { foreignKey: 'product_id' });
OrderDetail.belongsTo(Product, { foreignKey: 'product_id' });

Order.hasMany(OrderReturn, { foreignKey: 'order_id', onDelete: 'CASCADE' });
OrderReturn.belongsTo(Order, { foreignKey: 'order_id' });

Promotion.hasMany(SavedPromotion, { foreignKey: 'promotion_id', onDelete: 'CASCADE' });
SavedPromotion.belongsTo(Promotion, { foreignKey: 'promotion_id' });

Promotion.hasMany(PromotionUsage, { foreignKey: 'promotion_id', onDelete: 'CASCADE' });
PromotionUsage.belongsTo(Promotion, { foreignKey: 'promotion_id' });

module.exports = { sequelize, Category, Product, ProductDetail, Cart, CartItem, Review, Order, OrderDetail, InventoryRequest, Promotion, UserAddress, SavedPromotion, PromotionUsage, OrderReturn };