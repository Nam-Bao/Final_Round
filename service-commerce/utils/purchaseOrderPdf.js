// Đơn đặt hàng (Purchase Order) gửi nhà cung cấp dạng PDF khổ A4: đính kèm email và tải từ trang Nhập hàng.
// pdfmake + font Roboto kèm sẵn trong gói (đủ dấu tiếng Việt), cùng cách dựng với utils/orderInvoicePdf.js.
const PdfPrinter = require('pdfmake');

const vfsModule = require('pdfmake/build/vfs_fonts.js');
const vfs = vfsModule.pdfMake ? vfsModule.pdfMake.vfs : (vfsModule.vfs || vfsModule);
const font = (file) => Buffer.from(vfs[file], 'base64');
const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
});

const money = (n) => (n === null || n === undefined || n === '' ? '—' : `${Math.round(Number(n)).toLocaleString('vi-VN')} đ`);
const dmy = (d) => { const [y, m, dd] = String(d || '').slice(0, 10).split('-'); return y ? `${dd}/${m}/${y}` : '—'; };
const vnDate = (d) => new Date(new Date(d).getTime() + 7 * 3600000).toISOString().slice(0, 10);

// d: { code, created_at, expected_date, note, supplier: { name, tax_code, contact_name, phone, email, address },
//      clinic: { business_name, address, hotline, tax_code }, items: [{ name, unit, quantity, unit_cost }], created_by_name }
const buildDoc = (d) => {
  const clinic = d.clinic || {};
  const s = d.supplier || {};
  const items = d.items || [];
  const total = items.reduce((sum, i) => sum + (Number(i.unit_cost) || 0) * Number(i.quantity), 0);
  const party = (title, lines) => ({ width: '*', stack: [{ text: title, bold: true, margin: [0, 0, 0, 3] }, ...lines.filter(Boolean).map((t) => ({ text: t, fontSize: 9.5 }))] });
  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 40],
    info: { title: `Đơn đặt hàng ${d.code}`, author: clinic.business_name || 'Phòng khám da liễu GlowSkin' },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.2 },
    content: [
      { columns: [
        { width: '*', stack: [{ text: clinic.business_name || 'Phòng khám da liễu GlowSkin', bold: true, fontSize: 12, color: '#0f766e' }, { text: clinic.address || '', fontSize: 9 }, { text: `Hotline: ${clinic.hotline || ''}`, fontSize: 9 }] },
        { width: 'auto', stack: [{ text: 'ĐƠN ĐẶT HÀNG', bold: true, fontSize: 16, alignment: 'right' }, { text: `Số: ${d.code}`, alignment: 'right' }, { text: `Ngày: ${dmy(vnDate(d.created_at || new Date()))}`, alignment: 'right' }] },
      ] },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 0.8, lineColor: '#0f766e' }], margin: [0, 0, 0, 10] },
      { columns: [
        party('Bên đặt hàng', [clinic.business_name || 'Phòng khám da liễu GlowSkin', clinic.tax_code ? `MST: ${clinic.tax_code}` : null, clinic.address ? `Địa chỉ giao: ${clinic.address}` : null, `Liên hệ nhận hàng: ${clinic.hotline || ''}`]),
        party('Nhà cung cấp', [s.name, s.tax_code ? `MST: ${s.tax_code}` : null, s.contact_name ? `Người liên hệ: ${s.contact_name}` : null, s.phone ? `Điện thoại: ${s.phone}` : null, s.email ? `Email: ${s.email}` : null, s.address ? `Địa chỉ: ${s.address}` : null]),
      ], columnGap: 20, margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1, widths: [22, '*', 60, 50, 75, 85],
          body: [
            ['STT', 'Sản phẩm', 'Đơn vị', 'Số lượng', 'Đơn giá', 'Thành tiền'].map((t) => ({ text: t, bold: true, fillColor: '#f0fdfa' })),
            ...items.map((i, k) => [String(k + 1), i.name, i.unit || '', { text: String(i.quantity), alignment: 'right' }, { text: money(i.unit_cost), alignment: 'right' }, { text: i.unit_cost != null && i.unit_cost !== '' ? money(Number(i.unit_cost) * Number(i.quantity)) : '—', alignment: 'right' }]),
            [{ text: 'Tổng giá trị dự kiến', colSpan: 5, bold: true, alignment: 'right' }, {}, {}, {}, {}, { text: money(total), bold: true, alignment: 'right' }],
          ],
        },
        layout: { hLineColor: () => '#d1d5db', vLineColor: () => '#d1d5db' },
      },
      { text: `Ngày giao mong muốn: ${d.expected_date ? dmy(d.expected_date) : 'Thỏa thuận'}`, margin: [0, 10, 0, 2] },
      d.note ? { text: `Ghi chú: ${d.note}`, margin: [0, 0, 0, 2] } : null,
      { text: 'Yêu cầu khi giao hàng', bold: true, margin: [0, 10, 0, 3] },
      { ul: [
        'Ghi rõ số lô, ngày sản xuất, hạn sử dụng của từng sản phẩm; hàng nhập khẩu có nhãn phụ tiếng Việt.',
        'Kèm phiếu giao hàng / hóa đơn. Phòng khám kiểm đếm, kiểm tra tình trạng khi nhận và gửi biên bản nếu có chênh lệch.',
        'Hàng móp vỡ, rò rỉ, mất niêm phong, sai sản phẩm hoặc hạn sử dụng còn lại quá ngắn sẽ được trả lại hoặc yêu cầu đổi.',
      ], fontSize: 9.5 },
      { columns: [
        { width: '*', text: '' },
        { width: 200, stack: [{ text: 'Người lập đơn', bold: true, alignment: 'center' }, { text: '(đã duyệt trên hệ thống)', italics: true, fontSize: 8.5, alignment: 'center' }, { text: d.created_by_name || '', alignment: 'center', margin: [0, 28, 0, 0] }] },
      ], margin: [0, 24, 0, 0] },
    ].filter(Boolean),
  };
};

const renderPurchaseOrderPdf = (data) => new Promise((resolve, reject) => {
  const doc = printer.createPdfKitDocument(buildDoc(data));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  doc.end();
});

module.exports = { renderPurchaseOrderPdf };
