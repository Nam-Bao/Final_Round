const jwt = require('jsonwebtoken');
const { ChatSession, ChatMessage } = require('./models');
const { getSecret } = require('./middlewares/auth.middleware.js');

const MAX_CHATS = 5;
let onlineConsultants = new Map(); // consultantSocketId -> { userId, isReady, activeChats }
let waitingQueue = [];             // [{ socketId, customerId }]
let activeChats = new Map();       // customerSocketId -> consultantSocketId
// sessionId -> { customerSocket, consultantSocket, customerId }
// Server tự nắm ai thuộc phiên nào => không tin senderType/toSocketId do client gửi lên
let sessions = new Map();

module.exports = function(io) {
  // Xác thực khi kết nối: có token hợp lệ thì gắn socket.user, không có thì là khách vãng lai
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    socket.user = null;
    if (token) {
      try { socket.user = jwt.verify(token, getSecret()); } catch (e) { /* token hỏng => khách vãng lai */ }
    }
    next();
  });

  // Gán 1 khách cho 1 CSKH: tạo phiên trong DB, báo cho 2 bên. Lỗi DB thì trả lại slot cho CSKH.
  async function assignCustomer(customer, cskhSocketId, cskhData, acceptMessage) {
    activeChats.set(customer.socketId, cskhSocketId);
    cskhData.activeChats += 1;
    try {
      const session = await ChatSession.create({
        customer_id: customer.customerId,
        consultant_id: cskhData.userId,
        status: 'ACTIVE'
      });
      sessions.set(session.id, { customerSocket: customer.socketId, consultantSocket: cskhSocketId, customerId: customer.customerId });
      io.to(customer.socketId).emit('chat_accepted', { sessionId: session.id, message: acceptMessage });
      io.to(cskhSocketId).emit('new_customer_assigned', { sessionId: session.id, customerId: customer.customerId, customerSocket: customer.socketId });
    } catch (dbError) {
      console.error("LỖI LƯU SESSION:", dbError.message);
      activeChats.delete(customer.socketId);
      cskhData.activeChats = Math.max(0, cskhData.activeChats - 1);
      io.to(customer.socketId).emit('system_message', 'Không thể kết nối CSKH lúc này, vui lòng thử lại sau.');
    }
  }

  // HÀM QUÉT HÀNG ĐỢI: CSKH còn bao nhiêu slot trống thì nhận bấy nhiêu khách
  async function checkQueue() {
    for (let [cskhSocketId, cskhData] of onlineConsultants.entries()) {
      while (cskhData.isReady && cskhData.activeChats < MAX_CHATS && waitingQueue.length > 0) {
        const nextCustomer = waitingQueue.shift();
        await assignCustomer(nextCustomer, cskhSocketId, cskhData, 'Đã kết nối với CSKH mới!');
      }
    }
  }

  io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    // 1. CSKH ONLINE: chỉ tài khoản CONSULTANT thật (theo token) mới được nhận khách
    socket.on('consultant_online', async () => {
      if (socket.user?.role !== 'CONSULTANT') {
        return socket.emit('system_message', 'Bạn không có quyền nhận khách (cần đăng nhập tài khoản CSKH).');
      }
      onlineConsultants.set(socket.id, {
         userId: socket.user.id,
         isReady: true,
         activeChats: 0
      });
      console.log(`👨‍💼 CSKH ${socket.user.id} đã sẵn sàng nhận khách.`);
      checkQueue();
    });

    // Sự kiện Gạt nút BẬN/SẴN SÀNG
    socket.on('consultant_toggle_status', (data) => {
      const cskh = onlineConsultants.get(socket.id);
      if (cskh) {
          cskh.isReady = !!data?.isReady;
          if (cskh.isReady) checkQueue();
      }
    });

    // 2. KHÁCH YÊU CẦU CHAT: định danh khách lấy từ token, không lấy từ dữ liệu client gửi
    socket.on('request_human_chat', async () => {
      if (activeChats.has(socket.id) || waitingQueue.some(q => q.socketId === socket.id)) return; // tránh bấm nhiều lần
      const customer = { socketId: socket.id, customerId: socket.user?.role === 'CUSTOMER' ? socket.user.id : null };

      let bestCSKH = null;
      let minChats = MAX_CHATS;
      for (let [cskhSocketId, cskhData] of onlineConsultants.entries()) {
        if (cskhData.isReady && cskhData.activeChats < minChats) {
          minChats = cskhData.activeChats;
          bestCSKH = cskhSocketId;
        }
      }

      if (bestCSKH && waitingQueue.length === 0) {
        await assignCustomer(customer, bestCSKH, onlineConsultants.get(bestCSKH), 'Đã kết nối với bộ phận CSKH!');
      } else {
        waitingQueue.push(customer);
        io.to(socket.id).emit('system_message', 'Các tư vấn viên đều đang bận. Bạn vui lòng đợi trong giây lát, hệ thống sẽ kết nối ngay khi có người rảnh ạ!');
        checkQueue();
      }
    });

    // 3. CHUYỂN TIN NHẮN: chỉ 2 thành viên của phiên mới gửi được, vai trò do server xác định
    socket.on('send_message', async (data) => {
       const session = data?.sessionId && sessions.get(data.sessionId);
       if (!session || !data.content) return;

       let senderType, receiverSocket;
       if (socket.id === session.customerSocket) { senderType = 'CUSTOMER'; receiverSocket = session.consultantSocket; }
       else if (socket.id === session.consultantSocket) { senderType = 'CONSULTANT'; receiverSocket = session.customerSocket; }
       else return; // không thuộc phiên này

       const content = String(data.content).slice(0, 2000);
       try {
           await ChatMessage.create({ session_id: data.sessionId, sender_type: senderType, content });
           io.to(receiverSocket).emit('receive_message', { sessionId: data.sessionId, senderType, content });
       } catch (dbError) {
           console.error("LỖI LƯU TIN NHẮN:", dbError.message);
       }
    });

    // 4. CSKH CHỦ ĐỘNG ĐÓNG PHIÊN: chỉ CSKH đang giữ phiên mới đóng được
    socket.on('close_session', async (data) => {
       const sessionId = data?.sessionId;
       const session = sessionId && sessions.get(sessionId);
       if (!session || session.consultantSocket !== socket.id) return;

       try {
           await ChatSession.update({ status: 'CLOSED' }, { where: { id: sessionId } });
       } catch (e) { console.error("LỖI ĐÓNG SESSION:", e.message); }

       const cskh = onlineConsultants.get(socket.id);
       if (cskh) cskh.activeChats = Math.max(0, cskh.activeChats - 1);
       activeChats.delete(session.customerSocket);
       sessions.delete(sessionId);

       io.to(session.customerSocket).emit('system_message', 'Phiên tư vấn đã kết thúc. Cảm ơn bạn!');
       io.to(session.customerSocket).emit('session_closed');
       checkQueue();
    });

    // 5. CỨU HỘ KHI RỚT MẠNG ĐỘT NGỘT
    socket.on('disconnect', () => {
      const isConsultant = onlineConsultants.has(socket.id);

      if (isConsultant) {
         for (let [sessionId, s] of sessions.entries()) {
             if (s.consultantSocket === socket.id) {
                 io.to(s.customerSocket).emit('system_message', 'Tư vấn viên của bạn vừa bị rớt mạng. Hệ thống đang chuyển bạn sang tư vấn viên khác, vui lòng đợi...');
                 // Giữ lại customerId để phiên mới vẫn biết là khách nào
                 waitingQueue.unshift({ socketId: s.customerSocket, customerId: s.customerId });
                 activeChats.delete(s.customerSocket);
                 sessions.delete(sessionId);
                 ChatSession.update({ status: 'CLOSED' }, { where: { id: sessionId } }).catch(() => {});
             }
         }
         onlineConsultants.delete(socket.id);
         checkQueue();
      } else {
         const cskhId = activeChats.get(socket.id);
         if (cskhId) {
            const cskh = onlineConsultants.get(cskhId);
            if (cskh) cskh.activeChats = Math.max(0, cskh.activeChats - 1);
            io.to(cskhId).emit('system_message', 'Khách hàng đã rời khỏi cuộc trò chuyện (Rớt mạng/Tắt web).');
         }
         for (let [sessionId, s] of sessions.entries()) {
            if (s.customerSocket === socket.id) {
               sessions.delete(sessionId);
               ChatSession.update({ status: 'CLOSED' }, { where: { id: sessionId } }).catch(() => {});
            }
         }
         activeChats.delete(socket.id);
         waitingQueue = waitingQueue.filter(q => q.socketId !== socket.id);
         if (cskhId) checkQueue();
      }
    });
  });
};
