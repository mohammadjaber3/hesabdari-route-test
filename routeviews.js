/* =====================================================================
   routeviews.js — صفحه‌های «مسیر امروز»، «مدیریت مسیرها» و «ترتیب مشتریان».
   فقط نمایش و جمع‌کردنِ ورودی کاربر است؛ نوشتن در Firestore در app.js (routeOps) انجام می‌شود.
   به فروش، پرداخت، مانده و موجودی هیچ دسترسی نمی‌نویسد.
   ===================================================================== */
import { escapeHtml, fmt, ic } from './helpers.js';
import { todayISO, daysBetweenISO, dateLabelFa } from './core.js';
import { normQ } from './listtools.js';
import {
  WEEKDAY_FA, WEEK_ORDER, VISIT_STATUSES, VISIT_STATUS_FA,
  routesForDate, routesByWeek, plannedCustomers, lastVisitByCustomer, lastPurchaseByCustomer,
  visitsOnDate, routeProgress, assignmentUpdates, validateRouteInput, isActiveRoute, routeWeekday
} from './route.js';

let App;
export function bindRouteViews(a){ App = a; }

function agoLabel(iso){
  if(!iso) return '';
  const n = daysBetweenISO(String(iso).slice(0, 10), todayISO());
  return n <= 0 ? 'امروز' : n === 1 ? 'دیروز' : n + ' روز پیش';
}

