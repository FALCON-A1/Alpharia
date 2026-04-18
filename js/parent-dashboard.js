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
            
            // Get latest assessment data (simplified)
            const resultsSnap = await getDocs(query(collection(db, 'results'), where('userId', '==', docSnap.id)));
            let latestLevel = 'Unassessed';
            let testsTaken = resultsSnap.size;
            
            if (testsTaken > 0) {
                 const results = resultsSnap.docs.map(d => d.data()).sort((a,b) => b.timestamp - a.timestamp);
                 latestLevel = results[0].placedLevel || 'Unassessed';
            }

            html += `
                <div class="child-card">
                    <div class="child-avatar"><i class="fas fa-user-graduate"></i></div>
                    <div class="child-info">
                        <h4 class="child-name">${student.name || student.displayName || 'Student'}</h4>
                        <div class="child-meta">
                            <span><i class="fas fa-layer-group"></i> Level: ${latestLevel.replace('_', ' ')}</span>
                            <span><i class="fas fa-tasks"></i> Assessments: ${testsTaken}</span>
                        </div>
                    </div>
                    <div>
                        <!-- Use the teacher's portfolio view but maybe pass a flag for parent view in the future -->
                        <a href="student-portfolio.html?id=${docSnap.id}&view=parent" class="sd-btn sd-btn-outline" style="font-size:0.8rem; padding:0.4rem 0.8rem;">
                            View Progress
                        </a>
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
