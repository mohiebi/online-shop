/* داده‌ی اولیه: در حالت توسعه، فروشگاه نمونه با حساب‌های آزمایشی؛ در حالت production فقط مدیرکل */
import { fileURLToPath } from 'node:url';
import { get, run, db, tx } from './db.js';
import { hashPassword } from './auth.js';
import { PALETTE } from './constants.js';

/* حساب‌های آزمایشی فقط برای توسعه‌ی محلی‌اند و در production ساخته نمی‌شوند. */
export const DEMO_ACCOUNTS = [
  { role: 'admin', name: 'مدیر کل', email: 'admin@albaloo.test', password: 'Admin@12345' },
  { role: 'manager', name: 'مدیر فروش', email: 'manager@albaloo.test', password: 'Manager@12345' },
  { role: 'editor', name: 'ویرایشگر محتوا', email: 'editor@albaloo.test', password: 'Editor@12345' },
  { role: 'customer', name: 'سارا محمدی', email: 'customer@albaloo.test', password: 'Customer@12345', phone: '09121234567' },
];

const EXTRA_CUSTOMERS = [
  { name: 'رضا احمدی', email: 'reza@albaloo.test', phone: '09351112233' },
  { name: 'مریم کریمی', email: 'maryam@albaloo.test', phone: '09124445566' },
];

const CATEGORIES = ['لوازم دیجیتال', 'مد و پوشاک', 'خانه و آشپزخانه', 'لوازم تحریر'];

