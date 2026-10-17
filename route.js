/* =====================================================================
   route.js — منطق خالصِ «مسیر و ویزیت» (بدون صفحه، بدون Firebase).
   مثل core.js جدا تست می‌شود. هیچ‌چیز از حساب‌داری (فروش، پرداخت، مانده) را عوض نمی‌کند.

   مدل داده (حداقلی):
     routes/{id}  : { id, name, weekday(0=یکشنبه … 6=شنبه), active }
     customers    : فقط دو فیلد تازه — routeId (مسیر پیش‌فرض)، routeOrder (ترتیب دستی)
     visits/{id}  : { id, date, ts, customerId, customerName, routeId, routeName,
                      planned, status, note }
                    شناسهٔ ویزیت = «v_تاریخ_شناسهٔ‌مشتری» → لمسِ دوباره = تصحیحِ همان ویزیت، نه رکورد تکراری.
                    routeId/routeName/customerName «عکسِ لحظه» هستند تا تغییرِ بعدیِ مسیر مشتری، گزارش گذشته را خراب نکند.
   ===================================================================== */
import { weekdayIndex, addDaysISO } from './core.js';

/* هفتهٔ کاری از شنبه شروع می‌شود؛ weekday همان شمارهٔ core.js است (۰=یکشنبه … ۶=شنبه) */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
export const WEEKDAY_FA = { 6:'شنبه', 0:'یکشنبه', 1:'دوشنبه', 2:'سه‌شنبه', 3:'چهارشنبه', 4:'پنجشنبه', 5:'جمعه' };

/* وضعیت‌های مرحلهٔ ۱. (مرحلهٔ ۲ «فروخت» و «پول گرفت» را اضافه می‌کند.) */
export const VISIT_STATUSES = ['no_order', 'closed', 'revisit'];
export const VISIT_STATUS_FA = { no_order:'سفارش نداد', closed:'دکان بسته بود', revisit:'مراجعه مجدد' };
export const VISIT_WINDOW_DAYS = 90;

