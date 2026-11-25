// Phiếu thanh toán sau khám dạng PDF (khổ A5) cho khách tải về. Bố cục giống phiếu in A5 ở trang quản trị (frontend-admin/pages/PrintPage.jsx).
// Dùng pdfmake + font Roboto kèm sẵn trong gói (có đủ dấu tiếng Việt), không cần trình duyệt chạy ngầm.
const PdfPrinter = require('pdfmake');
const dayjs = require('dayjs');

const vfsModule = require('pdfmake/build/vfs_fonts.js');
const vfs = vfsModule.pdfMake ? vfsModule.pdfMake.vfs : (vfsModule.vfs || vfsModule);
const font = (file) => Buffer.from(vfs[file], 'base64');
const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
});

const DEFAULT_NAME = 'Phòng khám da liễu GlowSkin';
// Ô trống trong "Thông tin phòng khám" => giá trị mặc định giống website / phiếu in tại quầy
const withDefaults = (c = {}) => ({
  ...c,
  hotline: c.hotline || '0869694064',
  address: c.address || process.env.CLINIC_ADDRESS || '',
  working_hours: c.working_hours || '08:00 - 17:00 (Hàng ngày)',
});
const money = (n) => (n === null || n === undefined ? '—' : `${Math.round(Number(n)).toLocaleString('vi-VN')} đ`);
const fmtDate = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—');
const fmtDateTime = (d) => (d ? dayjs(d).format('HH:mm DD/MM/YYYY') : '—');