export const routeViewMethods = {
  /* پیام روشن وقتی قوانین Firestore هنوز منتشر نشده یا دریافت مسیرها خطا دارد */
  _routeBanner(){
    const sy = this.routeSync || {};
    if(sy.routes === 'denied' || sy.visits === 'denied'){
      return `<div class="card rt-warn"><b>قوانین «مسیر و ویزیت» هنوز در Firebase منتشر نشده.</b>
        <div class="field-note">تا آن زمان ثبت ویزیت و مسیر غیرفعال است (بقیهٔ برنامه عادی کار می‌کند). فایل firestore.rules جدید را در Firebase منتشر کنید.</div></div>`;
    }
    if(sy.routes === 'error' || sy.visits === 'error'){
      return `<div class="card rt-warn"><b>خطا در دریافت مسیرها یا ویزیت‌ها.</b>
        <div class="field-note">اینترنت را بررسی کنید؛ بقیهٔ برنامه عادی کار می‌کند.</div></div>`;
    }
    return '';
  },
  _routeBlocked(){
    const sy = this.routeSync || {};
    return ['denied', 'error'].indexOf(sy.routes) >= 0 || ['denied', 'error'].indexOf(sy.visits) >= 0;
  },
  canManageRoutes(){ return !this.isPartner(); },

  pickRoute(id){ this.routeUI = { routeId: id || null }; this.render(); },

  /* ---------------- مسیر امروز ---------------- */
  renderRoute(){
    if(this.sub === 'manage') return this.renderRouteManage();
    if(this.sub === 'order') return this.renderRouteOrder();
    const S = this.state, today = todayISO();
    const active = routesByWeek(S.routes).filter(isActiveRoute);
    const todays = routesForDate(S.routes, today);
    const ui = this.routeUI = this.routeUI || {};
    const route = active.find(r => r.id === ui.routeId) || todays[0] || null;
    const manage = this.canManageRoutes()
      ? `<span class="icon-btn" onclick="App.navigate('route','manage')" title="مدیریت مسیرها">${ic('settings', 16)}</span>` : '';
    const head = `<h2 class="section-title u-margin-top-0">${ic('map-pin', 17)}مسیر امروز ${manage}</h2>
      <div class="field-note">${escapeHtml(dateLabelFa(today))}</div>${this._routeBanner()}`;

    if(!active.length){
      return head + `<div class="empty"><span class="ic">${ic('map-pin', 26)}</span><b>هنوز مسیری تعریف نشده</b>
        <div class="field-note">${this.canManageRoutes() ? 'اول یک مسیر بسازید و مشتریانش را انتخاب کنید.' : 'مالک باید مسیرها را بسازد.'}</div>
        ${this.canManageRoutes() ? `<button class="btn btn-primary" onclick="App.navigate('route','manage')">ساخت مسیر</button>` : ''}</div>`;
    }
    const picker = `<label>مسیر</label><select onchange="App.pickRoute(this.value)">
      ${route ? '' : '<option value="">— مسیر را انتخاب کنید —</option>'}
      ${active.map(r => `<option value="${escapeHtml(r.id)}" ${route && route.id === r.id ? 'selected' : ''}>${WEEKDAY_FA[routeWeekday(r)]} — ${escapeHtml(r.name)}${todays.some(t => t.id === r.id) ? ' (امروز)' : ''}</option>`).join('')}
    </select>`;
    if(!route){
      return head + `<div class="card">${picker}<div class="field-note">برای امروز مسیری برنامه‌ریزی نشده؛ یکی را انتخاب کنید.</div></div>
        <button class="btn btn-outline" onclick="App.openOffPlanVisit()" ${this._routeBlocked() ? 'disabled' : ''}>${ic('plus', 16)}ویزیت خارج از برنامه</button>`;
    }

    const planned = plannedCustomers(S.customers, route.id);
    const vmap = visitsOnDate(S.visits, today);
    const prog = routeProgress(planned, vmap);
    const lv = lastVisitByCustomer((S.visits || []).filter(v => v.date !== today));
    const lp = lastPurchaseByCustomer(S.sales);
    const dis = this._routeBlocked() ? 'disabled' : '';
    const isToday = todays.some(t => t.id === route.id);
    const stat = [
      prog.noOrder ? prog.noOrder + ' سفارش نداد' : '', prog.closed ? prog.closed + ' بسته بود' : '',
      prog.revisit ? prog.revisit + ' مراجعه مجدد' : ''].filter(Boolean).join(' · ');

    const rows = planned.map(c => {
      const v = vmap.get(c.id), bal = Number(c.balance) || 0;
      const lastV = lv.get(c.id), lastP = lp.get(c.id);
      const subs = [lastP ? 'آخرین خرید: ' + agoLabel(lastP) : 'خریدی ثبت نشده', lastV ? 'آخرین ویزیت: ' + agoLabel(lastV.date) : ''].filter(Boolean).join(' · ');
      return `<div class="card route-row">
        <div class="rt-head">
          <div><b>${escapeHtml(c.name)}</b>${c.address ? `<span class="sub" style="display:block">${escapeHtml(c.address)}</span>` : ''}</div>
          <div class="rt-badges">
            ${bal > 0.5 ? `<span class="badge red num">بدهی ${fmt(bal)}</span>` : ''}
            ${v ? `<span class="badge ${v.status === 'revisit' ? 'gold' : 'green'}">${escapeHtml(VISIT_STATUS_FA[v.status] || v.status)}</span>` : ''}
          </div>
        </div>
        <div class="field-note">${escapeHtml(subs)}</div>
        <div class="rt-actions">
          ${VISIT_STATUSES.map(s => `<button type="button" class="rt-btn ${v && v.status === s ? 'on' : ''}" ${dis} onclick="App.markVisit('${escapeHtml(c.id)}','${s}')">${VISIT_STATUS_FA[s]}</button>`).join('')}
        </div>
        ${v && this.isOwner() ? `<div class="rt-undo"><span class="icon-btn" onclick="App.removeVisit('${escapeHtml(v.id)}')" title="حذف این ویزیت">${ic('trash', 15)}</span></div>` : ''}
      </div>`;
    }).join('');

    const plannedIds = new Set(planned.map(c => c.id));
    const offList = [...vmap.values()].filter(v => !plannedIds.has(v.customerId));
    const offRows = offList.map(v => `<div class="row-item"><div class="r-left"><b>${escapeHtml(v.customerName || '')}</b>
        <span class="sub">${escapeHtml(VISIT_STATUS_FA[v.status] || v.status)}</span></div>
        ${this.isOwner() ? `<span class="icon-btn" onclick="App.removeVisit('${escapeHtml(v.id)}')" title="حذف این ویزیت">${ic('trash', 15)}</span>` : ''}</div>`).join('');

    return head + `
      <div class="card">${picker}
        ${isToday ? '' : '<div class="field-note">این مسیر امروز برنامه ندارد؛ ویزیت‌ها «خارج از برنامه» ثبت می‌شوند.</div>'}</div>
      <div class="card">
        <div class="rt-prog-top"><b class="num">${prog.done} از ${prog.total}</b><span>ویزیت شد</span></div>
        <div class="rt-bar"><i style="width:${prog.percent}%"></i></div>
        ${stat ? `<div class="field-note">${escapeHtml(stat)}</div>` : ''}
      </div>
      ${planned.length ? rows : `<div class="empty"><span class="ic">${ic('users', 26)}</span><b>این مسیر هنوز مشتری ندارد</b>
        ${this.canManageRoutes() ? `<button class="btn btn-primary" onclick="App.openAssignCustomers('${escapeHtml(route.id)}')">انتخاب مشتریان</button>` : ''}</div>`}
      <button class="btn btn-outline" onclick="App.openOffPlanVisit()" ${dis}>${ic('plus', 16)}ویزیت خارج از برنامه</button>
      ${offRows ? `<h2 class="section-title">ویزیت‌های خارج از این فهرست (امروز)</h2><div class="card">${offRows}</div>` : ''}`;
  },

  /* ویزیت خارج از برنامه: هر مشتری، بدون تغییر در مسیر پیش‌فرض او */
  openOffPlanVisit(){
    if(this._routeBlocked()){ this.toast('ثبت ویزیت فعلاً غیرفعال است (قوانین Firebase).'); return; }
    const list = [...(this.state.customers || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
    if(!list.length){ this.toast('هنوز مشتری‌ای ثبت نشده.'); return; }
    this.openCustomModal({
      title: 'ویزیت خارج از برنامه',
      sub: 'مسیر پیش‌فرض مشتری عوض نمی‌شود.',
      submitLabel: 'ثبت ویزیت',
      bodyHtml: `<input id="rt-q" placeholder="جستجوی نام مشتری" oninput="App.filterPick(this.value)">
        <div id="rt-pick-list" class="rt-pick-list">${list.map(c => `<label class="rt-pick" data-q="${escapeHtml(normQ(c.name + ' ' + (c.address || '')))}">
          <input type="radio" name="rt-off" value="${escapeHtml(c.id)}"><span>${escapeHtml(c.name)}</span></label>`).join('')}</div>
        <label>نتیجهٔ ویزیت</label><select id="rt-off-status">${VISIT_STATUSES.map(s => `<option value="${s}">${VISIT_STATUS_FA[s]}</option>`).join('')}</select>`,
      onSubmit: async () => {
        const el = document.querySelector('#rt-pick-list input[name="rt-off"]:checked');
        if(!el) throw new Error('یک مشتری را انتخاب کنید.');
        await this.markVisit(el.value, document.getElementById('rt-off-status').value, { silent: true });
      }
    });
  },
  filterPick(q){
    const terms = normQ(q).split(' ').filter(Boolean);
    document.querySelectorAll('#rt-pick-list .rt-pick').forEach(el => {
      const hay = el.getAttribute('data-q') || '';
      el.style.display = terms.every(t => hay.includes(t)) ? '' : 'none';
    });
  },

  /* ---------------- مدیریت مسیرها ---------------- */
  renderRouteManage(){
    if(!this.canManageRoutes()) return this.renderNoAccess('مدیریت مسیرها');
    const S = this.state;
    const all = routesByWeek(S.routes);
    const noRoute = (S.customers || []).filter(c => !c.routeId || !(S.routes || []).some(r => r.id === c.routeId)).length;
    const dis = this._routeBlocked() ? 'disabled' : '';
    const rows = all.map(r => {
      const n = plannedCustomers(S.customers, r.id).length, on = isActiveRoute(r);
      return `<div class="card route-row">
        <div class="rt-head"><div><b>${escapeHtml(r.name)}</b><span class="sub" style="display:block">${WEEKDAY_FA[routeWeekday(r)]} · <span class="num">${n}</span> مشتری</span></div>
          <span class="badge ${on ? 'green' : 'gold'}">${on ? 'فعال' : 'غیرفعال'}</span></div>
        <div class="rt-actions rt-actions-4">
          <button type="button" class="rt-btn" ${dis} onclick="App.openAssignCustomers('${escapeHtml(r.id)}')">مشتریان</button>
          <button type="button" class="rt-btn" ${dis} onclick="App.routeUI={routeId:'${escapeHtml(r.id)}'};App.navigate('route','order')">ترتیب</button>
          <button type="button" class="rt-btn" ${dis} onclick="App.openRouteForm('${escapeHtml(r.id)}')">ویرایش</button>
          <button type="button" class="rt-btn" ${dis} onclick="App.toggleRouteActive('${escapeHtml(r.id)}')">${on ? 'غیرفعال' : 'فعال'}</button>
        </div></div>`;
    }).join('');
    return `<h2 class="section-title u-margin-top-0">${ic('settings', 17)}مدیریت مسیرها</h2>
      ${this._routeBanner()}
      <button class="btn btn-outline" onclick="App.navigate('route')">${ic('arrow-right', 16)}برگشت به مسیر امروز</button>
      <button class="btn btn-primary" ${dis} onclick="App.openRouteForm()">${ic('plus', 16)}مسیر جدید</button>
      <div class="field-note u-margin-top-12px">مشتری بدون مسیر: <b class="num">${noRoute}</b></div>
      ${rows || `<div class="empty"><span class="ic">${ic('map-pin', 26)}</span><b>هنوز مسیری ساخته نشده</b></div>`}`;
  },

  openRouteForm(id){
    if(!this.canManageRoutes()) return;
    const r = id ? (this.state.routes || []).find(x => x.id === id) : null;
    this.openFormModal({
      title: r ? 'ویرایش مسیر' : 'مسیر جدید',
      sub: 'هر مسیر یک روز ثابت هفته دارد؛ مثلاً «شنبه — خالد چوک».',
      submitLabel: 'ذخیره',
      fields: [
        { key: 'name', label: 'نام مسیر', type: 'text', value: r ? r.name : '', placeholder: 'مثلاً خالد چوک / کوچهٔ مارمل' },
        { key: 'weekday', label: 'روز هفته', type: 'select', value: r ? routeWeekday(r) : 6,
          options: WEEK_ORDER.map(d => ({ value: d, label: WEEKDAY_FA[d] })) }
      ],
      onSubmit: async (vals) => {
        const err = validateRouteInput(vals);
        if(err) throw new Error(err);
        await this.saveRouteRecord({ id: r ? r.id : null, name: vals.name, weekday: Number(vals.weekday) });
      }
    });
  },

  openAssignCustomers(routeId){
    if(!this.canManageRoutes()) return;
    const S = this.state, route = (S.routes || []).find(r => r.id === routeId);
    if(!route) return;
    if(this._routeBlocked()){ this.toast('ثبت مسیر فعلاً غیرفعال است (قوانین Firebase).'); return; }
    const nameOf = id => { const r = (S.routes || []).find(x => x.id === id); return r ? r.name : ''; };
    const list = [...(S.customers || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
    if(!list.length){ this.toast('هنوز مشتری‌ای ثبت نشده.'); return; }
    this.openCustomModal({
      title: 'مشتریان «' + route.name + '»',
      sub: 'تیک‌دار = در این مسیر. مشتری که در مسیر دیگری است، با تیک زدن به این مسیر منتقل می‌شود.',
      submitLabel: 'ذخیره',
      bodyHtml: `<input id="rt-q" placeholder="جستجوی نام مشتری" oninput="App.filterPick(this.value)">
        <div id="rt-pick-list" class="rt-pick-list">${list.map(c => {
          const other = c.routeId && c.routeId !== routeId ? nameOf(c.routeId) : '';
          return `<label class="rt-pick" data-q="${escapeHtml(normQ(c.name + ' ' + (c.address || '')))}">
            <input type="checkbox" value="${escapeHtml(c.id)}" ${c.routeId === routeId ? 'checked' : ''}>
            <span>${escapeHtml(c.name)}${other ? `<small> (الان در: ${escapeHtml(other)})</small>` : ''}</span></label>`;
        }).join('')}</div>`,
      onSubmit: async () => {
        const ids = [...document.querySelectorAll('#rt-pick-list input[type="checkbox"]:checked')].map(el => el.value);
        const updates = assignmentUpdates({ customers: S.customers, routeId, selectedIds: ids });
        if(!updates.length) return;
        await this.applyCustomerRouteUpdates(updates);
      }
    });
  },

  /* ---------------- ترتیب دستی مشتریان ---------------- */
  renderRouteOrder(){
    if(!this.canManageRoutes()) return this.renderNoAccess('ترتیب مشتریان');
    const S = this.state, route = (S.routes || []).find(r => r.id === (this.routeUI || {}).routeId);
    if(!route) return `<div class="empty"><b>مسیر پیدا نشد</b><button class="btn btn-outline" onclick="App.navigate('route','manage')">برگشت</button></div>`;
    const list = plannedCustomers(S.customers, route.id), dis = this._routeBlocked() ? 'disabled' : '';
    return `<h2 class="section-title u-margin-top-0">${ic('map-pin', 17)}ترتیب «${escapeHtml(route.name)}»</h2>
      ${this._routeBanner()}
      <button class="btn btn-outline" onclick="App.navigate('route','manage')">${ic('arrow-right', 16)}برگشت</button>
      <div class="field-note u-margin-top-12px">با دکمه‌های ▲ ▼ ترتیب ویزیت را عوض کنید. شمارهٔ بدون ترتیب، آخر فهرست می‌رود.</div>
      ${list.length ? list.map((c, i) => `<div class="row-item"><div class="r-left"><b><span class="num">${i + 1}.</span> ${escapeHtml(c.name)}</b>
          ${c.address ? `<span class="sub">${escapeHtml(c.address)}</span>` : ''}</div>
        <div class="u-align-items-center u-gap-8px" style="display:flex">
          <button type="button" class="rt-btn rt-arrow" ${dis} onclick="App.moveRouteCustomer('${escapeHtml(route.id)}','${escapeHtml(c.id)}',-1)" aria-label="بالاتر">▲</button>
          <button type="button" class="rt-btn rt-arrow" ${dis} onclick="App.moveRouteCustomer('${escapeHtml(route.id)}','${escapeHtml(c.id)}',1)" aria-label="پایین‌تر">▼</button>
        </div></div>`).join('') : `<div class="empty"><b>این مسیر مشتری ندارد</b></div>`}`;
  }
};
