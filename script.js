// Configuration
// Rooms are now loaded from Supabase

// ⚠️ ดึง URL และ Key ของ Supabase มาจากไฟล์ env.js
const SUPABASE_URL = ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let studentsData = [];
let rooms = [];
let currentSelectedRoom = null;
let currentPreviewStudent = null;
let isFetching = false;
let isBookingOpen = false;
let isAdmin = localStorage.getItem('isAdmin') === 'true';

// 31 ก.ค. 2569 เวลา 20:00:00 น. (GMT+7)
const BOOKING_START_TIME = new Date('2026-07-31T20:00:00+07:00').getTime();

function initCountdown() {
    const updateCountdown = () => {
        const now = new Date().getTime();
        const distance = BOOKING_START_TIME - now;

        if (distance <= 0) {
            isBookingOpen = true;
            document.getElementById('countdown-section').classList.add('hidden');
            return;
        }

        isBookingOpen = false;
        document.getElementById('countdown-section').classList.remove('hidden');

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('cd-days').innerText = days.toString().padStart(2, '0');
        document.getElementById('cd-hours').innerText = hours.toString().padStart(2, '0');
        document.getElementById('cd-minutes').innerText = minutes.toString().padStart(2, '0');
        document.getElementById('cd-seconds').innerText = seconds.toString().padStart(2, '0');
    };

    updateCountdown();
    setInterval(updateCountdown, 1000);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Restore admin UI if logged in
    if (isAdmin) {
        document.getElementById('adminBtn').innerHTML = '<i class="fa-solid fa-lock-open text-lg"></i>';
        document.getElementById('adminBtn').classList.replace('text-gray-300', 'text-emerald-500');
    }

    initCountdown();
    await loadRooms();
    await loadStudents();
    renderRoomSkeletons();
    
    // โหลดข้อมูลการจองจาก Supabase
    if(SUPABASE_URL) {
        await fetchBookings();
    } else {
        renderRooms();
        showToast("กรุณาใส่ URL ของ Supabase ในไฟล์ env.js", "error");
    }


    // รองรับการกด Enter สำหรับรหัสผ่าน
    const adminInput = document.getElementById('adminPassword');
    if(adminInput) {
        adminInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                loginAdmin();
            }
        });
    }
});

// Load students from Supabase
async function loadStudents() {
    try {
        let { data, error } = await supabaseClient
            .from('students')
            .select('*');
            
        if (error) throw error;
        
        // Map back to original keys so we don't break existing code
        if (data) {
            studentsData = data.map(s => ({
                StdNo: s.std_no,
                PrefixTitle: s.prefix_title,
                FName: s.fname,
                LName: s.lname,
                class: s.class_room
            }));
        }
    } catch (error) {
        console.error("Error loading students data:", error);
        showToast("ไม่สามารถโหลดข้อมูลนักเรียนได้: " + error.message, "error");
    }
}

// Load rooms from Supabase
async function loadRooms() {
    try {
        let { data, error } = await supabaseClient
            .from('rooms')
            .select('*');
            
        if (error) throw error;
        
        if (data) {
            data.sort((a, b) => {
                const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
                return numA - numB;
            });
            
            rooms = data.map(r => ({
                id: r.id,
                title: r.title,
                type: r.type,
                capacity: r.capacity,
                targetClass: r.target_class,
                occupants: []
            }));
        }
    } catch (error) {
        console.error("Error loading rooms data:", error);
        showToast("ไม่สามารถโหลดข้อมูลห้องได้: " + error.message, "error");
    }
}

