/* ثابت‌های مشترک: نقش‌ها، دسترسی‌ها، وضعیت سفارش و تنظیمات پیش‌فرض */

export const PALETTE = [
  ['#fde2e4', '#fbc4cf'], ['#e0ecff', '#c3d8ff'], ['#e3f6e8', '#c6ecd1'], ['#fff0d6', '#ffe0a8'],
  ['#e8e3ff', '#d3caff'], ['#ffe4d6', '#ffcdb2'], ['#e4e4e7', '#cfcfd6'], ['#fdecd2', '#f9d9a8'],
  ['#fff8c9', '#fdeb8a'], ['#f3e8ff', '#e4ccff'], ['#e6efe0', '#cfe0c3'], ['#dde7f3', '#bfd2ea'],
];

export const ORDER_STATUSES = {
  pending: 'در انتظار تأیید',
  processing: 'در حال آماده‌سازی',
  shipped: 'ارسال شده',
  delivered: 'تحویل شده',
  cancelled: 'لغو شده',
};

/* از هر وضعیت فقط به این وضعیت‌ها می‌شود رفت */
export const TRANSITIONS = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/* فهرست همه‌ی دسترسی‌ها. نقش مدیرکل همه را دارد. */
export const ALL_PERMISSIONS = [
  'dashboard.sales', 'dashboard.content', 'dashboard.admin',
  'products.manage', 'categories.manage', 'orders.manage', 'coupons.manage', 'customers.view',
  'content.manage', 'reviews.moderate', 'media.upload',
  'users.manage', 'settings.manage', 'audit.view',
];

export const ROLES = {
  admin: { label: 'مدیرکل', permissions: ALL_PERMISSIONS },
  manager: {
    label: 'مدیر فروش',
    permissions: ['dashboard.sales', 'products.manage', 'categories.manage', 'orders.manage', 'coupons.manage', 'customers.view', 'reviews.moderate', 'media.upload'],
  },
  editor: {
    label: 'ویرایشگر محتوا',
    permissions: ['dashboard.content', 'content.manage', 'reviews.moderate', 'media.upload'],
  },
  customer: { label: 'مشتری', permissions: [] },
};

export const ROLE_KEYS = Object.keys(ROLES);

export const DEFAULT_SETTINGS = {
  store_name: 'آلبالو',
  hero_badge: '🍒 ارسال رایگان برای خرید بالای ۳ میلیون تومان',
  hero_title: 'هر چه می‌خواهی، با خیال راحت بخر.',
  hero_subtitle: 'کالای اصل با ضمانت بازگشت ۷ روزه، بسته‌بندی دقیق و ارسال سریع به سراسر کشور.',
  announcement: '',
  footer_text: 'کالای اصل، بسته‌بندی دقیق و ارسال سریع؛ خریدی بی‌دغدغه.',
  contact_phone: '',
  contact_email: '',
  contact_address: '',
  free_shipping_from: 3000000,
  post_price: 60000,
  express_price: 150000,
};

/* هر گروه تنظیمات را چه کسی می‌تواند ویرایش کند */
export const SETTING_GROUPS = {
  content: {
    permission: 'content.manage',
    keys: ['hero_badge', 'hero_title', 'hero_subtitle', 'announcement', 'footer_text', 'contact_phone', 'contact_email', 'contact_address'],
  },
  store: {
    permission: 'settings.manage',
    keys: ['store_name', 'free_shipping_from', 'post_price', 'express_price'],
  },
};
