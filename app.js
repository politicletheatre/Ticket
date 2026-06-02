/* =====================================================================
   app.js — Theater Ticket App (Main SPA Logic)
   ===================================================================== */

// ─── CONFIG ───────────────────────────────────────────────────────────────
const CONFIG = {
  showName: 'น่าจะรู้อย่างนี้ตั้งแต่ปี 2475',
  showNameEn: 'What I Wish I Knew When I was back in 1932',
  venue: 'KINJAI CONTEMPORARY',
  dates: '16–25 ตุลาคม 2569',
  maxQty: 10,
  slotCapacity: 50, // ← จำนวนที่นั่งสูงสุดต่อรอบ

  // ⬇️ ใส่ URL ของ Google Apps Script ที่ deploy แล้วตรงนี้
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw8J0UW5pBkFVGfaRKh0THmaHjUqVIQgCTQATUUNGjhZ1h6525M1Gad-Jn2zUi9Oyc1/exec',

  // ── ตารางรอบการแสดง ──
  schedule: [
    { id:'w1-fri', week:1, day:'ศุกร์',    date:'16', month:'ต.ค.', year:'2569', dateLabel:'ศุกร์ที่ 16 ต.ค. 2569',    slots:['19:00'] },
    { id:'w1-sat', week:1, day:'เสาร์',   date:'17', month:'ต.ค.', year:'2569', dateLabel:'เสาร์ที่ 17 ต.ค. 2569',   slots:['14:00','19:00'] },
    { id:'w1-sun', week:1, day:'อาทิตย์', date:'18', month:'ต.ค.', year:'2569', dateLabel:'อาทิตย์ที่ 18 ต.ค. 2569', slots:['14:00','19:00'] },
    { id:'w2-fri', week:2, day:'ศุกร์',    date:'23', month:'ต.ค.', year:'2569', dateLabel:'ศุกร์ที่ 23 ต.ค. 2569',    slots:['19:00'] },
    { id:'w2-sat', week:2, day:'เสาร์',   date:'24', month:'ต.ค.', year:'2569', dateLabel:'เสาร์ที่ 24 ต.ค. 2569',   slots:['14:00','19:00'] },
    { id:'w2-sun', week:2, day:'อาทิตย์', date:'25', month:'ต.ค.', year:'2569', dateLabel:'อาทิตย์ที่ 25 ต.ค. 2569', slots:['14:00','19:00'] },
  ],

  ticketTypes: [
    { id:'earlybird', name:'Early Bird',  desc:'สำหรับผู้ที่จองก่อน 30 ก.ย. 2569', price:590, badge:'early',   badgeText:'🐦 Early Bird', available:true },
    { id:'regular',   name:'บัตรปกติ', desc:'ราคาปกติ — ที่นั่งทั่วไป',        price:790, badge:'regular', badgeText:'🎭 Regular',    available:true },
    { id:'quota-free', name:'โควต้าฟรี', desc:'โควต้าพิเศษสำหรับทีมงาน/ Staff', price:0,   badge:'quota',   badgeText:'🎟️ โควต้าฟรี', available:false },
    { id:'quota-earlybird', name:'โควต้าราคา Early Bird', desc:'โควต้าพิเศษราคา Early Bird', price:590, badge:'quota', badgeText:'🎟️ โควต้า Early Bird', available:false },
    { id:'quota-spon', name:'โควต้า Spon', desc:'โควต้าพิเศษสำหรับสปอนเซอร์', price:0, badge:'quota', badgeText:'🎟️ โควต้า Spon', available:false },
  ],

  bankAccount: {
    bank:        'ธนาคารกสิกรไทย (KBank)',
    accountNo:   '0001234567',
    accountName: 'บจก. น่าจะรู้อย่างนี้ตั้งแต่ปี 2475 โปรดักชั่น',
    promptpay:   '0901234567',
  },
};

// ─── GLOBAL CONFIG (Early Bird state shared across all devices) ───────────
let GLOBAL_EARLYBIRD_ENABLED = true; // default: enabled

// JSONBin settings — must match staff.html
const _JSONBIN_BIN_ID  = '6a1e8f65f5f4af5e29abf2ff';
const _JSONBIN_API_KEY = '$2a$10$l/R8BGxkz/nlfuPduNbrQe7Vojq21Ta25o8eij5mNFVDeGw/3sdsm';
const _JSONBIN_CONFIGURED = _JSONBIN_BIN_ID !== 'YOUR_BIN_ID_HERE' && _JSONBIN_API_KEY !== 'YOUR_API_KEY_HERE';

