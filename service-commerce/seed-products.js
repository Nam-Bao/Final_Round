const { sequelize, Product, Category } = require('./models');

const sampleProducts = [{
        name: 'Serum Phục Hồi B5 La Roche-Posay Hyalu B5',
        description: 'Hỗ trợ tái tạo màng ẩm, làm dịu da kích ứng và phục hồi sau mụn.',
        price: 950000,
        stock: 50,
        image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=500',
        status: 'ACTIVE'
    },
    {
        name: 'Kem Chống Nắng Kiểm Soát Dầu Anessa Perfect UV',
        description: 'Bảo vệ da phổ rộng với chỉ số SPF50+ PA++++, kháng nước và mồ hôi tối ưu.',
        price: 685000,
        stock: 80,
        image_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500',
        status: 'ACTIVE'
    },
    {
        name: 'Sữa Rửa Mặt CeraVe Foaming Facial Cleanser',
        description: 'Làm sạch sâu bã nhờn, bảo vệ hàng rào tự nhiên của da nhờ 3 loại Ceramide thiết yếu.',
        price: 370000,
        stock: 120,
        image_url: 'https://images.unsplash.com/photo-1556228722-d0b71235b2e9?w=500',
        status: 'ACTIVE'
    },
    {
        name: 'Toner BHA Obagi Clenziderm Pore Therapy 2%',
        description: 'Salicylic Acid 2% giúp thông thoáng lỗ chân lông, ngăn ngừa hình thành mụn ẩn.',
        price: 880000,
        stock: 40,
        image_url: 'https://images.unsplash.com/photo-1608248597359-57778b7a4c48?w=500',
        status: 'ACTIVE'
    }
];

(async() => {
    try {
        await sequelize.authenticate();
        console.log('✅ Đã kết nối cơ sở dữ liệu Commerce!');
        await sequelize.sync({ alter: true });

        for (const item of sampleProducts) {
            await Product.findOrCreate({
                where: { name: item.name },
                defaults: item
            });
        }
        console.log('✅ Đã nạp thành công các sản phẩm mẫu vào commerce_db!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi khi nạp dữ liệu:', err);
        process.exit(1);
    }
})();