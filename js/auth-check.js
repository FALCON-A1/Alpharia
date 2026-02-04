import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/**
 * Ensures the user is authenticated and optionally has a specific role.
 * Redirects to login if not authenticated.
 * @param {string[]} allowedRoles - Array of allowed roles (e.g. ['admin', 'student']). Empty array means any authenticated user.
 * @returns {Promise<{user: Object, role: string}>} Resolves with user object and detected role.
 */
export function requireAuth(allowedRoles = []) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe(); // Run once

            if (!user) {
                console.log('No authentication found. Redirecting to login...');
                window.location.href = '/auth/login-fixed.html';
                reject(new Error('Unauthenticated'));
                return;
            }

            // Determine role
            let role = 'unknown';
            try {
                // Check if admin
                const adminRef = doc(db, 'admins', user.uid);
                const adminSnap = await getDoc(adminRef);
                if (adminSnap.exists()) {
                    role = 'admin';
                } else {
                    // Fallback: Check 'users' collection (legacy)
                    const userRef = doc(db, 'users', user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        const r = (data.role || '').toLowerCase();
                        if (r === 'admin') role = 'admin';
                        else if (r === 'teacher') role = 'teacher';
                        else if (r === 'student') role = 'student';
                    }

                    // If still unknown, check 'students' collection (common for pure students)
                    if (role === 'unknown') {
                        const studentRef = doc(db, 'students', user.uid);
                        const studentSnap = await getDoc(studentRef);
                        if (studentSnap.exists()) {
                            role = 'student';
                        } else {
                            // Check 'teachers' collection
                            const teacherRef = doc(db, 'teachers', user.uid);
                            const teacherSnap = await getDoc(teacherRef);
                            if (teacherSnap.exists()) {
                                role = 'teacher';
                            }
                        }
                    }
                }

                // If specific roles are required, verify
                if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
                    console.warn(`User role '${role}' is not in allowed roles: [${allowedRoles.join(', ')}]`);
                    // Optional: Redirect to unauthorized page or dashboard
                    if (role === 'student') window.location.href = '/student-dashboard.html';
                    else if (role === 'admin') window.location.href = '/admin-dashboard.html';
                    else window.location.href = '/unauthorized.html';

                    reject(new Error('Unauthorized'));
                    return;
                }

                resolve({ user, role });

            } catch (error) {
                console.error('Error checking user role:', error);
                // In case of error, you might want to let them through or block. 
                // Blocking is safer for admin routes.
                reject(error);
            }
        });
    });
}
