const { Sequelize, DataTypes } = require('sequelize');

// Đọc từ .env; giá trị mặc định khớp docker-compose cho môi trường dev
const sequelize = new Sequelize(process.env.DB_NAME || 'media_db', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || 'password', {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5436),
  dialect: 'postgres',
  logging: false
});

const Article = sequelize.define('Article', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  summary: { type: DataTypes.TEXT },
  content: { type: DataTypes.TEXT },
  thumbnail_url: { type: DataTypes.STRING },
  category: { type: DataTypes.STRING, defaultValue: 'Tin tức' },
  author_id: { type: DataTypes.UUID },
  author_name: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('PUBLISHED', 'DRAFT', 'HIDDEN'), defaultValue: 'PUBLISHED' },
  published_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

module.exports = { sequelize, Article };
