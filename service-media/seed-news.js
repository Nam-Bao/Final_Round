const { sequelize, Article } = require('./models');

const samples = [
    // ==========================================
    // TAB 1: TIN TỨC & KIẾN THỨC CHĂM SÓC DA (3 BÀI)
    // ==========================================
    {
        title: '5 sai lầm khi trị mụn tại nhà khiến da thâm sẹo',
        slug: 'sai-lam-khi-tri-mun-tai-nha',
        category: 'Kiến thức da liễu',
        author_name: 'Bác sĩ Da liễu GlowSkin',
        image_url: 'https://images.unsplash.com/photo-1512290900672-1f486c91d4e0?w=800&auto=format&fit=crop&q=80',
        summary: 'Nặn mụn sai cách, lạm dụng tẩy tế bào chết hay đổi sản phẩm liên tục là những lỗi phổ biến làm mụn nặng hơn và để lại sẹo rỗ khó phục hồi.',
        content: 'Việc tự điều trị mụn tại nhà nếu không đúng phương pháp khoa học rất dễ dẫn đến tình trạng viêm nhiễm lan rộng.\n\n1. Tự ý cạy nặn mụn: Bàn tay và dụng cụ không được khử trùng sẽ đưa vi khuẩn xâm nhập sâu vào nang lông, phá vỡ cấu trúc collagen dưới da.\n2. Lạm dụng AHA/BHA nồng độ cao: Tẩy tế bào chết quá đà khiến hàng rào bảo vệ da bị tổn thương nặng nề, gây đỏ rát và nhạy cảm với ánh sáng.\n3. Thường xuyên đổi sản phẩm dưỡng da: Da cần ít nhất 4 - 8 tuần để thích nghi với các hoạt chất điều trị. Việc thay đổi liên tục khiến da bị quá tải và kích ứng.\n\nHãy tham khảo ý kiến chuyên gia da liễu để có phác đồ điều trị an toàn và chuẩn y khoa.'
    },
    {
        title: 'Chống nắng đúng cách trong mùa mưa: Sai lầm ai cũng mắc',
        slug: 'chong-nang-dung-cach-mua-mua',
        category: 'Chăm sóc da',
        author_name: 'Dược sĩ Nguyễn An',
        image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
        summary: 'Trời âm u hay mưa rào vẫn có tới 80% tia UVA xuyên qua mây. Hướng dẫn cách chọn và thoa kem chống nắng để da luôn sáng khỏe.',
        content: 'Rất nhiều người có thói quen bỏ qua kem chống nắng vào những ngày mưa hoặc râm mát.\n\nThực tế, tia UVB gây cháy nắng có thể giảm bớt, nhưng tia UVA - thủ phạm chính gây lão hóa, nám sạm và phá hủy sợi đàn hồi - vẫn có khả năng xuyên qua tầng mây dày và cửa kính.\n\nLời khuyên từ chuyên gia:\n- Dùng lượng kem chống nắng đủ khoảng 2 đốt ngón tay cho toàn mặt.\n- Ưu tiên các dòng kem chống nắng quang phổ rộng, có khả năng kháng nước (Water-resistant) để tránh bị trôi khi gặp mưa ẩm.\n- Thoa lại sau mỗi 2 - 3 tiếng nếu làm việc ngoài trời hoặc đổ mồ hôi nhiều.'
    },
    {
        title: 'Chu trình phục hồi da sau tổn thương do corticoid và kem trộn',
        slug: 'phuc-hoi-da-nhiem-corticoid',
        category: 'Kiến thức da liễu',
        author_name: 'Bác sĩ Da liễu GlowSkin',
        image_url: 'https://images.unsplash.com/photo-1576426863848-c21f53c60b19?w=800&auto=format&fit=crop&q=80',
        summary: 'Cần làm gì khi da nổi chỉ máu, mỏng đỏ và bùng phát mụn do ngưng kem trộn? Các bước cấp ẩm và phục hồi nền da an toàn.',
        content: 'Làn da bị nhiễm corticoid thường bị teo lớp màng bảo vệ biểu bì, mạch máu giãn nở và rất dễ kích ứng với môi trường bên ngoài.\n\nGiai đoạn phục hồi cần sự kiên nhẫn tối đa:\n- Tối giản hóa chu trình dưỡng: Chỉ dùng nước muối sinh lý hoặc sữa rửa mặt dịu nhẹ có độ pH 5.5.\n- Tích cực bổ sung các hoạt chất phục hồi: Vitamin B5 (Panthenol), Ceramide, Rau má (Centella Asiatica) và Hyaluronic Acid để tái tạo lại lớp màng lipid.\n- Tuyệt đối không tự ý dùng các loại treatment nặng như Retinoids hay BHA nồng độ cao trong giai đoạn này.'
    },

    // ==========================================
    // TAB 2: SỰ KIỆN & ƯU ĐÃI (3 BÀI)
    // ==========================================
    {
        title: 'Sự kiện Da Liễu: Khám và soi da công nghệ AI miễn phí cùng Chuyên gia',
        slug: 'su-kien-soi-da-ai-cung-chuyen-gia',
        category: 'Sự kiện',
        author_name: 'Ban Tổ Chức GlowSkin',
        image_url: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop&q=80',
        summary: 'Cơ hội trải nghiệm công nghệ phân tích da AI thế hệ mới kết hợp cùng bác sĩ da liễu đầu ngành tại trung tâm GlowSkin.',
        content: 'Nhân dịp nâng cấp hệ thống sàng lọc AI O2O, GlowSkin trân trọng kính mời quý khách hàng tham dự Workshop chăm sóc da chuyên sâu.\n\nQuyền lợi tham gia:\n- Soi da đa tầng với công nghệ AI phát hiện sớm ổ viêm sâu và đốm sắc tố tiềm ẩn.\n- Bác sĩ chuyên khoa 1 trực tiếp tư vấn phác đồ và lên lộ trình phục hồi.\n- Tặng ngay voucher trị giá 300.000 VNĐ cho dịch vụ điều trị đầu tiên.\n\nThời gian: 08:30 - 17:00 các ngày cuối tuần trong tháng.'
    },
    {
        title: 'Workshop: Xu hướng Dược mỹ phẩm Clean Beauty và Chăm sóc da khoa học',
        slug: 'su-kien-workshop-clean-beauty',
        category: 'Sự kiện',
        author_name: 'GlowSkin Academy',
        image_url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&auto=format&fit=crop&q=80',
        summary: 'Gặp gỡ các chuyên gia hoạt chất hàng đầu để hiểu đúng về bảng thành phần mỹ phẩm và cách đọc nhãn sản phẩm an toàn.',
        content: 'Buổi giao lưu trực tiếp dành cho những tín đồ yêu thích skincare khoa học.\n\nNội dung chính:\n- Giải mã các hoạt chất vàng: Niacinamide, Retinol, Peptide và Vitamin C.\n- Phân biệt cồn khô, hương liệu và paraben an toàn trong mỹ phẩm.\n- Trải nghiệm trực tiếp các dòng dược mỹ phẩm chuẩn y khoa được bác sĩ khuyên dùng.\n\nĐịa điểm: Hội trường GlowSkin Central Clinic.'
    },
    {
        title: 'Ưu đãi liệu trình phục hồi da chuyên sâu tháng này',
        slug: 'uu-dai-lieu-trinh-phuc-hoi-da',
        category: 'Sự kiện',
        author_name: 'GlowSkin Clinic',
        image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80',
        summary: 'Giảm giá 30% gói phục hồi da 6 buổi chuyên sâu, tặng kèm bộ dược mỹ phẩm chăm sóc tại nhà tiêu chuẩn châu Âu.',
        content: 'Gói liệu trình chuyên biệt dành riêng cho da yếu sau mụn hoặc tổn thương do môi trường.\n\nQuy trình bao gồm:\n- Điện di tinh chất Vitamin B5 và HA nồng độ cao.\n- Chiếu ánh sáng sinh học Biolight giảm đỏ và kháng khuẩn tầng sâu.\n- Đắp mặt nạ tế bào gốc làm dịu tức thì.\n\nƯu đãi áp dụng cho khách hàng đặt lịch hẹn trước qua website hoặc ứng dụng.'
    },

    // ==========================================
    // TAB 3: GIỚI THIỆU & THƯƠNG HIỆU (3 BÀI)
    // ==========================================
    {
        title: 'Hành trình xây dựng hệ sinh thái da liễu chuẩn y khoa GlowSkin O2O',
        slug: 'gioi-thieu-he-sinh-thai-glowskin',
        category: 'Giới thiệu',
        author_name: 'GlowSkin Team',
        image_url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&auto=format&fit=crop&q=80',
        summary: 'Kết hợp nền tảng công nghệ số và hệ thống phòng khám y khoa để mang đến trải nghiệm chăm sóc da minh bạch, chuẩn xác.',
        content: 'GlowSkin khởi nguồn từ mong muốn giúp người trẻ Việt Nam tiếp cận các phương pháp chăm sóc da khoa học, chấm dứt nỗi lo từ các loại mỹ phẩm không rõ nguồn gốc.\n\nMô hình O2O (Online to Offline) của chúng tôi giúp bạn:\n- Tự sàng lọc và theo dõi tiến trình cải thiện da tại nhà với trợ lý AI.\n- Đặt lịch hẹn và thăm khám trực tiếp tại hệ thống phòng khám chuẩn y khoa.\n- Sử dụng dược mỹ phẩm chính hãng với sự đồng hành 1:1 từ đội ngũ y bác sĩ.'
    },
    {
        title: 'Đội ngũ Bác sĩ và Chuyên gia Da liễu đồng hành cùng GlowSkin',
        slug: 'gioi-thieu-doi-ngu-bac-si',
        category: 'Giới thiệu',
        author_name: 'Phòng Y Khoa GlowSkin',
        image_url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=800&auto=format&fit=crop&q=80',
        summary: '100% bác sĩ tại hệ thống GlowSkin đều tốt nghiệp Đại học Y Dược và có chứng chỉ hành nghề khám chữa bệnh chuyên khoa da liễu.',
        content: 'Chúng tôi tin rằng sự tận tâm và kiến thức y khoa chuẩn mực là nền tảng vững chắc nhất của việc làm đẹp.\n\nĐội ngũ tại GlowSkin gồm:\n- Bác sĩ chuyên khoa 1 với hơn 10 năm kinh nghiệm điều trị mụn và sẹo rỗ.\n- Điều dưỡng viên được đào tạo chuyên sâu về kỹ thuật lấy nhân mụn vô khuẩn chuẩn y khoa.\n- Đội ngũ dược sĩ tư vấn sử dụng dược mỹ phẩm phù hợp với từng nền da.'
    },
    {
        title: 'Tiêu chuẩn vô trùng và trang thiết bị hiện đại tại GlowSkin Clinic',
        slug: 'gioi-thieu-co-so-vat-chat-glowskin',
        category: 'Giới thiệu',
        author_name: 'Ban Quản Trị Cơ Sở',
        image_url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&auto=format&fit=crop&q=80',
        summary: 'Cam kết môi trường điều trị vô khuẩn 1 chiều, hệ thống máy Laser Toning và máy soi da nhập khẩu chính hãng từ Hoa Kỳ và Hàn Quốc.',
        content: 'Sự an toàn của khách hàng là ưu tiên số một tại GlowSkin Clinic.\n\nMỗi khách hàng đến với phòng khám đều được:\n- Sử dụng bộ dụng cụ thăm khám và điều trị riêng biệt, được khử khuẩn qua nồi hấp áp suất cao Autoclave.\n- Phòng điều trị khép kín, vô khuẩn với hệ thống lọc không khí y tế.\n- Trải nghiệm các công nghệ thẩm mỹ da liễu tiên tiến đạt chứng nhận FDA và CE.'
    }
];

(async() => {
    try {
        await sequelize.authenticate();
        console.log('✅ Đã kết nối cơ sở dữ liệu media_db!');
        await sequelize.sync({ alter: true });

        // Dùng upsert/findOrCreate để cập nhật hoặc tạo mới 9 bài viết
        for (const s of samples) {
            const existing = await Article.findOne({ where: { slug: s.slug } });
            if (existing) {
                await existing.update(s);
            } else {
                await Article.create(s);
            }
        }

        console.log(`✅ Đã nạp và đồng bộ đủ ${samples.length} bài viết (mỗi tab 3 bài) vào PostgreSQL!`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi nạp dữ liệu tin tức:', error);
        process.exit(1);
    }
})();