// DỮ LIỆU MẪU để dựng giao diện. Khi có API thật (service-booking), thay SERVICES bằng dữ liệu gọi từ API.
// Tên, giá, điểm đánh giá bên dưới chỉ là ví dụ, không phải số liệu thật.

export const CATEGORIES = [
    { id: 'all', label: 'Tất cả' },
    { id: 'acne', label: 'Trị mụn' },
    { id: 'pigment', label: 'Trị nám và tàn nhang' },
    { id: 'rejuvenation', label: 'Trẻ hóa da' },
    { id: 'recovery', label: 'Phục hồi da' },
    { id: 'basic', label: 'Chăm sóc da cơ bản' },
    { id: 'online', label: 'Khám da liễu online' },
];

// max là cận trên (không bao gồm)
export const PRICE_RANGES = [
    { id: 'all', label: 'Mọi mức giá', min: 0, max: Infinity },
    { id: 'low', label: 'Dưới 500.000đ', min: 0, max: 500000 },
    { id: 'mid', label: '500.000đ – 1.000.000đ', min: 500000, max: 1000000 },
    { id: 'high', label: 'Trên 1.000.000đ', min: 1000000, max: Infinity },
];

export const SORT_OPTIONS = [
    { id: 'default', label: 'Mặc định' },
    { id: 'price-asc', label: 'Giá tăng dần' },
    { id: 'price-desc', label: 'Giá giảm dần' },
    { id: 'rating', label: 'Đánh giá cao nhất' },
];

// status: 'ACTIVE' (đang bán) | 'STOPPED' (ngừng kinh doanh)
export const SERVICES = [{
        id: 1,
        name: 'Điều trị mụn chuyên sâu',
        category: 'acne',
        price: 650000,
        duration: 60,
        status: 'ACTIVE',
        rating: 4.8,
        reviewCount: 126,
        image: null,
        description: 'Bác sĩ đánh giá tình trạng mụn, làm sạch và điều trị theo từng mức độ.',
        includes: ['Khám và đánh giá tình trạng da', 'Làm sạch sâu', 'Điều trị mụn theo chỉ định', 'Hướng dẫn chăm sóc tại nhà'],
    },
    {
        id: 2,
        name: 'Lấy nhân mụn và làm sạch sâu',
        category: 'acne',
        price: 350000,
        duration: 45,
        status: 'ACTIVE',
        rating: 4.7,
        reviewCount: 98,
        image: null,
        description: 'Làm sạch lỗ chân lông, lấy nhân mụn đúng kỹ thuật, hạn chế viêm và thâm.',
        includes: ['Làm sạch da', 'Xông hơi và lấy nhân mụn', 'Đắp mặt nạ làm dịu'],
    },
    {
        id: 3,
        name: 'Điều trị nám và tàn nhang',
        category: 'pigment',
        price: 1200000,
        duration: 75,
        status: 'ACTIVE',
        rating: 4.6,
        reviewCount: 64,
        image: null,
        description: 'Phác đồ làm mờ vết sắc tố, kết hợp chống nắng và chăm sóc da hằng ngày.',
        includes: ['Khám và chụp ảnh da', 'Điều trị sắc tố theo phác đồ', 'Tư vấn chống nắng và dưỡng da'],
    },
    {
        id: 4,
        name: 'Peel da sinh học',
        category: 'rejuvenation',
        price: 900000,
        duration: 60,
        status: 'ACTIVE',
        rating: 4.5,
        reviewCount: 41,
        image: null,
        description: 'Tái tạo lớp da bề mặt, giúp da đều màu và mịn hơn.',
        includes: ['Kiểm tra độ nhạy cảm của da', 'Peel da', 'Làm dịu và phục hồi sau peel'],
    },
    {
        id: 5,
        name: 'Cấp ẩm phục hồi da',
        category: 'recovery',
        price: 450000,
        duration: 50,
        status: 'ACTIVE',
        rating: 4.9,
        reviewCount: 87,
        image: null,
        description: 'Cấp nước và phục hồi hàng rào bảo vệ da cho da khô, da sau điều trị.',
        includes: ['Làm sạch nhẹ', 'Cấp ẩm chuyên sâu', 'Mặt nạ phục hồi'],
    },
    {
        id: 6,
        name: 'Chăm sóc da cơ bản',
        category: 'basic',
        price: 280000,
        duration: 45,
        status: 'ACTIVE',
        rating: 4.7,
        reviewCount: 150,
        image: null,
        description: 'Làm sạch, tẩy tế bào chết nhẹ và dưỡng ẩm, phù hợp chăm sóc định kỳ.',
        includes: ['Làm sạch da', 'Tẩy tế bào chết nhẹ', 'Massage mặt', 'Mặt nạ dưỡng ẩm'],
    },
    {
        id: 7,
        name: 'Khám da liễu trực tuyến',
        category: 'online',
        price: 200000,
        duration: 30,
        status: 'ACTIVE',
        rating: 4.8,
        reviewCount: 210,
        image: null,
        description: 'Trao đổi với bác sĩ qua video hoặc chat, gửi ảnh da để được đánh giá từ xa.',
        includes: ['Tư vấn trực tuyến với bác sĩ', 'Đánh giá ảnh da', 'Hướng dẫn chăm sóc và đơn thuốc nếu cần'],
    },
    {
        id: 8,
        name: 'Laser trẻ hóa da',
        category: 'rejuvenation',
        price: 1800000,
        duration: 90,
        status: 'STOPPED',
        rating: 4.4,
        reviewCount: 22,
        image: null,
        description: 'Dịch vụ hiện đã ngừng cung cấp.',
        includes: [],
    },
];

export const formatPrice = (value) => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
export const formatDuration = (minutes) => `${minutes} phút`;
export const getCategoryLabel = (id) => {
    const found = CATEGORIES.find((c) => c.id === id);
    return found ? found.label : '';
};