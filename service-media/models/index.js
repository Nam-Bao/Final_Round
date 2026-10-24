const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('media_db', 'postgres', 'password', {
  host: 'localhost',
  port: 5436,
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
