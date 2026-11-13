import { timing } from './timing';

// Tư vấn chuyên gia: lĩnh vực + quy định (khớp service-booking/controllers/consultation.controller.js)
export const CONSULT_FIELDS = {
  DERMATOLOGY: { label: 'Da liễu', desc: 'Hỏi đáp về mụn, nám, kích ứng... trước khi quyết định đi khám.' },
  NUTRITION: { label: 'Dinh dưỡng', desc: 'Chế độ ăn uống, sinh hoạt hỗ trợ làn da khỏe từ bên trong.' },
  COSMETICS: { label: 'Mỹ phẩm', desc: 'Chọn sản phẩm, xây dựng quy trình skincare phù hợp loại da.' },
};

// Phí 1 buổi tư vấn (server trả qua /config/timing). Không trừ vào phí khám; khám sau tư vấn được ưu đãi tại quầy
export const consultFee = () => Number(timing().consultFee) || 300000;
export const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
