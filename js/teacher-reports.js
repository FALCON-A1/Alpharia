import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import {
    collection, query, where, getDocs, doc, getDoc, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { analyzeStudentRisk, levelLabel, LEVEL_ORDER } from './early-warning.js';

// ═══════════════════════════════════════════════════════════
//  TEACHER REPORTS — Reading Report Generator (Feature #20)
// ═══════════════════════════════════════════════════════════

let currentTeacherId = null;
let studentsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    initSidebar(); // Initialize sidebar toggle first
    try {
        const { user } = await requireAuth(['teacher', 'admin']);
        currentTeacherId = user.uid;
        await loadTeacherProfile(user.uid);
        await loadStudents(user.uid);
        initEventListeners();
    } catch (e) {
        console.error('Reports init error:', e);
    }
});

async function loadTeacherProfile(uid) {
    try {
        const teacherDoc = await getDoc(doc(db, 'teachers', uid));
        let name = 'Teacher';
        if (teacherDoc.exists()) {
            const d = teacherDoc.data();
            name = d.name || d.firstName || d.displayName || 'Teacher';
        } else {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                const d = userDoc.data();
                name = d.firstName ? `${d.firstName} ${d.lastName || ''}`.trim() : (d.name || 'Teacher');
            }
        }
        const el = document.getElementById('sidebar-teacher-name');
        if (el) el.textContent = name;
    } catch (e) {
        console.error('Profile error:', e);
    }
}

async function loadStudents(teacherId) {
    const snap = await getDocs(
        query(collection(db, 'students'), where('teacherId', '==', teacherId))
    );
    
    const select = document.getElementById('studentSelect');
    if (!select) return;

    studentsCache = [];
    for (const sDoc of snap.docs) {
        const s = sDoc.data();
        const name = s.displayName || s.name || s.firstName || 'Student';
        studentsCache.push({ id: sDoc.id, name, data: s });
        
        const opt = document.createElement('option');
        opt.value = sDoc.id;
        opt.textContent = name;
        select.appendChild(opt);
    }
}

function initEventListeners() {
    // Report type cards
    document.querySelectorAll('.rp-type-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.rp-type-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const type = card.dataset.type;
            const selectorCard = document.getElementById('studentSelectorCard');
            if (selectorCard) selectorCard.style.display = type === 'individual' ? '' : 'none';
            
            if (type === 'class') generateClassReport();
            else if (type === 'progress') generateProgressReport();
        });
    });

    // Student selector
    document.getElementById('studentSelect')?.addEventListener('change', async (e) => {
        if (e.target.value) await generateIndividualReport(e.target.value);
    });

    // Print button
    document.getElementById('printReportBtn')?.addEventListener('click', () => window.print());

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        auth.signOut().then(() => window.location.href = '/auth/login-fixed.html');
    });
}

