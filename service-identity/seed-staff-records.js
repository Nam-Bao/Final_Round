// Dữ liệu mẫu Hồ sơ nhân sự cho các tài khoản nhân viên có sẵn (khớp theo email).
// TOÀN BỘ là thông tin giả dùng để demo: tên, CCCD, MST, BHXH, số tài khoản, số chứng chỉ không thuộc về ai.
// Chạy: cd service-identity && node seed-staff-records.js
// Tài khoản đã có hồ sơ thì bỏ qua (không ghi đè); tài khoản không tồn tại thì bỏ qua. Không đổi email / mật khẩu / vai trò.
require('dotenv').config();
const { sequelize, User, Profile, DoctorProfile, EmployeeRecord } = require('./models');
const { parseBody, nextEmployeeCode } = require('./controllers/hr.controller');
const { buildProfessionalData } = require('./controllers/doctorProfile.controller');

const CCCD_PLACE = 'Cục Cảnh sát QLHC về TTXH';
const HCM = 'TP. Hồ Chí Minh';

const STAFF = [
  {
    email: 'quanly@gmail.com', full_name: 'Trần Thị Thu Hà', gender: 'FEMALE', dob: '1983-04-18', phone: '0903120418',
    national_id: '079183900101', national_id_issue_date: '2021-06-15', permanent_address: `128 Nguyễn Tri Phương, Phường 7, Quận 5, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'MARRIED', education_level: 'Thạc sĩ Quản trị kinh doanh',
    emergency_contact_name: 'Lê Văn Hùng', emergency_contact_relation: 'Chồng', emergency_contact_phone: '0903556721',
    position: 'Quản lý phòng khám', employment_type: 'FULL_TIME', start_date: '2023-03-01',
    contract_type: 'INDEFINITE', contract_no: '2023/HĐLĐ-001', contract_start: '2023-03-01',
    tax_code: '8301204181', social_insurance_no: '7923900101', bank_name: 'Vietcombank', bank_account_no: '1023900101',
    health_check_date: '2026-05-12',
    role_data: { appointment_decision_no: '01/2023/QĐ-GS', appointment_date: '2023-03-01', managed_scope: 'Nhân sự, lương, kho hàng, dịch vụ và nội dung website' },
  },
  {
    email: 'abc@gmail.com', full_name: 'Lê Quốc Bảo', gender: 'MALE', dob: '1990-09-02', phone: '0908090290',
    national_id: '048090900102', national_id_issue_date: '2021-08-20', permanent_address: '45 Hùng Vương, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng',
    current_address: `76/12 Cách Mạng Tháng 8, Phường 6, Quận 3, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'SINGLE', education_level: 'Kỹ sư Công nghệ thông tin',
    emergency_contact_name: 'Lê Văn Thành', emergency_contact_relation: 'Bố', emergency_contact_phone: '0905234876',
    position: 'Quản trị hệ thống', employment_type: 'FULL_TIME', start_date: '2023-05-15',
    contract_type: 'INDEFINITE', contract_no: '2023/HĐLĐ-004', contract_start: '2023-05-15',
    tax_code: '8309020902', social_insurance_no: '4890900102', bank_name: 'Techcombank', bank_account_no: '1903900102',
    health_check_date: '2026-05-12',
    role_data: { system_scope: 'Tài khoản người dùng, phân quyền, sao lưu dữ liệu và bảo mật hệ thống', confidentiality_signed_at: '2023-05-15' },
  },
  {
    email: 'bacsi1@gmail.com', full_name: 'Nguyễn Minh Khoa', gender: 'MALE', dob: '1978-11-23', phone: '0909781123',
    national_id: '079078900103', national_id_issue_date: '2021-03-10', permanent_address: `215 Lý Thường Kiệt, Phường 15, Quận 11, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'MARRIED', education_level: 'Bác sĩ Chuyên khoa II',
    emergency_contact_name: 'Phan Thị Mai', emergency_contact_relation: 'Vợ', emergency_contact_phone: '0918445162',
    position: 'Bác sĩ Da liễu', employment_type: 'FULL_TIME', start_date: '2023-04-03',
    contract_type: 'INDEFINITE', contract_no: '2023/HĐLĐ-002', contract_start: '2023-04-03',
    tax_code: '8078112303', social_insurance_no: '7978900103', bank_name: 'BIDV', bank_account_no: '3101900103',
    health_check_date: '2026-05-12',
    role_data: {
      license_issue_date: '2012-08-14', license_issue_place: `Sở Y tế ${HCM}`, practice_scope: 'Khám bệnh, chữa bệnh chuyên khoa Da liễu',
      practice_registered_at: '2023-04-03', cme_expiry: '2027-08-14',
    },
    professional: {
      specialty: 'Bác sĩ Da liễu', workplace: 'Phòng Khám Da Liễu GlowSkin', experience_years: 15, license_number: '004512/HCM-CCHN',
      bio: 'Hơn 15 năm khám và điều trị các bệnh da liễu, chuyên sâu về mụn trứng cá, sẹo mụn và rối loạn sắc tố da.',
      work_history: [
        { position: 'Bác sĩ Da liễu', place: 'Phòng Khám Da Liễu GlowSkin', from: 2023, to: null },
        { position: 'Bác sĩ điều trị', place: 'Khoa Da liễu, bệnh viện đa khoa tại TP.HCM', from: 2011, to: 2023 },
      ],
      certificates: ['Chứng chỉ Laser trong Da liễu thẩm mỹ - 2018', 'Chứng chỉ Điều trị sẹo mụn chuyên sâu - 2020'],
      expertise: ['Mụn trứng cá', 'Sẹo mụn', 'Nám da', 'Viêm da cơ địa'],
    },
  },
  {
    email: 'bacsi2@gmail.com', full_name: 'Phạm Thị Ngọc Lan', gender: 'FEMALE', dob: '1988-02-14', phone: '0909880214',
    national_id: '075188900104', national_id_issue_date: '2021-11-05', permanent_address: '32 Phạm Văn Thuận, Phường Tân Mai, TP. Biên Hòa, Đồng Nai',
    current_address: `18 Sư Vạn Hạnh, Phường 12, Quận 10, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'MARRIED', education_level: 'Thạc sĩ Y khoa',
    emergency_contact_name: 'Trương Văn Dũng', emergency_contact_relation: 'Chồng', emergency_contact_phone: '0937662104',
    position: 'Bác sĩ Da liễu', employment_type: 'FULL_TIME', start_date: '2024-02-19',
    contract_type: 'FIXED_TERM', contract_no: '2025/HĐLĐ-011', contract_start: '2025-02-19', contract_end: '2027-02-18',
    tax_code: '8088021404', social_insurance_no: '7588900104', bank_name: 'ACB', bank_account_no: '2188900104',
    health_check_date: '2026-05-12',
    role_data: {
      license_issue_date: '2015-10-02', license_issue_place: `Sở Y tế ${HCM}`, practice_scope: 'Khám bệnh, chữa bệnh chuyên khoa Da liễu',
      practice_registered_at: '2024-02-19', cme_expiry: '2027-10-02',
    },
    professional: {
      title: 'ThS.BS', specialty: 'Bác sĩ Da liễu', workplace: 'Phòng Khám Da Liễu GlowSkin', experience_years: 10, license_number: '011873/HCM-CCHN',
      bio: 'Thạc sĩ, bác sĩ Da liễu với 10 năm kinh nghiệm, thế mạnh về da nhạy cảm, phục hồi da và chăm sóc da sau điều trị.',
      education: [
        { degree: 'Bác sĩ Đa khoa', school: 'Đại học Y Dược TP.HCM', year: 2012 },
        { degree: 'Thạc sĩ Da liễu', school: 'Đại học Y Dược TP.HCM', year: 2017 },
      ],
      work_history: [
        { position: 'Bác sĩ Da liễu', place: 'Phòng Khám Da Liễu GlowSkin', from: 2024, to: null },
        { position: 'Bác sĩ điều trị', place: 'Phòng khám chuyên khoa Da liễu tại TP.HCM', from: 2015, to: 2024 },
      ],
      certificates: ['Chứng chỉ Phục hồi da sau tổn thương - 2021'],
      expertise: ['Da nhạy cảm', 'Phục hồi da', 'Viêm nang lông', 'Lão hóa da'],
    },
  },
  {
    email: 'chuyengia1@gmail.com', full_name: 'Đỗ Thị Hải Yến', gender: 'FEMALE', dob: '1984-07-30', phone: '0907840730',
    national_id: '079184900105', national_id_issue_date: '2021-05-22', permanent_address: `56 Trần Quang Khải, Phường Tân Định, Quận 1, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'MARRIED', education_level: 'Thạc sĩ Dinh dưỡng',
    emergency_contact_name: 'Ngô Minh Tuấn', emergency_contact_relation: 'Chồng', emergency_contact_phone: '0908331947',
    position: 'Chuyên gia tư vấn dinh dưỡng', employment_type: 'COLLABORATOR', start_date: '2026-01-05',
    contract_type: 'SERVICE', contract_no: '2026/HĐDV-001', contract_start: '2026-01-05', contract_end: '2026-12-31',
    tax_code: '8084073005', bank_name: 'Sacombank', bank_account_no: '0601900105',
    role_data: {
      home_organization: 'Bệnh viện Đại học Y Dược TP.HCM', license_issue_date: '2013-06-11', license_issue_place: `Sở Y tế ${HCM}`,
      practice_scope: 'Tư vấn dinh dưỡng lâm sàng', practice_registered_at: '2026-01-05', cme_expiry: '2028-06-11',
    },
    professional: {
      license_number: '007264/HCM-CCHN',
      bio: 'Thạc sĩ, bác sĩ Dinh dưỡng, tư vấn chế độ ăn và sinh hoạt hỗ trợ làn da khỏe mạnh, đặc biệt cho người bị mụn và da nhạy cảm.',
      certificates: ['Chứng chỉ Dinh dưỡng lâm sàng - 2016'],
      expertise: ['Dinh dưỡng cho da mụn', 'Chế độ ăn chống viêm', 'Kiểm soát cân nặng'],
    },
  },
  {
    email: 'ktv1@gmail.com', full_name: 'Huỳnh Thị Kim Ngân', gender: 'FEMALE', dob: '1997-12-05', phone: '0906971205',
    national_id: '072197900106', national_id_issue_date: '2022-01-14', permanent_address: 'Ấp Thạnh Hiệp, Xã Thạnh Đông, Huyện Tân Châu, Tây Ninh',
    current_address: `22/7 Bắc Hải, Phường 15, Quận 10, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'SINGLE', education_level: 'Cao đẳng Điều dưỡng',
    emergency_contact_name: 'Huỳnh Văn Sang', emergency_contact_relation: 'Bố', emergency_contact_phone: '0983120657',
    position: 'Kỹ thuật viên chăm sóc da', employment_type: 'FULL_TIME', start_date: '2024-06-03',
    contract_type: 'FIXED_TERM', contract_no: '2025/HĐLĐ-014', contract_start: '2025-06-03', contract_end: '2027-06-02',
    tax_code: '8097120506', social_insurance_no: '7297900106', bank_name: 'MB Bank', bank_account_no: '0906900106',
    health_check_date: '2026-05-12',
    role_data: {
      certificate_name: 'Chứng chỉ Kỹ thuật viên Chăm sóc da chuyên nghiệp', certificate_no: 'KTV-2022-0486', certificate_issue_date: '2022-09-20',
      certificate_issue_place: `Trường Cao đẳng Y tế tại ${HCM}`, certificate_expiry: '2027-09-20',
      trained_devices: ['Máy điện di ion', 'Máy soi da', 'Đèn LED sinh học'],
      trained_services: ['Lấy nhân mụn chuẩn y khoa', 'Peel da sinh học mờ thâm', 'Điện di Ion Vitamin C'],
    },
  },
  {
    email: 'tuvan1@gmail.com', full_name: 'Võ Thị Mỹ Linh', gender: 'FEMALE', dob: '1996-03-27', phone: '0905960327',
    national_id: '052196900107', national_id_issue_date: '2021-12-09', permanent_address: '14 Nguyễn Huệ, Phường Lê Lợi, TP. Quy Nhơn, Bình Định',
    current_address: `9 Thành Thái, Phường 14, Quận 10, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'SINGLE', education_level: 'Cử nhân Quản trị kinh doanh',
    emergency_contact_name: 'Võ Văn Hòa', emergency_contact_relation: 'Bố', emergency_contact_phone: '0914556238',
    position: 'Chuyên viên CSKH', employment_type: 'FULL_TIME', start_date: '2023-09-11',
    contract_type: 'INDEFINITE', contract_no: '2025/HĐLĐ-009', contract_start: '2025-09-11',
    tax_code: '8096032707', social_insurance_no: '5296900107', bank_name: 'VPBank', bank_account_no: '1052900107',
    health_check_date: '2026-05-12',
    role_data: { languages: ['Tiếng Anh giao tiếp'], channels: ['Hotline', 'Zalo', 'Chat web'], training_certificates: ['Kỹ năng chăm sóc khách hàng - 2023', 'Kiến thức da liễu cơ bản cho CSKH - 2024'] },
  },
  {
    email: 'tuvan2@gmail.com', full_name: 'Đặng Hoàng Nam', gender: 'MALE', dob: '1998-08-16', phone: '0902980816',
    national_id: '046098900108', national_id_issue_date: '2022-03-18', permanent_address: '27 Lê Duẩn, Phường Phú Hội, TP. Huế, Thừa Thiên Huế',
    current_address: `150 Ba Tháng Hai, Phường 12, Quận 10, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'SINGLE', education_level: 'Cử nhân Marketing',
    emergency_contact_name: 'Đặng Thị Hoa', emergency_contact_relation: 'Mẹ', emergency_contact_phone: '0935447102',
    position: 'Chuyên viên CSKH', employment_type: 'FULL_TIME', start_date: '2025-11-24',
    contract_type: 'FIXED_TERM', contract_no: '2025/HĐLĐ-021', contract_start: '2025-11-24', contract_end: '2026-11-23',
    tax_code: '8098081608', social_insurance_no: '4698900108', bank_name: 'TPBank', bank_account_no: '0298900108',
    health_check_date: '2026-05-12',
    role_data: { languages: ['Tiếng Anh giao tiếp'], channels: ['Chat web', 'Zalo'], training_certificates: ['Kỹ năng chăm sóc khách hàng - 2025'] },
    notes: 'Hợp đồng sắp hết hạn, cần đánh giá để gia hạn.',
  },
  {
    email: 'banhang1@gmail.com', full_name: 'Bùi Thanh Tùng', gender: 'MALE', dob: '1999-05-09', phone: '0904990509',
    national_id: '079099900109', national_id_issue_date: '2022-05-26', permanent_address: `88 Lê Văn Sỹ, Phường 13, Quận 3, ${HCM}`,
    ethnicity: 'Kinh', marital_status: 'SINGLE', education_level: 'Cao đẳng Dược',
    emergency_contact_name: 'Bùi Văn Lâm', emergency_contact_relation: 'Bố', emergency_contact_phone: '0918220975',
    position: 'Nhân viên bán hàng', employment_type: 'FULL_TIME', start_date: '2025-03-17',
    contract_type: 'FIXED_TERM', contract_no: '2025/HĐLĐ-012', contract_start: '2025-03-17', contract_end: '2027-03-16',
    tax_code: '8099050909', social_insurance_no: '7999900109', bank_name: 'Agribank', bank_account_no: '6300900109',
    health_check_date: '2026-05-12',
    role_data: {
      counter_area: 'Quầy dược mỹ phẩm tầng 1', pharmacy_certificate_no: '019342/HCM-CCHND', pharmacy_certificate_date: '2024-11-08',
      product_training: ['Dược mỹ phẩm La Roche-Posay - 2025', 'Tư vấn sản phẩm chống nắng - 2025'],
    },
  },
];

