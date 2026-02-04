// Import Firebase modules
import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import {
    createUserWithEmailAndPassword,
    updateProfile,
    signOut,
    sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// DOM Elements
const teachersList = document.getElementById('teachers-list');
const studentsList = document.getElementById('students-list');
const addTeacherBtn = document.getElementById('add-teacher-btn');
const addStudentBtn = document.getElementById('add-student-btn');
const saveTeacherBtn = document.getElementById('save-teacher-btn');
const saveStudentBtn = document.getElementById('save-student-btn');
const saveUserChangesBtn = document.getElementById('save-user-changes');
const logoutBtn = document.getElementById('logout-btn');
const adminName = document.getElementById('admin-name');
let currentUser = null;
let currentEditUserId = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const result = await requireAuth(['admin']);
        currentUser = result.user;

        // Update UI with admin name
        // Try to get extended profile from Firestore if needed, or use auth profile
        let displayName = currentUser.displayName || 'Admin';
        try {
            // Check admin/users collection for name
            const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
            if (adminDoc.exists()) displayName = adminDoc.data().name || displayName;
            else {
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                if (userDoc.exists()) displayName = userDoc.data().displayName || displayName;
            }
        } catch (e) { }

        if (adminName) adminName.textContent = displayName;

        setupEventListeners();
        loadUsers();

    } catch (error) {
        console.error("Auth check failed", error);
    }
});

// Setup event listeners
function setupEventListeners() {
    // Add Teacher button
    addTeacherBtn?.addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('addTeacherModal'));
        modal.show();
    });

    // Add Student button
    addStudentBtn?.addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('addStudentModal'));
        modal.show();
    });

    // Save Teacher
    saveTeacherBtn?.addEventListener('click', async () => {
        await addTeacher();
    });

    // Save Student
    saveStudentBtn?.addEventListener('click', async () => {
        await addStudent();
    });

    // Save User Changes
    saveUserChangesBtn?.addEventListener('click', async () => {
        await updateUser();
    });

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'auth/login-fixed.html';
            } catch (error) {
                console.error('Logout error:', error);
                showAlert('Error logging out. Please try again.', 'danger');
            }
        });
    }

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

// Load all users
async function loadUsers() {
    try {
        // Load teachers
        await loadTeachers();

        // Load students
        await loadStudents();

    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Error loading users. Please try again.', 'danger');
    }
}

// Load teachers
async function loadTeachers() {
    if (!teachersList) return;

    try {
        console.log('Loading teachers...');
        teachersList.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </td>
            </tr>`;

        // Log the query being made
        console.log('Querying users collection for teachers...');
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('userType', 'in', ['teacher', 'limited_teacher']));
        console.log('Updated query to use userType instead of role');

        // Log the query for debugging
        console.log('Query:', q);

        const querySnapshot = await getDocs(q);
        console.log('Query snapshot:', querySnapshot);

        if (querySnapshot.empty) {
            console.log('No teachers found in the query');
            teachersList.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">No teachers found. (Query returned empty)</td>
                </tr>`;
            return;
        }

        console.log(`Found ${querySnapshot.size} teachers`);
        teachersList.innerHTML = '';

        querySnapshot.forEach((doc) => {
            console.log('Teacher doc:', doc.id, doc.data());
            const teacher = doc.data();
            const row = createTeacherRow(doc.id, teacher);
            if (row) {
                teachersList.appendChild(row);
            } else {
                console.error('Failed to create row for teacher:', doc.id);
            }
        });

    } catch (error) {
        console.error('Error loading teachers:', error);
        showAlert('Error loading teachers: ' + error.message, 'danger');
    }
}