// ═══════════════════════════════════════════════════════════
//  INDIVIDUAL REPORT
// ═══════════════════════════════════════════════════════════
async function generateIndividualReport(studentId) {
    const preview = document.getElementById('reportPreviewCard');
    const content = document.getElementById('reportContent');
    if (!preview || !content) return;

    const student = studentsCache.find(s => s.id === studentId);
    if (!student) return;

    // Fetch results
    let results = [];
    try {
        const snap = await getDocs(
            query(collection(db, 'results'), where('userId', '==', studentId), orderBy('timestamp', 'desc'), limit(10))
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

    const risk = analyzeStudentRisk(results);
    const latest = results[0] || {};
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    content.innerHTML = `
        <div class="report-container">
            <div class="report-header">
                <h1>📖 Reading Assessment Report</h1>
                <p><strong>${student.name}</strong> · Generated: ${date}</p>
                <p style="font-size:0.75rem; margin-top:0.3rem;">Alpharia Reading Assessment Platform</p>
            </div>

            <div class="report-stats">
                <div class="report-stat">
                    <div class="report-stat-value">${risk.details.placedLevelLabel || 'N/A'}</div>
                    <div class="report-stat-label">Reading Level</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${risk.details.wpm || '—'}</div>
                    <div class="report-stat-label">Words Per Minute</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${risk.details.accuracy ? risk.details.accuracy + '%' : '—'}</div>
                    <div class="report-stat-label">Accuracy</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value">${risk.details.compPercent ? risk.details.compPercent + '%' : '—'}</div>
                    <div class="report-stat-label">Comprehension</div>
                </div>
            </div>

            <div class="report-section">
                <h3>📊 Risk Assessment</h3>
                <p>Overall risk level: <span class="report-risk-${risk.level}">${risk.level.toUpperCase()}</span></p>
                ${risk.flags.length > 0 ? `<ul style="padding-left:1.5rem; margin-top:0.5rem;">${risk.flags.map(f => `<li style="font-size:0.85rem; color:#475569; margin-bottom:0.3rem;">${f}</li>`).join('')}</ul>` : '<p style="color:#22c55e; font-size:0.85rem;">No concerns detected — student is on track!</p>'}
            </div>

            <div class="report-section">
                <h3>🗣️ Fluency Profile</h3>
                <p style="font-size:0.88rem;">
                    Fluency Classification: <strong>${risk.details.fluencyClass || 'N/A'}</strong><br>
                    Speed: <strong>${risk.details.wpm} WPM</strong> · 
                    Accuracy: <strong>${risk.details.accuracy}%</strong>
                </p>
            </div>

            ${(latest.recommendations || []).length > 0 ? `
            <div class="report-section">
                <h3>💡 AI Recommendations</h3>
                ${latest.recommendations.map(r => `
                    <div class="report-rec">
                        <div class="report-rec-title">${r.title || 'Recommendation'}</div>
                        <div class="report-rec-detail">${r.detail || ''}</div>
                    </div>
                `).join('')}
            </div>
            ` : ''}

            ${results.length > 1 ? `
            <div class="report-section">
                <h3>📈 Assessment History</h3>
                <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                    <thead>
                        <tr style="border-bottom:2px solid #e2e8f0;">
                            <th style="padding:0.5rem; text-align:left;">Date</th>
                            <th style="padding:0.5rem; text-align:left;">Level</th>
                            <th style="padding:0.5rem; text-align:right;">WPM</th>
                            <th style="padding:0.5rem; text-align:right;">Accuracy</th>
                            <th style="padding:0.5rem; text-align:left;">Fluency</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.slice(0, 10).map(r => {
                            const d = r.timestamp?.toDate ? r.timestamp.toDate().toLocaleDateString() : '—';
                            return `<tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:0.5rem;">${d}</td>
                                <td style="padding:0.5rem;">${levelLabel(r.placedLevel)}</td>
                                <td style="padding:0.5rem; text-align:right;">${r.fluency?.wordsPerMinute || '—'}</td>
                                <td style="padding:0.5rem; text-align:right;">${r.fluency?.accuracyRate ? r.fluency.accuracyRate + '%' : '—'}</td>
                                <td style="padding:0.5rem;">${r.fluency?.classification || '—'}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <div class="report-section">
                <h3>✍️ Teacher Comments</h3>
                <textarea style="width:100%; min-height:80px; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem; font-family:inherit; font-size:0.85rem; resize:vertical;" placeholder="Add your observations here before printing…"></textarea>
            </div>

            <div class="report-footer">
                Alpharia Reading Assessment Platform · Report generated on ${date}<br>
                This report was generated using AI-powered speech analysis technology.
            </div>
        </div>
    `;

    preview.style.display = '';
}

// ═══════════════════════════════════════════════════════════
//  CLASS SUMMARY REPORT
// ═══════════════════════════════════════════════════════════
async function generateClassReport() {
    const preview = document.getElementById('reportPreviewCard');
    const content = document.getElementById('reportContent');
    if (!preview || !content) return;

    content.innerHTML = `<p style="text-align:center; padding:2rem; color:var(--sd-text-3);"><i class="fas fa-spinner fa-spin"></i> Generating class report…</p>`;
    preview.style.display = '';

    // Gather all student data
    const rows = [];
    for (const s of studentsCache) {
        let results = [];
        try {
            const snap = await getDocs(query(collection(db, 'results'), where('userId', '==', s.id)));
            results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            results.sort((a, b) => {
                const ta = a.timestamp?.toDate?.() || new Date(0);
                const tb = b.timestamp?.toDate?.() || new Date(0);
                return tb - ta;
            });
        } catch (e) { /* silent */ }

        const risk = analyzeStudentRisk(results);
        rows.push({ ...s, risk, latest: results[0] || null });
    }

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const highRisk = rows.filter(r => r.risk.level === 'high').length;
    const medRisk = rows.filter(r => r.risk.level === 'medium').length;

    content.innerHTML = `
        <div class="report-container">
            <div class="report-header">
                <h1>📊 Class Reading Summary Report</h1>
                <p>${rows.length} Students · Generated: ${date}</p>
            </div>

            <div class="report-stats">
                <div class="report-stat">
                    <div class="report-stat-value">${rows.length}</div>
                    <div class="report-stat-label">Total Students</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value report-risk-high">${highRisk}</div>
                    <div class="report-stat-label">High Risk</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value report-risk-medium">${medRisk}</div>
                    <div class="report-stat-label">Medium Risk</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-value report-risk-low">${rows.length - highRisk - medRisk}</div>
                    <div class="report-stat-label">On Track</div>
                </div>
            </div>

            <div class="report-section">
                <h3>Student Overview</h3>
                <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                    <thead>
                        <tr style="border-bottom:2px solid #e2e8f0;">
                            <th style="padding:0.5rem; text-align:left;">Student</th>
                            <th style="padding:0.5rem; text-align:left;">Level</th>
                            <th style="padding:0.5rem; text-align:right;">WPM</th>
                            <th style="padding:0.5rem; text-align:right;">Accuracy</th>
                            <th style="padding:0.5rem; text-align:left;">Fluency</th>
                            <th style="padding:0.5rem; text-align:left;">Risk</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => {
                            const l = r.latest;
                            return `<tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:0.5rem; font-weight:600;">${r.name}</td>
                                <td style="padding:0.5rem;">${l ? levelLabel(l.placedLevel) : 'N/A'}</td>
                                <td style="padding:0.5rem; text-align:right;">${l?.fluency?.wordsPerMinute || '—'}</td>
                                <td style="padding:0.5rem; text-align:right;">${l?.fluency?.accuracyRate ? l.fluency.accuracyRate + '%' : '—'}</td>
                                <td style="padding:0.5rem;">${l?.fluency?.classification || '—'}</td>
                                <td style="padding:0.5rem;"><span class="report-risk-${r.risk.level}">${r.risk.level.toUpperCase()}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <div class="report-footer">
                Alpharia Reading Assessment Platform · Class Summary · ${date}
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
//  PROGRESS REPORT (placeholder for growth tracking)
// ═══════════════════════════════════════════════════════════
async function generateProgressReport() {
    const preview = document.getElementById('reportPreviewCard');
    const content = document.getElementById('reportContent');
    if (!preview || !content) return;

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    content.innerHTML = `
        <div class="report-container">
            <div class="report-header">
                <h1>📈 Reading Progress Report</h1>
                <p>Growth tracking for all students · ${date}</p>
            </div>
            <div class="report-section">
                <p style="text-align:center; padding:2rem; color:#64748b;">
                    <i class="fas fa-chart-line" style="font-size:2rem; display:block; margin-bottom:0.75rem; color:#4f46e5;"></i>
                    Progress tracking requires students to complete at least 2 assessments.<br>
                    As students take more reading tests, their growth data will appear here automatically.
                </p>
            </div>
            <div class="report-footer">Alpharia Reading Assessment Platform · ${date}</div>
        </div>
    `;
    preview.style.display = '';
}

// Sidebar
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    if (toggle && sidebar) toggle.addEventListener('click', () => { sidebar.classList.toggle('active'); overlay?.classList.toggle('active'); });
    if (overlay && sidebar) overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
}
