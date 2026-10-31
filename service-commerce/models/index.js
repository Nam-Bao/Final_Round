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

const Cart = sequelize.define('Cart', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false, unique: true } 
});

const CartItem = sequelize.define('CartItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
});

const Review = sequelize.define('Review', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  comment: { type: DataTypes.TEXT },
  images: { type: DataTypes.JSONB }, 
  status: { type: DataTypes.ENUM('VISIBLE', 'HIDDEN'), defaultValue: 'VISIBLE' }
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

const ReturnRequest = sequelize.define('ReturnRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  order_id: { type: DataTypes.UUID, allowNull: false, unique: true }, 
  reason: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  images: { type: DataTypes.JSONB }, // Mảng URL ảnh/video bằng chứng
  bank_info: { type: DataTypes.TEXT }, // Thông tin NH để kế toán hoàn tiền tay
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'), defaultValue: 'PENDING' },
  handled_by: { type: DataTypes.UUID } // ID của NVBH/Quản lý đã duyệt
});

// THIẾT LẬP QUAN HỆ
Category.hasMany(Product, { foreignKey: 'category_id', onDelete: 'SET NULL' });
Product.belongsTo(Category, { foreignKey: 'category_id' });

Cart.hasMany(CartItem, { foreignKey: 'cart_id', onDelete: 'CASCADE' });
CartItem.belongsTo(Cart, { foreignKey: 'cart_id' });
Product.hasMany(CartItem, { foreignKey: 'product_id', onDelete: 'CASCADE' });
CartItem.belongsTo(Product, { foreignKey: 'product_id' });

Product.hasMany(Review, { foreignKey: 'product_id', onDelete: 'CASCADE' });
Review.belongsTo(Product, { foreignKey: 'product_id' });

Order.hasMany(OrderDetail, { foreignKey: 'order_id', onDelete: 'CASCADE' });
OrderDetail.belongsTo(Order, { foreignKey: 'order_id' });
Product.hasMany(OrderDetail, { foreignKey: 'product_id' });
OrderDetail.belongsTo(Product, { foreignKey: 'product_id' });

Order.hasOne(ReturnRequest, { foreignKey: 'order_id', onDelete: 'CASCADE' });
ReturnRequest.belongsTo(Order, { foreignKey: 'order_id' });

Promotion.hasMany(SavedPromotion, { foreignKey: 'promotion_id', onDelete: 'CASCADE' });
SavedPromotion.belongsTo(Promotion, { foreignKey: 'promotion_id' });

Promotion.hasMany(PromotionUsage, { foreignKey: 'promotion_id', onDelete: 'CASCADE' });
PromotionUsage.belongsTo(Promotion, { foreignKey: 'promotion_id' });

module.exports = { sequelize, Category, Product, Cart, CartItem, Review, Order, OrderDetail, InventoryRequest, Promotion, UserAddress, SavedPromotion, PromotionUsage, ReturnRequest };