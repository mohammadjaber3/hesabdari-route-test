import test from 'node:test';
import assert from 'node:assert/strict';
import { routeViewMethods, bindRouteViews } from '../routeviews.js';
import { todayISO, weekdayIndex } from '../core.js';

bindRouteViews({});
const wd = weekdayIndex(todayISO());
const mk = (over={}) => Object.assign(Object.create(routeViewMethods), {
  sub: null, routeUI: {}, routeSync: { routes:'ok', visits:'ok' },
  isPartner: () => false, isOwner: () => true, renderNoAccess: (w) => 'NOACCESS:' + w,
  state: { routes: [], visits: [], sales: [], customers: [] }
}, over);

test('بدون مسیر: صفحهٔ خالی با دکمهٔ ساخت مسیر (برای مالک)', () => {
  const h = mk().renderRoute();
  assert.match(h, /هنوز مسیری تعریف نشده/); assert.match(h, /ساخت مسیر/);
});

test('مسیر امروز: مشتری، بدهی، پیشرفت، دکمه‌های ویزیت؛ نام مخرب escape می‌شود', () => {
  const t = todayISO();
  const ctx = mk({ state: {
    routes: [{ id:'r1', name:'خالد چوک', weekday: wd }],
    customers: [
      { id:'c1', name:'<img src=x onerror=alert(1)>', routeId:'r1', routeOrder:1, balance:1500 },
      { id:'c2', name:'سوپر نور', routeId:'r1', routeOrder:2, balance:0 },
    ],
    visits: [{ id:'v_'+t+'_c2', date:t, customerId:'c2', customerName:'سوپر نور', status:'no_order', ts:1 }],
    sales: [{ customerId:'c1', date:t, status:'active' }]
  }});
  const h = ctx.renderRoute();
  assert.doesNotMatch(h, /<img src=x/);
  assert.match(h, /&lt;img/);
  assert.match(h, /بدهی 1,500/);                           // نشان بدهی برای c1
  assert.match(h, /1 از 2/);                                // یکی ویزیت شده
  assert.match(h, /سفارش نداد/); assert.match(h, /دکان بسته بود/); assert.match(h, /مراجعه مجدد/);
  assert.match(h, /آخرین خرید: امروز/);
  assert.doesNotMatch(h, /disabled/);
});

test('قوانین منتشر نشده: هشدار روشن و دکمه‌های ثبت غیرفعال', () => {
  const t = todayISO();
  const ctx = mk({ routeSync: { routes:'denied', visits:'denied' }, state: {
    routes: [{ id:'r1', name:'م', weekday: wd }], customers: [{ id:'c1', name:'الف', routeId:'r1' }], visits: [], sales: [] } });
  const h = ctx.renderRoute();
  assert.match(h, /هنوز در Firebase منتشر نشده/); assert.match(h, /disabled/);
});

test('شریک (partner): دکمهٔ مدیریت دیده نمی‌شود و مدیریت بسته است', () => {
  const ctx = mk({ isPartner: () => true, isOwner: () => false, state: {
    routes: [{ id:'r1', name:'م', weekday: wd }], customers: [{ id:'c1', name:'الف', routeId:'r1' }], visits: [], sales: [] } });
  assert.doesNotMatch(ctx.renderRoute(), /navigate\('route','manage'\)/);
  assert.equal(ctx.renderRouteManage(), 'NOACCESS:مدیریت مسیرها');
  assert.equal(ctx.renderRouteOrder(), 'NOACCESS:ترتیب مشتریان');
});

test('مدیریت مسیرها و ترتیب رندر می‌شوند', () => {
  const ctx = mk({ state: {
    routes: [{ id:'r1', name:'خالد چوک', weekday: 6 }, { id:'r2', name:'قدیمی', weekday: 0, active:false }],
    customers: [{ id:'c1', name:'الف', routeId:'r1', routeOrder:1 }, { id:'c2', name:'ب' }], visits: [], sales: [] } });
  const m = ctx.renderRouteManage();
  assert.match(m, /شنبه/); assert.match(m, /غیرفعال/); assert.match(m, /مشتری بدون مسیر: <b class="num">1/);
  ctx.routeUI = { routeId:'r1' };
  assert.match(ctx.renderRouteOrder(), /ترتیب «خالد چوک»/);
});
