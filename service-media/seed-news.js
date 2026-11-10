require('dotenv').config();
const { sequelize, Article, syncSchema } = require('./models');
const { typeFromCategory } = require('./utils/articleTypes');

// Bài mẫu đã đối chiếu: bài kiến thức chỉ giữ ý có trong nguồn ghi ở sources; bài giới thiệu khớp tính năng của hệ thống.
// Không thêm sự kiện, ưu đãi hay khẳng định về cơ sở vật chất không có thật.
const samples = [
    {
        title: "3 sai lầm khi trị mụn tại nhà khiến mụn lâu khỏi và để lại thâm",
        slug: "sai-lam-khi-tri-mun-tai-nha",
        category: "Kiến thức da liễu",
        author_name: "Ban biên tập GlowSkin",
        thumbnail_url: "https://images.unsplash.com/photo-1761718209708-9ab9ba1c7252?w=1200&auto=format&fit=crop&q=80",
        summary: "Nặn mụn, chà xát hay dùng sản phẩm gây kích ứng, và đổi sản phẩm liên tục là những lỗi khiến mụn lâu khỏi hơn, dễ để lại sẹo và thâm.",
        content: "Theo Viện Da liễu Hoa Kỳ (AAD), một số thói quen chăm sóc da tại nhà có thể làm mụn lâu khỏi hơn.\n\n1. Nặn, cạy mụn: làm mụn lâu khỏi hơn và tăng nguy cơ để lại sẹo cùng vết thâm sau viêm.\n2. Chà xát mạnh hoặc dùng sản phẩm gây kích ứng: chà bằng khăn, mút hay dụng cụ có thể làm da kích ứng. Nước se khít lỗ chân lông, toner và sản phẩm tẩy tế bào chết có thể làm khô da và khiến mụn trông nặng hơn.\n3. Đổi sản phẩm trị mụn quá thường xuyên: thử sản phẩm mới liên tục có thể làm da kích ứng và nổi mụn. Hãy cho sản phẩm thời gian, thường mất vài tuần đến vài tháng mới thấy khác biệt.\n\nNếu mụn không cải thiện, hãy đặt lịch khám để bác sĩ da liễu đánh giá và chỉ định điều trị phù hợp.",
        sources: ["American Academy of Dermatology (AAD) - 10 skin care habits that can help clear acne: https://www.aad.org/public/diseases/acne/skin-care/tips"],
    },
    {
        title: "Chống nắng cả những ngày mưa, trời râm",
        slug: "chong-nang-dung-cach-mua-mua",
        category: "Chăm sóc da",
        author_name: "Ban biên tập GlowSkin",
        thumbnail_url: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1200&auto=format&fit=crop&q=80",
        summary: "Tia UVA vẫn xuyên qua mây và cửa kính, gây lão hoá da. Chọn kem chống nắng phổ rộng SPF 30 trở lên và thoa lại mỗi 2 giờ khi ở ngoài trời.",
        content: "Nhiều người bỏ kem chống nắng vào ngày mưa hoặc trời râm. Theo Skin Cancer Foundation, tia UVA có thể xuyên qua mây và cửa kính, và là nguyên nhân gây lão hoá da, nếp nhăn. Tia UVB có thể bị lọc bớt và không xuyên qua kính.\n\nKhuyến nghị của Viện Da liễu Hoa Kỳ (AAD):\n- Chọn kem chống nắng phổ rộng (chống cả UVA và UVB), SPF 30 trở lên, có khả năng chống nước.\n- Thoa cho mặt ít nhất 1 thìa cà phê, khoảng lượng kem trải dài hết ngón trỏ và ngón giữa.\n- Khi ở ngoài trời, thoa lại mỗi 2 giờ, và thoa lại ngay sau khi bơi hoặc ra nhiều mồ hôi.\n- Da vẫn tiếp xúc với tia UV mỗi khi ra ngoài, kể cả ngày nhiều mây.",
        sources: ["Skin Cancer Foundation - UV Radiation: https://www.skincancer.org/risk-factors/uv-radiation/","American Academy of Dermatology (AAD) - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    },
    {
        title: "Da tổn thương do bôi corticoid kéo dài: nhận biết và phục hồi",
        slug: "phuc-hoi-da-nhiem-corticoid",
        category: "Chăm sóc da",
        author_name: "Ban biên tập GlowSkin",
        thumbnail_url: "https://images.unsplash.com/photo-1761718209835-c8586b7dcac0?w=1200&auto=format&fit=crop&q=80",
        summary: "Bôi corticoid mạnh hằng ngày trong nhiều tháng có thể làm mỏng da, giãn mạch, gây viêm da quanh miệng hoặc kiểu rosacea. Ngưng thuốc cần bác sĩ theo dõi.",
        content: "Nhiều loại kem không rõ nguồn gốc (thường gọi là kem trộn) có thể chứa corticoid. Theo DermNet, khi bôi corticoid mạnh hằng ngày trong thời gian dài (nhiều tháng), da có thể gặp:\n- Mỏng da (teo da).\n- Giãn mạch máu nhỏ trên da.\n- Dễ bầm, dễ rách da.\n- Viêm da quanh miệng, mũi, mắt, hoặc tình trạng giống rosacea do corticoid.\n\nKhi ngưng thuốc:\n- Ngưng corticoid bôi là bước chính, nhưng cần theo dõi phản ứng bùng phát trở lại, nên làm dưới sự theo dõi của bác sĩ.\n- Dùng kem dưỡng ẩm, làm mềm da. Chườm mát có thể giúp dịu da.\n- Thời gian hồi phục có thể từ vài tuần đến vài năm.\n\nNếu nghi da bị ảnh hưởng do corticoid, hãy đặt lịch khám để bác sĩ da liễu đánh giá, không tự dùng thêm thuốc bôi.",
        sources: ["DermNet - Topical steroid: https://dermnetnz.org/topics/topical-steroid","DermNet - Topical corticosteroid withdrawal: https://dermnetnz.org/topics/topical-corticosteroid-withdrawal"],
    },
    {
        title: "Hành trình xây dựng hệ sinh thái da liễu chuẩn y khoa GlowSkin O2O",
        slug: "gioi-thieu-he-sinh-thai-glowskin",
        category: "Giới thiệu",
        author_name: "Ban biên tập GlowSkin",
        thumbnail_url: "https://images.unsplash.com/photo-1758691463606-1493d79cc577?w=1200&auto=format&fit=crop&q=80",
        summary: "Kết hợp nền tảng công nghệ số và hệ thống phòng khám y khoa để mang đến trải nghiệm chăm sóc da minh bạch, chuẩn xác.",
        content: "GlowSkin khởi nguồn từ mong muốn giúp người trẻ Việt Nam tiếp cận cách chăm sóc da có bác sĩ theo dõi, thay vì tự thử mỹ phẩm theo lời truyền miệng.\n\nMô hình O2O (Online to Offline) của GlowSkin giúp bạn:\n- Tự sàng lọc da tại nhà bằng công cụ AI trước khi đi khám.\n- Đặt lịch khám trực tiếp tại phòng khám hoặc khám online qua video call.\n- Dùng dược mỹ phẩm theo đơn của bác sĩ, mua tại quầy hoặc đặt online.\n\nToàn bộ lịch khám, buổi điều trị và đơn hàng của bạn được lưu trong tài khoản để tiện theo dõi.",
    },
    {
        title: "Gặp gỡ đội ngũ bác sĩ da liễu tại GlowSkin",
        slug: "gioi-thieu-doi-ngu-bac-si",
        category: "Giới thiệu",
        author_name: "Ban biên tập GlowSkin",
        thumbnail_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&auto=format&fit=crop&q=80",
        summary: "Ba bác sĩ da liễu trực tiếp thăm khám, chẩn đoán và chỉ định liệu trình cho khách hàng tại GlowSkin.",
        content: "Tại GlowSkin, mọi dịch vụ điều trị đều bắt đầu từ buổi khám với bác sĩ da liễu.\n\nĐội ngũ bác sĩ hiện tại gồm:\n- BS. Nguyễn Điền Thịnh\n- BS. Trần Minh Hiếu\n- BS. Phạm Bảo Khang\n\nSau buổi khám, bác sĩ ghi chẩn đoán vào hồ sơ của bạn, chỉ định dịch vụ hoặc gói liệu trình phù hợp và kê dược mỹ phẩm dùng tại nhà kèm số lượng cụ thể.\n\nBạn có thể xem số lượt khám đã hoàn tất và đánh giá thật của khách hàng cho từng bác sĩ tại trang Đội ngũ bác sĩ.",
    },
];

(async() => {
    try {
        await sequelize.authenticate();
        console.log('✅ Đã kết nối cơ sở dữ liệu media_db!');
        await syncSchema(); // chỉ tạo bảng / thêm cột còn thiếu, không xóa dữ liệu

        // Cập nhật hoặc tạo mới theo slug
        for (const sample of samples) {
            const s = { ...sample, article_type: typeFromCategory(sample.category) }; // loại bài suy từ danh mục
            const existing = await Article.findOne({ where: { slug: s.slug } });
            if (existing) {
                await existing.update(s);
            } else {
                await Article.create(s);
            }
        }

        console.log(`✅ Đã nạp và đồng bộ đủ ${samples.length} bài viết vào PostgreSQL!`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi nạp dữ liệu tin tức:', error);
        process.exit(1);
    }
})();