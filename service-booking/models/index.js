const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize('booking_db', 'postgres', 'password', { host: 'localhost', port: 5433, dialect: 'postgres' });

const TreatmentPackage = sequelize.define('TreatmentPackage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  duration_days: { type: DataTypes.INTEGER }
});

const WorkShift = sequelize.define('WorkShift', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employee_id: { type: DataTypes.UUID, allowNull: false }, // Soft link to Identity
  date: { type: DataTypes.DATEONLY, allowNull: false },
  shift_type: { type: DataTypes.ENUM('MORNING', 'AFTERNOON', 'EVENING') },
  status: { type: DataTypes.ENUM('SCHEDULED', 'ATTENDED', 'ABSENT') }
});

const ShiftRequest = sequelize.define('ShiftRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employee_id: { type: DataTypes.UUID, allowNull: false },
  reason: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), defaultValue: 'PENDING' },
  approved_by: { type: DataTypes.UUID } // Soft link to GEN_MANAGER
});

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false }, // Soft link
  staff_id: { type: DataTypes.UUID }, // Soft link (Doctor/Consultant)
  type: { type: DataTypes.ENUM('VIDEO_CALL', 'IN_CLINIC') },
  status: { type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'), defaultValue: 'PENDING' },
  meet_url: { type: DataTypes.STRING }
});

const AppointmentReview = sequelize.define('AppointmentReview', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  rating: { type: DataTypes.INTEGER },
  comment: { type: DataTypes.TEXT }
});

// Quan hệ nội bộ trong Booking
TreatmentPackage.hasMany(Appointment, { foreignKey: 'package_id' });
Appointment.belongsTo(TreatmentPackage, { foreignKey: 'package_id' });

WorkShift.hasMany(ShiftRequest, { foreignKey: 'from_shift_id' });
Appointment.hasOne(AppointmentReview, { foreignKey: 'appointment_id' });

module.exports = { sequelize, TreatmentPackage, WorkShift, ShiftRequest, Appointment, AppointmentReview };