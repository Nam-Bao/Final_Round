const jwt = require('jsonwebtoken');
const { ChatSession, ChatMessage } = require('./models');

const MAX_CHATS = 5;
const MAX_MESSAGE_LENGTH = 2000;
const CONSULTANT_ROLES = ['CONSULTANT'];

// Toàn bộ trạng thái do server giữ — KHÔNG tin userId / socketId / senderType client gửi lên
const consultants = new Map(); // socketId -> { userId, isReady, sessionIds: Set, pending: số phiên đang tạo }
const sessions = new Map();    // sessionId -> { customerSocket, consultantSocket, customerId }
let waitingQueue = [];         // [socketId của khách đang chờ]

module.exports = function(io) {
  // Xác thực khi kết nối: bắt buộc đăng nhập (khách hoặc CSKH); không có token / token sai -> từ chối
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Vui lòng đăng nhập để chat với CSKH'));
    try {
      const { id, role } = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.user = { id, role };
      next();
    } catch {
      next(new Error('Token không hợp lệ'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    // 1. CSKH ONLINE — chỉ tài khoản CONSULTANT đã đăng nhập
    socket.on('consultant_online', () => {
      if (!user || !CONSULTANT_ROLES.includes(user.role)) {
        return socket.emit('system_message', 'Bạn không có quyền nhận chat CSKH.');
      }
      consultants.set(socket.id, { userId: user.id, isReady: true, sessionIds: new Set(), pending: 0 });
      checkQueue();
    });

    // Sự kiện Gạt nút BẬN/SẴN SÀNG
    socket.on('consultant_toggle_status', (data) => {
      const cskh = consultants.get(socket.id);
      if (!cskh) return;
      cskh.isReady = Boolean(data?.isReady);
      if (cskh.isReady) checkQueue();
    });

    // 2. KHÁCH YÊU CẦU CHAT — customer_id lấy từ token
    socket.on('request_human_chat', async () => {
      if (consultants.has(socket.id) || findSessionByCustomerSocket(socket.id) || waitingQueue.includes(socket.id)) return;

      const bestCSKH = findAvailableConsultant();
      if (bestCSKH) {
        await assignSession(socket.id, bestCSKH, 'Đã kết nối với bộ phận CSKH!');
      } else {
        waitingQueue.push(socket.id);
        socket.emit('system_message', 'Các tư vấn viên đều đang bận. Bạn vui lòng đợi trong giây lát, hệ thống sẽ kết nối ngay khi có người rảnh ạ!');
      }
    });

    // 3. CHUYỂN TIN NHẮN — chỉ người trong phiên mới gửi được, người nhận & vai trò do server xác định
    socket.on('send_message', async (data) => {
      const session = sessions.get(data?.sessionId);
      if (!session) return;

      let senderType;
      let receiverSocket;
      if (session.customerSocket === socket.id) {
        senderType = 'CUSTOMER';
        receiverSocket = session.consultantSocket;
      } else if (session.consultantSocket === socket.id) {
        senderType = 'CONSULTANT';
        receiverSocket = session.customerSocket;
      } else {
        return; // không thuộc phiên này
      }

      const content = String(data.content || '').trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!content) return;

      try {
        await ChatMessage.create({ session_id: data.sessionId, sender_type: senderType, content });
        io.to(receiverSocket).emit('receive_message', { sessionId: data.sessionId, senderType, content });
      } catch (dbError) {
        console.error('LỖI LƯU TIN NHẮN:', dbError.message);
      }
    });

    // 4. CSKH CHỦ ĐỘNG ĐÓNG PHIÊN — chỉ CSKH đang phụ trách phiên đó
    socket.on('close_session', async (data) => {
      const session = sessions.get(data?.sessionId);
      if (!session || session.consultantSocket !== socket.id) return;

      try {
        await ChatSession.update({ status: 'CLOSED' }, { where: { id: data.sessionId } });
      } catch (e) {}

      endSession(data.sessionId);
      io.to(session.customerSocket).emit('system_message', 'Phiên tư vấn đã kết thúc. Cảm ơn bạn!');
      io.to(session.customerSocket).emit('session_closed');
      checkQueue();
    });

    // 5. CỨU HỘ KHI RỚT MẠNG ĐỘT NGỘT
    socket.on('disconnect', async () => {
      const cskh = consultants.get(socket.id);
      if (cskh) {
        // Khách của CSKH này quay lại đầu hàng chờ để chuyển sang người khác
        for (const sessionId of cskh.sessionIds) {
          const session = sessions.get(sessionId);
          sessions.delete(sessionId);
          ChatSession.update({ status: 'CLOSED' }, { where: { id: sessionId } }).catch(() => {});
          if (session) {
            io.to(session.customerSocket).emit('system_message', 'Tư vấn viên của bạn vừa bị rớt mạng. Hệ thống đang chuyển bạn sang tư vấn viên khác, vui lòng đợi...');
            waitingQueue.unshift(session.customerSocket);
          }
        }
        consultants.delete(socket.id);
        checkQueue();
        return;
      }

      waitingQueue = waitingQueue.filter(id => id !== socket.id);
      const sessionId = findSessionByCustomerSocket(socket.id);
      if (sessionId) {
        const session = sessions.get(sessionId);
        endSession(sessionId);
        ChatSession.update({ status: 'CLOSED' }, { where: { id: sessionId } }).catch(() => {});
        io.to(session.consultantSocket).emit('system_message', 'Khách hàng đã rời khỏi cuộc trò chuyện (Rớt mạng/Tắt web).');
        checkQueue();
      }
    });
  });

  function findAvailableConsultant() {
    let best = null;
    let minChats = MAX_CHATS;
    for (const [socketId, cskh] of consultants.entries()) {
      const load = cskh.sessionIds.size + cskh.pending;
      if (cskh.isReady && load < minChats) {
        minChats = load;
        best = socketId;
      }
    }
    return best;
  }

  function findSessionByCustomerSocket(customerSocket) {
    for (const [sessionId, s] of sessions.entries()) if (s.customerSocket === customerSocket) return sessionId;
    return null;
  }

  function endSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    consultants.get(session.consultantSocket)?.sessionIds.delete(sessionId);
    sessions.delete(sessionId);
  }

  async function assignSession(customerSocket, consultantSocket, message) {
    const customerUser = io.sockets.sockets.get(customerSocket)?.data.user;
    const customerId = customerUser?.role === 'CUSTOMER' ? customerUser.id : null;
    const cskh = consultants.get(consultantSocket);
    cskh.pending += 1; // giữ chỗ trước khi ghi DB để 2 khách cùng lúc không vượt MAX_CHATS
    try {
      const session = await ChatSession.create({ customer_id: customerId, consultant_id: cskh.userId, status: 'ACTIVE' });
      sessions.set(session.id, { customerSocket, consultantSocket, customerId });
      cskh.sessionIds.add(session.id);
      io.to(customerSocket).emit('chat_accepted', { sessionId: session.id, message });
      io.to(consultantSocket).emit('new_customer_assigned', { sessionId: session.id, customerId, customerSocket });
    } catch (dbError) {
      console.error('LỖI LƯU SESSION:', dbError.message);
    } finally {
      cskh.pending -= 1;
    }
  }

  // 6. HÀM QUÉT HÀNG ĐỢI: CSKH còn bao nhiêu slot trống thì nhận bấy nhiêu khách
  async function checkQueue() {
    let consultantSocket;
    while (waitingQueue.length > 0 && (consultantSocket = findAvailableConsultant())) {
      const nextCustomer = waitingQueue.shift();
      if (!io.sockets.sockets.has(nextCustomer)) continue; // khách đã thoát
      await assignSession(nextCustomer, consultantSocket, 'Đã kết nối với CSKH mới!');
    }
  }
};
