const { sequelize, Promotion } = require('./models');

const samplePromotions = [{
        code: 'GLOWNEW',
        discount_type: 'PERCENTAGE',
        discount_value: 20.00,
        max_discount: 150000.00,
        min_order_value: 300000.00,
        usage_limit: 100,
        used_count: 14,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        image_url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=80',
        applicable_scope: 'ALL', // Áp dụng toàn bộ
        status: 'ACTIVE'
    },
    {
        code: 'TRIMUN50K',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 50000.00,
        max_discount: 50000.00,
        min_order_value: 350000.00,
        usage_limit: 50,
        used_count: 8,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80',
        applicable_scope: 'SPA_SERVICE', // Tab Dịch vụ Spa
        status: 'ACTIVE'
    },
    {
        code: 'GLOWVIP100',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 100000.00,
        max_discount: 100000.00,
        min_order_value: 800000.00,
        usage_limit: 80,
        used_count: 22,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        image_url: 'https://images.unsplash.com/photo-1512290900672-1f486c91d4e0?w=800&auto=format&fit=crop&q=80',
        applicable_scope: 'TREATMENT_PACKAGE', // Tab Gói điều trị
        status: 'ACTIVE'
    },
    {
        code: 'FREESHIPSKIN',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 30000.00,
        max_discount: 30000.00,
        min_order_value: 200000.00,
        usage_limit: 200,
        used_count: 45,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        image_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80',
        applicable_scope: 'PRODUCT', // Tab Dược mỹ phẩm
        status: 'ACTIVE'
    }
];

(async() => {
    try {
        await sequelize.authenticate();
        console.log('✅ Kết nối database commerce_db thành công!');
        await sequelize.sync({ alter: true });

        for (const p of samplePromotions) {
            const existing = await Promotion.findOne({ where: { code: p.code } });
            if (existing) {
                await existing.update(p);
            } else {
                await Promotion.create(p);
            }
        }

        console.log(`✅ Đã nạp và cập nhật thành công ${samplePromotions.length} mã khuyến mãi thật vào commerce_db!`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi nạp dữ liệu khuyến mãi:', error);
        process.exit(1);
    }
})();