// Load students
async function loadStudents() {
    if (!studentsList) return;

    try {
        studentsList.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </td>
            </tr>`;

        // Query for students from the 'students' collection
        console.log('Querying for students from "students" collection');
        const q = collection(db, 'students');
        const querySnapshot = await getDocs(q);

        // Debug: Log document data
        querySnapshot.forEach(doc => {
            console.log('Student document data from students collection:', {
                id: doc.id,
                data: doc.data(),
                hasGrade: 'grade' in doc.data(),
                allFields: Object.keys(doc.data())
            });
        });

        if (querySnapshot.empty) {
            studentsList.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">No students found.</td>
                </tr>`;
            return;
        }

        studentsList.innerHTML = '';

        // Get all teachers for assignment - check both userType and role fields
        const teachersQuery = query(collection(db, 'users'),
            where('userType', '==', 'teacher')
        );
        const teachersSnapshot = await getDocs(teachersQuery);
        const teachers = [];
        teachersSnapshot.forEach(doc => {
            const teacherData = doc.data();
            teachers.push({
                id: doc.id,
                uid: teacherData.uid, // Include uid for matching with teacherId
                name: teacherData.name || teacherData.displayName,
                email: teacherData.email,
                ...teacherData
            });
        });

        console.log('Available teachers for assignment:', teachers);

        querySnapshot.forEach((doc) => {
            const student = doc.data();
            console.log('Student data from Firestore:', {
                id: doc.id,
                data: student,
                hasGrade: 'grade' in student,
                gradeValue: student.grade,
                gradeType: typeof student.grade
            });
            const row = createStudentRow(doc.id, student, teachers);
            studentsList.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading students:', error);
        showAlert('Error loading students. Please try again.', 'danger');
    }
}

// Create teacher table row
function createTeacherRow(id, teacher) {
    console.log('Creating row for teacher:', id, teacher);

    // Validate teacher data
    if (!teacher) {
        console.error('No teacher data provided');
        return null;
    }

    const row = document.createElement('tr');
    row.dataset.id = id;

    // Debug userType and permissions
    console.log(`Teacher ${id} userType:`, teacher.userType);
    console.log(`Teacher ${id} permissions:`, teacher.permissions);

    const statusClass = teacher.isActive !== false ? 'badge bg-success' : 'badge bg-secondary';
    const statusText = teacher.isActive !== false ? 'Active' : 'Inactive';

    // Update to check userType instead of role
    const canCreateTests = teacher.userType === 'teacher' || (teacher.permissions && teacher.permissions.canCreateTests === true);
    console.log(`Teacher ${id} can create tests:`, canCreateTests);

    // Use name instead of displayName
    const displayName = teacher.name || teacher.displayName || 'N/A';

    row.innerHTML = `
        <td>${displayName}</td>
        <td>${teacher.email || 'N/A'}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td>
            <div class="form-check form-switch d-inline-block">
                <input class="form-check-input toggle-permission" type="checkbox" 
                       data-user-id="${id}" data-permission="canCreateTests" 
                       ${canCreateTests ? 'checked' : ''}>
            </div>
        </td>
        <td>${teacher.lastLogin ? new Date(teacher.lastLogin.seconds * 1000).toLocaleDateString() : 'Never'}</td>
        <td>
            <button class="btn btn-sm btn-outline-primary edit-teacher" data-id="${id}">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-user" data-id="${id}">
                <i class="fas fa-trash"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary reset-password" data-id="${id}" data-email="${teacher.email}">
                <i class="fas fa-key"></i>
            </button>
        </td>
    `;

    // Add event listeners
    row.querySelector('.edit-teacher')?.addEventListener('click', () => editUser(id, 'teacher'));
    row.querySelector('.delete-user')?.addEventListener('click', () => confirmDeleteUser(id, teacher.displayName || 'teacher'));
    row.querySelector('.reset-password')?.addEventListener('click', (e) => {
        e.stopPropagation();
        resetPassword(teacher.email);
    });

    // Add event listener to the toggle switch
    const toggleSwitch = row.querySelector('.toggle-permission');
    if (toggleSwitch) {
        toggleSwitch.addEventListener('change', (e) => {
            updateUserPermission(id, e.target.dataset.permission, e.target.checked);
        });
    }

    return row;
}

// Create student table row
function createStudentRow(id, student, teachers = []) {
    console.log('Creating row for student:', { id, student, teachers });

    const row = document.createElement('tr');
    row.dataset.id = id;

    const statusClass = student.isActive !== false ? 'badge bg-success' : 'badge bg-secondary';
    const statusText = student.isActive !== false ? 'Active' : 'Inactive';

    // Find assigned teacher - check both assignedTeacherId and teacherId for compatibility
    let teacherName = 'Not assigned';
    const teacherId = student.assignedTeacherId || student.teacherId;
    if (teacherId) {
        const teacher = teachers.find(t => t.id === teacherId || t.uid === teacherId);
        if (teacher) {
            teacherName = teacher.name || teacher.displayName || teacher.email;
        } else {
            console.log('Teacher not found in teachers list, ID:', teacherId);
            console.log('Available teachers:', teachers.map(t => ({ id: t.id, uid: t.uid, name: t.name || t.displayName })));
        }
    }

    // Debug: Log all student properties
    console.log('Student properties:', Object.keys(student));
    console.log('Raw student data:', JSON.stringify(student, null, 2));

    // Handle student name - check all possible name fields
    const studentName = student.name || student.displayName || student.email?.split('@')[0] || 'N/A';

    // Handle grade - check all possible grade fields and formats
    let studentGrade = 'Not Set';
    if (student.grade !== undefined && student.grade !== null) {
        studentGrade = student.grade; // Just show the grade number
    } else if (student.gradeLevel !== undefined && student.gradeLevel !== null) {
        studentGrade = student.gradeLevel;
    } else if (student.classGrade !== undefined && student.classGrade !== null) {
        studentGrade = student.classGrade;
    }

    console.log('Processed student data:', { studentName, studentGrade });

    row.innerHTML = `
        <td>${studentName}</td>
        <td>${student.email || 'N/A'}</td>
        <td>${studentGrade}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td>${teacherName}</td>
        <td>
            <button class="btn btn-sm btn-outline-primary edit-student" data-id="${id}" title="Edit Student">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-user" data-id="${id}" title="Delete Student">
                <i class="fas fa-trash"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary reset-password" data-id="${id}" data-email="${student.email}" title="Reset Password">
                <i class="fas fa-key"></i>
            </button>
            <button class="btn btn-sm btn-outline-info view-details" data-id="${id}" title="View Details">
                <i class="fas fa-eye"></i>
            </button>
        </td>
    `;

    // Add event listeners
    row.querySelector('.edit-student')?.addEventListener('click', () => editUser(id, 'student'));
    row.querySelector('.delete-user')?.addEventListener('click', () => confirmDeleteUser(id, student.displayName || 'student'));
    row.querySelector('.reset-password')?.addEventListener('click', (e) => {
        e.stopPropagation();
        resetPassword(student.email);
    });

    row.querySelector('.view-details')?.addEventListener('click', (e) => {
        e.stopPropagation();
        viewStudentDetails(id, student);
    });

    return row;
}

// Add a new teacher
async function addTeacher() {
    const name = document.getElementById('teacher-name')?.value.trim();
    const email = document.getElementById('teacher-email')?.value.trim();
    const canCreateTests = document.getElementById('can-create-tests')?.checked ?? true;

    if (!name || !email) {
        showAlert('Please fill in all required fields.', 'warning');
        return;
    }

    try {
        // Generate a temporary password
        const tempPassword = generateTempPassword();

        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, tempPassword);
        const user = userCredential.user;

        // Update user profile
        await updateProfile(user, { displayName: name });

        // Determine role based on permissions
        const role = canCreateTests ? 'TEACHER' : 'LIMITED_TEACHER';

        // Create user document in Firestore
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: email,
            displayName: name,
            role: role,
            isActive: true,
            createdAt: serverTimestamp(),
            lastLogin: null,
            permissions: {
                canCreateTests: canCreateTests
            }
        });

        // Send password reset email
        await sendPasswordResetEmail(auth, email);

        // Close modal and reset form
        const modal = bootstrap.Modal.getInstance(document.getElementById('addTeacherModal'));
        modal.hide();
        document.getElementById('add-teacher-form')?.reset();

        // Reload teachers
        await loadTeachers();

        showAlert('Teacher added successfully! A password reset email has been sent to their email address.', 'success');

    } catch (error) {
        console.error('Error adding teacher:', error);
        let errorMessage = 'Error adding teacher. Please try again.';

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Please enter a valid email address.';
        }

        showAlert(errorMessage, 'danger');
    }
}

