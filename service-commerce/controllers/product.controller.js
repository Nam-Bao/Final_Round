const { Product, Category, Review, sequelize } = require('../models');
const { Op } = require('sequelize');

// 1. Lấy danh sách Sản phẩm (Dành cho Admin)
const getProducts = async(req, res) => {
    try {
        const products = await Product.findAll({
            include: [{ model: Category, attributes: ['id', 'name'] }],
            order: [
                ['createdAt', 'DESC']
            ]
        });

        // Chuẩn hóa dữ liệu trả về cho frontend (đảm bảo stock_quantity luôn có giá trị)
        const formattedProducts = products.map(p => {
            const item = p.toJSON();
            item.stock_quantity = item.stock_quantity !== undefined && item.stock_quantity !== null ?
                item.stock_quantity :
                (item.stock || 0);
            return item;
        });

        res.status(200).json({ success: true, data: formattedProducts });
    } catch (error) {
        console.error('[getProducts Error]:', error);
        res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
    }
};

// 2. Thêm Sản phẩm mới (Chỉ Admin)
const createProduct = async(req, res) => {
    try {
        const {
            name,
            type,
            price,
            stock_quantity,
            stock,
            category_id,
            start_date,
            end_date,
            image_url,
            description,
            usage_instructions,
            brand,
            category
        } = req.body;

        // Đảm bảo số lượng tồn kho hợp lệ
        const finalStock = stock_quantity !== undefined ? Number(stock_quantity) : Number(stock || 100);

        // Chuẩn hóa image_url dạng JSON string cho Postgres
        let formattedImages = image_url;
        if (Array.isArray(image_url)) {
            formattedImages = JSON.stringify(image_url);
        }

        const newProduct = await Product.create({
            name,
            type: type || 'PRODUCT',
            price,
            stock_quantity: finalStock,
            stock: finalStock, // Ghi đồng thời cả 2 cột để tránh lệch DB
            category_id,
            brand: brand || 'GlowSkin Pharma',
            category: category || 'Dược Mỹ Phẩm',
            description: description || '',
            usage_instructions: usage_instructions || '',
            start_date: start_date || new Date(),
            end_date: end_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            image_url: formattedImages
        });

        res.status(201).json({ success: true, message: 'Thêm sản phẩm thành công', data: newProduct });
    } catch (error) {
        console.error('[createProduct Error]:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi tạo sản phẩm', error: error.message });
    }
};

// 3. Cập nhật Sản phẩm (Fix lỗi Sửa tồn kho & Ảnh)
const updateProduct = async(req, res) => {
    try {
        const { id } = req.params;
        const { stock_quantity, stock, image_url } = req.body;

        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
        }

        const updateData = {...req.body };

        // Xử lý tồn kho đồng bộ cả 2 trường stock và stock_quantity
        if (stock_quantity !== undefined || stock !== undefined) {
            const newStock = Number(stock_quantity !== undefined ? stock_quantity : stock);
            updateData.stock_quantity = newStock;
            updateData.stock = newStock;
        }

        // Xử lý ảnh nếu truyền vào dạng Mảng (Array)
        if (image_url) {
            if (Array.isArray(image_url)) {
                updateData.image_url = JSON.stringify(image_url);
            } else if (typeof image_url === 'string' && !image_url.startsWith('[')) {
                updateData.image_url = JSON.stringify([image_url]);
            }
        }

        await product.update(updateData);

        res.status(200).json({ success: true, message: 'Cập nhật thành công', data: product });
    } catch (error) {
        console.error('[updateProduct Error]:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi cập nhật sản phẩm', error: error.message });
    }
};

// 4. Xóa Sản phẩm
const deleteProduct = async(req, res) => {
    try {
        const { id } = req.params;
        await Product.destroy({ where: { id } });
        res.status(200).json({ success: true, message: 'Xóa thành công' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi xóa sản phẩm', error: error.message });
    }
};

// 5. Trừ tồn kho (Gọi từ Booking Service / Cart Checkout)
const deductInventory = async(req, res) => {
    try {
        const { product_ids } = req.body;
        if (!product_ids || product_ids.length === 0) {
            return res.status(200).json({ success: true, message: 'Không có sản phẩm để trừ' });
        }

        for (const id of product_ids) {
            const product = await Product.findByPk(id);
            if (product) {
                const currentStock = product.stock_quantity !== undefined && product.stock_quantity !== null ?
                    product.stock_quantity :
                    product.stock;

                if (currentStock > 0) {
                    const updatedStock = currentStock - 1;
                    await product.update({ stock_quantity: updatedStock, stock: updatedStock });
                }
            }
        }
        res.status(200).json({ success: true, message: 'Đã trừ tồn kho thành công' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi trừ tồn kho', error: error.message });
    }
};

// 6. Lấy sản phẩm cho Client Shop
const getAllProducts = async(req, res) => {
    try {
        const products = await Product.findAll({
            where: { type: 'PRODUCT' },
            order: [
                ['createdAt', 'DESC']
            ]
        });

        return res.status(200).json({ success: true, data: products });
    } catch (error) {
        console.error('[Lỗi tải sản phẩm Client]:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    deductInventory,
    getAllProducts
};