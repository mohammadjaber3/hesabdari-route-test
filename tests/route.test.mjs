import test from 'node:test';
import assert from 'node:assert/strict';
import {
  visitId, routesForDate, routesByWeek, plannedCustomers, nextRouteOrder, lastVisitByCustomer,
  lastPurchaseByCustomer, visitsOnDate, routeProgress, buildVisit, reorderUpdates,
  assignmentUpdates, validateRouteInput, visitWindowStart
} from '../route.js';

// 2026-10-17 شنبه است (core.js: ۶=شنبه)
const SAT = '2026-10-17', SUN = '2026-10-18';
const routes = [
  { id:'r1', name:'خالد چوک', weekday:6 },
  { id:'r2', name:'علی چوپان', weekday:0 },
  { id:'r3', name:'قدیمی', weekday:6, active:false },
];
const customers = [
  { id:'c1', name:'ب', routeId:'r1', routeOrder:2, balance:100 },
  { id:'c2', name:'الف', routeId:'r1', routeOrder:1 },
  { id:'c3', name:'ج', routeId:'r1' },
  { id:'c4', name:'د', routeId:'r2', routeOrder:1 },
  { id:'c5', name:'ه' },
];

test('روز هفته و مسیرهای امروز (فقط فعال‌ها)', () => {
  assert.deepEqual(routesForDate(routes, SAT).map(r=>r.id), ['r1']);
  assert.deepEqual(routesForDate(routes, SUN).map(r=>r.id), ['r2']);
  assert.equal(routesByWeek(routes)[0].id, 'r1');                 // شنبه اول
  assert.equal(routesByWeek(routes).at(-1).id, 'r3');             // غیرفعال آخر
});

test('ترتیب دستی مشتریان؛ بدون ترتیب آخر می‌رود', () => {
  assert.deepEqual(plannedCustomers(customers, 'r1').map(c=>c.id), ['c2','c1','c3']);
  assert.deepEqual(plannedCustomers(customers, ''), []);
  assert.equal(nextRouteOrder(customers, 'r1'), 3);
});

test('شناسهٔ ویزیت ثابت و امن است (ضد تکرار)', () => {
  assert.equal(visitId(SAT,'c1'), visitId(SAT,'c1'));
  assert.notEqual(visitId(SAT,'c1'), visitId(SUN,'c1'));
  assert.equal(visitId('2026-10-17','a/b c'), 'v_2026-10-17_abc');
});

test('ساخت ویزیت: عکس لحظه، برنامه‌ای/خارج از برنامه، تصحیح بدون رکورد تازه', () => {
  const v = buildVisit({ date:SAT, customer:customers[0], route:routes[0], status:'no_order', ts:111 });
  assert.equal(v.planned, true); assert.equal(v.routeName, 'خالد چوک'); assert.equal(v.customerName, 'ب');
  const off = buildVisit({ date:SUN, customer:customers[0], route:routes[0], status:'closed', ts:5 });
  assert.equal(off.planned, false);                                // مسیرش امروز برنامه ندارد
  const none = buildVisit({ date:SAT, customer:customers[4], route:null, status:'revisit', ts:5 });
  assert.equal(none.routeId, ''); assert.equal(none.planned, false);
  const fix = buildVisit({ date:SAT, customer:customers[0], route:routes[0], status:'closed', ts:999, existing:v });
  assert.equal(fix.id, v.id); assert.equal(fix.ts, 111); assert.equal(fix.status, 'closed');
  assert.throws(() => buildVisit({ date:SAT, customer:customers[0], route:null, status:'sold' }));
  assert.throws(() => buildVisit({ date:SAT, customer:null, route:null, status:'closed' }));
});

test('پیشرفت: مراجعه مجدد هنوز در انتظار است', () => {
  const planned = plannedCustomers(customers, 'r1');
  const vs = [
    buildVisit({ date:SAT, customer:customers[1], route:routes[0], status:'no_order' }),
    buildVisit({ date:SAT, customer:customers[0], route:routes[0], status:'revisit' }),
    buildVisit({ date:SUN, customer:customers[2], route:routes[0], status:'closed' }),   // روز دیگر: حساب نمی‌شود
  ];
  const p = routeProgress(planned, visitsOnDate(vs, SAT));
  assert.deepEqual([p.total, p.done, p.pending, p.revisit, p.percent], [3, 1, 2, 1, 33]);
  assert.equal(routeProgress([], new Map()).percent, 0);
});

test('آخرین ویزیت و آخرین خرید (فاکتور باطل حساب نمی‌شود)', () => {
  const lv = lastVisitByCustomer([{customerId:'c1',date:'2026-10-01',ts:1},{customerId:'c1',date:'2026-10-10',ts:1},{customerId:'c1',date:'2026-10-10',ts:9}]);
  assert.equal(lv.get('c1').ts, 9);
  const lp = lastPurchaseByCustomer([
    {customerId:'c1',date:'2026-10-05'},{customerId:'c1',date:'2026-10-12',status:'cancelled'},{customerId:'c1',date:'2026-10-08T10:00'},{customerId:null,date:'2026-10-09'}]);
  assert.equal(lp.get('c1'), '2026-10-08'); assert.equal(lp.size, 1);
});

test('تغییر ترتیب: فقط تغییرها، شماره‌گذاری ۱..n، لبه‌ها بی‌اثر', () => {
  assert.deepEqual(reorderUpdates(customers,'r1','c1',-1), [{id:'c1',routeOrder:1},{id:'c2',routeOrder:2}, {id:'c3',routeOrder:3}]);
  assert.deepEqual(reorderUpdates(customers,'r1','c2',-1), []);       // اولی بالاتر نمی‌رود
  assert.deepEqual(reorderUpdates(customers,'r1','c3',1), []);        // آخری پایین‌تر نمی‌رود
  assert.deepEqual(reorderUpdates(customers,'r1','نیست',1), []);
});

test('انتخاب مشتریان مسیر: مشتری دیگران جابه‌جا، برداشته‌شده آزاد، بقیه دست‌نخورده', () => {
  const up = assignmentUpdates({ customers, routeId:'r1', selectedIds:['c1','c2','c4','c5'] });
  assert.deepEqual(up, [
    { id:'c3', routeId:'', routeOrder:0 },
    { id:'c4', routeId:'r1', routeOrder:3 },
    { id:'c5', routeId:'r1', routeOrder:4 },
  ]);
  assert.deepEqual(assignmentUpdates({ customers, routeId:'r1', selectedIds:['c1','c2','c3'] }), []);
});

test('اعتبارسنجی مسیر و پنجرهٔ ۹۰ روز', () => {
  assert.equal(validateRouteInput({name:'  ', weekday:1}), 'نام مسیر را بنویسید.');
  assert.equal(validateRouteInput({name:'x', weekday:9}), 'روز هفته را انتخاب کنید.');
  assert.equal(validateRouteInput({name:'x', weekday:'6'}), '');
  assert.equal(visitWindowStart('2026-10-17'), '2026-07-19');
});
