import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import {
    collection, query, where, getDocs, doc, getDoc, writeBatch, serverTimestamp, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { analyzeStudentRisk, summarizeClassRisk, levelLabel, LEVEL_ORDER } from './early-warning.js';

// ═══════════════════════════════════════════════════════════
//  TEACHER PROGRESS — ENHANCED WITH FULL ASSESSMENT DATA
// ═══════════════════════════════════════════════════════════

// DOM Elements
const teacherNameElement = document.getElementById('sidebar-teacher-name');
const totalStudentsElement = document.getElementById('total-students');
const avgWpmElement = document.getElementById('avg-wpm');
const avgAccuracyElement = document.getElementById('avg-accuracy');
const needsHelpElement = document.getElementById('needs-help-count');
const avgReadingLevelElement = document.getElementById('avg-reading-level');

// State
let allStudentsData = []; // Full enriched student array
let studentDataTable = null;
let readingLevelChart = null;
let studentGrowthChart = null;

// ═══ INIT ═══
document.addEventListener('DOMContentLoaded', () => {
    initSidebar(); // Initialize sidebar toggle first
    initAuthState();
    initEventListeners();
});

async function initAuthState() {
    try {
        const { user } = await requireAuth(['teacher', 'admin']);
        await loadTeacherData(user.uid);
        await loadEnrichedClassData(user.uid);
    } catch (e) {
        console.error("Auth init failed", e);
    }
}

// ═══ TEACHER PROFILE ═══
async function loadTeacherData(uid) {
    try {
        const teacherDoc = await getDoc(doc(db, 'teachers', uid));
        let displayName = 'Teacher';
        
        if (teacherDoc.exists()) {
            const data = teacherDoc.data();
            displayName = data.name || data.firstName || data.displayName || 'Teacher';
        } else {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                displayName = data.firstName 
                    ? `${data.firstName} ${data.lastName || ''}`.trim()
                    : (data.name || data.displayName || 'Teacher');
            }
        }
        
        if (teacherNameElement) teacherNameElement.textContent = displayName;
    } catch (error) {
        console.error('Error loading teacher data:', error);
    }
}

