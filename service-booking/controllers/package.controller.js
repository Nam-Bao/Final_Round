const { TreatmentPackage } = require('../models');

const getActivePackages = async (req, res) => {
  try {
    const packages = await TreatmentPackage.findAll({ where: { status: 'ACTIVE' }, order: [['createdAt', 'DESC']] });
    res.status(200).json({ data: packages });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const getAllPackagesForAdmin = async (req, res) => {
  try {
    const packages = await TreatmentPackage.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json({ data: packages });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const createPackage = async (req, res) => {
  try {
    const newPackage = await TreatmentPackage.create(req.body);
    res.status(201).json({ message: 'Tạo Lộ trình thành công!', data: newPackage });
  } catch (error) { res.status(500).json({ message: 'Lỗi khi tạo', error: error.message }); }
};

const updatePackage = async (req, res) => {
  try {
    await TreatmentPackage.update(req.body, { where: { id: req.params.id } });
    res.status(200).json({ message: 'Cập nhật thành công!' });
  } catch (error) { res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message }); }
};

const deletePackage = async (req, res) => {
  try {
    await TreatmentPackage.update({ status: 'HIDDEN' }, { where: { id: req.params.id } });
    res.status(200).json({ message: 'Đã gỡ Gói Lộ trình xuống!' });
  } catch (error) { res.status(500).json({ message: 'Lỗi khi gỡ', error: error.message }); }
};

module.exports = { getActivePackages, getAllPackagesForAdmin, createPackage, updatePackage, deletePackage };