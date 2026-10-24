// DỮ LIỆU MẪU để dựng giao diện. Khi có API thật, thay ARTICLES bằng dữ liệu gọi từ API.
// Tiêu đề và nội dung bài viết bên dưới chỉ là ví dụ.
import dayjs from 'dayjs';

export const PAGE_SIZE = 6;

export const NEWS_TABS = [
    { id: 'news', label: 'Tin tức' },
    { id: 'event', label: 'Sự kiện' },
    { id: 'about', label: 'Giới thiệu' },
];

export const ARTICLES = [{
        id: 1,
        category: 'news',
        date: '2026-10-15',
        image: null,
        title: 'Chăm sóc da mùa nắng: 5 thói quen cần giữ',
        summary: 'Chống nắng đúng cách, cấp ẩm đủ và làm sạch nhẹ nhàng là nền tảng cho làn da khỏe.',
        content: [
            'Nắng gắt làm da mất nước nhanh và dễ sạm. Việc đầu tiên là thoa kem chống nắng mỗi sáng và thoa lại sau vài giờ nếu ở ngoài trời.',
            'Hãy làm sạch da nhẹ nhàng, tránh chà xát mạnh. Sau đó dưỡng ẩm đều đặn để giữ hàng rào bảo vệ da.',
            'Uống đủ nước và ngủ đủ giấc cũng góp phần giúp da phục hồi tốt hơn.',
        ]
    },
    {
        id: 2,
        category: 'news',
        date: '2026-10-10',
        image: null,
        title: 'Cách chọn kem chống nắng phù hợp với loại da',
        summary: 'Da dầu, da khô hay da nhạy cảm đều cần loại kem chống nắng khác nhau.',
        content: [
            'Da dầu nên ưu tiên kết cấu nhẹ, thấm nhanh. Da khô nên chọn loại có thêm thành phần dưỡng ẩm.',
            'Da nhạy cảm nên thử một lượng nhỏ ở vùng da kín trước khi dùng cho cả mặt.',
        ]
    },
    {
        id: 3,
        category: 'news',
        date: '2026-10-05',
        image: null,
        title: 'Da dầu mụn nên rửa mặt mấy lần mỗi ngày?',
        summary: 'Rửa quá nhiều có thể làm da tổn thương. Vậy bao nhiêu lần là hợp lý?',
        content: [
            'Phần lớn trường hợp, rửa mặt hai lần mỗi ngày (sáng và tối) là đủ. Rửa quá nhiều có thể làm da khô rát và tiết dầu nhiều hơn.',
            'Nên chọn sữa rửa mặt dịu nhẹ và không tự ý nặn mụn tại nhà. Nếu mụn viêm kéo dài, hãy đến gặp bác sĩ da liễu.',
        ]
    },
    {
        id: 4,
        category: 'news',
        date: '2026-09-28',
        image: null,
        title: 'Vì sao cần phục hồi hàng rào bảo vệ da sau điều trị?',
        summary: 'Da sau điều trị thường nhạy cảm hơn bình thường và cần được chăm sóc nhẹ nhàng.',
        content: [
            'Sau các thủ thuật như peel hay điều trị mụn, da có thể khô và dễ kích ứng. Dưỡng ẩm và chống nắng là hai bước không nên bỏ qua.',
            'Hãy làm theo hướng dẫn của bác sĩ và hạn chế dùng sản phẩm mới trong giai đoạn này.',
        ]
    },
    {
        id: 5,
        category: 'news',
        date: '2026-09-20',
        image: null,
        title: 'Khám da liễu online: khi nào nên và không nên',
        summary: 'Khám từ xa tiện lợi cho nhiều tình huống, nhưng có trường hợp cần khám trực tiếp.',
        content: [
            'Khám online phù hợp khi cần tư vấn chăm sóc da, theo dõi sau điều trị hoặc đánh giá ban đầu qua ảnh.',
            'Nếu da có tổn thương lan nhanh, đau nhiều hoặc sốt kèm theo, bạn nên đến cơ sở y tế để được thăm khám trực tiếp.',
        ]
    },
    {
        id: 6,
        category: 'news',
        date: '2026-09-12',
        image: null,
        title: 'Nhật ký da: theo dõi tình trạng da mỗi tuần',
        summary: 'Ghi lại hình ảnh và cảm nhận về da giúp bác sĩ đánh giá chính xác hơn.',
        content: [
            'Chụp ảnh da cùng một góc và ánh sáng mỗi tuần để dễ so sánh. Ghi chú các sản phẩm đã dùng và thay đổi trong sinh hoạt.',
        ]
    },
    {
        id: 7,
        category: 'news',
        date: '2026-09-03',
        image: null,
        title: 'Nám da và những hiểu lầm thường gặp',
        summary: 'Nám cần được đánh giá đúng nguyên nhân trước khi điều trị.',
        content: [
            'Nám có thể liên quan đến nắng, nội tiết và nhiều yếu tố khác, vì vậy không có một cách chung cho tất cả mọi người.',
            'Hãy chống nắng đều đặn và thăm khám để có phác đồ phù hợp với tình trạng da của bạn.',
        ]
    },
    {
        id: 8,
        category: 'news',
        date: '2026-08-25',
        image: null,
        title: 'Chăm sóc da tuổi dậy thì',
        summary: 'Những nguyên tắc đơn giản giúp làn da tuổi mới lớn khỏe mạnh.',
        content: [
            'Giữ quy trình đơn giản: làm sạch nhẹ, dưỡng ẩm và chống nắng. Tránh tự ý dùng nhiều sản phẩm cùng lúc.',
        ]
    },

    {
        id: 9,
        category: 'event',
        date: '2026-10-18',
        image: null,
        title: 'Workshop chăm sóc da tại nhà cùng bác sĩ',
        summary: 'Buổi chia sẻ về quy trình chăm sóc da cơ bản và cách đọc thành phần sản phẩm.',
        content: [
            'Trong buổi workshop, bác sĩ sẽ hướng dẫn cách xây dựng quy trình chăm sóc da phù hợp và giải đáp thắc mắc của người tham dự.',
            'Thông tin thời gian và địa điểm chi tiết sẽ được cập nhật trên trang này.',
        ]
    },
    {
        id: 10,
        category: 'event',
        date: '2026-10-02',
        image: null,
        title: 'Ngày hội kiểm tra da',
        summary: 'Cơ hội đánh giá tình trạng da cùng đội ngũ chuyên môn của GlowSkin.',
        content: [
            'Người tham dự được đánh giá tình trạng da và nhận tư vấn chăm sóc phù hợp.',
        ]
    },
    {
        id: 11,
        category: 'event',
        date: '2026-09-15',
        image: null,
        title: 'Chương trình tri ân khách hàng',
        summary: 'Gửi lời cảm ơn đến những khách hàng đã đồng hành cùng GlowSkin.',
        content: [
            'Nội dung chương trình và ưu đãi dành cho khách hàng sẽ được thông báo chi tiết tại đây.',
        ]
    },
    {
        id: 12,
        category: 'event',
        date: '2026-08-30',
        image: null,
        title: 'Hội thảo: Hiểu đúng về mụn trứng cá',
        summary: 'Giải đáp các câu hỏi thường gặp về nguyên nhân và cách chăm sóc da mụn.',
        content: [
            'Hội thảo có phần chia sẻ của bác sĩ và thời gian hỏi đáp trực tiếp.',
        ]
    },

    {
        id: 13,
        category: 'about',
        date: '2026-01-10',
        image: null,
        title: 'Về GlowSkin O2O',
        summary: 'Nền tảng kết nối chăm sóc da trực tuyến và trực tiếp tại phòng khám.',
        content: [
            'GlowSkin O2O giúp khách hàng sàng lọc da bằng AI, đặt lịch khám, theo dõi liệu trình và mua sản phẩm chăm sóc da trong cùng một nơi.',
            'Bạn có thể khám trực tiếp tại phòng khám hoặc trao đổi với bác sĩ từ xa.',
        ]
    },
    {
        id: 14,
        category: 'about',
        date: '2026-01-10',
        image: null,
        title: 'Đội ngũ bác sĩ và chuyên viên',
        summary: 'Đội ngũ chuyên môn đồng hành cùng bạn trong hành trình chăm sóc da.',
        content: [
            'Phòng khám có bác sĩ da liễu, chuyên viên tư vấn và kỹ thuật viên chăm sóc da. Thông tin chi tiết từng thành viên sẽ được cập nhật.',
        ]
    },
];

export const formatDate = (value) => dayjs(value).format('DD/MM/YYYY');

export const getTabLabel = (id) => {
    const found = NEWS_TABS.find((t) => t.id === id);
    return found ? found.label : '';
};