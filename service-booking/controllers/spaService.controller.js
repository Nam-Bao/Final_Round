const { SpaService } = require('../models');

// [PUBLIC] Lấy danh sách dịch vụ đang mở bán
exports.getActiveServices = async (req, res) => {
  try {
    const services = await SpaService.findAll({ 
      where: { status: 'ACTIVE' },
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({ data: services });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi lấy dịch vụ', error: error.message });
  }
};

// [ADMIN] Lấy toàn bộ dịch vụ (Cả ACTIVE và HIDDEN)
exports.getAllServicesForAdmin = async (req, res) => {
  try {
    const services = await SpaService.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json({ data: services });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [ADMIN] Tạo dịch vụ mới
exports.createService = async (req, res) => {
  try {
    const newService = await SpaService.create(req.body);
    res.status(201).json({ message: 'Tạo dịch vụ thành công', data: newService });
  } catch (error) {
    res.status(500).json({ message: 'Không thể tạo dịch vụ', error: error.message });
  }
};

// [ADMIN] Cập nhật dịch vụ
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await SpaService.findByPk(id);
    if (!service) return res.status(404).json({ message: 'Không tìm thấy dịch vụ' });

    await service.update(req.body);
    res.status(200).json({ message: 'Cập nhật thành công', data: service });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message });
  }
};

// [ADMIN] Xóa mềm (Đổi status thành HIDDEN)
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await SpaService.findByPk(id);
    if (!service) return res.status(404).json({ message: 'Không tìm thấy dịch vụ' });

    await service.update({ status: 'HIDDEN' });
    res.status(200).json({ message: 'Đã ẩn dịch vụ thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa', error: error.message });
  }
};