/* [عنوان، دسته(۰تا۳)، قیمت، قیمت قبلی، موجودی، ایموجی، رنگ، ویژه، توضیح، مشخصات] */
const PRODUCTS = [
  ['هدفون بی‌سیم نویزکنسلینگ', 0, 4850000, 5600000, 12, '🎧', 0, 1, 'هدفون اورایر با حذف فعال نویز، صدای دقیق و باتری ۳۰ ساعته؛ مناسب سفر، کار و تمرکز.', 'اتصال: بلوتوث ۵٫۳\nعمر باتری: تا ۳۰ ساعت\nحذف نویز: فعال (ANC)\nوزن: ۲۵۰ گرم'],
  ['ساعت هوشمند ورزشی', 0, 3290000, null, 8, '⌚', 1, 1, 'نمایشگر AMOLED روشن و شفاف، ردیابی ضربان قلب و خواب، و بیش از ۴۰ حالت تمرین.', 'نمایشگر: ۱٫۹ اینچ AMOLED\nمقاومت در برابر آب: ۵ ATM\nعمر باتری: تا ۷ روز\nسنسورها: ضربان قلب، اکسیژن خون'],
  ['پاوربانک ۲۰۰۰۰ میلی‌آمپر', 0, 1150000, 1350000, 25, '🔋', 2, 0, 'ظرفیت بالا با شارژ سریع ۲۲٫۵ واتی؛ موبایل شما را تا ۴ بار کامل شارژ می‌کند.', 'ظرفیت: ۲۰٬۰۰۰ میلی‌آمپرساعت\nشارژ سریع: ۲۲٫۵ وات\nدرگاه‌ها: USB-C و ۲ × USB-A\nوزن: ۳۸۰ گرم'],
  ['اسپیکر بلوتوثی ضدآب', 0, 1980000, null, 0, '🔊', 3, 0, 'اسپیکر قابل‌حمل با باس قوی و مقاوم در برابر آب و گردوغبار، مناسب کوه، ساحل و حیاط.', 'مقاومت: IP67\nعمر باتری: تا ۱۲ ساعت\nتوان: ۲۰ وات\nاتصال: بلوتوث ۵٫۱'],
  ['کوله‌پشتی ضدآب لپ‌تاپ', 1, 1290000, null, 15, '🎒', 4, 1, 'کوله‌پشتی سبک با جیب مخصوص لپ‌تاپ تا ۱۶ اینچ، پارچه ضدآب و بند کمری راحت.', 'ظرفیت: ۲۸ لیتر\nجای لپ‌تاپ: تا ۱۶ اینچ\nجنس: پلی‌استر ضدآب\nوزن: ۷۰۰ گرم'],
  ['کفش کتانی راحتی روزمره', 1, 2450000, 2900000, 6, '👟', 5, 1, 'کفش سبک با زیره طبی و رویه تنفس‌پذیر؛ برای پیاده‌روی طولانی و استفاده هر روزه.', 'جنس رویه: پارچه مش\nزیره: EVA ضدلغزش\nسایزها: ۳۹ تا ۴۴\nوزن: ۳۲۰ گرم (هر لنگه)'],
  ['عینک آفتابی پلاریزه', 1, 890000, null, 20, '🕶️', 6, 0, 'لنز پلاریزه با محافظ UV400 که تابش خیره‌کننده را کم می‌کند؛ فریم سبک و مقاوم.', 'لنز: پلاریزه، UV400\nفریم: TR90 انعطاف‌پذیر\nوزن: ۲۸ گرم\nهمراه: کیف و دستمال'],
  ['ماگ سرامیکی دست‌ساز', 2, 240000, null, 40, '☕', 7, 1, 'ماگ سرامیکی با لعاب مات و دسته راحت؛ هر قطعه با دست ساخته شده و کمی با دیگری فرق دارد.', 'حجم: ۳۵۰ میلی‌لیتر\nجنس: سرامیک\nشست‌وشو: مناسب ماشین ظرفشویی\nمایکروویو: بله'],
  ['چراغ مطالعه LED رومیزی', 2, 720000, null, 18, '💡', 8, 0, 'نور بدون سوسو با سه دمای رنگ و پنج سطح روشنایی؛ مناسب مطالعه و کار طولانی.', 'توان: ۹ وات\nدمای رنگ: ۲۷۰۰ تا ۶۵۰۰ کلوین\nتنظیم: لمسی\nدرگاه شارژ: USB-A'],
  ['تابه گرانیتی ۲۸ سانتی‌متر', 2, 1650000, 1890000, 9, '🍳', 5, 0, 'پوشش گرانیتی نچسب با توزیع یکنواخت گرما؛ با حداقل روغن هم غذا نمی‌چسبد.', 'قطر: ۲۸ سانتی‌متر\nپوشش: گرانیت نچسب\nسازگار با: گاز، برقی، القایی\nدسته: ضدحرارت'],
  ['شمع معطر سویا', 2, 380000, null, 30, '🕯️', 9, 0, 'شمع طبیعی از موم سویا با رایحه وانیل و چوب صندل، حدود ۴۵ ساعت سوزش.', 'وزن: ۲۰۰ گرم\nزمان سوزش: حدود ۴۵ ساعت\nرایحه: وانیل و صندل\nفتیله: نخ پنبه‌ای'],
  ['دفترچه یادداشت چرمی', 3, 320000, null, 35, '📓', 10, 1, 'دفترچه ۱۶۰ برگ با جلد چرم مصنوعی و کاغذ ضدلک‌شدگی؛ همراه همیشگی ایده‌هایتان.', 'تعداد برگ: ۱۶۰\nقطع: A5\nصفحه‌بندی: خط‌دار\nبستن: کش الاستیک'],
  ['خودکار فونتن فلزی', 3, 1450000, null, 10, '🖋️', 11, 0, 'قلم فونتن با نوک ایریدیوم و بدنه فلزی متعادل؛ نوشتن روان و ماندگار، در جعبه هدیه.', 'نوک: ایریدیوم، سایز M\nبدنه: فلز\nجوهر: کارتریجی و تلمبه‌ای\nهمراه: جعبه هدیه'],
  ['مداد رنگی ۴۸ رنگ', 3, 560000, 650000, 22, '🖍️', 1, 0, 'مغز نرم و پررنگ با رنگ‌دهی یکنواخت؛ مناسب طراحی حرفه‌ای و سرگرمی کودکان، در جعبه فلزی.', 'تعداد: ۴۸ رنگ\nمغز: نرم، ۳ میلی‌متر\nبسته‌بندی: جعبه فلزی\nسمی نیست: بله'],
];

