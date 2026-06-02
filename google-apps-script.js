/**
 * ============================================================
 * Google Apps Script — ฝันในม่านหมอก Theater Ticket Backend
 * ============================================================
 *
 * วิธีติดตั้ง:
 * 1. ไปที่ https://script.google.com → สร้างโปรเจกต์ใหม่
 * 2. วางโค้ดนี้ทั้งหมดในไฟล์ Code.gs
 * 3. แก้ SPREADSHEET_ID ให้ตรงกับ Google Sheet ของคุณ
 * 4. กด Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy URL ที่ได้ ไปวางใน CONFIG.APPS_SCRIPT_URL ในไฟล์ app.js
 *    และ APPS_SCRIPT_URL ในไฟล์ staff.html
 *
 * โครงสร้าง Google Sheet:
 * - Sheet1 "Orders" — รายการคำสั่งซื้อ
 * - Sheet2 "Tickets" — รายการบัตรแต่ละใบ
 * - Sheet3 "CheckIns" — log การเช็คอิน
 * ============================================================
 */

// ⚠️ แก้ค่านี้: ใส่ ID ของ Google Sheet ของคุณ
// (เอาจาก URL: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit)
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

// Sheet names
const SHEET_ORDERS   = 'Orders';
const SHEET_TICKETS  = 'Tickets';
const SHEET_CHECKINS = 'CheckIns';

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === 'checkin') {
      return handleCheckin(data);
    } else {
      return handleNewOrder(data);
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Allow CORS preflight (OPTIONS) — needed for fetch from browser
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', service: 'Theater Ticket API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── HANDLE NEW ORDER ─────────────────────────────────────────────────────
function handleNewOrder(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // ── Save slip image to Google Drive (if provided) ──
  let slipUrl = '—';
  if (data.slipImage && data.slipImage.startsWith('data:image')) {
    try {
      const base64Data = data.slipImage.split(',')[1];
      const mimeType = data.slipImage.split(';')[0].split(':')[1];
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, `slip-${data.orderId}.jpg`);
      
      // Save to a folder named "Theater Slips" in Drive
      let folder;
      const folders = DriveApp.getFoldersByName('Theater Slips - ฝันในม่านหมอก');
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder('Theater Slips - ฝันในม่านหมอก');
      }
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      slipUrl = file.getUrl();
    } catch (e) {
      slipUrl = 'บันทึกรูปไม่สำเร็จ: ' + e.message;
    }
  }

  // ── Sheet: Orders ──
  const ordersSheet = getOrCreateSheet(ss, SHEET_ORDERS, [
    'เลขที่คำสั่งซื้อ',
    'วันเวลา',
    'ชื่อ-นามสกุล',
    'เบอร์โทร',
    'อีเมล',
    'ประเภทบัตร',
    'จำนวนใบ',
    'ราคาต่อใบ',
    'ราคารวม',
    'หมายเหตุ',
    'รหัสบัตรทั้งหมด',
    'สลิปการโอนเงิน',
  ]);
  
  ordersSheet.appendRow([
    data.orderId,
    data.timestamp,
    data.name,
    data.phone,
    data.email,
    data.ticketType,
    data.qty,
    data.pricePerTicket,
    data.total,
    data.note,
    data.tickets,
    slipUrl,
  ]);

  
  // ── Sheet: Tickets ──
  const ticketsSheet = getOrCreateSheet(ss, SHEET_TICKETS, [
    'รหัสบัตร',
    'เลขที่คำสั่งซื้อ',
    'ชื่อ-นามสกุล',
    'เบอร์โทร',
    'ประเภทบัตร',
    'สถานะเช็คอิน',
    'เวลาเช็คอิน',
  ]);
  
  // Add each ticket ID as separate row
  const ticketIds = data.tickets.split(', ');
  ticketIds.forEach(tid => {
    ticketsSheet.appendRow([
      tid,
      data.orderId,
      data.name,
      data.phone,
      data.ticketType,
      'ยังไม่เช็คอิน',
      '',
    ]);
  });
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, orderId: data.orderId }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── HANDLE CHECK-IN ──────────────────────────────────────────────────────
function handleCheckin(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Update Tickets sheet
  const ticketsSheet = getOrCreateSheet(ss, SHEET_TICKETS, []);
  updateCheckinStatus(ticketsSheet, data.ticketId, data.checkInTime);
  
  // Append to CheckIns log sheet
  const checkinsSheet = getOrCreateSheet(ss, SHEET_CHECKINS, [
    'รหัสบัตร',
    'ชื่อ-นามสกุล',
    'เบอร์โทร',
    'ประเภทบัตร',
    'เวลาเช็คอิน',
  ]);
  
  checkinsSheet.appendRow([
    data.ticketId,
    data.name,
    data.phone,
    data.type,
    data.checkInTime,
  ]);
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers.length > 0) {
      sheet.appendRow(headers);
      // Style header row
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#4a2080');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      headerRange.setFontSize(11);
      sheet.setFrozenRows(1);
      
      // Auto-resize columns
      headers.forEach((_, i) => sheet.autoResizeColumn(i + 1));
    }
  }
  return sheet;
}

function updateCheckinStatus(sheet, ticketId, checkInTime) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === ticketId) {
      sheet.getRange(i + 1, 6).setValue('เช็คอินแล้ว');
      sheet.getRange(i + 1, 6).setBackground('#d4edda');
      sheet.getRange(i + 1, 7).setValue(checkInTime);
      break;
    }
  }
}