async function fetchGlobalConfig() {
  try {
    // 1. ลองดึงสถานะจาก Google Apps Script ก่อน (เป็น API ส่วนกลางที่อัปเดตทันที)
    if (CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL !== 'YOUR_APPS_SCRIPT_URL_HERE') {
      const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=getSettings`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.earlybird_enabled === 'boolean') {
          GLOBAL_EARLYBIRD_ENABLED = data.earlybird_enabled;
          // บันทึกยอดจองกลาง (Central Stock) ลงเครื่องเพื่อใช้คำนวณที่นั่งเหลือจริง
          if (data.soldCounts) {
            localStorage.setItem('theater_sold_counts', JSON.stringify(data.soldCounts));
          }
          // บันทึกค่า Capacity ที่ปรับปรุงจาก Sheets ลงใน localStorage 'theater_stock'
          const stockOverride = {};
          Object.keys(data).forEach(key => {
            if (key.startsWith('capacity|')) {
              const slotKey = key.replace('capacity|', '');
              stockOverride[slotKey] = Number(data[key]);
            }
          });
          localStorage.setItem('theater_stock', JSON.stringify(stockOverride));
          return;
        }
      }
    }

    // 2. Fallback: ถ้าไม่ได้ตั้งค่า Apps Script ให้ลองดึงจาก JSONBin (กรณีใช้งานระบบเดิม)
    if (_JSONBIN_CONFIGURED) {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${_JSONBIN_BIN_ID}/latest`, {
        headers: { 'X-Master-Key': _JSONBIN_API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.record?.earlybird_enabled === 'boolean') {
          GLOBAL_EARLYBIRD_ENABLED = data.record.earlybird_enabled;
          return;
        }
      }
    }

    // 3. Fallback สุดท้าย: ดึงจากไฟล์ config.json แบบสแตติกในเครื่อง
    const res2 = await fetch('./config.json?t=' + Date.now());
    if (res2.ok) {
      const cfg = await res2.json();
      if (typeof cfg.earlybird_enabled === 'boolean') {
        GLOBAL_EARLYBIRD_ENABLED = cfg.earlybird_enabled;
      }
    }
  } catch (e) {
    // ออฟไลน์: ใช้ค่าเริ่มต้นที่เป็น true
  }
}

// ─── STATE ────────────────────────────────────────────────────────────────
const state = {
  selectedDateId: null,
  selectedSlot:   null,
  selectedTypeId: null,
  qty:            1,
  currentOrder:   null,
  slipBase64:     null,
  carouselIndex:  0,
  savedForm:      null,  // ← preserve form when going back
};

// ─── SEAT CAPACITY ────────────────────────────────────────────────────────
function getSlotKey(dateId, slot) {
  return `${dateId}|${slot}`;
}

function getSlotCapacity(dateId, slot) {
  const stock = JSON.parse(localStorage.getItem('theater_stock') || '{}');
  const key   = getSlotKey(dateId, slot);
  // If staff has set a capacity, use it; else fall back to CONFIG
  return (typeof stock[key] === 'number') ? stock[key] : CONFIG.slotCapacity;
}

function getSoldCountForSlot(dateId, slot) {
  const dateObj = CONFIG.schedule.find(d => d.id === dateId);
  if (!dateObj) return 0;
  const showDateLabel = `${dateObj.dateLabel} · ${slot} น.`;
  const syncedSold = JSON.parse(localStorage.getItem('theater_sold_counts') || '{}');
  
  // ดึงยอดจองบนเครื่องของลูกค้าเองมาร่วมคำนวณด้วยเพื่อความแม่นยำ
  const localTickets = JSON.parse(localStorage.getItem('theater_tickets') || '{}');
  const localSold = Object.values(localTickets).filter(t =>
    t.showDateId === dateId && t.showSlot === slot && !t.cancelled
  ).length;

  // ใช้ยอดจากส่วนกลาง (Sheets) เป็นหลัก หรือใช้ยอดจากเครื่องหากส่วนกลางยังไม่ได้ประสานข้อมูล
  const centralSold = typeof syncedSold[showDateLabel] === 'number' ? syncedSold[showDateLabel] : 0;
  return Math.max(localSold, centralSold);
}

function getRemainingSeats(dateId, slot) {
  return Math.max(0, getSlotCapacity(dateId, slot) - getSoldCountForSlot(dateId, slot));
}

// ─── FORM STATE PRESERVATION ──────────────────────────────────────────────
function saveFormState() {
  state.savedForm = {
    name:       document.getElementById('f-name')?.value  || '',
    phone:      document.getElementById('f-phone')?.value || '',
    email:      document.getElementById('f-email')?.value || '',
    note:       document.getElementById('f-note')?.value  || '',
    slipBase64: state.slipBase64,
  };
}

function restoreForm() {
  if (!state.savedForm) return;
  const f = state.savedForm;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('f-name',  f.name);
  set('f-phone', f.phone);
  set('f-email', f.email);
  set('f-note',  f.note);
  if (f.slipBase64) {
    state.slipBase64 = f.slipBase64;
    const preview = document.getElementById('slip-preview');
    if (preview) preview.src = f.slipBase64;
    const ph = document.getElementById('slip-placeholder');
    if (ph) ph.style.display = 'none';
    const pw = document.getElementById('slip-preview-wrap');
    if (pw) pw.style.display = 'flex';
    const area = document.getElementById('slip-upload-area');
    if (area) area.classList.add('has-file');
  }
}

