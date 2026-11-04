// Tư vấn chuyên gia: lĩnh vực + quy định (khớp service-booking/controllers/consultation.controller.js)
export const CONSULT_FIELDS = {
  DERMATOLOGY: { label: 'Da liễu', desc: 'Hỏi đáp về mụn, nám, kích ứng... trước khi quyết định đi khám.' },
  NUTRITION: { label: 'Dinh dưỡng', desc: 'Chế độ ăn uống, sinh hoạt hỗ trợ làn da khỏe từ bên trong.' },
  COSMETICS: { label: 'Mỹ phẩm', desc: 'Chọn sản phẩm, xây dựng quy trình skincare phù hợp loại da.' },
};

export const CONSULT_DEPOSIT = 50000;
export const CREDIT_VALID_DAYS = 30;
export const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
