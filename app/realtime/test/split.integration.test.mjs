import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { io } from 'socket.io-client';
process.loadEnvFile('.env');
const api = process.env.TEST_API_URL || 'http://127.0.0.1:3002';
const realtime = process.env.TEST_REALTIME_URL || 'http://127.0.0.1:3003';

test('split service: sockets, REST broadcast, presence and live revocation', { timeout: 30000 }, async () => {
 await mongoose.connect(process.env.MONGODB_URI);
 const db = mongoose.connection;
 const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
 const jwt = new JwtService({ secret: process.env.JWT_SECRET });
 const tokens = ids.map((id, i) => jwt.sign({ sub: String(id), email: 'test-' + id + '@example.test', role: i ? 'agent' : 'admin', ver: 0, scope: 'agent' }, { expiresIn: 120 }));
 let siteId; const sockets = [];
 async function request(path, method = 'GET', body, token = tokens[0]) {
  const response = await fetch(api + '/api' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
 }
 const event = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(name, handler); reject(new Error('No event: ' + name)); }, 5000);
  const handler = (value) => { clearTimeout(timer); resolve(value); };
  socket.once(name, handler);
 });
 async function connect(token) {
  const socket = io(realtime, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false });
  sockets.push(socket); const ready = event(socket, 'ready'); socket.connect(); await ready; return socket;
 }
 try {
  assert.equal((await fetch(realtime + '/health')).status, 200);
  assert.equal((await fetch(realtime + '/api/sites')).status, 404);
  assert.equal((await fetch(api + '/socket.io/?EIO=4&transport=polling')).status, 404);
  await db.collection('users').insertMany(ids.map((id, i) => ({ _id: id, email: 'test-' + id + '@example.test', name: i ? 'Split member' : 'Split owner', role: i ? 'agent' : 'admin', passwordHash: 'unused', emailVerified: true, tokenVersion: 0 })));
  const site = await request('/sites', 'POST', { name: 'Temporary split service test' });
  assert.equal(site.status, 201); siteId = site.data.id;
  await request('/sites/' + siteId + '/members', 'POST', { userId: String(ids[1]) });
  const session = await request('/widget/session', 'POST', { publicKey: site.data.publicKey });
  assert.equal(session.status, 200); assert.ok(session.data.realtimeUrl.endsWith(':3003'));
  const cid = session.data.conversationId;
  const visitor = await connect(session.data.visitorToken);
  const member = await connect(tokens[1]);
  assert.equal((await member.timeout(5000).emitWithAck('conversation:join', { conversationId: cid })).ok, true);
  const maintenanceEvent = event(visitor, 'widget:maintenance');
  await request('/sites/' + siteId, 'PATCH', { active: false });
  assert.equal((await maintenanceEvent).maintenance, true);
  const blocked = await visitor.timeout(5000).emitWithAck('message:send', { body: 'blocked maintenance' });
  assert.equal(blocked.ok, false);
  const disabledSession = await request('/widget/session', 'POST', { publicKey: site.data.publicKey });
  assert.equal(disabledSession.data.code, 'WIDGET_MAINTENANCE');
  const restored = event(visitor, 'widget:maintenance');
  await request('/sites/' + siteId, 'PATCH', { active: true });
  assert.equal((await restored).maintenance, false);
  const newMessage = event(member, 'message:new');
  assert.equal((await visitor.timeout(5000).emitWithAck('message:send', { body: 'Message via standalone realtime' })).ok, true);
  assert.equal((await newMessage).body, 'Message via standalone realtime');
  const reply = event(visitor, 'message:new');
  const sent = await member.timeout(5000).emitWithAck('message:send', { conversationId: cid, body: 'Admin acknowledgement regression' });
  assert.equal(sent.ok, true);
  assert.equal(sent.message.body, 'Admin acknowledgement regression');
  assert.equal(sent.message.conversationId, cid);
  assert.ok(sent.message.id);
  assert.equal((await reply).id, sent.message.id);
  const note = event(visitor, 'message:new');
  assert.equal((await request('/conversations/' + cid + '/close', 'POST')).status, 200);
  assert.equal((await note).senderKind, 'system');
  await new Promise((resolve) => setTimeout(resolve, 3200));
  assert.equal((await request('/widget/availability', 'GET', undefined, session.data.visitorToken)).data.agentsOnline, true);
  const revoked = event(member, 'access:revoked');
  assert.equal((await request('/sites/' + siteId + '/members/' + ids[1], 'DELETE')).status, 200);
  assert.equal((await revoked).siteId, siteId);
  assert.equal((await member.timeout(5000).emitWithAck('conversation:join', { conversationId: cid })).ok, false);
  let leaked = false; member.on('message:new', () => { leaked = true; });
  await request('/conversations/' + cid + '/reopen', 'POST');
  await new Promise((resolve) => setTimeout(resolve, 150)); assert.equal(leaked, false);
  const expiredSession = event(member, 'error:auth');
  await db.collection('users').updateOne({ _id: ids[1] }, { $inc: { tokenVersion: 1 } });
  await expiredSession;
  assert.equal((await member.timeout(1000).emitWithAck('conversation:join', { conversationId: cid }).catch(() => ({ ok: false }))).ok, false);
 } finally {
  for (const socket of sockets) socket.close();
  if (siteId) {
   const id = new mongoose.Types.ObjectId(siteId);
   for (const name of ['messages', 'conversations', 'visitors', 'sitemembers']) await db.collection(name).deleteMany({ siteId: id });
   await db.collection('sites').deleteOne({ _id: id });
  }
  await db.collection('users').deleteMany({ _id: { $in: ids } });
  await mongoose.disconnect();
 }
});
