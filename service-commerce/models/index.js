const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize('commerce_db', 'postgres', 'password', { host: 'localhost', port: 5434, dialect: 'postgres' });

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
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true }, // Tọa độ thật
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true }, // Tọa độ thật
  note: { type: DataTypes.TEXT }, 
  total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  discount_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }, 
  status: { type: DataTypes.ENUM('UNPAID', 'PARTIAL_PAID', 'PAID', 'PROCESSING', 'SHIPPING', 'COMPLETED', 'CANCELLED'), defaultValue: 'UNPAID' },
  payment_method: { type: DataTypes.ENUM('COD', 'VIETQR_SEPAY'), defaultValue: 'COD', allowNull: false } 
});

const OrderDetail = sequelize.define('OrderDetail', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false } 
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

Promotion.hasMany(SavedPromotion, { foreignKey: 'promotion_id', onDelete: 'CASCADE' });
SavedPromotion.belongsTo(Promotion, { foreignKey: 'promotion_id' });

Promotion.hasMany(PromotionUsage, { foreignKey: 'promotion_id', onDelete: 'CASCADE' });
PromotionUsage.belongsTo(Promotion, { foreignKey: 'promotion_id' });

module.exports = { sequelize, Category, Product, Cart, CartItem, Review, Order, OrderDetail, InventoryRequest, Promotion, UserAddress, SavedPromotion, PromotionUsage };