// ═══════════════════════════════════════════════════════════
//  CORE: Load enriched class data (results + students)
// ═══════════════════════════════════════════════════════════
async function loadEnrichedClassData(teacherId) {
    try {
        // 1. Get all students assigned to this teacher
        const studentsSnap = await getDocs(
            query(collection(db, 'students'), where('teacherId', '==', teacherId))
        );

        if (studentsSnap.empty) {
            console.log('No students found');
            updateStats([], []);
            updateStudentTable([]);
            return;
        }

        const students = [];
        const studentsWithRisk = [];

        // 2. For each student, fetch their RESULTS (rich assessment data)
        for (const sDoc of studentsSnap.docs) {
            const student = sDoc.data();
            const studentId = sDoc.id;

            // Query the 'results' collection (where take-reading-test.js saves)
            let results = [];
            try {
                const resultsSnap = await getDocs(
                    query(
                        collection(db, 'results'),
                        where('userId', '==', studentId),
                        orderBy('timestamp', 'desc'),
                        limit(20) // Last 20 assessments
                    )
                );
                results = resultsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                // If index doesn't exist yet, try without orderBy
                try {
                    const fallbackSnap = await getDocs(
                        query(collection(db, 'results'), where('userId', '==', studentId))
                    );
                    results = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    // Sort manually
                    results.sort((a, b) => {
                        const ta = a.timestamp?.toDate?.() || new Date(0);
                        const tb = b.timestamp?.toDate?.() || new Date(0);
                        return tb - ta;
                    });
                } catch (e2) {
                    console.warn(`Could not load results for ${studentId}:`, e2);
                }
            }

            // Also try 'testResults' collection as fallback
            let testResults = [];
            try {
                const trSnap = await getDocs(
                    query(collection(db, 'testResults'), where('studentId', '==', studentId))
                );
                testResults = trSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                // Silent fallback
            }

            // Run early warning analysis
            const risk = analyzeStudentRisk(results);

            // Build enriched student object
            const latest = results[0] || null;
            const enriched = {
                id: studentId,
                name: student.displayName || student.name || 'Student',
                email: student.email || '',
                className: student.className || student.class || '',
                
                // From latest result
                readingLevel: latest?.placedLevel || null,
                readingLevelLabel: latest ? levelLabel(latest.placedLevel) : 'Not Tested',
                wpm: latest?.fluency?.wordsPerMinute || 0,
                accuracy: latest?.fluency?.accuracyRate || 0,
                fluencyClass: latest?.fluency?.classification || 'N/A',
                compPercent: latest?.comprehensionPercent || 0,
                oralErrors: latest?.oralErrors || {},
                recommendations: latest?.recommendations || [],
                
                // Aggregates
                totalResults: results.length,
                totalTestResults: testResults.length,
                allResults: results,
                allTestResults: testResults,
                
                // Risk
                risk: risk,
                
                // Last test date
                lastTestDate: null
            };

            // Calculate last test date
            if (latest?.timestamp) {
                try {
                    enriched.lastTestDate = latest.timestamp.toDate 
                        ? latest.timestamp.toDate() 
                        : new Date(latest.timestamp);
                } catch (e) {
                    enriched.lastTestDate = null;
                }
            }

            students.push(enriched);
            studentsWithRisk.push({ student: enriched, risk });
        }

        allStudentsData = students;
        
        // 3. Update all UI
        const classSummary = summarizeClassRisk(studentsWithRisk);
        updateStats(students, classSummary);
        updateStudentTable(students);
        updateEarlyWarnings(classSummary);
        updateFluencyBars(classSummary);
        updateReadingLevelChart(classSummary);

        console.log(`Loaded ${students.length} students with enriched data`);

    } catch (error) {
        console.error('Error loading enriched class data:', error);
    }
}

