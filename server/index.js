import { createApp } from './app.js';
import { seedIfEmpty, DEMO_ACCOUNTS } from './seed.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

const seeded = await seedIfEmpty();
if (seeded && process.env.NODE_ENV !== 'production') {
  console.log('\nداده‌ی نمونه ساخته شد. حساب‌های آزمایشی (فقط برای توسعه‌ی محلی):');
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(9)} ${a.email}`);
  console.log('  گذرواژه‌ها در README.md آمده است.\n');
}

createApp().listen(port, host, () => {
  console.log(`فروشگاه آلبالو روی http://${host === '0.0.0.0' ? 'localhost' : host}:${port} در حال اجراست`);
});
