const { ChatSession, ChatMessage, User, Profile } = require('./models');

const MAX_CHATS = 5;
let onlineConsultants = new Map(); 
let waitingQueue = []; 
let activeChats = new Map(); 

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    // 1. CSKH ONLINE 
    socket.on('consultant_online', async (data) => {
      onlineConsultants.set(socket.id, { 
         userId: data.userId, 
         isReady: true, 
         activeChats: 0 
      });
      console.log(`👨‍💼 CSKH ${data.userId} đã sẵn sàng nhận khách.`);
      checkQueue(); 
    });

    // Sự kiện Gạt nút BẬN/SẴN SÀNG
    socket.on('consultant_toggle_status', (data) => {
      const cskh = onlineConsultants.get(socket.id);
      if (cskh) {
          cskh.isReady = data.isReady; 
          if (cskh.isReady) checkQueue(); 
      }
    });

    // 2. KHÁCH YÊU CẦU CHAT
    socket.on('request_human_chat', async (data) => {
      const validCustomerId = (data.customerId && data.customerId !== 'khach_vang_lai') ? data.customerId : null;
      
      let bestCSKH = null;
      let minChats = MAX_CHATS;

      for (let [cskhSocketId, cskhData] of onlineConsultants.entries()) {
        if (cskhData.isReady && cskhData.activeChats < minChats) {
          minChats = cskhData.activeChats;
          bestCSKH = cskhSocketId;
        }
      }

      if (bestCSKH) {
        activeChats.set(socket.id, bestCSKH);
        onlineConsultants.get(bestCSKH).activeChats += 1;
        
        try {
           const session = await ChatSession.create({ 
               customer_id: validCustomerId, 
               consultant_id: onlineConsultants.get(bestCSKH).userId, 
               status: 'ACTIVE' 
           });
           io.to(socket.id).emit('chat_accepted', { sessionId: session.id, message: 'Đã kết nối với bộ phận CSKH!' });
           io.to(bestCSKH).emit('new_customer_assigned', { sessionId: session.id, customerId: validCustomerId, customerSocket: socket.id });
        } catch (dbError) {
           console.error("LỖI LƯU SESSION:", dbError.message);
        }
      } else {
        waitingQueue.push({ socketId: socket.id, customerId: validCustomerId });
        io.to(socket.id).emit('system_message', 'Các tư vấn viên đều đang bận. Bạn vui lòng đợi trong giây lát, hệ thống sẽ kết nối ngay khi có người rảnh ạ!');
      }
    });

    // 3. CHUYỂN TIN NHẮN
    socket.on('send_message', async (data) => {
       // Chỉ lưu DB nếu có sessionId hợp lệ (Bảo vệ Database khi khách lỡ chat lúc đang chờ)
       if (!data.sessionId) return; 

       let receiverSocket = data.toSocketId;
       if (!receiverSocket) {
           receiverSocket = activeChats.get(socket.id); 
       }

       try {
           await ChatMessage.create({ session_id: data.sessionId, sender_type: data.senderType, content: data.content });
           
           if (receiverSocket) {
               io.to(receiverSocket).emit('receive_message', { sessionId: data.sessionId, senderType: data.senderType, content: data.content });
           }
       } catch (dbError) {}
    });

    // 4. CSKH CHỦ ĐỘNG ĐÓNG PHIÊN 
    socket.on('close_session', async (data) => {
       const { sessionId, customerSocketId } = data;
       try {
           await ChatSession.update({ status: 'CLOSED' }, { where: { id: sessionId } });
       } catch (e) {} 
       
       const cskh = onlineConsultants.get(socket.id);
       if (cskh) cskh.activeChats = Math.max(0, cskh.activeChats - 1);
       activeChats.delete(customerSocketId);
       
       io.to(customerSocketId).emit('system_message', 'Phiên tư vấn đã kết thúc. Cảm ơn bạn!');
       io.to(customerSocketId).emit('session_closed'); // TÍN HIỆU MỚI BÁO CHO FRONTEND
       checkQueue(); 
    });

    // 5. CỨU HỘ KHI RỚT MẠNG ĐỘT NGỘT 
    socket.on('disconnect', () => {
      const isConsultant = onlineConsultants.has(socket.id);

      if (isConsultant) {
         for (let [customerSockId, consultantSockId] of activeChats.entries()) {
             if (consultantSockId === socket.id) {
                 io.to(customerSockId).emit('system_message', 'Tư vấn viên của bạn vừa bị rớt mạng. Hệ thống đang chuyển bạn sang tư vấn viên khác, vui lòng đợi...');
                 waitingQueue.unshift({ socketId: customerSockId, customerId: null }); 
                 activeChats.delete(customerSockId);
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
         activeChats.delete(socket.id);
         waitingQueue = waitingQueue.filter(q => q.socketId !== socket.id);
         if (cskhId) checkQueue();
      }
    });

    // 6. HÀM QUÉT HÀNG ĐỢI (Đã sửa IF thành WHILE để hốt đủ 5 khách)
    async function checkQueue() {
      if (waitingQueue.length > 0) {
        for (let [cskhSocketId, cskhData] of onlineConsultants.entries()) {
          
          // SỬA IF THÀNH WHILE: CSKH còn bao nhiêu slot trống thì hốt bấy nhiêu khách
          while (cskhData.isReady && cskhData.activeChats < MAX_CHATS && waitingQueue.length > 0) {
            const nextCustomer = waitingQueue.shift();
            activeChats.set(nextCustomer.socketId, cskhSocketId);
            cskhData.activeChats += 1;
            
            try {
                const session = await ChatSession.create({ 
                    customer_id: nextCustomer.customerId, 
                    consultant_id: cskhData.userId, 
                    status: 'ACTIVE' 
                });
                io.to(nextCustomer.socketId).emit('chat_accepted', { sessionId: session.id, message: 'Đã kết nối với CSKH mới!' });
                io.to(cskhSocketId).emit('new_customer_assigned', { sessionId: session.id, customerId: nextCustomer.customerId, customerSocket: nextCustomer.socketId });
            } catch (dbError) {}
          }

        }
      }
    }
  });
};