(async () => {
  await sequelize.authenticate();
  await EmployeeRecord.sync();
  let created = 0;
  for (const s of STAFF) {
    const user = await User.findOne({ where: { email: s.email } });
    if (!user) { console.log(`- Bỏ qua ${s.email}: chưa có tài khoản`); continue; }
    if (await EmployeeRecord.findOne({ where: { user_id: user.id }, paranoid: false })) { console.log(`- Bỏ qua ${s.email}: đã có hồ sơ`); continue; }

    // Chạy qua đúng bộ kiểm tra của form nên hồ sơ mẫu sửa được bình thường trên giao diện
    const { professional: pro, ...body } = s;
    const { profile, record } = parseBody({
      ...body, national_id_issue_place: CCCD_PLACE, nationality: 'Việt Nam', bank_account_name: s.full_name.toUpperCase(), documents: [],
    }, user.role);

    await sequelize.transaction(async (t) => {
      const [account] = await Profile.findOrCreate({ where: { user_id: user.id }, defaults: profile, transaction: t });
      await account.update(profile, { transaction: t });
      if (pro) {
        const old = (await DoctorProfile.findOne({ where: { user_id: user.id }, transaction: t }))?.toJSON() || {};
        const keep = (k, fallback) => (old[k]?.length ? old[k] : fallback);
        // Giữ những gì đã khai (học vị, lĩnh vực, thù lao...), chỉ bổ sung phần còn thiếu
        const data = buildProfessionalData(user.role, {
          ...old, ...pro, title: old.title || pro.title,
          education: keep('education', pro.education), work_history: keep('work_history', pro.work_history),
          certificates: keep('certificates', pro.certificates), expertise: keep('expertise', pro.expertise),
        }, null);
        const [doc] = await DoctorProfile.findOrCreate({ where: { user_id: user.id }, defaults: data, transaction: t });
        await doc.update(data, { transaction: t });
      }
      const employee_code = await nextEmployeeCode(t);
      await EmployeeRecord.create({ ...record, user_id: user.id, employee_code }, { transaction: t });
      console.log(`+ ${employee_code} ${s.full_name} (${user.role})`);
    });
    created += 1;
  }
  console.log(`Đã tạo ${created} hồ sơ nhân sự mẫu.`);
  await sequelize.close();
})().catch((err) => { console.error('Lỗi:', err.message); process.exit(1); });
