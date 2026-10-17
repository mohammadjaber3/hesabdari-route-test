// بررسی بخش نوشتنِ مسیر/ویزیت: کدِ routeOps مستقیماً از app.js بیرون کشیده و با «دیتابیس ساختگی» اجرا می‌شود
// تا ثابت شود فقط روی routes/visits و دو فیلد مسیرِ مشتری می‌نویسد (نه فروش/پرداخت/مانده).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { visitId, visitWindowStart, buildVisit, reorderUpdates } from '../route.js';
import { todayISO } from '../core.js';

const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = src.indexOf('const routeOps = {');
const end = src.indexOf('bindViews(App);', start);
assert.ok(start > 0 && end > start, 'routeOps در app.js پیدا نشد');
const body = src.slice(start, end).replace(/^const routeOps = /, '').trim().replace(/;$/, '');

function setup(state){
  const writes = [];
  const mkBatch = () => { const ops = []; return {
    set:(ref,data)=>ops.push({op:'set',path:ref.path,data}), update:(ref,data)=>ops.push({op:'update',path:ref.path,data}),
    delete:(ref)=>ops.push({op:'delete',path:ref.path}), commit: async()=>{ writes.push(...ops); } }; };
  const cols = new Proxy({}, { get:(_,n)=>({ name:n }) });
  const deps = { cols, db:{}, doc:(c,id)=>({ path:c.name+'/'+id }), writeBatch:()=>mkBatch(),
    sanitizeDoc:x=>x, todayISO, uid:()=>'new_id', visitId, visitWindowStart, buildVisit, reorderUpdates,
    onSnapshot:()=>()=>{}, query:(c)=>c, where:()=>0 };
  const ops = new Function(...Object.keys(deps), 'return ' + body)(...Object.values(deps));
  const app = Object.assign({
    state, routeSync:{routes:'ok',visits:'ok'}, _unsubs:[], _pendingParts:new Set(),
    _routeBlocked:()=>false, editMeta:()=>({lastEditedByEmail:'e'}), recordMeta:()=>({createdByEmail:'e',createdByDevice:'d'}),
    _markWriteResult(){}, _syncRender(){}, _recomputeSyncState(){}, toast(){}, toastError(m){ app.errors.push(m); },
    friendlyError:e=>e.message, isOwner:()=>true, errors:[]
  }, ops);
  return { app, writes };
}
const baseState = () => ({
  routes:[{ id:'r1', name:'خالد چوک', weekday:6 }], visits:[],
  customers:[{ id:'c1', name:'الف', routeId:'r1', routeOrder:1, balance:700 }, { id:'c2', name:'ب', routeId:'r1', routeOrder:2, balance:0 }]
});

test('markVisit: فقط یک سند در visits می‌نویسد، با شناسهٔ ثابت و عکسِ لحظه', async () => {
  const { app, writes } = setup(baseState());
  await app.markVisit('c1', 'no_order');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, 'visits/' + visitId(todayISO(), 'c1'));
  assert.equal(writes[0].data.routeName, 'خالد چوک'); assert.equal(writes[0].data.customerName, 'الف');
  assert.ok(writes.every(w => w.path.startsWith('visits/')), 'نباید جای دیگری نوشته شود');
});

test('markVisit دوباره = همان سند (تصحیح)، با حفظ ثبت‌کنندهٔ اول و ts اول', async () => {
  const st = baseState();
  const first = setup(st); await first.app.markVisit('c1', 'closed');
  st.visits = [ { ...first.writes[0].data, createdByEmail:'first@x', ts: 123 } ];
  const { app, writes } = setup(st); await app.markVisit('c1', 'revisit');
  assert.equal(writes.length, 1); assert.equal(writes[0].path, first.writes[0].path);
  assert.equal(writes[0].data.status, 'revisit'); assert.equal(writes[0].data.ts, 123); assert.equal(writes[0].data.createdByEmail, 'first@x');
});

test('markVisit: مشتری ناموجود / وضعیت نامعتبر / قفل قوانین → هیچ نوشتنی نیست', async () => {
  let t = setup(baseState()); await t.app.markVisit('نیست', 'closed'); assert.equal(t.writes.length, 0); assert.equal(t.app.errors.length, 1);
  t = setup(baseState()); await t.app.markVisit('c1', 'sold'); assert.equal(t.writes.length, 0);
  t = setup(baseState()); t.app._routeBlocked = () => true; await t.app.markVisit('c1', 'closed'); assert.equal(t.writes.length, 0);
});

test('تغییر مسیر مشتری: فقط routeId/routeOrder/مهر ویرایش — هرگز balance', async () => {
  const { app, writes } = setup(baseState());
  await app.applyCustomerRouteUpdates([{ id:'c1', routeId:'', routeOrder:0 }, { id:'c2', routeOrder:1 }]);
  assert.equal(writes.length, 2);
  writes.forEach(w => { assert.ok(w.path.startsWith('customers/')); assert.equal(w.op, 'update');
    Object.keys(w.data).forEach(k => assert.ok(['routeId','routeOrder','lastEditedByEmail'].includes(k), 'کلید غیرمجاز: ' + k)); });
});

test('جابه‌جایی ترتیب و ساخت/ویرایش مسیر', async () => {
  let t = setup(baseState()); await t.app.moveRouteCustomer('r1', 'c2', -1);
  assert.deepEqual(t.writes.map(w => [w.path, w.data.routeOrder]), [['customers/c2', 1], ['customers/c1', 2]]);
  t = setup(baseState()); await t.app.saveRouteRecord({ id:null, name:' مسیر نو ', weekday:3 });
  assert.equal(t.writes[0].path, 'routes/new_id'); assert.equal(t.writes[0].data.name, 'مسیر نو'); assert.equal(t.writes[0].data.active, true);
  t = setup(baseState()); await t.app.toggleRouteActive('r1');
  assert.deepEqual([t.writes[0].path, t.writes[0].data.active], ['routes/r1', false]);
});
