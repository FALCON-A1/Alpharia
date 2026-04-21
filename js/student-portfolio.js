import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import {
    collection, query, where, getDocs, doc, getDoc, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { analyzeStudentRisk, levelLabel, LEVEL_ORDER } from './early-warning.js';

// ═══════════════════════════════════════════════════════════
//  STUDENT PORTFOLIO — Teacher-Facing Student Detail View
//  Feature #14: Student Reading Portfolio
// ═══════════════════════════════════════════════════════════

let growthChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Allow teachers, admins, AND parents to view portfolios
        const urlParams = new URLSearchParams(window.location.search);
        const isParentView = urlParams.get('view') === 'parent';
        
        await requireAuth(isParentView ? ['teacher', 'admin', 'parent'] : ['teacher', 'admin']);
        
        if (isParentView) {
            loadParentProfile();
        } else {
            loadTeacherProfile();
        }
        
        const studentId = urlParams.get('id');
        if (!studentId) {
            document.getElementById('pfName').textContent = 'No student selected';
            return;
        }
        await loadPortfolio(studentId);
        initSidebar();
        
        // If parent view, adjust the sidebar and back button
        if (isParentView) {
            adaptForParentView();
        }
    } catch (e) {
        console.error('Portfolio init error:', e);
    }
});

async function loadTeacherProfile() {
    try {
        const { user } = await requireAuth(['teacher', 'admin']);
        const teacherDoc = await getDoc(doc(db, 'teachers', user.uid));
        let name = 'Teacher';
        if (teacherDoc.exists()) name = teacherDoc.data().name || name;
        else {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const d = userDoc.data();
                name = d.firstName ? `${d.firstName} ${d.lastName || ''}`.trim() : (d.name || 'Teacher');
            }
        }
        document.getElementById('sidebar-teacher-name').textContent = name;
    } catch (e) { /* silent */ }
}

async function loadParentProfile() {
    try {
        const { user } = await requireAuth(['parent', 'teacher', 'admin']);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        let name = 'Parent';
        if (userDoc.exists()) {
            const d = userDoc.data();
            name = d.name || d.firstName || 'Parent';
        }
        const nameEl = document.getElementById('sidebar-teacher-name');
        if (nameEl) nameEl.textContent = name;
        const roleEl = document.querySelector('.sd-sidebar-user-role');
        if (roleEl) roleEl.textContent = 'Parent';
    } catch (e) { /* silent */ }
}

function adaptForParentView() {
    // Change sidebar brand
    const brandText = document.querySelector('.sd-brand-text');
    if (brandText) brandText.textContent = 'Alpharia Parent';
    const brandLink = document.querySelector('.sd-sidebar-brand');
    if (brandLink) brandLink.href = 'parent-dashboard.html';

    // Update sidebar nav for parent context
    const nav = document.querySelector('.sd-nav');
    if (nav) {
        nav.innerHTML = `
            <span class="sd-nav-section-label">Home</span>
            <a href="parent-dashboard.html" class="sd-nav-link"><i class="fas fa-tachometer-alt"></i><span>Dashboard</span></a>
            <span class="sd-nav-section-label">Services</span>
            <a href="assessment-booking.html" class="sd-nav-link"><i class="fas fa-calendar-check"></i><span>Book Assessment</span></a>
            <a href="parent-assessments.html" class="sd-nav-link"><i class="fas fa-calendar-alt"></i><span>My Bookings</span></a>
            <a href="parent-invite.html" class="sd-nav-link"><i class="fas fa-link"></i><span>Link Child Account</span></a>
            <span class="sd-nav-section-label">Account</span>
            <a href="parent-settings.html" class="sd-nav-link"><i class="fas fa-cog"></i><span>Settings</span></a>
        `;
    }

    // Change back button to go to parent dashboard
    const backBtn = document.querySelector('a[href="teacher-progress.html"]');
    if (backBtn) {
        backBtn.href = 'parent-dashboard.html';
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Dashboard';
    }
}