// Add a new student
async function addStudent() {
    const name = document.getElementById('student-name')?.value.trim();
    const email = document.getElementById('student-email')?.value.trim();
    const grade = document.getElementById('student-grade')?.value;

    if (!name || !email || !grade) {
        showAlert('Please fill in all required fields.', 'warning');
        return;
    }

    try {
        // Generate a temporary password
        const tempPassword = generateTempPassword();

        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, tempPassword);
        const user = userCredential.user;

        // Update user profile
        await updateProfile(user, { displayName: name });

        // Create user document in Firestore
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: email,
            displayName: name,
            role: 'STUDENT',
            grade: parseInt(grade),
            isActive: true,
            createdAt: serverTimestamp(),
            lastLogin: null
        });

        // Send password reset email
        await sendPasswordResetEmail(auth, email);

        // Close modal and reset form
        const modal = bootstrap.Modal.getInstance(document.getElementById('addStudentModal'));
        modal.hide();
        document.getElementById('add-student-form')?.reset();

        // Reload students
        await loadStudents();

        showAlert('Student added successfully! A password reset email has been sent to their email address.', 'success');

    } catch (error) {
        console.error('Error adding student:', error);
        let errorMessage = 'Error adding student. Please try again.';

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Please enter a valid email address.';
        }

        showAlert(errorMessage, 'danger');
    }
}

