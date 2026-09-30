const { Order, OrderItem, Product, sequelize } = require('../models');
const axios = require('axios');

// 1. Kéo danh sách hóa đơn chờ Thu ngân (O2O)
const getUnpaidOrders = async (req, res) => {
  try {
    const token = req.headers.authorization;

    // Kéo các đơn đang chờ thanh toán, kèm theo chi tiết từng món hàng
    const orders = await Order.findAll({
      where: { status: 'UNPAID' },
      include: [{
        model: OrderItem,
        include: [{ model: Product, attributes: ['name', 'price'] }]
      }],
      order: [['createdAt', 'ASC']] // Đơn tạo trước thì hiển thị trên cùng
    });

    // Gọi chéo sang service-identity để lấy Tên và SĐT khách hàng
    let allUsers = [];
    try {
      const identityRes = await axios.get('http://localhost:4000/api/identity/users', { headers: { 'Authorization': token } });
      allUsers = identityRes.data.data;
    } catch (err) { 
      console.warn("Không gọi được service-identity, sử dụng ID thô."); 
    }

    // Ghép Tên khách hàng vào dữ liệu hóa đơn
    const mappedOrders = orders.map(order => {
      const customer = allUsers.find(u => u.id === order.customer_id);
      return {
        ...order.toJSON(),
        customer_name: customer?.Profile?.full_name || 'Khách hàng',
        customer_phone: customer?.Profile?.phone || 'Chưa có SĐT',
      };
    });

    res.status(200).json({ data: mappedOrders });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 2. Thu tiền & Trừ số lượng Tồn kho tự động
const payOrder = async (req, res) => {
  // Khởi tạo Transaction (Bảo vệ toàn vẹn dữ liệu)
  const t = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id, {
      include: [{ model: OrderItem }]
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    if (order.status !== 'UNPAID') {
      await t.rollback();
      return res.status(400).json({ message: 'Hóa đơn này đã được thanh toán hoặc đã hủy' });
    }

    // Vòng lặp: Kiểm tra và trừ tồn kho cho từng món mỹ phẩm trong hóa đơn
    for (const item of order.OrderItems) {
      if (item.product_id) {
        const product = await Product.findByPk(item.product_id);
        if (product && product.type === 'PRODUCT') {
          // Kiểm tra xem kho có đủ hàng không
          if (product.stock_quantity < item.quantity) {
            await t.rollback();
            return res.status(400).json({ message: `Sản phẩm "${product.name}" không đủ số lượng trong kho!` });
          }
          // Trừ kho
          product.stock_quantity -= item.quantity;
          await product.save({ transaction: t });
        }
      }
    }

    // Đổi trạng thái hóa đơn thành Đã thanh toán
    order.status = 'PAID';
    await order.save({ transaction: t });

    // Lưu tất cả các thay đổi vào Database
    await t.commit();
    res.status(200).json({ message: 'Thanh toán & Trừ tồn kho thành công!' });

  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Lỗi xử lý thanh toán', error: error.message });
  }
};

module.exports = { getUnpaidOrders, payOrder };