async function loadPortfolio(studentId) {
    // 1. Get student profile
    const studentDoc = await getDoc(doc(db, 'students', studentId));
    if (!studentDoc.exists()) {
        document.getElementById('pfName').textContent = 'Student not found';
        return;
    }
    const student = studentDoc.data();
    const studentName = student.displayName || student.name || student.firstName || 'Student';
    document.getElementById('pfName').textContent = studentName;
    document.title = `${studentName} — Portfolio — Alpharia`;

    // 2. Get results
    let results = [];
    try {
        const snap = await getDocs(
            query(collection(db, 'results'), where('userId', '==', studentId), orderBy('timestamp', 'desc'), limit(50))
        );
        results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        try {
            const snap = await getDocs(query(collection(db, 'results'), where('userId', '==', studentId)));
            results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            results.sort((a, b) => {
                const ta = a.timestamp?.toDate?.() || new Date(0);
                const tb = b.timestamp?.toDate?.() || new Date(0);
                return tb - ta;
            });
        } catch (e2) { console.warn(e2); }
    }

    // 3. Get gamification profile
    let gamData = null;
    try {
        const gamDoc = await getDoc(doc(db, 'students', studentId, 'gamification', 'profile'));
        if (gamDoc.exists()) gamData = gamDoc.data();
    } catch (e) { /* silent */ }

    // 4. Risk analysis
    const risk = analyzeStudentRisk(results);
    const latest = results[0] || null;

    // ═══ HEADER BADGES ═══
    document.getElementById('pfLevelBadge').textContent = risk.details.placedLevelLabel || 'Not Tested';
    document.getElementById('pfFluencyBadge').textContent = risk.details.fluencyClass || 'N/A';
    
    const riskBadge = document.getElementById('pfRiskBadge');
    riskBadge.textContent = risk.level.toUpperCase() + ' RISK';
    riskBadge.className = `pf-risk-badge pf-risk-${risk.level}`;

    // ═══ STATS ═══
    document.getElementById('pfWpm').textContent = risk.details.wpm > 0 ? risk.details.wpm : '—';
    document.getElementById('pfAccuracy').textContent = risk.details.accuracy > 0 ? risk.details.accuracy + '%' : '—';
    document.getElementById('pfComp').textContent = risk.details.compPercent > 0 ? risk.details.compPercent + '%' : '—';
    document.getElementById('pfTests').textContent = results.length;
    document.getElementById('pfPoints').textContent = gamData?.totalPoints || 0;
    document.getElementById('pfBadgeCount').textContent = gamData?.badges?.length || 0;

    // ═══ GROWTH CHART ═══
    buildGrowthChart(results);

    // ═══ BADGES ═══
    const badgesDiv = document.getElementById('pfBadgesContainer');
    const badges = gamData?.badges || [];
    if (badges.length > 0) {
        badgesDiv.innerHTML = `<div class="pf-badge-grid">
            ${badges.map(b => `
                <div class="pf-badge-item">
                    <span class="pf-badge-emoji">${b.emoji || '🏅'}</span>
                    <div class="pf-badge-name">${b.name || 'Badge'}</div>
                    <div class="pf-badge-date">${b.earnedAt ? new Date(b.earnedAt).toLocaleDateString() : ''}</div>
                </div>
            `).join('')}
        </div>`;
    } else {
        badgesDiv.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:1.5rem;">No badges earned yet. Badges are awarded after completing reading assessments.</p>`;
    }

    // ═══ RECOMMENDATIONS ═══
    const recDiv = document.getElementById('pfRecommendations');
    const recs = latest?.recommendations || [];
    if (recs.length > 0) {
        recDiv.innerHTML = recs.map(r => `
            <div class="pf-rec">
                <div class="pf-rec-title">${r.title || 'Recommendation'}</div>
                <div class="pf-rec-detail">${r.detail || ''}</div>
                ${r.area ? `<span class="pf-rec-area">${r.area}</span>` : ''}
            </div>
        `).join('');
    } else {
        recDiv.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:1.5rem;">No AI recommendations yet. Student needs to complete an assessment.</p>`;
    }

    // ═══ ERROR ANALYSIS ═══
    const errDiv = document.getElementById('pfErrors');
    const oe = latest?.oralErrors || {};
    const errorTypes = [
        { key: 'mispronounced', label: 'Mispronounced', icon: 'fa-times-circle', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
        { key: 'substitutions', label: 'Substitutions', icon: 'fa-exchange-alt', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
        { key: 'omissions', label: 'Omissions (Skipped)', icon: 'fa-minus-circle', color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
        { key: 'additions', label: 'Additions (Inserted)', icon: 'fa-plus-circle', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' }
    ];
    const hasErrors = errorTypes.some(t => oe[t.key] > 0);
    if (hasErrors) {
        errDiv.innerHTML = errorTypes.filter(t => oe[t.key] > 0).map(t => `
            <div class="pf-error-row">
                <div class="pf-error-icon" style="background:${t.bg}; color:${t.color};"><i class="fas ${t.icon}"></i></div>
                <div class="pf-error-label">${t.label}</div>
                <div class="pf-error-count">${oe[t.key]}</div>
            </div>
        `).join('');
    } else {
        errDiv.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:1.5rem;">No error data available. Complete an oral reading assessment to see error breakdowns.</p>`;
    }

    // ═══ HISTORY TABLE ═══
    const histDiv = document.getElementById('pfHistory');
    if (results.length > 0) {
        histDiv.innerHTML = `
            <table class="pf-hist-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Reading Level</th>
                        <th>WPM</th>
                        <th>Accuracy</th>
                        <th>Fluency</th>
                        <th>Comprehension</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map(r => {
                        const d = r.timestamp?.toDate ? r.timestamp.toDate().toLocaleDateString() : '—';
                        return `<tr>
                            <td>${d}</td>
                            <td><span style="background:var(--sd-primary-lt); color:var(--sd-primary); padding:0.15rem 0.5rem; border-radius:50px; font-size:0.72rem; font-weight:700;">${levelLabel(r.placedLevel)}</span></td>
                            <td style="font-weight:700;">${r.fluency?.wordsPerMinute || '—'}</td>
                            <td>${r.fluency?.accuracyRate ? r.fluency.accuracyRate + '%' : '—'}</td>
                            <td>${r.fluency?.classification || '—'}</td>
                            <td>${r.comprehensionPercent ? r.comprehensionPercent + '%' : '—'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    } else {
        histDiv.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:1.5rem;">No assessments found.</p>`;
    }
}

function buildGrowthChart(results) {
    const canvas = document.getElementById('growthChart');
    if (!canvas) return;
    if (growthChart) growthChart.destroy();

    const reversed = [...results].reverse();
    if (reversed.length < 1) {
        canvas.parentElement.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:2rem;">Not enough data for a growth chart.</p>`;
        return;
    }

    const labels = reversed.map((r, i) =>
        r.timestamp?.toDate ? r.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Test ${i + 1}`
    );

    growthChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Reading Level',
                    data: reversed.map(r => LEVEL_ORDER.indexOf(r.placedLevel) + 1 || 0),
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79,70,229,0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'WPM',
                    data: reversed.map(r => r.fluency?.wordsPerMinute || 0),
                    borderColor: '#14b8a6',
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y1'
                },
                {
                    label: 'Accuracy %',
                    data: reversed.map(r => r.fluency?.accuracyRate || 0),
                    borderColor: '#f59e0b',
                    borderDash: [2, 4],
                    tension: 0.4,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    position: 'left',
                    title: { display: true, text: 'Reading Level' },
                    ticks: {
                        callback: v => ['', 'PP', 'P', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'][v] || v,
                        stepSize: 1
                    },
                    min: 0, max: 8
                },
                y1: { position: 'right', title: { display: true, text: 'WPM' }, grid: { drawOnChartArea: false } },
                y2: { display: false }
            },
            plugins: {
                legend: { labels: { font: { size: 11, weight: 600 } } }
            }
        }
    });
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    if (toggle && sidebar) toggle.addEventListener('click', () => { sidebar.classList.toggle('active'); overlay?.classList.toggle('active'); });
    if (overlay && sidebar) overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
    auth.signOut().then(() => window.location.href = '/auth/login-fixed.html');
});
