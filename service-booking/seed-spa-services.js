const { sequelize, SpaService } = require('./models');

// 13 dịch vụ của phòng khám. Giá theo giá thị trường, căn cứ ở docs/CAN-CU-GIA-DICH-VU.md.
// Thời lượng và các bước là quy định nội bộ; nội dung y khoa chỉ ghi ý có trong nguồn ở sources.
// Ảnh là ảnh minh hoạ (Unsplash), không phải ảnh chụp tại phòng khám.
const sampleServices = [
  {
    name: "Chăm Sóc Da Dầu Mụn",
    description: "Buổi chăm sóc da định kỳ cho da dầu, dễ nổi mụn: làm sạch dịu nhẹ, đắp mặt nạ, dưỡng ẩm. Không thay thế điều trị mụn của bác sĩ.",
    category: "Chăm sóc da cơ bản",
    includes: ["Làm sạch da dịu nhẹ","Đắp mặt nạ","Thoa dưỡng ẩm mỏng nhẹ"],
    procedure_steps: ["Tẩy trang, rửa mặt nhẹ nhàng","Đắp mặt nạ","Thoa dưỡng ẩm mỏng nhẹ và kem chống nắng"],
    suitable_for: ["Da dầu, dễ nổi mụn","Không thay thế điều trị khi đang có mụn: cần khám bác sĩ"],
    aftercare: ["Không chà xát da bằng khăn, mút hay dụng cụ","Tránh nước se khít lỗ chân lông, toner, sản phẩm tẩy tế bào chết vì có thể làm khô da và mụn trông nặng hơn","Không đổi sản phẩm trị mụn quá thường xuyên","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 60,
    price: 600000,
    image_url: "https://images.unsplash.com/photo-1761718209708-9ab9ba1c7252?w=800&auto=format&fit=crop&q=80",
    sources: ["AAD - 10 skin care habits that can help clear acne: https://www.aad.org/public/diseases/acne/skin-care/tips","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Chăm Sóc Da Định Kỳ",
    description: "Buổi chăm sóc da định kỳ: làm sạch, tẩy tế bào chết dịu nhẹ, đắp mặt nạ, massage mặt và dưỡng ẩm. Đây là dịch vụ thư giãn, chăm sóc, không phải điều trị.",
    category: "Chăm sóc da cơ bản",
    includes: ["Làm sạch da","Tẩy tế bào chết dịu nhẹ","Đắp mặt nạ","Massage mặt thư giãn","Dưỡng ẩm và chống nắng"],
    procedure_steps: ["Tẩy trang, rửa mặt","Tẩy tế bào chết dịu nhẹ","Đắp mặt nạ","Massage mặt thư giãn","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Da khoẻ cần chăm sóc định kỳ","Không phù hợp với da nhạy cảm, đang kích ứng hoặc đang có mụn (có bước tẩy tế bào chết)"],
    aftercare: ["Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 60,
    price: 600000,
    image_url: "https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=800&auto=format&fit=crop&q=80",
    sources: ["DermNet - Sensitive skin: https://dermnetnz.org/topics/sensitive-skin","AAD - 10 skin care habits that can help clear acne: https://www.aad.org/public/diseases/acne/skin-care/tips","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Chăm Sóc Da Nhạy Cảm",
    description: "Chăm sóc dịu nhẹ cho da nhạy cảm, dễ kích ứng. Theo DermNet, da nhạy cảm liên quan chặt với hàng rào bảo vệ da bị tổn thương; điều trị gồm xử lý bệnh da nền (nếu có) và tránh yếu tố gây kích ứng.",
    category: "Phục hồi da",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Làm sạch bằng sản phẩm dịu nhẹ, không tẩy tế bào chết","Thoa dưỡng ẩm, làm mềm da","Hướng dẫn chăm sóc tại nhà"],
    procedure_steps: ["Làm sạch da bằng sữa rửa mặt không xà phòng","Chườm mát vùng da khó chịu","Thoa kem dưỡng ẩm, làm mềm da không gây kích ứng","Thoa kem chống nắng"],
    suitable_for: ["Da nhạy cảm, dễ kích ứng","Da đang ngưng corticoid bôi (cần bác sĩ theo dõi)"],
    aftercare: ["Dùng sữa rửa mặt không xà phòng, dưỡng ẩm đều đặn","Tránh sản phẩm có hương liệu, tránh tẩy tế bào chết hoá học và cơ học","Thử sản phẩm mới trên vùng da nhỏ trước, mỗi lần chỉ thêm 1 sản phẩm","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 60,
    price: 600000,
    image_url: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=800&auto=format&fit=crop&q=80",
    sources: ["DermNet - Sensitive skin: https://dermnetnz.org/topics/sensitive-skin","DermNet - Topical corticosteroid withdrawal: https://dermnetnz.org/topics/topical-corticosteroid-withdrawal","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Điện Di Tinh Chất B5 + HA",
    description: "Thoa tinh chất chứa vitamin B5 (panthenol) và hyaluronic acid, rồi dùng máy điện di trên da. Phòng khám không cam kết công dụng điều trị.",
    category: "Phục hồi da",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Điện di tinh chất B5 + HA","Hướng dẫn chăm sóc tại nhà"],
    procedure_steps: ["Tẩy trang, làm sạch da","Thoa tinh chất B5 + HA","Điện di trên vùng da đã thoa tinh chất","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Theo chỉ định của bác sĩ","Mang thai, cho con bú, có máy tạo nhịp hoặc cấy ghép kim loại: chưa có dữ liệu an toàn, bác sĩ cân nhắc"],
    aftercare: ["Dưỡng ẩm đều đặn","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 60,
    price: 750000,
    image_url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80",
    sources: ["Tap Water Iontophoresis, thử nghiệm lâm sàng. Ann Dermatol 2017 (tiêu chí loại trừ): https://pmc.ncbi.nlm.nih.gov/articles/PMC5705354/","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Điều Trị Bằng Sóng RF",
    description: "Dùng thiết bị sóng cao tần (RF) tác động lên da theo thông số bác sĩ chọn. Bác sĩ đánh giá trước để xác định có phù hợp hay không.",
    category: "Trẻ hóa da",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Thực hiện RF theo từng vùng","Theo dõi sau thực hiện"],
    procedure_steps: ["Tẩy trang, làm sạch da","Thoa gel dẫn truyền","Thực hiện RF theo từng vùng","Làm sạch gel, thoa dưỡng và kem chống nắng"],
    suitable_for: ["Theo chỉ định của bác sĩ","Không thực hiện khi có máy tạo nhịp, máy khử rung hoặc thiết bị điện cấy ghép","Không áp dụng khi mang thai hoặc có cấy ghép kim loại vùng mặt (quy định phòng khám)","Đang cho con bú, có herpes hoặc bệnh tự miễn: nhà sản xuất chưa nghiên cứu, bác sĩ cân nhắc"],
    aftercare: ["Làm theo hướng dẫn của bác sĩ sau buổi","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 75,
    price: 1250000,
    image_url: "https://images.unsplash.com/photo-1761718209852-54ca4210183e?w=800&auto=format&fit=crop&q=80",
    sources: ["Thermage CPT/FLX - thông tin an toàn của nhà sản xuất: https://www.thermage.com/hcp/","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Tiêm Meso Dưỡng Da",
    description: "Mesotherapy là tiêm các chất qua kim rất nhỏ vào da, được dùng cho da lão hoá. Theo DermNet, có rất ít bằng chứng khoa học cho kỹ thuật này và FDA chưa phê duyệt thuốc nào dùng cho mesotherapy. Thường cần 3 - 15 buổi, cách nhau 2 tuần.",
    category: "Trẻ hóa da",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Ủ tê bề mặt","Tiêm vi điểm theo chỉ định","Hướng dẫn chăm sóc sau thực hiện"],
    procedure_steps: ["Làm sạch và sát khuẩn da","Ủ tê bề mặt","Tiêm vi điểm theo chỉ định","Sát khuẩn lại","Thoa dưỡng"],
    suitable_for: ["Theo chỉ định của bác sĩ","Không áp dụng khi mang thai hoặc cho con bú (quy định phòng khám)","Không thực hiện khi: herpes đang hoạt động hoặc da đang viêm nhiễm, cơ địa sẹo lồi hoặc sẹo phì đại, bệnh tự miễn","Đang dùng thuốc chống đông: có thể chảy máu kéo dài, tụ máu"],
    aftercare: ["Báo phòng khám nếu có dấu hiệu dị ứng, nhiễm trùng, loét tại chỗ tiêm","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 60,
    price: 8900000,
    image_url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=80",
    sources: ["DermNet - Mesotherapy: https://dermnetnz.org/topics/mesotherapy","International Consensus Guidelines on Mesotherapy. J Clin Med 2025: https://pmc.ncbi.nlm.nih.gov/articles/PMC12250733/","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Chiếu Ánh Sáng Xanh / Đỏ Trị Mụn",
    description: "Chiếu ánh sáng nhìn thấy (xanh, đỏ). Theo AAD, ánh sáng nhìn thấy có thể điều trị mụn viêm (sẩn mụn), nhưng không hiệu quả với mụn đầu đen, đầu trắng, mụn nang hay mụn cục, và hiếm khi tự làm sạch mụn nếu dùng riêng.",
    category: "Trị mụn",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Làm sạch da trước khi chiếu đèn","Chiếu ánh sáng xanh / đỏ","Thoa dưỡng sau chiếu đèn"],
    procedure_steps: ["Tẩy trang, làm sạch da","Đeo kính bảo vệ mắt","Chiếu ánh sáng theo chỉ định","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Mụn viêm (sẩn mụn), thường kết hợp với cách trị mụn khác","Không hiệu quả với mụn đầu đen, đầu trắng, mụn nang, mụn cục"],
    aftercare: ["Đỏ và sưng là phản ứng thường gặp sau chiếu đèn","Cần một loạt buổi mới có kết quả; kết quả rõ nhất thường vài tuần sau buổi cuối","Báo phòng khám nếu đau kéo dài, bỏng hoặc phồng rộp","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 45,
    price: 320000,
    image_url: "https://images.unsplash.com/photo-1789135840265-de3afe7cc717?w=800&auto=format&fit=crop&q=80",
    sources: ["AAD - Acne: Lasers and lights: https://www.aad.org/public/diseases/acne/derm-treat/lasers-lights","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Điều Trị Sẹo Rỗ Bằng Vi Kim",
    description: "Vi kim là một trong các cách điều trị sẹo rỗ sau mụn. Theo AAD, sẹo mụn có thể mờ dần nhưng hiếm khi tự hết hoàn toàn, và nên điều trị sẹo sau khi đã kiểm soát được mụn.",
    category: "Trị mụn",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Ủ tê bề mặt","Thực hiện vi kim trên vùng sẹo","Hướng dẫn chăm sóc sau thực hiện"],
    procedure_steps: ["Làm sạch và sát khuẩn da","Ủ tê bề mặt","Thực hiện vi kim trên vùng da có sẹo","Thoa dưỡng phục hồi"],
    suitable_for: ["Sẹo rỗ sau mụn, khi mụn đã được kiểm soát","Không thực hiện khi: đang có mụn viêm, nhiễm trùng hoặc herpes ở vùng điều trị, cơ địa sẹo lồi, đang dùng thuốc chống đông hoặc rối loạn đông máu, suy giảm miễn dịch, chàm hoặc vảy nến mức vừa đến nặng","Đang mang thai: nên hoãn đến sau sinh"],
    aftercare: ["Làm theo hướng dẫn chăm sóc bác sĩ đưa sau buổi","Một số cách điều trị sẹo cần thời gian nghỉ dưỡng","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 90,
    price: 2500000,
    image_url: "https://images.unsplash.com/photo-1761819920857-7edc5e808fd3?w=800&auto=format&fit=crop&q=80",
    sources: ["AAD - Acne scars: Diagnosis and treatment: https://www.aad.org/public/diseases/acne/derm-treat/scars/treatment","StatPearls - Microneedling: https://www.ncbi.nlm.nih.gov/sites/books/NBK459344/","Microneedling in Dermatology: A Comprehensive Review (PMC11499218): https://pmc.ncbi.nlm.nih.gov/articles/PMC11499218/","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Lấy Nhân Mụn",
    description: "Lấy nhân mụn đầu đen, đầu trắng bằng dụng cụ vô khuẩn. Theo AAD, lấy nhân mụn do bác sĩ da liễu thực hiện là cách an toàn để loại bỏ mụn đầu đen, đầu trắng; tự nặn tại nhà dễ làm viêm nặng hơn và để lại sẹo.",
    category: "Trị mụn",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Làm sạch da","Lấy nhân mụn bằng dụng cụ vô khuẩn","Hướng dẫn chăm sóc da tại nhà"],
    procedure_steps: ["Tẩy trang, rửa mặt","Làm mềm da trước khi lấy nhân","Lấy nhân mụn đầu đen, đầu trắng bằng dụng cụ vô khuẩn","Sát khuẩn vùng da vừa lấy nhân","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Mụn đầu đen, mụn đầu trắng","Thường dùng khi các cách trị mụn khác chưa làm sạch được da (theo AAD)"],
    aftercare: ["Không tự nặn mụn: dễ làm viêm nặng hơn, để lại sẹo hoặc nhiễm trùng","Mụn đầu đen, đầu trắng có thể quay lại, cần duy trì chế độ chăm sóc da bác sĩ hướng dẫn","Không chà xát mạnh bằng khăn, mút hay dụng cụ","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 60,
    price: 710000,
    image_url: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80",
    sources: ["AAD - Pimple popping: Why only a dermatologist should do it: https://www.aad.org/public/diseases/acne/skin-care/popping","AAD - 10 skin care habits that can help clear acne: https://www.aad.org/public/diseases/acne/skin-care/tips","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Peel Da Hỗ Trợ Trị Mụn",
    description: "Thoa dung dịch peel hoá học lên da theo nồng độ bác sĩ chọn. Peel hoá học được dùng trong điều trị mụn. Peel nhẹ thường cần 3 - 5 lần, cách nhau 2 - 5 tuần; da lành sau khoảng 1 - 7 ngày (theo AAD).",
    category: "Trị mụn",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Chuẩn bị da trước khi peel","Thực hiện peel","Hướng dẫn chăm sóc trong thời gian da lành"],
    procedure_steps: ["Làm sạch da","Bảo vệ vùng da nhạy cảm (khóe mắt, cánh mũi, khóe môi)","Thoa dung dịch peel nhanh và đều","Trung hoà và làm sạch dung dịch peel","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Da mụn, theo chỉ định của bác sĩ","Không áp dụng cho phụ nữ mang thai (quy định phòng khám)","Không thực hiện khi đang nhiễm khuẩn, nấm hoặc virus ở vùng điều trị","Đang dùng hoặc vừa ngưng isotretinoin uống: bác sĩ cân nhắc từng trường hợp","Da màu sẫm cần bác sĩ có kinh nghiệm để tránh rối loạn sắc tố"],
    aftercare: ["Dưỡng ẩm theo hướng dẫn để da mềm ẩm","Có thể đỏ kéo dài hoặc sẫm màu tạm thời","Không tắm nắng nhân tạo","Sau khi da lành, thoa kem chống nắng mỗi ngày"],
    duration_minutes: 60,
    price: 1300000,
    image_url: "https://images.unsplash.com/photo-1761718209793-cb6d348831e0?w=800&auto=format&fit=crop&q=80",
    sources: ["AAD - Chemical peels: FAQs: https://www.aad.org/public/cosmetic/younger-looking/chemical-peels-faqs","Castillo DE, Keri JE. Chemical peels in the treatment of acne. Clin Cosmet Investig Dermatol 2018: https://www.dovepress.com/chemical-peels-in-the-treatment-of-acne-patient-selection-and-perspect-peer-reviewed-fulltext-article-CCID","Spring LK et al. Isotretinoin and Timing of Procedural Interventions. JAMA Dermatol 2017: https://pubmed.ncbi.nlm.nih.gov/28658462/"],
    status: "ACTIVE",
  },
  {
    name: "Điện Di Vitamin C",
    description: "Thoa tinh chất vitamin C, rồi dùng máy điện di trên da. Phòng khám không cam kết công dụng điều trị.",
    category: "Trị nám và tàn nhang",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Điện di tinh chất vitamin C","Hướng dẫn chăm sóc tại nhà"],
    procedure_steps: ["Tẩy trang, làm sạch da","Thoa tinh chất vitamin C","Điện di trên vùng da đã thoa tinh chất","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Theo chỉ định của bác sĩ","Không dùng khi dị ứng với thành phần tinh chất","Mang thai, cho con bú, có máy tạo nhịp hoặc cấy ghép kim loại: chưa có dữ liệu an toàn, bác sĩ cân nhắc"],
    aftercare: ["Dưỡng ẩm đều đặn","Thoa kem chống nắng phổ rộng SPF 30 trở lên, thoa lại mỗi 2 giờ khi ở ngoài trời"],
    duration_minutes: 60,
    price: 760000,
    image_url: "https://images.unsplash.com/photo-1761718209835-c8586b7dcac0?w=800&auto=format&fit=crop&q=80",
    sources: ["Tap Water Iontophoresis, thử nghiệm lâm sàng. Ann Dermatol 2017 (tiêu chí loại trừ): https://pmc.ncbi.nlm.nih.gov/articles/PMC5705354/","AAD - How to apply sunscreen: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen"],
    status: "ACTIVE",
  },
  {
    name: "Laser Toning Hỗ Trợ Điều Trị Nám",
    description: "Laser là một trong các thủ thuật dùng cho nám. Theo AAD, một số nghiên cứu cho thấy thêm laser hoặc ánh sáng vào phác đồ có thể cải thiện kết quả; hiệu quả nhất thường là chống nắng kết hợp thuốc bôi, đôi khi thêm thủ thuật.",
    category: "Trị nám và tàn nhang",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Chiếu laser theo thông số bác sĩ chọn","Theo dõi tiến triển qua từng buổi"],
    procedure_steps: ["Tẩy trang, làm sạch da","Đeo kính bảo vệ mắt","Chiếu laser lên vùng da cần điều trị","Làm dịu da","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Nám, theo chỉ định của bác sĩ","Không chỉ định khi đang mang thai do thiếu dữ liệu an toàn"],
    aftercare: ["Đỏ và sưng thường gặp sau laser; hiếm hơn có thể đổi màu da hoặc sẹo","Nám thường cần 3 - 12 tháng mới thấy kết quả","Chống nắng mỗi ngày để nám không đậm thêm và tái phát","Tái khám đúng hẹn"],
    duration_minutes: 60,
    price: 2900000,
    image_url: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80",
    sources: ["AAD - Melasma: Diagnosis and treatment: https://www.aad.org/public/diseases/a-z/melasma-treatment","AAD - Acne: Lasers and lights: https://www.aad.org/public/diseases/acne/derm-treat/lasers-lights","A review of the safety of cosmetic procedures during pregnancy and lactation. Int J Womens Dermatol 2017: https://pmc.ncbi.nlm.nih.gov/articles/PMC5418954/"],
    status: "ACTIVE",
  },
  {
    name: "Peel Hỗ Trợ Điều Trị Nám",
    description: "Peel hoá học là một trong các thủ thuật dùng cho nám, thường kết hợp với chống nắng và thuốc bôi. Theo AAD, nám thường mất 3 - 12 tháng mới thấy kết quả và dễ tái phát nếu không chống nắng.",
    category: "Trị nám và tàn nhang",
    includes: ["Bác sĩ khám và chỉ định trước khi thực hiện","Chuẩn bị da trước khi peel","Thực hiện peel","Hướng dẫn chăm sóc trong thời gian da lành"],
    procedure_steps: ["Làm sạch da","Bảo vệ vùng da nhạy cảm","Thoa dung dịch peel nhanh và đều","Trung hoà và làm sạch dung dịch peel","Thoa dưỡng và kem chống nắng"],
    suitable_for: ["Nám, theo chỉ định của bác sĩ","Không áp dụng cho phụ nữ mang thai (quy định phòng khám)","Không thực hiện khi đang nhiễm khuẩn, nấm hoặc virus ở vùng điều trị","Da màu sẫm cần bác sĩ có kinh nghiệm để tránh rối loạn sắc tố"],
    aftercare: ["Ánh nắng làm da tạo thêm sắc tố, khiến nám đậm hơn: chống nắng mỗi ngày","Dưỡng ẩm theo hướng dẫn","Có thể đỏ kéo dài hoặc sẫm màu tạm thời","Không tắm nắng nhân tạo"],
    duration_minutes: 60,
    price: 1400000,
    image_url: "https://images.unsplash.com/photo-1713085085470-fba013d67e65?w=800&auto=format&fit=crop&q=80",
    sources: ["AAD - Melasma: Diagnosis and treatment: https://www.aad.org/public/diseases/a-z/melasma-treatment","AAD - Chemical peels: FAQs: https://www.aad.org/public/cosmetic/younger-looking/chemical-peels-faqs","Castillo DE, Keri JE. Chemical peels in the treatment of acne. Clin Cosmet Investig Dermatol 2018: https://www.dovepress.com/chemical-peels-in-the-treatment-of-acne-patient-selection-and-perspect-peer-reviewed-fulltext-article-CCID"],
    status: "ACTIVE",
  },
];

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Kết nối DB booking_db thành công!');
    await sequelize.sync();
    await require('./models').addMissingColumns();

    for (const item of sampleServices) {
      const existing = await SpaService.findOne({ where: { name: item.name } });
      if (existing) {
        await existing.update(item);
      } else {
        await SpaService.create(item);
      }
    }

    console.log(`✅ Đã nạp ${sampleServices.length} dịch vụ vào booking_db!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi nạp Spa Services:', error);
    process.exit(1);
  }
})();