function str(v){ return v == null ? '' : String(v); }
function num(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
const SAFE_ID = /[^A-Za-z0-9_.:\-]/g;

/* شناسهٔ ثابت ویزیت: یک مشتری در یک روز = یک ویزیت */
export function visitId(date, customerId){
  return 'v_' + str(date).replace(SAFE_ID, '') + '_' + str(customerId).replace(SAFE_ID, '');
}
/* فقط ۹۰ روز اخیر همگام می‌شود (بهینه‌سازی؛ چیزی حذف نمی‌شود) */
export function visitWindowStart(today){ return addDaysISO(today, -VISIT_WINDOW_DAYS); }

export function isActiveRoute(r){ return !!r && r.active !== false; }
export function routeWeekday(r){ return Math.min(6, Math.max(0, Math.floor(num(r && r.weekday)))); }

/* مسیرهای فعالِ برنامهٔ یک تاریخ (به‌وقت کسب‌وکار؛ تاریخ را خود برنامه با todayISO می‌دهد) */
export function routesForDate(routes, dateISO){
  const wd = weekdayIndex(dateISO);
  return (routes || []).filter(r => isActiveRoute(r) && routeWeekday(r) === wd)
    .sort((a, b) => str(a.name).localeCompare(str(b.name), 'fa'));
}
/* همهٔ مسیرها به ترتیب هفتهٔ کاری (شنبه اول) */
export function routesByWeek(routes){
  const rank = r => WEEK_ORDER.indexOf(routeWeekday(r));
  return [...(routes || [])].sort((a, b) => (isActiveRoute(b) - isActiveRoute(a)) || (rank(a) - rank(b)) || str(a.name).localeCompare(str(b.name), 'fa'));
}

/* مشتریان یک مسیر به ترتیب دستی؛ بدون ترتیب، آخر می‌روند (با نام مرتب) */
export function plannedCustomers(customers, routeId){
  if(!routeId) return [];
  return (customers || []).filter(c => c && c.routeId === routeId)
    .sort((a, b) => {
      const oa = num(a.routeOrder) > 0 ? num(a.routeOrder) : 1e9;
      const ob = num(b.routeOrder) > 0 ? num(b.routeOrder) : 1e9;
      return (oa - ob) || str(a.name).localeCompare(str(b.name), 'fa');
    });
}
export function nextRouteOrder(customers, routeId){
  return plannedCustomers(customers, routeId).reduce((m, c) => Math.max(m, num(c.routeOrder)), 0) + 1;
}

/* آخرین ویزیت هر مشتری (جدیدترین تاریخ، بعد ts) */
export function lastVisitByCustomer(visits){
  const map = new Map();
  (visits || []).forEach(v => {
    if(!v || !v.customerId) return;
    const cur = map.get(v.customerId);
    if(!cur || str(v.date) > str(cur.date) || (v.date === cur.date && num(v.ts) > num(cur.ts))) map.set(v.customerId, v);
  });
  return map;
}
/* آخرین خرید هر مشتری از روی فاکتورهای فروشِ باطل‌نشده — فقط خواندن، هیچ چیز تغییر نمی‌کند */
export function lastPurchaseByCustomer(sales){
  const map = new Map();
  (sales || []).forEach(s => {
    if(!s || !s.customerId || s.status === 'cancelled') return;
    const d = str(s.date).slice(0, 10);
    if(d && (!map.has(s.customerId) || d > map.get(s.customerId))) map.set(s.customerId, d);
  });
  return map;
}
/* ویزیت‌های یک تاریخ: customerId → visit */
export function visitsOnDate(visits, date){
  const map = new Map();
  (visits || []).forEach(v => { if(v && v.date === date && v.customerId) map.set(v.customerId, v); });
  return map;
}

/* پیشرفت: «مراجعه مجدد» یعنی هنوز کارش تمام نشده → در انتظار حساب می‌شود */
export function routeProgress(planned, visitMap){
  const total = (planned || []).length;
  const p = { total, done: 0, pending: 0, noOrder: 0, closed: 0, revisit: 0, percent: 0 };
  (planned || []).forEach(c => {
    const v = visitMap && visitMap.get(c.id);
    if(!v) return;
    if(v.status === 'revisit') p.revisit++;
    else { p.done++; if(v.status === 'no_order') p.noOrder++; else if(v.status === 'closed') p.closed++; }
  });
  p.pending = total - p.done;
  p.percent = total > 0 ? Math.round((p.done / total) * 100) : 0;
  return p;
}

/* ساخت رکورد ویزیت. existing اگر باشد، ثبتِ‌کنندهٔ اول و ts اول حفظ می‌شود (تصحیح، نه رکورد تازه). */
export function buildVisit({ date, customer, route, status, note, ts, existing }){
  if(!customer || !customer.id) throw new Error('مشتری پیدا نشد.');
  if(VISIT_STATUSES.indexOf(status) < 0) throw new Error('وضعیت ویزیت نامعتبر است.');
  const planned = !!route && isActiveRoute(route) && routeWeekday(route) === weekdayIndex(date);
  return {
    id: visitId(date, customer.id),
    date,
    ts: existing && existing.ts ? existing.ts : (ts || Date.now()),
    customerId: customer.id,
    customerName: str(customer.name),
    routeId: route ? route.id : '',
    routeName: route ? str(route.name) : '',
    planned,
    status,
    note: str(note).trim().slice(0, 300)
  };
}

/* جابه‌جایی یک مشتری در ترتیب مسیر؛ فقط تغییرها را برمی‌گرداند و همه را ۱..n شماره می‌زند */
export function reorderUpdates(customers, routeId, customerId, dir){
  const list = plannedCustomers(customers, routeId);
  const i = list.findIndex(c => c.id === customerId);
  const j = i + (dir < 0 ? -1 : 1);
  if(i < 0 || j < 0 || j >= list.length) return [];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  const out = [];
  next.forEach((c, k) => { if(num(c.routeOrder) !== k + 1) out.push({ id: c.id, routeOrder: k + 1 }); });
  return out;
}

/* انتخاب مشتریان یک مسیر: تازه‌انتخاب‌شده‌ها آخر صف می‌روند (حتی اگر از مسیر دیگر بیایند)،
   برداشته‌شده‌های همین مسیر آزاد می‌شوند. مشتریانِ دست‌نخورده هیچ تغییری نمی‌کنند. */
export function assignmentUpdates({ customers, routeId, selectedIds }){
  const sel = new Set(selectedIds || []);
  const out = [];
  let order = nextRouteOrder(customers, routeId);
  (customers || []).forEach(c => {
    if(!c || !c.id) return;
    const inRoute = c.routeId === routeId;
    if(sel.has(c.id) && !inRoute) out.push({ id: c.id, routeId, routeOrder: order++ });
    else if(!sel.has(c.id) && inRoute) out.push({ id: c.id, routeId: '', routeOrder: 0 });
  });
  return out;
}

export function validateRouteInput({ name, weekday }){
  const n = str(name).trim();
  if(!n) return 'نام مسیر را بنویسید.';
  if(n.length > 60) return 'نام مسیر خیلی بلند است.';
  const w = Number(weekday);
  if(!Number.isInteger(w) || w < 0 || w > 6) return 'روز هفته را انتخاب کنید.';
  return '';
}
