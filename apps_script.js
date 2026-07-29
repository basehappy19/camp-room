// ตั้งค่าชื่อ Sheet ที่จะใช้เก็บข้อมูล
const SHEET_NAME = 'Bookings';
// ⚠️ ให้ก๊อปปี้ลิงก์ (URL) ของหน้า Google Sheets ของคุณ (ด้านบนของบราวเซอร์) มาวางในเครื่องหมายคำพูดด้านล่างนี้
const SPREADSHEET_URL = 'ใส่ลิงก์หน้า_GOOGLE_SHEETS_ที่นี่';

function getDoc() {
  if (SPREADSHEET_URL.includes('docs.google.com')) {
    return SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ฟังก์ชันแรกเริ่ม ให้กด "Run" ฟังก์ชัน setup() 1 ครั้ง เพื่อสร้างตารางให้พร้อมใช้งาน
function setup() {
  const ss = getDoc();
  if (!ss) throw new Error('กรุณาใส่ SPREADSHEET_URL ให้ถูกต้อง');
  
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['RoomID', 'StdNo', 'Timestamp']);
    
    // จัดรูปแบบหัวตาราง
    sheet.getRange('A1:C1').setFontWeight('bold').setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
  }
}

// ฟังก์ชันสำหรับอ่านข้อมูล (ดึงรายชื่อผู้จอง)
function doGet(e) {
  const ss = getDoc();
  if (!ss) return respond({ error: 'Spreadsheet not found. Please check SPREADSHEET_URL.' });
  
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return respond({ error: 'Sheet "Bookings" not found' });
  
  const data = sheet.getDataRange().getValues();
  const bookings = [];
  
  // เริ่มอ่านที่แถว 2 (ข้ามหัวตาราง)
  for (let i = 1; i < data.length; i++) {
    bookings.push({
      roomId: String(data[i][0]),
      stdNo: String(data[i][1])
    });
  }
  
  return respond({ success: true, data: bookings });
}

// ฟังก์ชันสำหรับบันทึก/ลบ ข้อมูล
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ error: 'Invalid data format' });
  }

  const ss = getDoc();
  if (!ss) return respond({ error: 'Spreadsheet not found' });
  
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return respond({ error: 'Sheet "Bookings" not found' });
  
  const action = payload.action;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  
  try {
    if (action === 'book') {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === String(payload.stdNo)) {
          return respond({ error: 'นักเรียนรหัสนี้ได้ทำการจองไปแล้ว' });
        }
      }
      
      sheet.appendRow([payload.roomId, payload.stdNo, new Date()]);
      return respond({ success: true });
        
    } else if (action === 'unbook') {
      const data = sheet.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][1]) === String(payload.stdNo) && String(data[i][0]) === String(payload.roomId)) {
          sheet.deleteRow(i + 1);
          return respond({ success: true });
        }
      }
      return respond({ error: 'ไม่พบข้อมูลการจอง' });
    }
  } catch (err) {
    return respond({ error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function respond(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject))
    .setMimeType(ContentService.MimeType.JSON);
}