// Edit user
async function editUser(userId, userType) {
    currentEditUserId = userId;

    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            throw new Error('User not found');
        }

        const userData = userDoc.data();
        const modalBody = document.getElementById('edit-user-modal-body');

        if (userType === 'teacher') {
            modalBody.innerHTML = `
                <form id="edit-teacher-form">
                    <div class="mb-3">
                        <label for="edit-teacher-name" class="form-label">Full Name</label>
                        <input type="text" class="form-control" id="edit-teacher-name" value="${userData.displayName || ''}" required>
                    </div>
                    <div class="mb-3">
                        <label for="edit-teacher-email" class="form-label">Email</label>
                        <input type="email" class="form-control" id="edit-teacher-email" value="${userData.email || ''}" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Status</label>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="edit-teacher-active" ${userData.isActive !== false ? 'checked' : ''}>
                            <label class="form-check-label" for="edit-teacher-active">
                                Active
                            </label>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Permissions</label>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="edit-can-create-tests" 
                                   ${userData.role === 'TEACHER' || userData.permissions?.canCreateTests ? 'checked' : ''}>
                            <label class="form-check-label" for="edit-can-create-tests">
                                Can create and manage tests
                            </label>
                        </div>
                    </div>
                </form>
            `;
        } else {
            // Student edit form
            modalBody.innerHTML = `
                <form id="edit-student-form">
                    <div class="mb-3">
                        <label for="edit-student-name" class="form-label">Full Name</label>
                        <input type="text" class="form-control" id="edit-student-name" value="${userData.displayName || ''}" required>
                    </div>
                    <div class="mb-3">
                        <label for="edit-student-email" class="form-label">Email</label>
                        <input type="email" class="form-control" id="edit-student-email" value="${userData.email || ''}" required>
                    </div>
                    <div class="mb-3">
                        <label for="edit-student-grade" class="form-label">Grade</label>
                        <select class="form-select" id="edit-student-grade" required>
                            <option value="" ${!userData.grade ? 'selected' : ''}>Select Grade</option>
                            ${Array.from({ length: 12 }, (_, i) => i + 1).map(grade =>
                `<option value="${grade}" ${userData.grade === grade ? 'selected' : ''}>Grade ${grade}</option>`
            ).join('')}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Status</label>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="edit-student-active" ${userData.isActive !== false ? 'checked' : ''}>
                            <label class="form-check-label" for="edit-student-active">
                                Active
                            </label>
                        </div>
                    </div>
                </form>
            `;

            // Load teachers for student assignment
            const teachersQuery = query(collection(db, 'users'), where('role', 'in', ['TEACHER', 'LIMITED_TEACHER']));
            const teachersSnapshot = await getDocs(teachersQuery);
            const teacherSelect = document.createElement('select');
            teacherSelect.className = 'form-select mb-3';
            teacherSelect.id = 'edit-assigned-teacher';
            teacherSelect.innerHTML = '<option value="">Select Teacher (Optional)</option>';

            teachersSnapshot.forEach(doc => {
                const teacher = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = teacher.displayName || teacher.email;
                option.selected = userData.assignedTeacherId === doc.id;
                teacherSelect.appendChild(option);
            });

            modalBody.querySelector('form').insertBefore(teacherSelect, modalBody.querySelector('form').lastElementChild);
        }

        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();

    } catch (error) {
        console.error('Error loading user data:', error);
        showAlert('Error loading user data. Please try again.', 'danger');
    }
}