// Đọc số tiền bằng chữ (cùng cách đọc với phiếu in tại quầy): 1250000 => "Một triệu hai trăm năm mươi nghìn đồng"
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const readTriple = (n, full) => {
  const a = Math.floor(n / 100); const b = Math.floor((n % 100) / 10); const c = n % 10;
  const out = [];
  if (full || a) out.push(`${DIGITS[a]} trăm`);
  if (b === 0 && c) { if (full || a) out.push('lẻ'); } else if (b === 1) out.push('mười'); else if (b > 1) out.push(`${DIGITS[b]} mươi`);
  if (c) out.push(c === 1 && b > 1 ? 'mốt' : c === 5 && b > 0 ? 'lăm' : DIGITS[c]);
  return out.join(' ');
};
const moneyInWords = (value) => {
  let n = Math.round(Math.abs(Number(value) || 0));
  if (!n) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const words = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (!groups[i]) continue;
    words.push(readTriple(groups[i], i < groups.length - 1), units[i] || '');
  }
  const s = words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`;
};

const row = (label, value, opt = {}) => ({ columns: [{ text: label, ...opt }, { text: value, alignment: 'right', ...opt }], margin: [0, 1, 0, 1] });

// data: kết quả buildInvoiceData() trong controllers/print.controller.js
const buildDoc = (d) => {
  const clinic = withDefaults(d.clinic);
  const t = d.totals;
  const lines = [];
  d.groups.forEach((g) => {
    const groupNote = g.total !== undefined && g.items.some((i) => i.amount === null) ? ` (tổng ${money(g.total)})` : '';
    lines.push([{ text: `${g.label}${groupNote}`, colSpan: 5, bold: true, fillColor: '#f5f5f5' }, {}, {}, {}, {}]);
    g.items.forEach((it, i) => lines.push([
      { text: String(i + 1), alignment: 'center' }, it.name, { text: String(it.quantity), alignment: 'center' },
      { text: money(it.price), alignment: 'right' }, { text: money(it.amount), alignment: 'right' },
    ]));
  });

  const legal = [clinic.tax_code && `MST: ${clinic.tax_code}`, clinic.license_no && `Giấy phép: ${clinic.license_no}`].filter(Boolean).join(' · ');
  const doctor = d.doctor ? `${d.doctor.title ? `${d.doctor.title} ` : ''}${d.doctor.name}` : '—';
  const showAccount = d.account?.name && d.account.name !== d.patient?.name;

  const content = [
    {
      stack: [
        { text: (clinic.business_name || DEFAULT_NAME).toUpperCase(), bold: true, fontSize: 10.5 },
        clinic.address ? { text: `Địa chỉ: ${clinic.address}`, fontSize: 8.5 } : null,
        { text: [clinic.hotline && `Hotline: ${clinic.hotline}`, clinic.working_hours && `Giờ khám: ${clinic.working_hours}`].filter(Boolean).join(' · '), fontSize: 8.5 },
        legal ? { text: legal, fontSize: 8.5 } : null,
      ].filter(Boolean),
    },
    { canvas: [{ type: 'line', x1: 0, y1: 3, x2: 362, y2: 3, lineWidth: 1.2 }] },
    { text: 'PHIẾU THANH TOÁN', bold: true, fontSize: 15, alignment: 'center', margin: [0, 8, 0, 1] },
    { text: `Số: ${d.doc_no} · Ngày ${fmtDateTime(d.checked_out_at)}`, alignment: 'center', fontSize: 8.5, margin: [0, 0, 0, 8] },
    {
      columns: [
        { text: [{ text: 'Khách hàng: ', color: '#444' }, { text: d.patient?.name || '—', bold: true }] },
        { text: [{ text: 'Điện thoại: ', color: '#444' }, d.patient?.phone || '—'] },
      ], fontSize: 9.5,
    },
    showAccount ? { text: [{ text: 'Chủ tài khoản: ', color: '#444' }, `${d.account.name}${d.patient?.relationship ? ` (người khám: ${d.patient.relationship})` : ''}`], fontSize: 9.5 } : null,
    {
      columns: [
        { text: [{ text: 'Ngày khám: ', color: '#444' }, `${fmtDate(d.appointment.date)} ${d.appointment.time}`] },
        { text: [{ text: 'Bác sĩ: ', color: '#444' }, doctor] },
      ], fontSize: 9.5, margin: [0, 0, 0, 6],
    },
    {
      table: {
        headerRows: 1,
        widths: [18, '*', 22, 62, 66],
        body: [
          ['TT', 'Nội dung', 'SL', 'Đơn giá', 'Thành tiền'].map((h) => ({ text: h, bold: true, alignment: 'center', fillColor: '#eeeeee' })),
          ...lines,
        ],
      },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#666', vLineColor: () => '#666', paddingTop: () => 2, paddingBottom: () => 2 },
      fontSize: 9,
    },
    {
      margin: [130, 6, 0, 0],
      fontSize: 9.5,
      stack: [
        row('Tạm tính', money(t.gross)),
        t.discount > 0 ? row(`Giảm giá${t.voucher_code ? ` (mã ${t.voucher_code})` : ''}`, `-${money(t.discount)}`) : null,
        { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 232, y2: 2, lineWidth: 0.8 }] },
        row('Tổng thanh toán', money(t.total), { bold: true, fontSize: 11 }),
        t.consult_credit > 0 ? row('Trừ cọc tư vấn chuyên gia', `-${money(t.consult_credit)}`) : null,
        t.deposit_paid > 0 ? row('Đã trả khi đặt lịch', `-${money(t.deposit_paid)}`) : null,
        t.amount_due_now !== null && t.amount_due_now !== undefined ? row('Thu tại quầy', money(t.amount_due_now), { bold: true }) : null,
      ].filter(Boolean),
    },
    { text: `Tổng thanh toán bằng chữ: ${moneyInWords(t.total)}.`, italics: true, fontSize: 9, margin: [0, 5, 0, 4] },
    {
      columns: [
        { text: [{ text: 'Hình thức thanh toán: ', color: '#444' }, d.payment_method] },
        { text: [{ text: 'Thu ngân: ', color: '#444' }, d.cashier || '—'] },
      ], fontSize: 9.5,
    },
    d.payments.length ? {
      margin: [0, 6, 0, 0],
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Các khoản đã thu', bold: true, colSpan: 2 }, {}],
          ...d.payments.map((p) => [`${p.label} (${fmtDateTime(p.at)})`, { text: money(p.amount), alignment: 'right' }]),
        ],
      },
      layout: { hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.6 : 0), vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0.6 : 0), hLineColor: () => '#888', vLineColor: () => '#888' },
      fontSize: 9,
    } : null,
    d.groups.some((g) => g.key === 'packages' || g.key === 'services')
      ? { text: 'Dịch vụ / gói liệu trình đã mua: xem lịch và số buổi còn lại tại mục "Gói liệu trình" trên website hoặc hỏi quầy CSKH.', fontSize: 8.5, margin: [0, 6, 0, 0] }
      : null,
    d.legacy ? { text: 'Hóa đơn chốt trước khi hệ thống lưu chi tiết đơn giá: một số dòng chỉ ghi tổng nhóm.', italics: true, fontSize: 8, margin: [0, 4, 0, 0] } : null,
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 362, y2: 8, lineWidth: 0.5, lineColor: '#999' }] },
    {
      columns: [
        { width: 'auto', text: `Tải từ website lúc ${fmtDateTime(d.printed_at)}`, fontSize: 7.5, color: '#444' },
        { width: '*', text: 'Phiếu không thay thế hóa đơn GTGT. Cảm ơn quý khách!', fontSize: 7.5, color: '#444', alignment: 'right' },
      ], margin: [0, 3, 0, 0],
    },
  ].filter(Boolean);

  return {
    pageSize: 'A5',
    pageMargins: [28, 26, 28, 26],
    info: { title: `Phiếu thanh toán ${d.doc_no}`, author: clinic.business_name || DEFAULT_NAME },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.15 },
    // Phiếu đã hoàn tiền: dấu mờ chéo giống phiếu in tại quầy
    watermark: d.status === 'REFUNDED' ? { text: 'ĐÃ HOÀN TIỀN', color: '#000', opacity: 0.18, bold: true } : undefined,
    content,
  };
};

// Trả về Buffer của file PDF
const renderReceiptPdf = (data) => new Promise((resolve, reject) => {
  const doc = printer.createPdfKitDocument(buildDoc(data));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  doc.end();
});

module.exports = { renderReceiptPdf, moneyInWords };
