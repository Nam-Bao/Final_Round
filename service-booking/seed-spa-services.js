const { sequelize, SpaService } = require('./models');

const sampleServices = [
  {
    name: 'Lấy Nhân Mụn Y Khoa Chuẩn Da Liễu',
    description: 'Quy trình vô khuẩn chuẩn y khoa 14 bước, làm sạch sâu nang lông, giảm bã nhờn và ngừa thâm sẹo tối đa.',
    category: 'Trị mụn',
    duration: 60,
    price: 350000,
    rating: 4.9,
    image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  },
  {
    name: 'Peel Da Sinh Học Trị Thâm & Sáng Da',
    description: 'Ứng dụng hoạt chất AHA/BHA tinh khiết loại bỏ lớp sừng già cỗi, mờ thâm mụn, kích thích tái sinh tầng thượng bì.',
    category: 'Trị mụn',
    duration: 45,
    price: 490000,
    rating: 4.8,
    image_url: 'https://images.unsplash.com/photo-1512290900672-1f486c91d4e0?w=800&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  },
  {
    name: 'Laser Toning Mờ Nám & Tàn Nhang',
    description: 'Công nghệ xung laser chọn lọc tác động sâu tầng trung bì, phá vỡ sắc tố melanin mà không gây tổn thương mô xung quanh.',
    category: 'Trị nám và tàn nhang',
    duration: 75,
    price: 950000,
    rating: 5.0,
    image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  },
  {
    name: 'Meso Căng Bóng Trẻ Hóa Tầng Sâu',
    description: 'Cấy vi điểm Hyaluronic Acid nồng độ cao kết hợp phức hợp Peptide giúp khóa ẩm tầng sâu, săn chắc và trẻ hóa da toàn diện.',
    category: 'Trẻ hóa da',
    duration: 90,
    price: 1500000,
    rating: 5.0,
    image_url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  },
  {
    name: 'Điện Di Tinh Chất Phục Hồi B5 + HA',
    description: 'Làm dịu cấp tốc làn da nhạy cảm sau điều trị hoặc kích ứng, phục hồi hàng rào lipid tự nhiên cho da bóng khỏe.',
    category: 'Phục hồi da',
    duration: 50,
    price: 400000,
    rating: 4.8,
    image_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  },
  {
    name: 'Chăm Sóc & Thải Độc Da Chuyên Sâu',
    description: 'Hút chì đào thải độc tố, xông hơi tinh chất thiên nhiên, massage dẫn lưu bạch huyết cho da thông thoáng nhẹ nhàng.',
    category: 'Chăm sóc da cơ bản',
    duration: 60,
    price: 300000,
    rating: 4.7,
    image_url: 'https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=800&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  }
];

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Kết nối DB booking_db thành công!');
    await sequelize.sync({ alter: true });

    for (const item of sampleServices) {
      const existing = await SpaService.findOne({ where: { name: item.name } });
      if (existing) {
        await existing.update(item);
      } else {
        await SpaService.create(item);
      }
    }

    console.log(`✅ Đã nạp thành công ${sampleServices.length} dịch vụ Spa thật vào booking_db!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi nạp Spa Services:', error);
    process.exit(1);
  }
})();
