import { Hono } from 'hono';
import type { AppEnv } from './types';
import { authRoute } from './routes/auth';
import { invitationsRoute } from './routes/invitations';
import { adminInvitationsRoute } from './routes/admin-invitations';
import { adminUsersRoute } from './routes/admin-users';
import { mePasskeysRoute } from './routes/me-passkeys';
import { coursesRoute } from './routes/courses';
import { novelsRoute } from './routes/novels';
import { requireSession } from './auth/session';

// Honoアプリのエントリポイント。各機能のルートをマウントするだけで、
// ルーティング自体のロジックはここに書かない。

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/auth', authRoute);
app.route('/api/invitations', invitationsRoute);
app.route('/api/admin/invitations', adminInvitationsRoute);
app.route('/api/admin/users', adminUsersRoute);
app.route('/api/courses', coursesRoute);
app.route('/api/novels', novelsRoute);

app.get('/api/me', requireSession, (c) => c.json({ user: c.get('user') }));
app.route('/api/me/passkeys', mePasskeysRoute);

export default app;