// Update user
async function updateUser() {
    if (!currentEditUserId) return;

    try {
        const userDoc = await getDoc(doc(db, 'users', currentEditUserId));
        if (!userDoc.exists()) {
            throw new Error('User not found');
        }

        const userData = userDoc.data();
        const isTeacher = userData.role === 'TEACHER' || userData.role === 'LIMITED_TEACHER';

        let updateData = {};

        if (isTeacher) {
            const name = document.getElementById('edit-teacher-name')?.value.trim();
            const email = document.getElementById('edit-teacher-email')?.value.trim();
            const isActive = document.getElementById('edit-teacher-active')?.checked ?? true;
            const canCreateTests = document.getElementById('edit-can-create-tests')?.checked ?? false;

            if (!name || !email) {
                throw new Error('Please fill in all required fields.');
            }

            updateData = {
                displayName: name,
                email: email,
                isActive: isActive,
                role: canCreateTests ? 'TEACHER' : 'LIMITED_TEACHER',
                'permissions.canCreateTests': canCreateTests,
                updatedAt: serverTimestamp()
            };

            // Update email in Firebase Auth if changed
            if (email !== userData.email) {
                // In a real app, you would update the email in Firebase Auth
                // This requires re-authentication, so we'll just update it in Firestore for now
                // and prompt the user to update their email on next login
                updateData.emailVerified = false;
            }

        } else {
            // Student update
            const name = document.getElementById('edit-student-name')?.value.trim();
            const email = document.getElementById('edit-student-email')?.value.trim();
            const grade = document.getElementById('edit-student-grade')?.value;
            const isActive = document.getElementById('edit-student-active')?.checked ?? true;
            const assignedTeacherId = document.getElementById('edit-assigned-teacher')?.value || null;

            if (!name || !email || !grade) {
                throw new Error('Please fill in all required fields.');
            }

            updateData = {
                displayName: name,
                email: email,
                grade: parseInt(grade),
                isActive: isActive,
                assignedTeacherId: assignedTeacherId || null,
                updatedAt: serverTimestamp()
            };

            // Update email in Firebase Auth if changed
            if (email !== userData.email) {
                updateData.emailVerified = false;
            }
        }

        // Update user document in Firestore
        await updateDoc(doc(db, 'users', currentEditUserId), updateData);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
        modal.hide();

        // Reload users
        await loadUsers();

        showAlert('User updated successfully!', 'success');

    } catch (error) {
        console.error('Error updating user:', error);
        showAlert(error.message || 'Error updating user. Please try again.', 'danger');
    }
}

// Update user permission
async function updateUserPermission(userId, permission, value) {
    try {
        await updateDoc(doc(db, 'users', userId), {
            [`permissions.${permission}`]: value,
            role: permission === 'canCreateTests' && value ? 'TEACHER' : 'LIMITED_TEACHER',
            updatedAt: serverTimestamp()
        });

        showAlert('Permission updated successfully!', 'success');

    } catch (error) {
        console.error('Error updating permission:', error);
        showAlert('Error updating permission. Please try again.', 'danger');

        // Revert the UI change
        const checkbox = document.querySelector(`.toggle-permission[data-user-id="${userId}"][data-permission="${permission}"]`);
        if (checkbox) {
            checkbox.checked = !value;
        }
    }
}

