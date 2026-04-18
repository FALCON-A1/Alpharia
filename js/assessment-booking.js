import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import { collection, query, where, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

let fpInstance = null;
let activeTeacher = null;
let selectedDate = null;
let selectedTime = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { user } = await requireAuth();
        
        // Fetch Parent Profile for sidebar
        const parentDoc = await getDoc(doc(db, 'users', user.uid));
        if (parentDoc.exists()) {
            const name = parentDoc.data().name || parentDoc.data().firstName || 'Parent';
            document.getElementById('parent-name-sidebar').textContent = name;
        }

        initSidebar();
        await fetchAvailableTeachers();

    } catch (e) {
        console.error('Booking init error:', e);
    }
});

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    if (toggle && sidebar) toggle.addEventListener('click', () => { sidebar.classList.toggle('active'); overlay?.classList.toggle('active'); });
    if (overlay && sidebar) overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
    
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        auth.signOut().then(() => window.location.href = '/auth/login-fixed.html');
    });
}

async function fetchAvailableTeachers() {
    const loadingEl = document.getElementById('teachers-loading');
    const emptyEl = document.getElementById('teachers-empty');
    const listEl = document.getElementById('teachers-list');
    
    try {
        const q = query(collection(db, 'teachers'), where('bookingEnabled', '==', true));
        const snap = await getDocs(q);

        loadingEl.style.display = 'none';

        if (snap.empty) {
            emptyEl.style.display = 'block';
            return;
        }

        let html = '';
        snap.forEach(docSnap => {
            const t = docSnap.data();
            const avatar = t.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name || 'Teacher')}&background=4f46e5&color=fff`;
            
            // Serialize bookingDays so we can attach it to the DOM dataset
            const daysArr = t.bookingDays || [];
            
            html += `
                <div class="expert-card" 
                     data-uid="${docSnap.id}" 
                     data-name="${t.name || 'Certified Teacher'}"
                     data-price="${t.bookingPrice || 49}"
                     data-days='${JSON.stringify(daysArr)}'>
                    <img src="${avatar}" class="expert-avatar" alt="Avatar">
                    <div class="expert-info">
                        <div class="expert-name">${t.name || 'Certified Teacher'}</div>
                        <div class="expert-title">Certified Reading Specialist</div>
                        <div class="expert-price">$${t.bookingPrice || 49} <span>/session</span></div>
                    </div>
                    <i class="fas fa-chevron-right" style="color:var(--sd-text-3);"></i>
                </div>
            `;
        });

        listEl.innerHTML = html;

        // Bind clicks
        document.querySelectorAll('.expert-card').forEach(card => {
            card.addEventListener('click', function() {
                // Visual selection state
                document.querySelectorAll('.expert-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');

                // Read data
                activeTeacher = {
                    uid: this.dataset.uid,
                    name: this.dataset.name,
                    price: this.dataset.price,
                    days: JSON.parse(this.dataset.days)
                };

                activateCalendar();
            });
        });

    } catch (e) {
        console.error('Error fetching teachers:', e);
        loadingEl.innerHTML = `<p style="color:red;">Error loading experts.</p>`;
    }
}

function activateCalendar() {
    const wrapper = document.getElementById('calendar-wrapper');
    const prompt = document.getElementById('select-prompt');
    const content = document.getElementById('calendar-content');
    
    wrapper.style.opacity = '1';
    wrapper.style.pointerEvents = 'auto';
    prompt.style.display = 'none';
    content.style.display = 'block';

    document.getElementById('teacher-name-label').textContent = `with ${activeTeacher.name}`;
    document.getElementById('pay-price-label').textContent = `$${activeTeacher.price}`;
    
    // Reset previous selection
    document.getElementById('checkout-box').style.display = 'none';
    document.getElementById('timeSlots').innerHTML = '<p style="color:var(--sd-text-3); font-size:0.85rem;">Please select a date first.</p>';
    
    initFlatpickr();
}

function initFlatpickr() {
    // Destroy previous instance if someone clicked a different teacher
    if (fpInstance) {
        fpInstance.destroy();
    }
    
    // Flatpickr weekday index is 0=Sun, 1=Mon, ..., 6=Sat
    // We only allow selection if the day matches activeTeacher.days array
    
    fpInstance = flatpickr("#datePicker", {
        minDate: "today",
        disable: [
            function(date) { 
                const jsDay = date.getDay(); 
                // Return true to DISABLE the date if it's NOT in the teacher's active days
                return !activeTeacher.days.includes(jsDay);
            }
        ],
        onChange: function(selectedDates, dateStr, instance) {
            selectedDate = dateStr;
            selectedTime = null;
            document.getElementById('checkout-box').style.display = 'none';
            generateTimeSlots();
        }
    });

    // Make sure we clear the input when a new teacher is selected
    document.getElementById('datePicker').value = "";
}

function generateTimeSlots() {
    const slotsDiv = document.getElementById('timeSlots');
    // Mock time generation for Phase 2
    const times = ['3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM'];
    
    let html = '';
    times.forEach(time => {
        const isDisabled = Math.random() > 0.7; // Randomly book some slots for realism
        const cls = isDisabled ? 'time-slot disabled' : 'time-slot';
        html += `<div class="${cls}" data-time="${time}">${time}</div>`;
    });
    
    slotsDiv.innerHTML = html;

    // Bind slot clicks
    document.querySelectorAll('.time-slot:not(.disabled)').forEach(el => {
        el.addEventListener('click', function() {
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
            this.classList.add('selected');
            selectedTime = this.getAttribute('data-time');
            
            document.getElementById('confirm-datetime').textContent = `${selectedDate} at ${selectedTime}`;
            document.getElementById('checkout-box').style.display = 'block';
        });
    });
}

// Proceed to Checkout
document.getElementById('pay-btn').addEventListener('click', async () => {
    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Secure Payment...';
    
    try {
        const { user } = auth;
        if (!user) throw new Error("Not logged in");

        // Save booking to Firestore
        const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
        
        await addDoc(collection(db, 'bookings'), {
            parentId: user.uid,
            teacherId: activeTeacher.uid,
            teacherName: activeTeacher.name,
            date: selectedDate,
            time: selectedTime,
            price: activeTeacher.price,
            status: 'upcoming',
            createdAt: serverTimestamp()
        });

        // Mock payment delay
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Assessment Booked!';
            btn.style.backgroundColor = '#10b981'; // Green
            btn.style.borderColor = '#10b981';
            
            setTimeout(() => {
                window.location.href = 'parent-assessments.html';
            }, 2000);
        }, 1000);

    } catch (e) {
        console.error("Booking error:", e);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error. Try Again.';
    }
});
