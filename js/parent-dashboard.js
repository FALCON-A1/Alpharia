import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import { collection, query, where, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Enforce parent role logic
        const { user } = await requireAuth();
        
        // Fetch Parent Profile
        const parentDoc = await getDoc(doc(db, 'users', user.uid));
        if (parentDoc.exists()) {
            const name = parentDoc.data().name || parentDoc.data().firstName || 'Parent';
            document.getElementById('parent-name').textContent = name;
            document.getElementById('parent-name-sidebar').textContent = name;
        }

        await loadLinkedChildren(user.uid);
        initSidebar();

    } catch (e) {
        console.error('Parent dashboard init error:', e);
    }
});

async function loadLinkedChildren(parentId) {
    const container = document.getElementById('children-container');
    
    try {
        // Query the students collection where parentId matches this user's UID
        const q = query(collection(db, 'students'), where('parentId', '==', parentId));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `
                <div class="empty-children">
                    <i class="fas fa-child"></i>
                    <h3>No children linked yet</h3>
                    <p>Link your child's account using the code provided by their teacher.</p>
                    <a href="parent-invite.html" class="sd-btn sd-btn-primary">Link Account</a>
                </div>`;
            return;
        }

        let html = '';
        for (const docSnap of snap.docs) {
            const student = docSnap.data();
            
            // Get all assessment results for this child
            const resultsSnap = await getDocs(query(collection(db, 'results'), where('userId', '==', docSnap.id)));
            let latestLevel = 'Unassessed';
            let latestWpm = '—';
            let latestAccuracy = '—';
            let latestComprehension = '—';
            let testsTaken = resultsSnap.size;
            let weeklyChange = null;
            let recommendations = [];
            let fluencyClass = 'N/A';
            
            if (testsTaken > 0) {
                const results = resultsSnap.docs.map(d => d.data()).sort((a,b) => {
                    const tA = a.timestamp?.seconds || a.timestamp || 0;
                    const tB = b.timestamp?.seconds || b.timestamp || 0;
                    return tB - tA;
                });
                const latest = results[0];
                latestLevel = latest.placedLevel || latest.readingLevel || 'Unassessed';
                latestWpm = latest.wpm != null ? Math.round(latest.wpm) : (latest.fluency?.wordsPerMinute || '—');
                latestAccuracy = latest.accuracy != null ? Math.round(latest.accuracy) : (latest.fluency?.accuracyRate || '—');
                latestComprehension = latest.comprehensionPercent || latest.comprehension || '—';
                fluencyClass = latest.fluency?.classification || 'N/A';
                
                // Get AI recommendations from the latest result
                recommendations = latest.recommendations || [];

                // Weekly improvement: compare latest vs 7-day-old result
                if (results.length >= 2) {
                    const now = Date.now();
                    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
                    const olderResult = results.find(r => {
                        const ts = (r.timestamp?.seconds || r.timestamp || 0) * 1000;
                        return ts < oneWeekAgo;
                    });
                    const latestWpmNum = typeof latestWpm === 'number' ? latestWpm : null;
                    const olderWpm = olderResult?.wpm != null ? olderResult.wpm : (olderResult?.fluency?.wordsPerMinute || null);
                    if (latestWpmNum && olderWpm) {
                        weeklyChange = Math.round(latestWpmNum - olderWpm);
                    }
                }
            }

            // Format level cleanly
            const levelDisplay = String(latestLevel).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const accDisplay = typeof latestAccuracy === 'number' ? latestAccuracy + '%' : latestAccuracy;
            const compDisplay = typeof latestComprehension === 'number' ? latestComprehension + '%' : latestComprehension;

            // Weekly change badge
            let weeklyBadge = '';
            if (weeklyChange !== null) {
                if (weeklyChange > 0) {
                    weeklyBadge = `<span style="display:inline-flex; align-items:center; gap:0.2rem; padding:0.2rem 0.55rem; border-radius:50px; font-size:0.72rem; font-weight:700; background:rgba(16,185,129,0.1); color:#10b981;"><i class="fas fa-arrow-up" style="font-size:0.6rem;"></i>+${weeklyChange} wpm this week</span>`;
                } else if (weeklyChange < 0) {
                    weeklyBadge = `<span style="display:inline-flex; align-items:center; gap:0.2rem; padding:0.2rem 0.55rem; border-radius:50px; font-size:0.72rem; font-weight:700; background:rgba(239,68,68,0.1); color:#ef4444;"><i class="fas fa-arrow-down" style="font-size:0.6rem;"></i>${weeklyChange} wpm this week</span>`;
                } else {
                    weeklyBadge = `<span style="display:inline-flex; align-items:center; gap:0.2rem; padding:0.2rem 0.55rem; border-radius:50px; font-size:0.72rem; font-weight:700; background:rgba(156,163,175,0.1); color:#6b7280;"><i class="fas fa-equals" style="font-size:0.6rem;"></i> No change this week</span>`;
                }
            }

            // Build AI recommendations HTML
            let recsHtml = '';
            if (recommendations.length > 0) {
                recsHtml = recommendations.slice(0, 3).map(r => {
                    const areaColors = {
                        phonics: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '#8b5cf6' },
                        vocabulary: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '#f59e0b' },
                        fluency: { bg: 'rgba(20,184,166,0.1)', color: '#14b8a6', border: '#14b8a6' },
                        comprehension: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '#3b82f6' }
                    };
                    const ac = areaColors[r.area?.toLowerCase()] || { bg: 'var(--sd-primary-lt)', color: 'var(--sd-primary)', border: 'var(--sd-primary)' };
                    return `
                        <div class="parent-rec" style="border-left-color: ${ac.border};">
                            <div class="parent-rec-title">${r.title || 'Recommendation'}</div>
                            <div class="parent-rec-desc">${r.detail || ''}</div>
                            ${r.area ? `<span class="parent-rec-tag" style="background:${ac.bg}; color:${ac.color};">${r.area}</span>` : ''}
                        </div>
                    `;
                }).join('');
            } else {
                recsHtml = `<p style="font-size:0.78rem; color:var(--sd-text-3); padding:0.5rem 0;">No recommendations yet — complete an assessment to get AI insights.</p>`;
            }

            // Practice tips (contextual based on reading status)
            const tips = getPracticeTips(latestLevel, typeof latestAccuracy === 'number' ? latestAccuracy : null, typeof latestWpm === 'number' ? latestWpm : null);

            html += `
                <div class="child-wrapper">
                    <div class="child-card" style="flex-wrap: wrap; cursor: pointer;">
                        <div class="child-avatar"><i class="fas fa-user-graduate"></i></div>
                        <div class="child-info" style="flex: 1; min-width: 200px;">
                            <h4 class="child-name">${student.name || student.displayName || 'Student'}</h4>
                            <div class="child-meta" style="flex-wrap:wrap; gap:0.5rem 1rem; margin-top:0.35rem;">
                                <span title="Current Reading Level"><i class="fas fa-layer-group"></i> ${levelDisplay}</span>
                                <span title="Words Per Minute"><i class="fas fa-tachometer-alt"></i> ${latestWpm} WPM</span>
                                <span title="Accuracy Rate"><i class="fas fa-bullseye"></i> ${accDisplay}</span>
                                <span title="Total Assessments"><i class="fas fa-tasks"></i> ${testsTaken} tests</span>
                            </div>
                            ${weeklyBadge ? `<div style="margin-top:0.5rem;">${weeklyBadge}</div>` : ''}
                        </div>
                        <div style="display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end;">
                            <a href="student-portfolio.html?id=${docSnap.id}&view=parent" class="sd-btn sd-btn-primary" style="font-size:0.8rem; padding:0.45rem 1rem; text-decoration:none; white-space:nowrap;">
                                <i class="fas fa-chart-line"></i> Full Portfolio
                            </a>
                        </div>
                    </div>

                    <!-- Expanded detail panel -->
                    <div class="child-detail">
                        <!-- Mini stats row -->
                        <div class="parent-mini-stats">
                            <div class="parent-mini-stat">
                                <div class="parent-mini-stat-value">${latestWpm}</div>
                                <div class="parent-mini-stat-label">Words/Min</div>
                            </div>
                            <div class="parent-mini-stat">
                                <div class="parent-mini-stat-value">${accDisplay}</div>
                                <div class="parent-mini-stat-label">Accuracy</div>
                            </div>
                            <div class="parent-mini-stat">
                                <div class="parent-mini-stat-value">${compDisplay}</div>
                                <div class="parent-mini-stat-label">Comprehension</div>
                            </div>
                        </div>

                        <div class="child-detail-grid">
                            <!-- AI Recommendations column -->
                            <div>
                                <div class="parent-section-title"><i class="fas fa-robot"></i> AI Recommendations</div>
                                ${recsHtml}
                            </div>

                            <!-- Practice Tips column -->
                            <div>
                                <div class="parent-section-title"><i class="fas fa-lightbulb"></i> Practice Tips for Parents</div>
                                ${tips}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;

    } catch (e) {
        console.error('Error loading children:', e);
        container.innerHTML = `<p style="color:red;">Error loading child data.</p>`;
    }
}

/**
 * Generate contextual practice tips based on the child's current reading status.
 */
function getPracticeTips(level, accuracy, wpm) {
    const tips = [];
    const normalizedLevel = String(level).toLowerCase().replace(/\s+/g, '_');

    // Level-based tips
    if (['pre_primer', 'pre-primer', 'primer', 'unassessed'].includes(normalizedLevel)) {
        tips.push({ icon: 'fa-shapes', text: 'Practice letter sounds together — point at letters in books and say the sounds out loud.' });
        tips.push({ icon: 'fa-book', text: 'Read picture books together daily for 10–15 minutes. Let your child point to words as you read.' });
    } else if (['level_1', 'level_2'].includes(normalizedLevel)) {
        tips.push({ icon: 'fa-book-reader', text: 'Have your child read easy books aloud to you for 15 minutes daily. Praise effort, not just accuracy.' });
        tips.push({ icon: 'fa-headphones', text: 'Use audiobooks alongside the physical book — your child follows along, building fluency.' });
    } else {
        tips.push({ icon: 'fa-comments', text: 'After reading, ask "What was the story about?" and "Why did the character do that?" to build comprehension.' });
        tips.push({ icon: 'fa-pencil-alt', text: 'Encourage your child to keep a reading journal — writing short summaries improves understanding.' });
    }

    // Accuracy-based tips
    if (accuracy !== null && accuracy < 85) {
        tips.push({ icon: 'fa-eye', text: '<strong>Accuracy tip:</strong> When your child misreads a word, gently say the correct word and have them repeat it 3 times.' });
    }

    // WPM-based tips
    if (wpm !== null && wpm < 40) {
        tips.push({ icon: 'fa-redo', text: '<strong>Fluency tip:</strong> Re-read the same short passage 3 times — speed and confidence improve each time!' });
    }

    // Always include a general encouragement tip
    tips.push({ icon: 'fa-star', text: 'Celebrate progress! Even small improvements in reading speed or accuracy deserve recognition.' });

    return tips.slice(0, 4).map(t => `
        <div class="parent-tip">
            <div class="parent-tip-icon"><i class="fas ${t.icon}"></i></div>
            <div class="parent-tip-text">${t.text}</div>
        </div>
    `).join('');
}

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