// Confirm before deleting user
function confirmDeleteUser(userId, userName) {
    if (confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
        deleteUser(userId);
    }
}

// Delete user
async function deleteUser(userId) {
    try {
        // In a real app, you would also delete the user from Firebase Auth
        // and handle any related data cleanup
        // For now, we'll just mark the user as inactive
        await updateDoc(doc(db, 'users', userId), {
            isActive: false,
            deletedAt: serverTimestamp()
        });

        // Reload users
        await loadUsers();

        showAlert('User deactivated successfully!', 'success');

    } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('Error deleting user. Please try again.', 'danger');
    }
}

// View student details in a modal
async function viewStudentDetails(studentId, studentData) {
    console.log('viewStudentDetails called with:', studentId, studentData);

    try {
        // Format dates for display
        const formatDate = (timestamp) => {
            if (!timestamp) return 'N/A';
            try {
                const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                return date.toLocaleDateString();
            } catch (e) {
                return 'Invalid date';
            }
        };

        // Get teacher name if teacherId exists
        let teacherName = 'Not Assigned';
        if (studentData.teacherId) {
            try {
                const teacherDoc = await getDoc(doc(db, 'users', studentData.teacherId));
                if (teacherDoc.exists()) {
                    const teacherData = teacherDoc.data();
                    teacherName = teacherData.name || teacherData.displayName || teacherData.email || 'Teacher Name Not Available';
                }
            } catch (error) {
                console.error('Error fetching teacher data:', error);
                teacherName = 'Error loading teacher info';
            }
        }

        // Fetch test results from Firebase
        let testResults = [];
        let placementLevel = studentData.level || 'Not Assessed';

        try {
            // Query without orderBy to avoid composite index requirement
            const resultsQuery = query(
                collection(db, 'results'),
                where('userId', '==', studentId)
            );
            const resultsSnapshot = await getDocs(resultsQuery);

            resultsSnapshot.forEach((docSnap) => {
                const result = docSnap.data();
                testResults.push({
                    id: docSnap.id,
                    testId: result.testId || 'Unknown Test',
                    level: result.placedLevel || result.level || 'N/A',
                    oralErrors: result.oralErrors ?? 'N/A',
                    oralClassification: result.oralClassification || 'N/A',
                    comprehensionPercent: result.comprehensionPercent ?? 'N/A',
                    comprehensionClassification: result.comprehensionClassification || 'N/A',
                    timestamp: result.timestamp,
                    date: formatDate(result.timestamp)
                });
            });

            // Sort by timestamp descending (most recent first) - client-side
            testResults.sort((a, b) => {
                const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
                const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
                return dateB - dateA;
            });

            // Update placement level from most recent result
            if (testResults.length > 0 && testResults[0].level !== 'N/A') {
                placementLevel = testResults[0].level.replace(/_/g, ' ').toUpperCase();
            }
        } catch (error) {
            console.error('Error fetching test results:', error);
        }

        // Format the student data for display (removed Created At, Updated At, Email Verified)
        const formattedData = {
            'ID': studentData.uid || studentId,
            'Grade': studentData.grade || 'Not Set',
            'Level': placementLevel,
            'Points': studentData.points || '0',
            'Assigned Teacher': teacherName
        };

        // Create the HTML for the modal content
        let detailsHtml = `
        <div class="row mb-4">
            <div class="col-12 text-center">
                <div class="student-avatar mb-3">
                    <i class="fas fa-user-circle fa-5x text-primary"></i>
                </div>
                <h4>${studentData.name || 'N/A'}</h4>
                <p class="text-muted">${studentData.email || 'N/A'}</p>
            </div>
        </div>
        <div class="row">
    `;

        // Add each data point in a card
        Object.entries(formattedData).forEach(([key, value]) => {
            let badgeClass = '';
            const strValue = String(value); // Convert to string to safely use includes
            if (key === 'Level') {
                // Color code the level
                if (strValue.includes('PRE') || strValue === 'Not Assessed') {
                    badgeClass = 'bg-secondary';
                } else if (strValue.includes('PRIMER') || strValue.includes('1')) {
                    badgeClass = 'bg-info';
                } else if (strValue.includes('2') || strValue.includes('3')) {
                    badgeClass = 'bg-primary';
                } else {
                    badgeClass = 'bg-success';
                }
            }

            detailsHtml += `
            <div class="col-md-6 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <h6 class="card-subtitle mb-2 text-muted">${key}</h6>
                        <p class="card-text" style="${key === 'Level' ? 'font-weight: bold; color: #0d6efd;' : ''}">${value}</p>
                    </div>
                </div>
            </div>
        `;
        });

        detailsHtml += '</div>'; // Close row

        // Add Test Grades Section
        detailsHtml += `
        <hr class="my-4">
        <h5 class="mb-3"><i class="fas fa-clipboard-check text-primary me-2"></i>Test Grades</h5>
    `;

        if (testResults.length === 0) {
            detailsHtml += `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>No test results found for this student.
            </div>
        `;
        } else {
            detailsHtml += `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>Test</th>
                            <th>Level</th>
                            <th>Oral Reading</th>
                            <th>Comprehension</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

            testResults.forEach(result => {
                const oralBadge = result.oralClassification === 'Independent' ? 'bg-success' :
                    result.oralClassification === 'Instructional' ? 'bg-warning' :
                        result.oralClassification === 'Frustrational' ? 'bg-danger' : 'bg-secondary';

                const compBadge = result.comprehensionClassification === 'Independent' ? 'bg-success' :
                    result.comprehensionClassification === 'Instructional' ? 'bg-warning' :
                        result.comprehensionClassification === 'Frustrational' ? 'bg-danger' : 'bg-secondary';

                detailsHtml += `
                <tr>
                    <td>${result.testId}</td>
                    <td><span class="badge bg-primary">${result.level.replace(/_/g, ' ').toUpperCase()}</span></td>
                    <td>
                        <span class="badge ${oralBadge}">${result.oralClassification}</span>
                        ${result.oralErrors !== 'N/A' ? `<small class="text-muted ms-1">(${result.oralErrors} errors)</small>` : ''}
                    </td>
                    <td>
                        <span class="badge ${compBadge}">${result.comprehensionClassification}</span>
                        ${result.comprehensionPercent !== 'N/A' ? `<small class="text-muted ms-1">(${result.comprehensionPercent}%)</small>` : ''}
                    </td>
                    <td>${result.date}</td>
                </tr>
            `;
            });

            detailsHtml += `
                    </tbody>
                </table>
            </div>
        `;
        }

        // Set the modal content and show it
        const modalContent = document.getElementById('studentDetailsContent');
        if (modalContent) {
            modalContent.innerHTML = detailsHtml;
            const modal = new bootstrap.Modal(document.getElementById('viewStudentModal'));
            modal.show();
        }
    } catch (error) {
        console.error('Error in viewStudentDetails:', error);
        alert('Error loading student details. Check console for more info.');
    }
}

// Reset user password
async function resetPassword(email) {
    if (!email) return;

    try {
        await sendPasswordResetEmail(auth, email);
        showAlert('Password reset email has been sent to ' + email, 'success');
    } catch (error) {
        console.error('Error sending password reset email:', error);
        showAlert('Error sending password reset email. Please try again.', 'danger');
    }
}

// Generate a temporary password
function generateTempPassword() {
    const length = 10;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }

    return password;
}

// Show alert message
function showAlert(message, type = 'info') {
    // Remove any existing alerts
    const existingAlert = document.querySelector('.alert');
    if (existingAlert) {
        existingAlert.remove();
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    // Add to the top of the main content
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.insertBefore(alertDiv, mainContent.firstChild);
    }

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const bsAlert = new bootstrap.Alert(alertDiv);
        bsAlert.close();
    }, 5000);
}

// Initialize Bootstrap tooltips
function initTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// Initialize popovers
function initPopovers() {
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });
}

// Initialize the page
initTooltips();
initPopovers();
