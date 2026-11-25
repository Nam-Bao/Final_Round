// Hóa đơn bán lẻ đơn mỹ phẩm dạng PDF (khổ A5) cho khách tải về: đơn nhận tại quầy và đơn giao hàng.
// Cùng phong cách với phiếu thanh toán sau khám (service-booking/utils/receiptPdf.js) và phiếu in A5 tại quầy.
// pdfmake + font Roboto kèm sẵn trong gói (đủ dấu tiếng Việt).
const PdfPrinter = require('pdfmake');

const vfsModule = require('pdfmake/build/vfs_fonts.js');
const vfs = vfsModule.pdfMake ? vfsModule.pdfMake.vfs : (vfsModule.vfs || vfsModule);
const font = (file) => Buffer.from(vfs[file], 'base64');
const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
});

const DEFAULT_NAME = 'Phòng khám da liễu GlowSkin';
const withDefaults = (c = {}) => ({
  ...c,
  hotline: c.hotline || '0869694064',
  address: c.address || process.env.CLINIC_ADDRESS || '',
  working_hours: c.working_hours || '08:00 - 17:00 (Hàng ngày)',
});
const money = (n) => (n === null || n === undefined ? '—' : `${Math.round(Number(n)).toLocaleString('vi-VN')} đ`);
// Giờ Việt Nam (server có thể chạy múi giờ khác)
const vn = (d) => new Date(new Date(d).getTime() + 7 * 3600000);
const pad = (n) => String(n).padStart(2, '0');
const fmtDateTime = (d) => { if (!d) return '—'; const x = vn(d); return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())} ${pad(x.getUTCDate())}/${pad(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`; };

// Đọc số tiền bằng chữ (cùng cách đọc với phiếu in tại quầy)
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

// Tên sản phẩm thường đã có dung tích ("... 40ml") => không ghi lặp
// Chỉ ghép dung tích ngắn ("40ml", "30 viên"); quy cách dài ("Gói 540 viên (dùng 90 ngày)") làm tên rối nên bỏ
const withCapacity = (name, cap) => (cap && String(cap).length <= 12 && !String(name).toLowerCase().includes(String(cap).toLowerCase()) ? `${name} (${cap})` : name);
const row = (label, value, opt = {}) => ({ columns: [{ text: label, ...opt }, { text: value, alignment: 'right', ...opt }], margin: [0, 1, 0, 1] });
const labeled = (label, value) => ({ text: [{ text: `${label}: `, color: '#444' }, value || '—'] });

// Chính sách hoàn trả theo loại đơn: đơn tại quầy mang hàng đến phòng khám, đơn giao hàng gửi yêu cầu trên website
const returnPolicy = (d, clinic) => [
  'Mỹ phẩm không nhận trả vì đổi ý.',
  d.delivery
    ? 'Sản phẩm lỗi hoặc không đúng mô tả: gửi yêu cầu hoàn / trả ở mục Đơn hàng mỹ phẩm trên website trong 7 ngày kể từ khi nhận hàng.'
    : 'Sản phẩm lỗi hoặc không đúng mô tả: mang sản phẩm (còn đủ hộp, tem) cùng hóa đơn này đến phòng khám.',
  d.has_sale_item ? 'Hàng mua khi đang khuyến mãi không hoàn tiền, lỗi thì đổi đúng sản phẩm đó.' : '',
  `Hotline: ${clinic.hotline}`,
].filter(Boolean).join(' ');

// data: kết quả buildOrderData() trong controllers/print.controller.js
const buildDoc = (d) => {
  const clinic = withDefaults(d.clinic);
  const t = d.totals;
  const legal = [clinic.tax_code && `MST: ${clinic.tax_code}`, clinic.license_no && `Giấy phép: ${clinic.license_no}`].filter(Boolean).join(' · ');

  const content = [
    {
      stack: [
        { text: (clinic.business_name || DEFAULT_NAME).toUpperCase(), bold: true, fontSize: 10.5 },
        clinic.address ? { text: `Địa chỉ: ${clinic.address}`, fontSize: 8.5 } : null,
        { text: [clinic.hotline && `Hotline: ${clinic.hotline}`, clinic.working_hours && `Giờ làm việc: ${clinic.working_hours}`].filter(Boolean).join(' · '), fontSize: 8.5 },
        legal ? { text: legal, fontSize: 8.5 } : null,
      ].filter(Boolean),
    },
    { canvas: [{ type: 'line', x1: 0, y1: 3, x2: 362, y2: 3, lineWidth: 1.2 }] },
    { text: 'HÓA ĐƠN BÁN LẺ', bold: true, fontSize: 15, alignment: 'center', margin: [0, 8, 0, 1] },
    { text: `Số: ${d.doc_no} · Ngày ${fmtDateTime(d.order.created_at)}`, alignment: 'center', fontSize: 8.5, margin: [0, 0, 0, 8] },
    { columns: [labeled('Khách hàng', d.customer.name), labeled('Điện thoại', d.customer.phone)], fontSize: 9.5 },
    d.delivery
      ? { stack: [labeled('Giao đến', d.delivery.address), d.delivery.tracking_code ? labeled('Mã vận đơn GHN', d.delivery.tracking_code) : null].filter(Boolean), fontSize: 9.5 }
      : { columns: [labeled('Nhận hàng', 'Tại quầy phòng khám'), labeled('Nhân viên bán', d.seller)], fontSize: 9.5 },
    { columns: [labeled('Mã đơn', `#${d.order.id.slice(0, 8).toUpperCase()}`), labeled('Thanh toán', d.order.payment_method)], fontSize: 9.5, margin: [0, 0, 0, 6] },
    d.exchange ? { text: d.exchange, italics: true, fontSize: 9, margin: [0, 0, 0, 4] } : null,
    {
      table: {
        headerRows: 1,
        widths: [18, '*', 22, 62, 66],
        body: [
          ['TT', 'Sản phẩm', 'SL', 'Đơn giá', 'Thành tiền'].map((h) => ({ text: h, bold: true, alignment: 'center', fillColor: '#eeeeee' })),
          ...d.items.map((it, i) => [
            { text: String(i + 1), alignment: 'center' },
            { text: [withCapacity(it.name, it.capacity), it.is_sale ? { text: ' (khuyến mãi)', italics: true, color: '#555' } : ''] },
            { text: String(it.quantity), alignment: 'center' },
            { text: money(it.price), alignment: 'right' },
            { text: money(it.amount), alignment: 'right' },
          ]),
        ],
      },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#666', vLineColor: () => '#666', paddingTop: () => 2, paddingBottom: () => 2 },
      fontSize: 9,
    },
    {
      margin: [130, 6, 0, 0],
      fontSize: 9.5,
      stack: [
        row('Tiền hàng', money(t.gross)),
        t.discount > 0 ? row(t.exchange ? 'Đổi hàng (không thu tiền)' : `Giảm giá${t.voucher_code ? ` (mã ${t.voucher_code})` : ''}`, `-${money(t.discount)}`) : null,
        t.shipping_fee > 0 ? row('Phí vận chuyển (GHN)', money(t.shipping_fee)) : null,
        { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 232, y2: 2, lineWidth: 0.8 }] },
        row('Tổng thanh toán', money(t.total), { bold: true, fontSize: 11 }),
      ].filter(Boolean),
    },
    { text: `Bằng chữ: ${moneyInWords(t.total)}.`, italics: true, fontSize: 9, margin: [0, 5, 0, 4] },
    d.safety.length ? {
      margin: [0, 4, 0, 0], fontSize: 8.5,
      table: { widths: ['*'], body: [[{ stack: [{ text: 'Lưu ý an toàn nhân viên đã tư vấn:', bold: true }, ...d.safety.map((w) => `- ${w.item}: ${w.message}${w.label ? ` (${w.label})` : ''}`)] }]] },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#888', vLineColor: () => '#888' },
    } : null,
    d.return_note ? { text: d.return_note, fontSize: 8.5, bold: true, margin: [0, 6, 0, 0] } : null,
    { margin: [0, 6, 0, 0], fontSize: 8.5, text: returnPolicy(d, clinic) },
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 362, y2: 8, lineWidth: 0.5, lineColor: '#999' }] },
    {
      columns: [
        { width: 'auto', text: `Tải từ website lúc ${fmtDateTime(d.printed_at)}`, fontSize: 7.5, color: '#444' },
        { width: '*', text: 'Hóa đơn không thay thế hóa đơn GTGT. Cảm ơn quý khách!', fontSize: 7.5, color: '#444', alignment: 'right' },
      ], margin: [0, 3, 0, 0],
    },
  ].filter(Boolean);

  return {
    pageSize: 'A5',
    pageMargins: [28, 26, 28, 26],
    info: { title: `Hóa đơn bán lẻ ${d.doc_no}`, author: clinic.business_name || DEFAULT_NAME },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.15 },
    watermark: d.stamp ? { text: d.stamp, color: '#000', opacity: 0.12, bold: true, fontSize: 46 } : undefined,
    content,
  };
};

// Trả về Buffer của file PDF
const renderOrderInvoicePdf = (data) => new Promise((resolve, reject) => {
  const doc = printer.createPdfKitDocument(buildDoc(data));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  doc.end();
});

module.exports = { renderOrderInvoicePdf };
