import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ["chat/chat.service.ts","chat/history-cursor.ts","chat/conversation.schema.ts","chat/message.schema.ts","chat/visitor.schema.ts","sites/sites.service.ts","sites/site.schema.ts","sites/site-member.schema.ts","users/users.service.ts","users/user.schema.ts","auth/jwt-payload.type.ts","widget/widget.service.ts","realtime/agent-registry.service.ts","realtime/realtime-bus.service.ts","realtime/rate-limiter.service.ts","realtime/redis-bridge.service.ts","realtime/realtime-shared.module.ts","realtime/rooms.ts"];
for (const file of files) {
 const target = resolve(here, 'src/shared', file);
 await mkdir(dirname(target), { recursive: true });
 await writeFile(target, await readFile(resolve(here, '../api/src', file)));
}
console.log('Prepared shared domain sources from api; no REST controllers copied.');