// ─── VIEW NAVIGATION ──────────────────────────────────────────────────────
function goTo(view) {
  // Save form state whenever leaving 'info' view
  const wasInfo = document.querySelector('.view.active')?.id === 'view-info';
  if (wasInfo) saveFormState();

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
  }

  const progressBar = document.getElementById('progress-bar');
  if (view === 'landing') {
    progressBar.style.display = 'none';
  } else {
    progressBar.style.display = 'block';
    if (target) {
      const pageHeader = target.querySelector('.page-header');
      if (pageHeader) {
        pageHeader.after(progressBar);
      }
    }
    updateProgress(view);
  }

  if (view === 'ticket')  {
    // 1. เรนเดอร์ตารางทันทีโดยใช้ข้อมูลแคชเดิม (โหลดปุ๊บ แสดงปั๊บ 0ms!)
    renderSchedule();
    
    // 2. ดึงข้อมูลใหม่จากคลาวด์ในเบื้องหลัง (Background Fetch) และอัปเดตตัวเลขเมื่อเสร็จ
    fetchGlobalConfig().then(() => {
      // อัปเดตเฉพาะยอดที่นั่งคงเหลือและรอบเวลาบนหน้าจอแบบเงียบๆ ไม่กระตุก
      if (document.querySelector('.view.active')?.id === 'view-ticket') {
        const prevDateId = state.selectedDateId;
        const prevSlot = state.selectedSlot;
        const prevTypeId = state.selectedTypeId;
        
        renderSchedule();
        
        // กู้คืนสถานะการเลือกเดิมของผู้ใช้
        state.selectedDateId = prevDateId;
        state.selectedSlot = prevSlot;
        state.selectedTypeId = prevTypeId;
      }
    }).catch(e => console.warn('Background stock sync failed:', e));
    
    // When returning from info with everything already selected, scroll to summary so
    // the user can see their choice + the "ดำเนินการต่อ" button without manually scrolling
    if (state.selectedTypeId) {
      setTimeout(() => {
        document.getElementById('price-summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 180);
    }
  }
  if (view === 'info')    { renderRecap(); restoreForm(); }
  if (view === 'confirm' && state.currentOrder) renderConfirmation();
}

function updateProgress(view) {
  const steps   = { ticket: 1, info: 2, confirm: 3 };
  const viewMap = { 1: 'ticket', 2: 'info' }; // step 3 (confirm) is not directly navigable
  const current = steps[view] || 1;
  for (let i = 1; i <= 3; i++) {
    const ps = document.getElementById(`ps-${i}`);
    const pl = document.getElementById(`pl-${i}`);
    ps.className = 'progress-step';
    ps.onclick   = null;
    ps.style.cursor = 'default';
    if (i < current) {
      ps.classList.add('done');
      ps.querySelector('.ps-dot').textContent = '✓';
      // Make completed steps clickable (except from confirm view)
      if (view !== 'confirm' && viewMap[i]) {
        ps.style.cursor = 'pointer';
        ps.title = `← กลับไปขั้นตอนที่ ${i}`;
        ps.onclick = ((step) => () => goTo(viewMap[step]))(i);
      }
    } else if (i === current) {
      ps.classList.add('active');
      ps.querySelector('.ps-dot').textContent = i;
    } else {
      ps.querySelector('.ps-dot').textContent = i;
    }
    if (pl) {
      pl.className = 'progress-line';
      if (i < current) pl.classList.add('done');
    }
  }
}

// ─── SCHEDULE (DATE + SLOT) ───────────────────────────────────────────────
function renderSchedule() {
  const container = document.getElementById('date-grid');
  let html = '';
  let currentWeek = null;
  CONFIG.schedule.forEach(d => {
    if (d.week !== currentWeek) {
      currentWeek = d.week;
      html += `<div class="week-label">✨ สัปดาห์ที่ ${d.week}</div>`;
    }
    // Check if any slot still has seats
    const hasAvail = d.slots.some(s => getRemainingSeats(d.id, s) > 0);
    html += `
      <div class="date-card ${state.selectedDateId===d.id?'selected':''} ${!hasAvail?'date-full':''}" id="dc-${d.id}" onclick="selectDate('${d.id}')">
        <div class="date-card-week">${d.day}</div>
        <div class="date-card-day">${d.date}</div>
        <div class="date-card-month">${d.month} ${d.year}</div>
        <div class="date-card-slots">${d.slots.length} รอบ${!hasAvail ? ' · <span class="sold-out">Sold Out</span>' : ''}</div>
      </div>`;
  });
  container.innerHTML = html;

  // Restore UI if user came back
  if (state.selectedDateId) {
    animateIn('slot-section');
    renderSlotGrid(state.selectedDateId);
    if (state.selectedSlot) {
      animateIn('type-section');
      renderTicketTypes();
      if (state.selectedTypeId) { showQuantitySection(); updateSummary(); renderPaymentQR(); }
    }
    updateStepBackButtons();
  }
}

function selectDate(dateId) {
  state.selectedDateId = dateId;
  state.selectedSlot   = null;
  state.selectedTypeId = null;
  state.qty            = 1;

  document.querySelectorAll('.date-card').forEach(el => el.classList.remove('selected'));
  document.getElementById(`dc-${dateId}`)?.classList.add('selected');

  ['slot-section','type-section','quantity-section','price-summary','payment-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('btn-to-info').style.display = 'none';

  animateIn('slot-section');
  renderSlotGrid(dateId);
  updateStepBackButtons();
}

function renderSlotGrid(dateId) {
  const dateObj = CONFIG.schedule.find(d => d.id === dateId);
  if (!dateObj) return;
  document.getElementById('slot-grid').innerHTML = dateObj.slots.map(slot => {
    const label     = slot === '14:00' ? 'รอบบ่าย' : 'รอบเย็น';
    const remaining = getRemainingSeats(dateId, slot);
    const isFull    = remaining <= 0;

    // แสดงเฉพาะ badge "Sold Out" เมื่อไม่มีที่นั่งเหลือ
    const seatBadge = isFull ? `<span class="slot-seat-badge seat-full">Sold Out</span>` : '';

    const onclickAttr = isFull ? '' : `onclick="selectSlot('${slot}')"` ;
    const disabledAttr = isFull ? 'disabled' : '';
    return `
      <button class="slot-btn ${state.selectedSlot===slot?'selected':''} ${isFull?'slot-full-btn':''}"
              id="sb-${slot.replace(':','')}"
              ${onclickAttr}
              ${disabledAttr}>
        <span class="slot-time">${slot}</span>
        <span class="slot-label">${label} น.</span>
        ${seatBadge}
      </button>`;
  }).join('');
}

function selectSlot(slot) {
  state.selectedSlot   = slot;
  state.selectedTypeId = null;
  state.qty            = 1;

  document.querySelectorAll('.slot-btn').forEach(el => el.classList.remove('selected'));
  document.getElementById(`sb-${slot.replace(':','')}`)?.classList.add('selected');

  ['quantity-section','price-summary','payment-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('btn-to-info').style.display = 'none';

  // Update qty cap
  const remaining = getRemainingSeats(state.selectedDateId, slot);
  state.qty = Math.min(state.qty, remaining);

  animateIn('type-section');
  renderTicketTypes();
  updateStepBackButtons();
}

function renderTicketTypes() {
  const container  = document.getElementById('ticket-types');
  const remaining  = state.selectedDateId && state.selectedSlot
    ? getRemainingSeats(state.selectedDateId, state.selectedSlot)
    : CONFIG.slotCapacity;

  const isEarlyBirdDisabled = !GLOBAL_EARLYBIRD_ENABLED;

  container.innerHTML = CONFIG.ticketTypes
    .filter(t => t.available && !(t.id === 'earlybird' && isEarlyBirdDisabled))
    .map(t => `
    <div class="ticket-type-card ${state.selectedTypeId === t.id ? 'selected' : ''}"
         id="tc-${t.id}"
         onclick="selectType('${t.id}')">
      <div class="ticket-type-info">
        <div class="ticket-type-name">${t.name}</div>
        <div class="ticket-type-desc">${t.desc}</div>
        <span class="ticket-type-badge badge-${t.badge}">${t.badgeText}</span>
      </div>
      <div style="display:flex;align-items:center;gap:16px">
        <div class="ticket-type-price">${fmt(t.price)}<span> บาท</span></div>
        <div class="ticket-radio"></div>
      </div>
    </div>
  `).join('');

  if (state.selectedTypeId) showQuantitySection();
}

function selectType(typeId) {
  state.selectedTypeId = typeId;
  document.querySelectorAll('.ticket-type-card').forEach(el => el.classList.remove('selected'));
  document.getElementById(`tc-${typeId}`)?.classList.add('selected');
  showQuantitySection();
  updateSummary();
  renderPaymentQR();
  updateStepBackButtons();
}

// ─── STEP BACK BUTTONS ───────────────────────────────────────────────────────────────────
function updateStepBackButtons() {
  const dateObj = CONFIG.schedule.find(d => d.id === state.selectedDateId);
  const btnDate = document.getElementById('back-to-date');
  if (btnDate) btnDate.textContent = dateObj
    ? `← ${dateObj.day} ${dateObj.date} ${dateObj.month}`
    : '← เปลี่ยนวัน';

  const btnSlot = document.getElementById('back-to-slot');
  if (btnSlot) {
    const slotLabel = state.selectedSlot === '14:00' ? 'รอบบ่าย 14:00' :
                      state.selectedSlot === '19:30' ? 'รอบเย็น 19:30' : (state.selectedSlot || '');
    btnSlot.textContent = state.selectedSlot ? `← ${slotLabel}` : '← เปลี่ยนรอบ';
  }

  const btnType = document.getElementById('back-to-type');
  if (btnType) {
    const type = CONFIG.ticketTypes.find(t => t.id === state.selectedTypeId);
    btnType.textContent = type ? `← ${type.name}` : '← เปลี่ยนประเภท';
  }
}

function backToDate() {
  state.selectedDateId = null;
  state.selectedSlot   = null;
  state.selectedTypeId = null;
  state.qty = 1;
  document.querySelectorAll('.date-card').forEach(el => el.classList.remove('selected'));
  ['slot-section','type-section','quantity-section','price-summary','payment-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('btn-to-info').style.display = 'none';
  document.getElementById('date-grid')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function backToSlot() {
  state.selectedSlot   = null;
  state.selectedTypeId = null;
  state.qty = 1;
  document.querySelectorAll('.slot-btn').forEach(el => el.classList.remove('selected'));
  ['type-section','quantity-section','price-summary','payment-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('btn-to-info').style.display = 'none';
  document.getElementById('slot-section')?.scrollIntoView({ behavior:'smooth', block:'start' });
  updateStepBackButtons();
}

function backToType() {
  state.selectedTypeId = null;
  state.qty = 1;
  document.querySelectorAll('.ticket-type-card').forEach(el => el.classList.remove('selected'));
  ['quantity-section','price-summary','payment-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('btn-to-info').style.display = 'none';
  document.getElementById('type-section')?.scrollIntoView({ behavior:'smooth', block:'start' });
  updateStepBackButtons();
}

// ─── EDIT SHORTCUTS (from view-info back to specific step) ────────────────
// ย้อนกลับไปเปลี่ยนรอบ (reset slot + type ให้เลือกใหม่)
function goToEditSlot() {
  saveFormState();
  state.selectedSlot   = null;
  state.selectedTypeId = null;
  state.qty            = 1;
  goTo('ticket');
  setTimeout(() => {
    document.getElementById('slot-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

// ย้อนกลับไปเปลี่ยนจำนวนบัตร (คง slot+type ไว้)
function goToEditQty() {
  saveFormState();
  goTo('ticket');
  // scrollIntoView จะถูกจัดการโดย goTo → renderSchedule → auto-scroll
}

function showQuantitySection() {
  const remaining = state.selectedDateId && state.selectedSlot
    ? getRemainingSeats(state.selectedDateId, state.selectedSlot)
    : CONFIG.maxQty;
  const maxBuy = Math.min(CONFIG.maxQty, remaining);

  // Clamp current qty
  if (state.qty > maxBuy) state.qty = maxBuy;

  const qtyDisplay = document.getElementById('qty-display');
  if (qtyDisplay) qtyDisplay.textContent = state.qty;
  const qtyMinus = document.getElementById('qty-minus');
  if (qtyMinus) qtyMinus.disabled = state.qty <= 1;
  const qtyPlus = document.getElementById('qty-plus');
  if (qtyPlus) qtyPlus.disabled = state.qty >= maxBuy;

  const limitEl = document.getElementById('qty-limit-text');
  if (limitEl) limitEl.textContent = `สูงสุด ${maxBuy} ใบต่อครั้ง`;

  animateIn('quantity-section');
  animateIn('price-summary');
  animateIn('payment-section');
  document.getElementById('btn-to-info').style.display = 'flex';
}

function animateIn(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'block';
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

// ─── QUANTITY ─────────────────────────────────────────────────────────────
function changeQty(delta) {
  const remaining = state.selectedDateId && state.selectedSlot
    ? getRemainingSeats(state.selectedDateId, state.selectedSlot)
    : CONFIG.maxQty;
  const maxBuy = Math.min(CONFIG.maxQty, remaining);
  state.qty = Math.max(1, Math.min(maxBuy, state.qty + delta));

  document.getElementById('qty-display').textContent = state.qty;
  document.getElementById('qty-minus').disabled = state.qty <= 1;
  document.getElementById('qty-plus').disabled  = state.qty >= maxBuy;
  updateSummary();
  renderPaymentQR();
}

function updateSummary() {
  const type = CONFIG.ticketTypes.find(t => t.id === state.selectedTypeId);
  if (!type) return;
  const total   = type.price * state.qty;
  const dateObj = CONFIG.schedule.find(d => d.id === state.selectedDateId);
  const showLabel = dateObj ? `${dateObj.dateLabel} · ${state.selectedSlot} น.` : '—';
  const showEl = document.getElementById('sum-show');
  if (showEl) showEl.textContent = showLabel;
  document.getElementById('sum-type').textContent  = type.name;
  document.getElementById('sum-price').textContent = `${fmt(type.price)} บาท`;
  document.getElementById('sum-qty').textContent   = `${state.qty} ใบ`;
  document.getElementById('sum-total').textContent = `${fmt(total)} บาท`;
}

// ─── QR CODE HELPER ───────────────────────────────────────────────────────
function makeQR(elementId, text, size = 160) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '';
  try {
    new QRCode(el, {
      text: unescape(encodeURIComponent(text)),
      width:  size,
      height: size,
      colorDark:  '#1a0d2e',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    const canvas = el.querySelector('canvas');
    const img    = el.querySelector('img');
    if (canvas) { 
      canvas.style.borderRadius = '8px'; 
      canvas.style.border = '3px solid white'; 
    }
    if (img) { 
      img.style.borderRadius = '8px'; 
      img.style.border = '3px solid white'; 
    }
  } catch(e) {
    console.error('QR generation failed:', e);
    el.innerHTML = `<div style="width:${size}px;height:${size}px;background:#2d1654;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9b5de5;font-size:12px;text-align:center;padding:8px">❌ QR Error</div>`;
  }
}

// ─── PAYMENT QR ───────────────────────────────────────────────────────────
function renderPaymentQR() {
  const type = CONFIG.ticketTypes.find(t => t.id === state.selectedTypeId);
  if (!type) return;
  const total  = type.price * state.qty;
  const qrData = `PromptPay|${CONFIG.bankAccount.promptpay}|THB|${total}`;
  makeQR('payment-qr-container', qrData, 160);
}

// ─── RECAP ────────────────────────────────────────────────────────────────
function renderRecap() {
  const type = CONFIG.ticketTypes.find(t => t.id === state.selectedTypeId);
  if (!type) return;
  document.getElementById('recap-type').textContent  = type.name;
  document.getElementById('recap-qty').textContent   = `${state.qty} ใบ`;
  document.getElementById('recap-total').textContent = `${fmt(type.price * state.qty)} บาท`;
}

// ─── SUBMIT ORDER ─────────────────────────────────────────────────────────
async function submitOrder(event) {
  event.preventDefault();

  const name  = document.getElementById('f-name').value.trim();
  const phone = cleanThaiPhone(document.getElementById('f-phone').value.trim());
  const email = document.getElementById('f-email').value.trim();
  const note  = document.getElementById('f-note').value.trim();
  const type  = CONFIG.ticketTypes.find(t => t.id === state.selectedTypeId);

  if (!type)              return showToast('❌ กรุณาเลือกประเภทบัตร', 'error');
  if (!state.slipBase64) return showToast('❌ กรุณาแนบสลิปการโอนเงิน', 'error');

  // Check seats still available
  const remaining = getRemainingSeats(state.selectedDateId, state.selectedSlot);
  if (remaining < state.qty) {
    return showToast(`❌ ที่นั่งไม่เพียงพอ เหลือเพียง ${remaining} ที่`, 'error');
  }

  const orderId    = generateOrderId();
  const dateObj    = CONFIG.schedule.find(d => d.id === state.selectedDateId);
  const showDateLabel = dateObj ? `${dateObj.dateLabel} · ${state.selectedSlot} น.` : '—';
  const tickets    = [];

  for (let i = 1; i <= state.qty; i++) {
    tickets.push({
      ticketId:  `${orderId}-T${String(i).padStart(2,'0')}`,
      ticketNum: i,
      orderId,
      name,
      phone,
      email,
      note,
      type:        type.name,
      typeId:      type.id,
      show:        CONFIG.showName,
      venue:       CONFIG.venue,
      showDateId:  state.selectedDateId,
      showSlot:    state.selectedSlot,
      showDate:    showDateLabel,
      pricePerTicket: type.price,
    });
  }

  const order = {
    orderId,
    name,
    phone,
    email,
    note,
    slipImage:      state.slipBase64,
    typeId:         type.id,
    typeName:       type.name,
    pricePerTicket: type.price,
    qty:            state.qty,
    total:          type.price * state.qty,
    showDateId:     state.selectedDateId,
    showSlot:       state.selectedSlot,
    showDate:       showDateLabel,
    timestamp:      new Date().toISOString(),
    tickets,
  };

  state.currentOrder = order;
  state.savedForm    = null; // clear saved form on success

  const saved = saveOrderLocally(order);
  if (!saved) return;

  setSubmitLoading(true);

  if (CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL !== 'YOUR_APPS_SCRIPT_URL_HERE') {
    try {
      await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        mode:   'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId:        order.orderId,
          timestamp:      new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
          name:           order.name,
          phone:          order.phone,
          email:          order.email  || '—',
          ticketType:     order.typeName,
          qty:            order.qty,
          pricePerTicket: order.pricePerTicket,
          total:          order.total,
          showDate:       order.showDate,
          note:           order.note   || '—',
          tickets:        order.tickets.map(t => t.ticketId).join(', '),
          slipImage:      order.slipImage || null,
        }),
      });
    } catch (e) { console.warn('Sheet sync failed:', e); }
  }

  setSubmitLoading(false);
  goTo('confirm');
  showToast('🎉 จองบัตรสำเร็จแล้ว!', 'success');
}

function setSubmitLoading(loading) {
  const btn     = document.getElementById('btn-submit');
  const text    = document.getElementById('submit-text');
  const spinner = document.getElementById('submit-spinner');
  btn.disabled          = loading;
  text.style.display    = loading ? 'none'  : 'inline';
  spinner.style.display = loading ? 'block' : 'none';
}

// ─── SLIP UPLOAD ──────────────────────────────────────────────────────────
function handleSlipUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX    = 800;
      const scale  = Math.min(1, MAX / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', 0.85);
      state.slipBase64 = b64;
      document.getElementById('slip-preview').src = b64;
      document.getElementById('slip-placeholder').style.display = 'none';
      document.getElementById('slip-preview-wrap').style.display = 'flex';
      document.getElementById('slip-upload-area').classList.add('has-file');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeSlip(e) {
  e.stopPropagation();
  state.slipBase64 = null;
  document.getElementById('f-slip').value = '';
  document.getElementById('slip-preview').src = '';
  document.getElementById('slip-placeholder').style.display = 'flex';
  document.getElementById('slip-preview-wrap').style.display = 'none';
  document.getElementById('slip-upload-area').classList.remove('has-file');
}

// ─── CONFIRMATION (CAROUSEL) ──────────────────────────────────────────────
function renderConfirmation() {
  const o = state.currentOrder;
  document.getElementById('conf-order-id').textContent = o.orderId;
  document.getElementById('conf-name').textContent     = o.name;
  document.getElementById('conf-show').textContent     = o.showDate || '—';
  document.getElementById('conf-type').textContent     = o.typeName;
  document.getElementById('conf-qty').textContent      = `${o.qty} ใบ`;
  document.getElementById('conf-total').textContent    = `${fmt(o.total)} บาท`;

  // Update the status check link with orderId so customers land directly on their order
  const statusLink = document.getElementById('btn-check-status');
  if (statusLink) statusLink.href = `status.html?order=${encodeURIComponent(o.orderId)}`;

  const carousel = document.getElementById('tickets-carousel');
  carousel.innerHTML = '';
  state.carouselIndex = 0;

  document.getElementById('carousel-total').textContent = o.qty;
  document.getElementById('carousel-cur').textContent   = 1;

  const wrap = carousel.closest('.ticket-carousel-wrap');
  wrap.classList.toggle('single', o.qty <= 1);

  const dotsEl = document.getElementById('carousel-dots');
  dotsEl.innerHTML = Array.from({ length: o.qty }, (_, i) =>
    `<div class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></div>`
  ).join('');

  o.tickets.forEach((ticket, idx) => {
    const card = document.createElement('div');
    card.className = `ticket-card${idx === 0 ? ' active-slide' : ''}`;
    card.id        = `ticket-card-${idx}`;
    card.innerHTML = `
      <div class="ticket-card-num">ใบที่ ${ticket.ticketNum} / ${o.qty}</div>
      <div id="qr-ticket-${idx}" class="qr-container"></div>
      <div class="ticket-card-title">${CONFIG.showName}</div>
      <div class="ticket-card-type">${ticket.type}</div>
      <div class="ticket-card-id">${ticket.ticketId}</div>
      <button class="btn-download-ticket" onclick="downloadTicket(${idx})">📥 ดาวน์โหลดใบนี้</button>
      <button class="btn-download-ticket" style="margin-top:6px;background:rgba(212,160,23,0.1);border-color:rgba(212,160,23,0.25);color:var(--gold-light)" onclick="regenerateConfirmationQR(${idx})">🔄 เจน QR Code อีกครั้ง</button>
    `;
    carousel.appendChild(card);

    const qrData = JSON.stringify({
      id:    ticket.ticketId,
      name:  ticket.name,
      phone: ticket.phone,
      type:  ticket.type,
      num:   ticket.ticketNum,
      total: o.qty,
    });
    setTimeout(() => makeQR(`qr-ticket-${idx}`, qrData, 180), 50 * idx);
  });

  updateCarouselUI();
  initCarouselSwipe(carousel);
}

// ─── CAROUSEL ─────────────────────────────────────────────────────────────
function carouselNext() {
  const total = state.currentOrder?.qty || 1;
  if (state.carouselIndex < total - 1) goToSlide(state.carouselIndex + 1);
}
function carouselPrev() {
  if (state.carouselIndex > 0) goToSlide(state.carouselIndex - 1);
}
function goToSlide(idx) {
  state.carouselIndex = idx;
  const carousel   = document.getElementById('tickets-carousel');
  const cardWidth  = carousel.parentElement.offsetWidth + 16;
  carousel.style.transform = `translateX(-${idx * cardWidth}px)`;
  document.querySelectorAll('.ticket-card').forEach((c, i) => c.classList.toggle('active-slide', i === idx));
  document.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  updateCarouselUI();
}
function updateCarouselUI() {
  const total = state.currentOrder?.qty || 1;
  const idx   = state.carouselIndex;
  document.getElementById('carousel-cur').textContent  = idx + 1;
  document.getElementById('carousel-prev').disabled = idx === 0;
  document.getElementById('carousel-next').disabled = idx >= total - 1;
}
function initCarouselSwipe(el) {
  let startX = 0;
  el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend',   (e) => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? carouselNext() : carouselPrev();
  }, { passive: true });
}

// ─── DOWNLOAD TICKET ──────────────────────────────────────────────────────
function downloadTicket(idx) {
  const ticket    = state.currentOrder?.tickets[idx];
  const srcCanvas = document.getElementById(`qr-ticket-${idx}`);
  if (!ticket || !srcCanvas) return;

  const tc  = document.createElement('canvas');
  tc.width  = 400; tc.height = 500;
  const ctx = tc.getContext('2d');

  ctx.fillStyle = '#1a0d2e';
  ctx.fillRect(0, 0, tc.width, tc.height);
  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth   = 3;
  ctx.strokeRect(12, 12, tc.width - 24, tc.height - 24);

  ctx.fillStyle  = '#fde68a';
  ctx.font       = 'bold 18px sans-serif';
  ctx.textAlign  = 'center';
  ctx.fillText(CONFIG.showName, tc.width / 2, 56);
  ctx.fillStyle  = '#c4b5fd';
  ctx.font       = '12px sans-serif';
  ctx.fillText(CONFIG.showNameEn, tc.width / 2, 80);

  const qrCanvas = srcCanvas.querySelector('canvas');
  if (qrCanvas) {
    const qrSize = 200;
    ctx.drawImage(qrCanvas, (tc.width - qrSize) / 2, 100, qrSize, qrSize);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 15px sans-serif';
  ctx.fillText(ticket.name, tc.width / 2, 330);
  ctx.fillStyle = '#c4b5fd';
  ctx.font      = '13px sans-serif';
  ctx.fillText(`ประเภท: ${ticket.type}`, tc.width / 2, 355);
  ctx.fillText(`ใบที่ ${ticket.ticketNum} / ${state.currentOrder.qty}`, tc.width / 2, 378);
  ctx.fillStyle = '#6b7280';
  ctx.font      = '11px monospace';
  ctx.fillText(ticket.ticketId, tc.width / 2, 410);
  if (ticket.showDate) {
    ctx.fillStyle = '#d4a017';
    ctx.font      = 'bold 11px sans-serif';
    ctx.fillText(ticket.showDate, tc.width / 2, 448);
  }

  const link    = document.createElement('a');
  link.download = `ticket-${ticket.ticketId}.png`;
  link.href     = tc.toDataURL('image/png');
  link.click();
}

function regenerateConfirmationQR(idx) {
  const o = state.currentOrder;
  if (!o || !o.tickets[idx]) return;
  const ticket = o.tickets[idx];
  const qrData = JSON.stringify({
    id:    ticket.ticketId,
    name:  ticket.name,
    phone: ticket.phone,
    type:  ticket.type,
    num:   ticket.ticketNum,
    total: o.qty,
  });
  makeQR(`qr-ticket-${idx}`, qrData, 180);
  showToast('🔄 สร้าง QR Code ใหม่เรียบร้อย');
}

// ─── LOCAL STORAGE ────────────────────────────────────────────────────────
function saveOrderLocally(order) {
  try {
    // Save full order
    const existing = JSON.parse(localStorage.getItem('theater_orders') || '[]');
    existing.push(order);
    localStorage.setItem('theater_orders', JSON.stringify(existing));

    // Save individual tickets for check-in + staff lookup
    const tickets = JSON.parse(localStorage.getItem('theater_tickets') || '{}');
    order.tickets.forEach(t => {
      tickets[t.ticketId] = {
        ...t,
        // Order-level data (OMIT slipImage here to prevent QuotaExceededError!)
        total:          order.total,
        qty:            order.qty,
        // Check-in state
        checkedIn:      false,
        checkInTime:    null,
      };
    });
    localStorage.setItem('theater_tickets', JSON.stringify(tickets));
    return true;
  } catch (e) {
    console.error('localStorage save failed:', e);
    alert('❌ พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (localStorage Quota Exceeded)\nกรุณาลองล้างประวัติการเข้าชมเว็บ หรือใช้รูปภาพสลิปโอนเงินที่มีขนาดเล็กลง เพื่อให้ระบบสามารถบันทึกตั๋วของคุณได้สำเร็จ');
    return false;
  }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────
function fmt(n) {
  return n.toLocaleString('th-TH');
}

function cleanThaiPhone(p) {
  let s = String(p || '').trim().replace(/\D/g, '');
  if (s.startsWith('66')) {
    s = '0' + s.substring(2);
  }
  if (s.length === 9 && !s.startsWith('0')) {
    s = '0' + s;
  }
  return s;
}

function generateOrderId() {
  const d      = new Date();
  const date   = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const random = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `FNH-${date}-${random}`;
}

function showToast(msg, type = '') {
  const toast   = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

// ─── INIT ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load global config asynchronously in the background (Non-blocking page load!)
  fetchGlobalConfig().then(() => {
    // If the customer is on the ticket selection step, silently refresh numbers
    if (document.querySelector('.view.active')?.id === 'view-ticket') {
      renderSchedule();
    }
  }).catch(err => console.warn('Background config fetch failed:', err));

  // Poster
  const posterEl = document.getElementById('poster-img');
  if (window.POSTER_BASE64) {
    posterEl.src = 'data:image/png;base64,' + window.POSTER_BASE64;
  } else {
    posterEl.src = 'assets/poster.png';
    posterEl.onerror = () => {
      posterEl.style.display = 'none';
      const wrap = posterEl.parentElement;
      wrap.style.cssText = 'background:linear-gradient(135deg,#2d1654,#4a2080,#1a0d2e);border-radius:24px;min-height:400px;display:flex;align-items:center;justify-content:center';
      wrap.innerHTML += '<div style="font-size:5rem;opacity:.4">🎭</div>';
    };
  }

  const labels = ['เลือกบัตร', 'ข้อมูล', 'ยืนยัน'];
  document.querySelectorAll('.progress-step span').forEach((el, i) => {
    el.textContent = labels[i];
  });

  document.getElementById('qty-minus').disabled = true;

  window.addEventListener('scroll', () => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    header.style.background = window.scrollY > 20
      ? 'rgba(13, 7, 24, 0.98)'
      : 'rgba(13, 7, 24, 0.8)';
  });
});
