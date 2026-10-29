const crypto = require('crypto');

// Sinh Token04 của ZegoCloud (theo zego_server_assistant chính thức) để serverSecret không lộ ra frontend
const generateToken04 = (appId, userId, secret, effectiveTimeInSeconds, payload = '') => {
  const ctime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: crypto.randomInt(-2147483648, 2147483647),
    ctime,
    expire: ctime + effectiveTimeInSeconds,
    payload,
  };

  const algorithm = { 16: 'aes-128-cbc', 24: 'aes-192-cbc', 32: 'aes-256-cbc' }[Buffer.byteLength(secret)];
  if (!algorithm) throw new Error('ZEGO_SERVER_SECRET phải dài 16, 24 hoặc 32 ký tự');

  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const iv = Array.from({ length: 16 }, () => chars[crypto.randomInt(chars.length)]).join('');

  const cipher = crypto.createCipheriv(algorithm, secret, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokenInfo)), cipher.final()]);

  const expireBuf = Buffer.alloc(8);
  expireBuf.writeBigInt64BE(BigInt(tokenInfo.expire));
  const ivLenBuf = Buffer.alloc(2);
  ivLenBuf.writeUInt16BE(iv.length);
  const encLenBuf = Buffer.alloc(2);
  encLenBuf.writeUInt16BE(encrypted.length);

  return '04' + Buffer.concat([expireBuf, ivLenBuf, Buffer.from(iv), encLenBuf, encrypted]).toString('base64');
};

// Token chỉ có quyền vào đúng 1 phòng (privilege 1 = đăng nhập phòng, 2 = phát stream)
const generateRoomToken = (appId, userId, secret, roomId, effectiveTimeInSeconds) => {
  const payload = JSON.stringify({ room_id: roomId, privilege: { 1: 1, 2: 1 }, stream_id_list: null });
  return generateToken04(appId, userId, secret, effectiveTimeInSeconds, payload);
};

module.exports = { generateToken04, generateRoomToken };