// Admin Logic
function toggleAdminMode() {
    if (isAdmin) {
        customConfirm("ออกจากระบบ", "ต้องการออกจากโหมดผู้ดูแลระบบหรือไม่?", "info", () => {
            isAdmin = false;
            localStorage.removeItem('isAdmin');
            document.getElementById('adminBtn').innerHTML = '<i class="fa-solid fa-lock text-lg"></i>';
            document.getElementById('adminBtn').classList.replace('text-emerald-500', 'text-gray-300');
            showToast("ออกจากระบบผู้ดูแลแล้ว", "success");
            if(currentSelectedRoom) renderOccupants();
        });
    } else {
        const modal = document.getElementById('adminModal');
        const modalContent = document.getElementById('adminModalContent');
        document.getElementById('adminPassword').value = '';
        modal.classList.remove('hidden');
        updateBodyScroll();
        setTimeout(() => {
            modal.classList.add('opacity-100');
            modalContent.classList.remove('scale-95');
            document.getElementById('adminPassword').focus();
        }, 10);
    }
}

function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    const modalContent = document.getElementById('adminModalContent');
    modal.classList.remove('opacity-100');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        updateBodyScroll();
    }, 300);
}

async function loginAdmin() {
    const pass = document.getElementById('adminPassword').value;
    const btn = document.querySelector('#adminModalContent button:last-child');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        const { data, error } = await supabaseClient
            .from('settings')
            .select('value')
            .eq('key', 'admin_password')
            .limit(1);
            
        if (error) throw error;
        
        if (data && data.length > 0 && pass.trim() === data[0].value.trim()) {
            isAdmin = true;
            localStorage.setItem('isAdmin', 'true');
            closeAdminModal();
            document.getElementById('adminBtn').innerHTML = '<i class="fa-solid fa-lock-open text-lg"></i>';
            document.getElementById('adminBtn').classList.replace('text-gray-300', 'text-emerald-500');
            showToast("เข้าสู่ระบบผู้ดูแลสำเร็จ", "success");
            
            if(currentSelectedRoom) {
                renderOccupants();
                updateBookingFormVisibility();
            }
        } else {
            showToast("รหัสผ่านไม่ถูกต้อง", "error");
        }
    } catch (error) {
        console.error("Login error:", error);
        showToast("เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Initialize Empty Rooms Structure


// ดึงข้อมูลการจองทั้งหมดจาก Google Sheets
async function fetchBookings() {
    try {
        showLoading(true);
        const { data, error } = await supabaseClient
            .from('bookings')
            .select('*');
            
        if (error) throw error;
        
        // เคลียร์คนออกให้หมดก่อน
        rooms.forEach(r => r.occupants = []);
        
        // จับคู่ข้อมูลการจองกับข้อมูลนักเรียน
        if (data) {
            data.forEach(booking => {
                const room = rooms.find(r => r.id === booking.room_id);
                const student = studentsData.find(s => s.StdNo === booking.std_no);
                
                if (room && student) {
                    room.occupants.push(student);
                }
            });
        }
        
        renderRooms();
        
        // ถ้า Modal เปิดอยู่ ให้อัปเดตข้อมูลใน Modal ด้วย
        if (currentSelectedRoom) {
            renderOccupants();
            document.getElementById('occupancyCount').innerText = currentSelectedRoom.occupants.length;
            updateBookingFormVisibility();
        }
    } catch (error) {
        console.error("Error fetching bookings:", error);
        showToast("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + error.message, "error");
    } finally {
        showLoading(false);
    }
}

// Render Skeleton Rooms while loading
function renderRoomSkeletons() {
    const octupleContainer = document.getElementById('octuple-rooms-container');
    const doubleContainer = document.getElementById('double-rooms-container');
    
    octupleContainer.innerHTML = '';
    doubleContainer.innerHTML = '';
    
    const skeletonHTML = `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 animate-pulse h-28">
            <div class="p-4 border-b border-gray-100 flex justify-between items-center">
                <div class="h-4 bg-gray-200 rounded w-24"></div>
                <div class="h-5 bg-gray-200 rounded-full w-10"></div>
            </div>
            <div class="p-4 bg-gray-50 flex justify-between items-center">
                <div class="h-3 bg-gray-200 rounded w-16"></div>
                <div class="w-8 h-8 bg-gray-200 rounded-full"></div>
            </div>
        </div>
    `;

    // 2 Octuple rooms
    for (let i = 0; i < 2; i++) {
        octupleContainer.innerHTML += skeletonHTML;
    }

    // 25 Double rooms
    for (let i = 0; i < 25; i++) {
        doubleContainer.innerHTML += skeletonHTML;
    }
}

let hasInitialRendered = false;

// Render Rooms to DOM
function renderRooms() {
    const doubleContainer = document.getElementById('double-rooms-container');
    const octupleContainer = document.getElementById('octuple-rooms-container');
    
    doubleContainer.innerHTML = '';
    octupleContainer.innerHTML = '';

    rooms.forEach((room, index) => {
        const isFull = room.occupants.length >= room.capacity;
        const isEmpty = room.occupants.length === 0;
        
        let stateClass = 'room-empty';
        if (isFull) stateClass = 'room-full';
        else if (!isEmpty) stateClass = 'room-partial';

        // Generate visual slots
        let slotsHTML = '<div class="flex flex-wrap gap-1 mt-3">';
        for (let i = 0; i < room.capacity; i++) {
            if (i < room.occupants.length) {
                const occ = room.occupants[i];
                const isMale = occ.PrefixTitle === 'นาย';
                const colorClass = isMale ? 'text-blue-500' : 'text-pink-500';
                slotsHTML += `<i class="fa-solid fa-user ${colorClass} text-base drop-shadow-sm"></i>`;
            } else {
                slotsHTML += `<i class="fa-solid fa-user text-gray-200 text-base"></i>`;
            }
        }
        slotsHTML += '</div>';

        // Gender Badge
        let genderBadge = '';
        if (!isEmpty) {
            const firstOccupant = room.occupants[0];
            const isMale = firstOccupant.PrefixTitle === 'นาย';
            genderBadge = isMale 
                ? '<span class="bg-blue-100 text-blue-600 text-[11px] px-2 py-0.5 rounded-md flex items-center w-fit mt-1.5"><i class="fa-solid fa-mars mr-1"></i> ห้องชาย</span>' 
                : '<span class="bg-pink-100 text-pink-600 text-[11px] px-2 py-0.5 rounded-md flex items-center w-fit mt-1.5"><i class="fa-solid fa-venus mr-1"></i> ห้องหญิง</span>';
        }

        const animClass = hasInitialRendered ? '' : 'animate-fade-in-up';
        const animDelay = hasInitialRendered ? '' : `style="animation-delay: ${(index % 12) * 50}ms;"`;

        const roomHTML = `
            <div onclick="openModal('${room.id}')" class="room-card ${stateClass} rounded-xl p-3 sm:p-4 cursor-pointer flex flex-col justify-between min-h-[8.5rem] relative overflow-hidden group ${animClass}" ${animDelay}>
                <div class="flex justify-between items-start gap-2">
                    <div class="flex-1">
                        <h4 class="font-bold text-gray-800 text-sm sm:text-base leading-tight">${room.title}</h4>
                        ${genderBadge}
                        ${room.type === 'octuple' ? `<span class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded mt-1 inline-block">เฉพาะ ม.${room.targetClass}</span>` : ''}
                    </div>
                    <div class="bg-white/80 rounded-full px-2 py-0.5 text-xs font-semibold text-gray-600 shadow-sm border border-gray-100 shrink-0">
                        ${room.occupants.length}/${room.capacity}
                    </div>
                </div>
                ${slotsHTML}
                ${isFull ? '<div class="absolute inset-0 bg-white/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span class="bg-gray-800 text-white text-xs px-3 py-1 rounded-full shadow-lg">ห้องเต็ม</span></div>' : ''}
            </div>
        `;

        if (room.type === 'octuple') {
            octupleContainer.innerHTML += roomHTML;
        } else {
            doubleContainer.innerHTML += roomHTML;
        }
    });
    
    hasInitialRendered = true;
}

// Modal Logic
function updateBookingFormVisibility() {
    if (!currentSelectedRoom) return;
    
    // เช็คว่าห้องเต็มหรือยัง และถึงเวลาจองหรือเป็น Admin หรือไม่
    if (isBookingOpen || isAdmin) {
        if (currentSelectedRoom.occupants.length >= currentSelectedRoom.capacity) {
            document.getElementById('bookingFormSection').classList.add('hidden');
            document.getElementById('roomFullMessage').classList.remove('hidden');
        } else {
            document.getElementById('bookingFormSection').classList.remove('hidden');
            document.getElementById('roomFullMessage').classList.add('hidden');
        }
        document.getElementById('notOpenMessage').classList.add('hidden');
    } else {
        document.getElementById('bookingFormSection').classList.add('hidden');
        document.getElementById('roomFullMessage').classList.add('hidden');
        document.getElementById('notOpenMessage').classList.remove('hidden');
    }
}

function openModal(roomId) {
    currentSelectedRoom = rooms.find(r => r.id === roomId);
    if (!currentSelectedRoom) return;

    // ดึงข้อมูลใหม่ก่อนเปิดให้ชัวร์
    if(!isFetching && SUPABASE_URL) {
        fetchBookings();
    }

    // Update Modal UI
    document.getElementById('modalRoomTitle').innerText = currentSelectedRoom.title;
    document.getElementById('occupancyCount').innerText = currentSelectedRoom.occupants.length;
    document.getElementById('maxCapacity').innerText = currentSelectedRoom.capacity;
    
    renderOccupants();
    resetForm();
    updateBookingFormVisibility();

    // Show Modal
    const modal = document.getElementById('bookingModal');
    const modalContent = document.getElementById('bookingModalContent');
    modal.classList.remove('hidden');
    updateBodyScroll();
    setTimeout(() => {
        modal.classList.add('modal-animate-in');
        modalContent.classList.add('modal-content-animate-in');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('bookingModal');
    const modalContent = document.getElementById('bookingModalContent');
    modal.classList.remove('modal-animate-in');
    modalContent.classList.remove('modal-content-animate-in');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        currentSelectedRoom = null;
        resetForm();
        updateBodyScroll();
    }, 300);
}

function renderOccupants() {
    const container = document.getElementById('currentOccupants');
    if (!currentSelectedRoom || currentSelectedRoom.occupants.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 italic text-center py-2 border border-dashed rounded bg-gray-50">ยังไม่มีผู้เข้าพัก</p>';
        return;
    }

    container.innerHTML = currentSelectedRoom.occupants.map((occ, index) => {
        const isMale = occ.PrefixTitle === 'นาย';
        const genderColor = isMale ? 'bg-blue-500' : 'bg-pink-500';
        const genderIcon = isMale ? 'fa-mars' : 'fa-venus';
        
        return `
            <div class="flex justify-between items-center p-4 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition-shadow animate-fade-in-up" style="animation-delay: ${index * 50}ms;">
                <div class="flex items-center">
                    <div class="w-10 h-10 rounded-full ${genderColor} flex items-center justify-center text-white mr-4 shadow-inner">
                        <i class="fa-solid ${genderIcon}"></i>
                    </div>
                    <div>
                        <p class="font-bold text-gray-800">${occ.PrefixTitle}${occ.FName} ${occ.LName}</p>
                        <p class="text-xs text-gray-500">รหัส: ${occ.StdNo} | ม.${occ.class}</p>
                    </div>
                </div>
                ${isAdmin ? `
                <button onclick="removeOccupant('${occ.StdNo}')" class="text-red-400 hover:text-red-600 hover:bg-red-50 w-8 h-8 rounded-full transition flex items-center justify-center shrink-0 ml-2" title="ลบออก">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

function resetForm() {
    document.getElementById('studentId').value = '';
    document.getElementById('studentError').classList.add('hidden');
    document.getElementById('studentPreview').classList.add('hidden');
    document.getElementById('confirmBookingBtn').disabled = true;
    document.getElementById('confirmBookingBtn').classList.add('hidden');
    currentPreviewStudent = null;
}

// Booking Logic
function searchStudent() {
    const studentId = document.getElementById('studentId').value.trim();
    const errorEl = document.getElementById('studentError');
    
    if (!studentId) {
        showError("กรุณากรอกรหัสนักเรียน");
        return;
    }

    const student = studentsData.find(s => s.StdNo === studentId);
    
    if (!student) {
        showError("ไม่พบข้อมูลรหัสนักเรียนนี้");
        return;
    }

    // 1. Already booked somewhere?
    let alreadyBookedRoom = null;
    for (const r of rooms) {
        if (r.occupants.some(o => o.StdNo === student.StdNo)) {
            alreadyBookedRoom = r;
            break;
        }
    }

    if (alreadyBookedRoom) {
        showError(`นักเรียนคนนี้จอง ${alreadyBookedRoom.title} ไปแล้ว`);
        return;
    }

    // 2. Gender and Class check (if room is not empty)
    if (currentSelectedRoom.occupants.length > 0) {
        const firstOccupant = currentSelectedRoom.occupants[0];
        
        if (student.PrefixTitle !== firstOccupant.PrefixTitle) {
            showError("ไม่สามารถจองห้องพักรวมชาย-หญิงได้");
            return;
        }
        
        if (currentSelectedRoom.type === 'double') {
            if (student.class !== firstOccupant.class) {
                showError(`นักเรียนคนละห้อง (ม.${firstOccupant.class} และ ม.${student.class}) ไม่สามารถพักห้องเดียวกันได้`);
                return;
            }
        }
    }

    // 3. Class check for octuple rooms
    if (currentSelectedRoom.type === 'octuple') {
        if (student.class !== currentSelectedRoom.targetClass) {
            showError(`ห้องนี้เฉพาะนักเรียนชั้น ม.${currentSelectedRoom.targetClass} เท่านั้น`);
            return;
        }
    }

    // Success Preview
    errorEl.classList.add('hidden');
    currentPreviewStudent = student;
    
    const isMale = student.PrefixTitle === 'นาย';
    document.getElementById('studentNamePreview').innerText = `${student.PrefixTitle}${student.FName} ${student.LName}`;
    document.getElementById('studentClassPreview').innerText = `ม.${student.class}`;
    
    const genderEl = document.getElementById('studentGenderPreview');
    genderEl.innerText = isMale ? 'ชาย' : 'หญิง';
    genderEl.className = `px-2 py-1 rounded text-xs font-medium ${isMale ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`;
    
    const iconEl = document.getElementById('studentGenderIcon');
    iconEl.className = `fa-solid ${isMale ? 'fa-mars text-blue-500' : 'fa-venus text-pink-500'} text-2xl`;

    document.getElementById('studentPreview').classList.remove('hidden');
    document.getElementById('confirmBookingBtn').disabled = false;
    document.getElementById('confirmBookingBtn').classList.remove('hidden');
}

function showError(msg) {
    const errorEl = document.getElementById('studentError');
    errorEl.innerText = msg;
    errorEl.classList.remove('hidden');
    document.getElementById('studentPreview').classList.add('hidden');
    document.getElementById('confirmBookingBtn').disabled = true;
    document.getElementById('confirmBookingBtn').classList.add('hidden');
    currentPreviewStudent = null;
}

// ยืนยันการจอง ส่งข้อมูลไป Supabase
async function confirmBooking() {
    if (!currentPreviewStudent || !currentSelectedRoom || isFetching) return;
    
    const btn = document.getElementById('confirmBookingBtn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
    btn.disabled = true;
    showLoading(true);
    
    try {
        const { error } = await supabaseClient
            .from('bookings')
            .insert([
                { room_id: currentSelectedRoom.id, std_no: currentPreviewStudent.StdNo }
            ]);
            
        if (error) throw error;
        
        await fetchBookings(); // อัปเดตข้อมูลใหม่ทั้งหมด
        resetForm();
        showToast("เพิ่มรายชื่อเข้าห้องพักสำเร็จ!");
    } catch (error) {
        console.error("Booking error:", error);
        showToast("ไม่สามารถบันทึกข้อมูลได้: " + error.message, "error");
    } finally {
        btn.innerHTML = 'ยืนยันการเข้าพัก';
        showLoading(false);
    }
}

// ลบผู้จองออกจาก Supabase
async function removeOccupant(stdNo) {
    if (isFetching) {
        showToast("ระบบกำลังอัปเดตข้อมูล กรุณารอสักครู่แล้วลองใหม่", "error");
        return;
    }

    customConfirm("ยืนยันการลบ", "ต้องการลบรายชื่อนี้ออกจากห้องพักหรือไม่?", "danger", async () => {
        showLoading(true);
        try {
            const { error } = await supabaseClient
                .from('bookings')
                .delete()
                .eq('room_id', currentSelectedRoom.id)
                .eq('std_no', stdNo);
                
            if (error) throw error;
            
            await fetchBookings(); // อัปเดตข้อมูลใหม่ทั้งหมด
            showToast("ลบรายชื่อสำเร็จ", "success");
        } catch (error) {
            console.error("Unbook error:", error);
            showToast("ไม่สามารถลบข้อมูลได้: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    });
}

// UI Utilities
function showLoading(show) {
    isFetching = show;
    // แสดง loading indicator บนหัวเว็บ (ถ้าต้องการเพิ่ม)
    const title = document.querySelector('h1');
    if (show) {
        if (!title.querySelector('.fa-spinner')) {
            title.innerHTML += ' <i class="fa-solid fa-spinner fa-spin text-sm text-gray-400 ml-2"></i>';
        }
    } else {
        const spinner = title.querySelector('.fa-spinner');
        if (spinner) spinner.remove();
    }
}

let toastTimeout;
function showToast(message, type = "success") {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');
    
    msg.innerText = message;
    
    if (type === "success") {
        icon.className = "inline-flex items-center justify-center flex-shrink-0 w-8 h-8 text-emerald-500 bg-emerald-100 rounded-lg";
        icon.innerHTML = '<i class="fa-solid fa-check"></i>';
    } else {
        icon.className = "inline-flex items-center justify-center flex-shrink-0 w-8 h-8 text-red-500 bg-red-100 rounded-lg";
        icon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    }

    toast.classList.remove('translate-y-20', 'opacity-0');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

let confirmCallback = null;

function customConfirm(title, text, type, onConfirm) {
    document.getElementById('confirmModalTitle').innerText = title;
    document.getElementById('confirmModalText').innerText = text;
    
    const iconDiv = document.getElementById('confirmModalIcon');
    const yesBtn = document.getElementById('confirmModalYesBtn');
    
    if (type === 'danger') {
        iconDiv.className = 'w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4';
        yesBtn.className = 'flex-1 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg px-5 py-3 transition-all duration-200 active:scale-95';
        iconDiv.innerHTML = '<i class="fa-solid fa-trash-can text-2xl"></i>';
    } else {
        iconDiv.className = 'w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4';
        yesBtn.className = 'flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg px-5 py-3 transition-all duration-200 active:scale-95';
        iconDiv.innerHTML = '<i class="fa-solid fa-circle-question text-2xl"></i>';
    }

    confirmCallback = onConfirm;
    
    yesBtn.onclick = function() {
        closeConfirmModal();
        if (confirmCallback) confirmCallback();
    };

    const modal = document.getElementById('confirmModal');
    const modalContent = document.getElementById('confirmModalContent');
    modal.classList.remove('hidden');
    updateBodyScroll();
    setTimeout(() => {
        modal.classList.add('opacity-100');
        modalContent.classList.remove('scale-95');
    }, 10);
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    const modalContent = document.getElementById('confirmModalContent');
    modal.classList.remove('opacity-100');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        updateBodyScroll();
    }, 300);
}

function updateBodyScroll() {
    const modals = ['bookingModal', 'adminModal', 'confirmModal'];
    let isAnyOpen = false;
    for (let id of modals) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
            isAnyOpen = true;
            break;
        }
    }
    if (isAnyOpen) {
        document.body.classList.add('overflow-hidden');
    } else {
        document.body.classList.remove('overflow-hidden');
    }
}

document.getElementById('studentId')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') searchStudent();
});