// ═══════════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════════
function updateStats(students, classSummary) {
    if (totalStudentsElement) totalStudentsElement.textContent = students.length;

    // Average WPM (only students with data)
    const withWpm = students.filter(s => s.wpm > 0);
    if (avgWpmElement) {
        avgWpmElement.textContent = withWpm.length > 0
            ? Math.round(withWpm.reduce((s, st) => s + st.wpm, 0) / withWpm.length)
            : '—';
    }

    // Average accuracy
    const withAcc = students.filter(s => s.accuracy > 0);
    if (avgAccuracyElement) {
        avgAccuracyElement.textContent = withAcc.length > 0
            ? Math.round(withAcc.reduce((s, st) => s + st.accuracy, 0) / withAcc.length) + '%'
            : '—';
    }

    // Needs help
    if (needsHelpElement && classSummary?.summary) {
        needsHelpElement.textContent = classSummary.summary.needsIntervention;
    }

    // Average reading level
    const withLevel = students.filter(s => s.readingLevel);
    if (avgReadingLevelElement) {
        if (withLevel.length > 0) {
            const avgIdx = Math.round(
                withLevel.reduce((s, st) => s + LEVEL_ORDER.indexOf(st.readingLevel), 0) / withLevel.length
            );
            avgReadingLevelElement.textContent = levelLabel(LEVEL_ORDER[avgIdx] || 'unknown');
        } else {
            avgReadingLevelElement.textContent = '—';
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  EARLY WARNING PANEL
// ═══════════════════════════════════════════════════════════
function updateEarlyWarnings(classSummary) {
    const card = document.getElementById('earlyWarningCard');
    const summaryText = document.getElementById('ewSummaryText');
    const list = document.getElementById('ewStudentsList');
    if (!card) return;

    const atRisk = [...classSummary.highRisk, ...classSummary.mediumRisk];
    if (atRisk.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    summaryText.textContent = `${classSummary.highRisk.length} high risk, ${classSummary.mediumRisk.length} medium risk students detected.`;

    list.innerHTML = atRisk.map(s => `
        <div class="ew-student-chip" data-student-id="${s.student.id}" title="${s.risk.flags.join(' • ')}">
            <span class="ew-dot ew-dot-${s.risk.level}"></span>
            ${s.student.name}
        </div>
    `).join('');

    // Click handlers
    list.querySelectorAll('.ew-student-chip').forEach(chip => {
        chip.addEventListener('click', () => openStudentDetail(chip.dataset.studentId));
    });
}

// ═══════════════════════════════════════════════════════════
//  FLUENCY BARS
// ═══════════════════════════════════════════════════════════
function updateFluencyBars(classSummary) {
    const dist = classSummary.summary?.fluencyDist || {};
    const total = classSummary.summary?.total || 1;

    const set = (id, countId, val) => {
        const bar = document.getElementById(id);
        const count = document.getElementById(countId);
        if (bar) bar.style.width = Math.round((val / total) * 100) + '%';
        if (count) count.textContent = val;
    };

    set('fbFluent', 'fbFluentCount', dist.fluent || 0);
    set('fbDeveloping', 'fbDevelopingCount', dist.developing || 0);
    set('fbDisfluent', 'fbDisfluentCount', dist.disfluent || 0);
    set('fbUnknown', 'fbUnknownCount', dist.unknown || 0);
}

// ═══════════════════════════════════════════════════════════
//  READING LEVEL CHART
// ═══════════════════════════════════════════════════════════
function updateReadingLevelChart(classSummary) {
    const canvas = document.getElementById('readingLevelChart');
    if (!canvas) return;

    const dist = classSummary.summary?.levelDist || {};
    const labels = Object.keys(dist);
    const data = Object.values(dist);
    const colors = ['#8b5cf6', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b', '#0f0a2e'];

    if (readingLevelChart) readingLevelChart.destroy();

    readingLevelChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12, font: { size: 11, weight: 600 } } }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  STUDENT TABLE — ENHANCED
// ═══════════════════════════════════════════════════════════
function updateStudentTable(students) {
    const table = document.querySelector('#student-progress-table');
    if (!table) return;

    // Destroy existing DataTable
    if ($.fn.DataTable.isDataTable('#student-progress-table')) {
        $('#student-progress-table').DataTable().destroy();
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4" style="color:var(--sd-text-3);">
            <i class="fas fa-users-slash" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>
            No students found. Click "Add Student" to get started.
        </td></tr>`;
        return;
    }

    students.forEach(s => {
        const row = document.createElement('tr');
        row.dataset.risk = s.risk.level;

        const riskDot = `<span class="risk-dot risk-${s.risk.level}" title="${s.risk.flags.join(' • ') || 'On Track'}"></span>`;

        const fluencyBadge = s.fluencyClass && s.fluencyClass !== 'N/A'
            ? `<span class="fluency-badge fluency-${s.fluencyClass.toLowerCase()}">${s.fluencyClass}</span>`
            : `<span class="fluency-badge fluency-na">—</span>`;

        const levelPill = s.readingLevel
            ? `<span class="level-pill">${s.readingLevelLabel}</span>`
            : `<span style="color:var(--sd-text-3); font-size:0.78rem;">Not tested</span>`;

        const lastDate = s.lastTestDate
            ? s.lastTestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '';

        row.innerHTML = `
            <td style="text-align:center;">${riskDot}</td>
            <td>
                <div style="font-weight:700; color:var(--sd-text); font-size:0.85rem;">${s.name}</div>
                ${lastDate ? `<div style="font-size:0.7rem; color:var(--sd-text-3);">Last: ${lastDate}</div>` : ''}
            </td>
            <td>${levelPill}</td>
            <td style="font-weight:700; color:var(--sd-text);">${s.wpm > 0 ? s.wpm : '—'}</td>
            <td style="font-weight:700; color:var(--sd-text);">${s.accuracy > 0 ? s.accuracy + '%' : '—'}</td>
            <td>${fluencyBadge}</td>
            <td style="font-weight:600; color:var(--sd-text-2);">${s.totalResults || 0}</td>
            <td>
                <button class="sd-icon-btn view-student-btn" data-student-id="${s.id}" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Attach view handlers
    tbody.querySelectorAll('.view-student-btn').forEach(btn => {
        btn.addEventListener('click', () => openStudentDetail(btn.dataset.studentId));
    });

    // Initialize DataTable
    try {
        studentDataTable = $('#student-progress-table').DataTable({
            pageLength: 10,
            order: [[0, 'asc']], // Sort by risk
            responsive: true,
            language: {
                search: "_INPUT_",
                searchPlaceholder: "Search students...",
                emptyTable: "No student data available"
            },
            dom: '<"d-flex justify-content-between align-items-center mb-3"f<"ms-3"l>>rtip',
            initComplete: function () {
                $('.dataTables_filter input').addClass('td-form-input');
            },
            columnDefs: [
                { orderable: false, targets: [7] },
                { responsivePriority: 1, targets: 1 },
                { responsivePriority: 2, targets: 2 },
                { responsivePriority: 3, targets: 3 }
            ]
        });
    } catch (e) {
        console.error('DataTable init error:', e);
    }

    // Risk filter
    const riskFilter = document.getElementById('riskFilter');
    if (riskFilter) {
        riskFilter.addEventListener('change', () => {
            const val = riskFilter.value;
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                if (val === 'all' || row.dataset.risk === val) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
}

// ═══════════════════════════════════════════════════════════
//  STUDENT DETAIL MODAL
// ═══════════════════════════════════════════════════════════
function openStudentDetail(studentId) {
    const student = allStudentsData.find(s => s.id === studentId);
    if (!student) return;

    const modal = document.getElementById('studentDetailModal');
    if (!modal) return;

    // Set name
    document.getElementById('detailStudentName').textContent = student.name;
    document.getElementById('viewFullPortfolio').href = `student-portfolio.html?id=${studentId}`;

    // Overview tab — stats
    const statsGrid = document.getElementById('detailStatsGrid');
    statsGrid.innerHTML = `
        <div class="detail-stat">
            <div class="detail-stat-value">${student.readingLevelLabel}</div>
            <div class="detail-stat-label">Reading Level</div>
        </div>
        <div class="detail-stat">
            <div class="detail-stat-value">${student.wpm > 0 ? student.wpm : '—'}</div>
            <div class="detail-stat-label">WPM</div>
        </div>
        <div class="detail-stat">
            <div class="detail-stat-value">${student.accuracy > 0 ? student.accuracy + '%' : '—'}</div>
            <div class="detail-stat-label">Accuracy</div>
        </div>
        <div class="detail-stat">
            <div class="detail-stat-value">${student.compPercent > 0 ? student.compPercent + '%' : '—'}</div>
            <div class="detail-stat-label">Comprehension</div>
        </div>
    `;

    // Recent results
    const recentDiv = document.getElementById('detailRecentResults');
    if (student.allResults.length > 0) {
        recentDiv.innerHTML = `
            <div class="detail-section-title"><i class="fas fa-history"></i> Recent Assessments</div>
            ${student.allResults.slice(0, 5).map(r => {
                const date = r.timestamp?.toDate ? r.timestamp.toDate().toLocaleDateString() : 'Unknown';
                return `
                    <div class="error-item">
                        <div class="error-icon" style="background:var(--sd-primary-lt); color:var(--sd-primary);">
                            <i class="fas fa-book-open"></i>
                        </div>
                        <div class="error-details">
                            <h5>${levelLabel(r.placedLevel)} — ${r.fluency?.classification || 'N/A'}</h5>
                            <p>${r.fluency?.wordsPerMinute || 0} WPM · ${r.fluency?.accuracyRate || 0}% accuracy · ${date}</p>
                        </div>
                    </div>
                `;
            }).join('')}
        `;
    } else {
        recentDiv.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:1rem;">No assessments yet</p>`;
    }

    // Error Analysis tab
    const errorDiv = document.getElementById('detailErrorAnalysis');
    const oe = student.oralErrors;
    if (oe && (oe.mispronounced || oe.substitutions || oe.omissions || oe.additions)) {
        errorDiv.innerHTML = `
            <div class="detail-section-title"><i class="fas fa-exclamation-triangle"></i> Word Error Breakdown</div>
            ${oe.mispronounced ? `<div class="error-item">
                <div class="error-icon danger"><i class="fas fa-times-circle"></i></div>
                <div class="error-details"><h5>Mispronounced</h5><p>Words read incorrectly</p></div>
                <div class="error-count">${oe.mispronounced}</div>
            </div>` : ''}
            ${oe.substitutions ? `<div class="error-item">
                <div class="error-icon warn"><i class="fas fa-exchange-alt"></i></div>
                <div class="error-details"><h5>Substitutions</h5><p>Wrong words used</p></div>
                <div class="error-count">${oe.substitutions}</div>
            </div>` : ''}
            ${oe.omissions ? `<div class="error-item">
                <div class="error-icon warn"><i class="fas fa-minus-circle"></i></div>
                <div class="error-details"><h5>Omissions</h5><p>Words skipped</p></div>
                <div class="error-count">${oe.omissions}</div>
            </div>` : ''}
            ${oe.additions ? `<div class="error-item">
                <div class="error-icon warn"><i class="fas fa-plus-circle"></i></div>
                <div class="error-details"><h5>Additions</h5><p>Extra words inserted</p></div>
                <div class="error-count">${oe.additions}</div>
            </div>` : ''}
        `;
    } else {
        errorDiv.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:2rem;">No error data available for this student</p>`;
    }

    // Recommendations tab
    const recDiv = document.getElementById('detailRecommendations');
    if (student.recommendations.length > 0) {
        recDiv.innerHTML = `
            <div class="detail-section-title"><i class="fas fa-lightbulb"></i> AI-Generated Recommendations</div>
            ${student.recommendations.map(r => `
                <div class="rec-card">
                    <div class="rec-card-title">${r.title || 'Recommendation'}</div>
                    <div class="rec-card-detail">${r.detail || ''}</div>
                    ${r.area ? `<span class="rec-card-area rec-area-${r.area}">${r.area}</span>` : ''}
                </div>
            `).join('')}
        `;
    } else {
        recDiv.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:2rem;">No AI recommendations yet. Student needs to complete an assessment.</p>`;
    }

    // Growth Chart tab
    buildGrowthChart(student);

    // Show modal
    modal.classList.add('show');
}

function buildGrowthChart(student) {
    const canvas = document.getElementById('studentGrowthChart');
    if (!canvas) return;

    if (studentGrowthChart) studentGrowthChart.destroy();

    const results = [...(student.allResults || [])].reverse(); // Chronological
    if (results.length < 1) {
        canvas.parentElement.innerHTML = `<p style="color:var(--sd-text-3); text-align:center; padding:2rem;">Not enough assessment data to show a growth chart.</p>`;
        return;
    }

    const labels = results.map((r, i) => {
        if (r.timestamp?.toDate) {
            return r.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return `Test ${i + 1}`;
    });

    const levelData = results.map(r => LEVEL_ORDER.indexOf(r.placedLevel) + 1 || 0);
    const wpmData = results.map(r => r.fluency?.wordsPerMinute || 0);

    studentGrowthChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Reading Level',
                    data: levelData,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79,70,229,0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'WPM',
                    data: wpmData,
                    borderColor: '#14b8a6',
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y1'
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
                        callback: v => {
                            const labels = ['', 'Pre-Primer', 'Primer', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
                            return labels[v] || v;
                        },
                        stepSize: 1
                    },
                    min: 0, max: 8
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'WPM' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { labels: { font: { size: 11, weight: 600 } } }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════════════════
function initEventListeners() {
    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = '/auth/login-fixed.html';
        });
    });

    // Add Student button
    document.getElementById('addStudentBtn')?.addEventListener('click', showAddStudentModal);

    // Close add-student modal
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('addStudentModal')?.classList.remove('show');
        });
    });

    // Close detail modal
    document.querySelectorAll('.close-detail-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('studentDetailModal')?.classList.remove('show');
        });
    });

    // Confirm Add Students
    document.getElementById('confirmAddStudents')?.addEventListener('click', addSelectedStudents);

    // Student search in modal
    document.getElementById('studentSearch')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#availableStudentsList tr').forEach(row => {
            if (row.dataset.studentId) {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            }
        });
    });

    // Detail modal tabs
    document.querySelectorAll('.detail-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  ADD STUDENT MODAL (preserved from previous version)
// ═══════════════════════════════════════════════════════════
async function showAddStudentModal() {
    const modalEl = document.getElementById('addStudentModal');
    const tbody = document.getElementById('availableStudentsList');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4" style="color:var(--sd-text-3);">
        <i class="fas fa-circle-notch fa-spin me-2"></i> Loading...
    </td></tr>`;

    try {
        const { user } = await requireAuth(['teacher', 'admin']);
        
        // Get students NOT assigned to this teacher
        const allStudentsSnap = await getDocs(collection(db, 'students'));
        const assignedSnap = await getDocs(
            query(collection(db, 'students'), where('teacherId', '==', user.uid))
        );
        const assignedIds = new Set(assignedSnap.docs.map(d => d.id));

        const available = allStudentsSnap.docs.filter(d => !assignedIds.has(d.id));

        if (available.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4" style="color:var(--sd-text-3);">
                No available students found
            </td></tr>`;
        } else {
            tbody.innerHTML = '';
            available.forEach(sDoc => {
                const s = sDoc.data();
                const row = document.createElement('tr');
                row.dataset.studentId = sDoc.id;
                row.innerHTML = `
                    <td><input type="checkbox" class="student-checkbox" value="${sDoc.id}" style="width:16px;height:16px;cursor:pointer;"></td>
                    <td>${s.displayName || s.name || s.firstName || 'Student'}</td>
                    <td>${s.email || '—'}</td>
                    <td>${s.grade || s.className || '—'}</td>
                    <td><span class="td-badge td-badge-green">Available</span></td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (e) {
        console.error('Error loading students:', e);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">Error loading students</td></tr>`;
    } finally {
        modalEl?.classList.add('show');
    }
}

async function addSelectedStudents() {
    const checkboxes = document.querySelectorAll('.student-checkbox:checked');
    const studentIds = Array.from(checkboxes).map(cb => cb.value);

    if (studentIds.length === 0) {
        alert('Please select at least one student.');
        return;
    }

    try {
        const { user } = await requireAuth(['teacher', 'admin']);
        const batch = writeBatch(db);

        studentIds.forEach(id => {
            const ref = doc(db, 'students', id);
            batch.update(ref, {
                teacherId: user.uid,
                assignedAt: serverTimestamp()
            });
        });

        await batch.commit();
        alert(`Successfully added ${studentIds.length} student(s).`);

        document.getElementById('addStudentModal')?.classList.remove('show');
        await loadEnrichedClassData(user.uid);
    } catch (e) {
        console.error('Error adding students:', e);
        alert('Error adding students. Please try again.');
    }
}

// ═══════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggle && sidebar) {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active');
        });
    }

    if (overlay && sidebar) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
}
