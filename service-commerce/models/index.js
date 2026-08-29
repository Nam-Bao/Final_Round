const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize('commerce_db', 'postgres', 'password', { host: 'localhost', port: 5434, dialect: 'postgres' });

const Product = sequelize.define('Product', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('PRODUCT', 'MATERIAL'), allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  stock_quantity: { type: DataTypes.INTEGER, defaultValue: 0 }
});

const Order = sequelize.define('Order', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false }, // Soft link
  prescription_id: { type: DataTypes.STRING }, // Soft link to MongoDB Medical_Record
  total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'SHIPPING', 'DELIVERED', 'CANCELLED'), defaultValue: 'PENDING' }
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

// Quan hệ nội bộ
Order.hasMany(OrderItem, { foreignKey: 'order_id' });
Product.hasMany(OrderItem, { foreignKey: 'product_id' });
OrderItem.belongsTo(Product, { foreignKey: 'product_id' });

module.exports = { sequelize, Product, Order, OrderItem, InventoryRequest };