const SPECS = (text) => JSON.stringify(text.split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const PAGES = [
  ['about', 'درباره ما', true, '## داستان آلبالو\n\nآلبالو با یک هدف ساده شروع شد: خرید اینترنتی که **قابل‌اعتماد** باشد. کالاها را خودمان انتخاب می‌کنیم، با دقت بسته‌بندی می‌کنیم و سریع ارسال می‌کنیم.\n\n## چرا آلبالو؟\n\n- کالای اصل و سالم\n- بازگشت ۷ روزه بدون سؤال\n- پشتیبانی هر روزه\n- ارسال سریع به سراسر کشور'],
  ['contact', 'تماس با ما', true, '## با ما در ارتباط باشید\n\nسؤال یا پیشنهادی دارید؟ از طریق راه‌های ارتباطی پایین صفحه با ما تماس بگیرید. تیم پشتیبانی همه‌روزه از ۹ صبح تا ۱۰ شب پاسخ‌گوست.'],
  ['shipping-returns', 'راهنمای ارسال و بازگشت کالا', true, '## روش‌های ارسال\n\n- **پست پیشتاز:** ۳ تا ۵ روز کاری، سراسر کشور\n- **پیک موتوری:** تحویل همان روز، فقط تهران\n\nسفارش‌های بالای ۳ میلیون تومان با پست پیشتاز **رایگان** ارسال می‌شوند.\n\n## بازگشت کالا\n\nتا ۷ روز پس از تحویل، در صورتی که کالا استفاده نشده و در بسته‌بندی اصلی باشد، می‌توانید آن را مرجوع کنید.'],
  ['terms', 'قوانین و مقررات', true, '## شرایط استفاده\n\nبا ثبت سفارش در فروشگاه، شرایط زیر را می‌پذیرید.\n\n- اطلاعات واردشده باید درست و کامل باشد.\n- قیمت و موجودی کالاها ممکن است بدون اطلاع قبلی تغییر کند.\n- پرداخت وجه هنگام تحویل سفارش انجام می‌شود.'],
];

const POSTS = [
  ['how-to-choose-headphones', 'راهنمای خرید هدفون؛ از کجا شروع کنیم؟', 'پیش از خرید هدفون، چند نکته‌ی مهم را باید بدانید؛ از نوع اتصال تا حذف نویز.', '## اول نیازتان را مشخص کنید\n\nهدفون برای **ورزش** با هدفون برای **کار در دفتر** فرق دارد. برای ورزش، سبکی و مقاومت در برابر تعریق مهم‌تر است.\n\n## نکته‌های فنی\n\n- **حذف نویز فعال (ANC):** برای سفر و محیط‌های شلوغ عالی است.\n- **عمر باتری:** حداقل ۲۰ ساعت را هدف بگیرید.\n- **نوع اتصال:** بلوتوث ۵ به بالا پایدارتر است.\n\n## جمع‌بندی\n\nبودجه‌تان را مشخص کنید و بین دو یا سه مدل مقایسه کنید.', true],
  ['home-office-tips', 'پنج ایده برای چیدمان میز کار راحت‌تر', 'میز کار مرتب و نور مناسب، تمرکز شما را چند برابر می‌کند.', '## ۱. نور درست\n\nیک چراغ مطالعه با نور بدون سوسو، چشم‌ها را کمتر خسته می‌کند.\n\n## ۲. فقط وسایل ضروری\n\nروی میز فقط چیزهایی بگذارید که هر روز استفاده می‌کنید.\n\n## ۳. یک نشانه‌ی دلنشین\n\nیک شمع معطر یا یک گلدان کوچک حال‌وهوای میز را عوض می‌کند.', true],
  ['notebook-habits', 'چرا یادداشت دستی هنوز کارآمد است؟', 'نوشتن با دست کمک می‌کند بهتر یاد بگیریم و بهتر فکر کنیم.', '## قدرت نوشتن با دست\n\nپژوهش‌ها نشان می‌دهد نوشتن دستی **یادآوری** را بهتر می‌کند.\n\n- هر روز ۵ دقیقه بنویسید.\n- ایده‌ها را سریع ثبت کنید.\n- هر هفته مرورشان کنید.', true],
  ['upcoming-sale', 'پیش‌نویس: جشنواره‌ی پاییزه', 'در حال تکمیل.', '## به‌زودی\n\nجزئیات جشنواره‌ی پاییزه به‌زودی اعلام می‌شود.', false],
];

const REVIEWS = [
  // [شماره محصول از ۱، نویسنده (0 سارا، 1 رضا، 2 مریم)، امتیاز، متن، وضعیت]
  [1, 0, 5, 'کیفیت صدا فوق‌العاده است و نویزگیرش واقعاً کار می‌کند.', 'approved'],
  [1, 1, 4, 'راحت و سبک؛ فقط کیفیت میکروفونش متوسط است.', 'approved'],
  [2, 1, 4, 'باتری خوبی دارد و نمایشگرش در آفتاب هم واضح است.', 'approved'],
  [3, 0, 5, 'سریع شارژ می‌کند، ارزش خرید دارد.', 'approved'],
  [3, 2, 4, 'کمی سنگین است ولی ظرفیتش عالی است.', 'approved'],
  [5, 0, 5, 'کوله‌ام عالی است؛ زیر باران هم لپ‌تاپ خشک ماند.', 'approved'],
  [5, 2, 5, 'جای کافی دارد و بندهایش راحت است.', 'approved'],
  [6, 1, 4, 'برای پیاده‌روی بسیار راحت است.', 'approved'],
  [8, 0, 5, 'ماگ بسیار زیبا و باکیفیت است.', 'approved'],
  [8, 2, 5, 'هدیه خریدم و خیلی پسند شد.', 'approved'],
  [9, 1, 4, 'نورش ملایم و بدون سوسو است.', 'approved'],
  [10, 2, 5, 'غذا اصلاً نمی‌چسبد؛ تمیز کردنش هم آسان است.', 'approved'],
  [11, 0, 5, 'بوی دل‌انگیزی دارد و خیلی طول می‌کشد.', 'approved'],
  [12, 1, 5, 'کاغذش عالی است و جلد شیکی دارد.', 'approved'],
  [14, 2, 5, 'رنگ‌ها زنده و پررنگ‌اند.', 'approved'],
  [7, 1, 3, 'پلاریزه است ولی فریمش کمی شل بود.', 'pending'],
];

const COUPONS = [
  ['ALBALOO10', 'percent', 10, 0, 0, true],
  ['WELCOME', 'fixed', 100000, 500000, 0, true],
  ['OLD50', 'percent', 50, 0, 0, false],
];

const TABLES = ['audit_log', 'order_events', 'order_items', 'orders', 'reviews', 'addresses', 'coupons', 'contents', 'products', 'categories', 'settings', 'sessions', 'users'];

export function resetAll() {
  tx(() => { for (const t of TABLES) run(`DELETE FROM ${t}`); });
}

const iso = (daysAgo, hour = 12) => {
  const d = new Date(Date.now() - daysAgo * 86400_000);
  d.setUTCHours(hour, 15, 0, 0);
  return d.toISOString();
};

async function seedDemo() {
  const userIds = {};
  for (const a of DEMO_ACCOUNTS) {
    userIds[a.email] = run(
      'INSERT INTO users (email, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      a.email, a.name, a.phone ?? null, await hashPassword(a.password), a.role,
    ).id;
  }
  const customers = [userIds['customer@albaloo.test']];
  for (const c of EXTRA_CUSTOMERS) {
    customers.push(run(
      "INSERT INTO users (email, name, phone, password_hash, role) VALUES (?, ?, ?, ?, 'customer')",
      c.email, c.name, c.phone, await hashPassword(DEMO_ACCOUNTS[3].password),
    ).id);
  }

  const catIds = CATEGORIES.map((title, i) => run('INSERT INTO categories (title, sort_order) VALUES (?, ?)', title, i).id);
  const productRows = PRODUCTS.map(([title, cat, price, oldPrice, stock, emoji, tint, featured, description, specs]) => {
    const id = run(
      `INSERT INTO products (title, category_id, price, old_price, stock, emoji, tint, featured, description, specs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, catIds[cat], price, oldPrice, stock, emoji, tint % PALETTE.length, featured, description, SPECS(specs),
    ).id;
    return { id, title, price, emoji, tint };
  });

  const editor = userIds['editor@albaloo.test'];
  for (const [slug, title, inMenu, body] of PAGES) {
    run(
      `INSERT INTO contents (type, slug, title, body, status, show_in_menu, author_id, published_at) VALUES ('page', ?, ?, ?, 'published', ?, ?, ?)`,
      slug, title, body, inMenu, editor, iso(30),
    );
  }
  POSTS.forEach(([slug, title, excerpt, body, published], i) => {
    run(
      `INSERT INTO contents (type, slug, title, excerpt, body, status, author_id, published_at) VALUES ('post', ?, ?, ?, ?, ?, ?, ?)`,
      slug, title, excerpt, body, published ? 'published' : 'draft', editor, published ? iso(10 - i * 3) : null,
    );
  });

  for (const [code, type, value, min, max, active] of COUPONS) {
    run('INSERT INTO coupons (code, type, value, min_total, max_uses, active) VALUES (?, ?, ?, ?, ?, ?)', code, type, value, min, max, active);
  }

  const sara = customers[0];
  run(
    'INSERT INTO addresses (user_id, title, name, phone, city, postal, address, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    sara, 'خانه', 'سارا محمدی', '09121234567', 'تهران', '1234567890', 'خیابان ولیعصر، کوچه گلستان، پلاک ۱۲، واحد ۴',
  );

  /* سفارش‌های نمونه روی چند روز گذشته؛ برای پر شدن داشبورد فروش */
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'pending', 'delivered', 'cancelled', 'delivered', 'pending'];
  const manager = userIds['manager@albaloo.test'];
  let seq = 1;
  const makeOrder = (userId, ownerName, ownerPhone, daysAgo, status, picks) => {
    const lines = picks.map(([pi, qty]) => ({ p: productRows[pi], qty }));
    const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
    const shipping = subtotal >= 3000000 ? 0 : 60000;
    const code = `AL-DEMO${String(seq++).padStart(3, '0')}`;
    const at = iso(daysAgo, 9 + (seq % 8));
    const { id } = run(
      `INSERT INTO orders (code, user_id, status, subtotal, discount, shipping_cost, total, shipping_method, name, phone, city, postal, address, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, 'post', ?, ?, 'تهران', '1234567890', 'تهران، خیابان ولیعصر، پلاک ۱۲', ?, ?)`,
      code, userId, status, subtotal, shipping, subtotal + shipping, ownerName, ownerPhone, at, at,
    );
    for (const { p, qty } of lines) {
      run('INSERT INTO order_items (order_id, product_id, title, price, qty, emoji, tint) VALUES (?, ?, ?, ?, ?, ?, ?)', id, p.id, p.title, p.price, qty, p.emoji, p.tint);
    }
    const flow = { pending: ['pending'], processing: ['pending', 'processing'], shipped: ['pending', 'processing', 'shipped'], delivered: ['pending', 'processing', 'shipped', 'delivered'], cancelled: ['pending', 'cancelled'] }[status];
    flow.forEach((s, i) => {
      run(
        'INSERT INTO order_events (order_id, status, note, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
        id, s, s === 'pending' ? 'سفارش ثبت شد' : '', s === 'pending' ? userId : manager, iso(daysAgo - i * 0.3 < 0 ? 0 : daysAgo - i * 0.3, 10 + i),
      );
    });
  };

  const names = [['سارا محمدی', '09121234567'], ['رضا احمدی', '09351112233'], ['مریم کریمی', '09124445566']];
  const picks = [[[0, 1], [7, 2]], [[4, 1]], [[2, 1], [11, 1]], [[5, 1]], [[1, 1]], [[9, 1], [10, 2]], [[8, 1], [13, 1]], [[6, 1]], [[12, 1]], [[0, 1]]];
  /* سفارش‌های سارا (مشتری آزمایشی): تحویل‌شده، ارسال‌شده، در انتظار */
  makeOrder(sara, names[0][0], names[0][1], 12, 'delivered', [[0, 1], [7, 2]]);
  makeOrder(sara, names[0][0], names[0][1], 6, 'delivered', [[4, 1], [10, 1]]);
  makeOrder(sara, names[0][0], names[0][1], 2, 'shipped', [[11, 2]]);
  makeOrder(sara, names[0][0], names[0][1], 0, 'pending', [[9, 1]]);
  picks.forEach((pk, i) => {
    const who = 1 + (i % 2);
    makeOrder(customers[who], names[who][0], names[who][1], 13 - i, statuses[i], pk);
  });

  for (const [pi, who, rating, body, status] of REVIEWS) {
    run('INSERT INTO reviews (product_id, user_id, rating, body, status) VALUES (?, ?, ?, ?, ?)', productRows[pi - 1].id, customers[who], rating, body, status);
  }

  run("INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, 'seed', 'system', NULL, 'داده‌ی نمونه ساخته شد')", userIds['admin@albaloo.test']);
}

async function seedProduction() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) {
    console.error('پایگاه داده خالی است. برای ساخت مدیرکل، متغیرهای ADMIN_EMAIL و ADMIN_PASSWORD (حداقل ۱۰ نویسه) را تنظیم کنید.');
    process.exit(1);
  }
  run("INSERT INTO users (email, name, password_hash, role) VALUES (?, 'مدیر کل', ?, 'admin')", email.toLowerCase(), await hashPassword(password));
  run('INSERT INTO categories (title, sort_order) VALUES (?, 0)', 'عمومی');
  console.log(`مدیرکل با ایمیل ${email} ساخته شد.`);
}

export async function seedIfEmpty() {
  if (get('SELECT COUNT(*) AS n FROM users').n > 0) return false;
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== '1') await seedProduction();
  else await seedDemo();
  return true;
}

/* اجرای مستقیم: node server/seed.js --reset */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--reset')) { resetAll(); console.log('داده‌های قبلی پاک شد.'); }
  const seeded = await seedIfEmpty();
  console.log(seeded ? 'داده‌ی اولیه ساخته شد.' : 'پایگاه داده خالی نبود؛ چیزی ساخته نشد. (برای پاک‌سازی: --reset)');
  db.close();
}
