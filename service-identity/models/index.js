const { Sequelize, DataTypes } = require('sequelize');

// Cấu hình kết nối (Sẽ cấu hình chi tiết ở file env sau, tạm thời để code mẫu)
const sequelize = new Sequelize('identity_db', 'postgres', 'password', { host: 'localhost',port: 5435, dialect: 'postgres' });

// 1. Bảng Users
const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { 
    type: DataTypes.ENUM('GUEST', 'CUSTOMER', 'GEN_MANAGER', 'ADMIN', 'DOCTOR', 'CONSULTANT', 'TECHNICIAN', 'SALES'),
    defaultValue: 'CUSTOMER' 
  },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'BANNED'), defaultValue: 'ACTIVE' }
});

// 2. Bảng Profiles
const Profile = sequelize.define('Profile', {
  full_name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  dob: { type: DataTypes.DATEONLY },
  avatar: { type: DataTypes.STRING }
});

// 3. Bảng Guardians (Người giám hộ)
const Guardian = sequelize.define('Guardian', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  full_name: { type: DataTypes.STRING, allowNull: false },
  relationship: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING }
});

// 4. Bảng Attendances (Chấm công nhân viên)
const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  check_in: { type: DataTypes.DATE },
  check_out: { type: DataTypes.DATE }
});

// Thiết lập quan hệ (Khóa ngoại vật lý TRONG CÙNG 1 DB)
User.hasOne(Profile, { foreignKey: 'user_id' });
Profile.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Guardian, { foreignKey: 'customer_id' });
User.hasMany(Attendance, { foreignKey: 'employee_id' });

module.exports = { sequelize, User, Profile, Guardian, Attendance };