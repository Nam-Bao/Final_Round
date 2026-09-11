const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize('commerce_db', 'postgres', 'password', { host: 'localhost', port: 5434, dialect: 'postgres' });

// 1. THÊM MỚI: Model Danh mục (Category)
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
  // THÊM MỚI: Khóa ngoại liên kết với bảng Category
  category_id: { type: DataTypes.UUID, allowNull: true } 
});

const Order = sequelize.define('Order', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false }, 
  appointment_id: { type: DataTypes.UUID, allowNull: false }, // THÊM MỚI: Soft link về lịch hẹn bên booking_db
  consultant_id: { type: DataTypes.UUID }, // THÊM MỚI: Ai chốt đơn này (Để tính hoa hồng)
  total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  discount_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }, // THÊM MỚI: Tiền giảm giá
  status: { 
    // SỬA LẠI: Trạng thái phù hợp với thanh toán phòng khám
    type: DataTypes.ENUM('UNPAID', 'PARTIAL_PAID', 'PAID', 'CANCELLED'), 
    defaultValue: 'UNPAID' 
  }
});

const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false } // Giá tại thời điểm mua
});

const InventoryRequest = sequelize.define('InventoryRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  requester_id: { type: DataTypes.UUID, allowNull: false }, // Soft link
  type: { type: DataTypes.ENUM('MATERIAL_USAGE', 'PURCHASE_ORDER') },
  items: { type: DataTypes.JSONB }, // Chứa array [{product_id, qty}]
  reason: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), defaultValue: 'PENDING' },
  approver_id: { type: DataTypes.UUID }
});

// 2. THIẾT LẬP QUAN HỆ CÁC BẢNG (Relations)
// Quan hệ Category - Product (1 Category có nhiều Product)
Category.hasMany(Product, { foreignKey: 'category_id', onDelete: 'SET NULL' });
Product.belongsTo(Category, { foreignKey: 'category_id' });

// Quan hệ Order - OrderItem - Product (Đã có sẵn từ trước)
Order.hasMany(OrderItem, { foreignKey: 'order_id' });
Product.hasMany(OrderItem, { foreignKey: 'product_id' });
OrderItem.belongsTo(Product, { foreignKey: 'product_id' });

// 3. XUẤT (Export) model Category ra ngoài để Controller dùng
module.exports = { 
  sequelize, 
  Category, 
  Product, 
  Order, 
  OrderItem, 
  InventoryRequest 
};