import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import {
    collection, query, where, getDocs, doc, getDoc, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

// DOM Elements
const teacherNameElement = document.getElementById('sidebar-teacher-name');
const userNameElement = document.querySelector('.username');
const totalStudentsElement = document.getElementById('total-students');
const averageScoreElement = document.getElementById('average-score');
const assignmentsGradedElement = document.getElementById('assignments-graded');
const classAverageElement = document.getElementById('class-average');

// Initialize the page when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initAuthState();
    initEventListeners();
});

// Initialize authentication state
async function initAuthState() {
    try {
        const { user } = await requireAuth(['teacher', 'admin']);
        await loadTeacherData(user.uid);
        await loadClassData(user.uid);
    } catch (e) {
        console.error("Auth init failed", e);
    }
}

// Initialize event listeners
function initEventListeners() {
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = '/auth/login-fixed.html';
        });
    });

    // Add Student button
    const addStudentBtn = document.getElementById('addStudentBtn');
    if (addStudentBtn) {
        addStudentBtn.addEventListener('click', showAddStudentModal);
    }

    // Confirm Add Students button
    const confirmAddBtn = document.getElementById('confirmAddStudents');
    if (confirmAddBtn) {
        confirmAddBtn.addEventListener('click', addSelectedStudents);
    }

    // Student search functionality
    const studentSearch = document.getElementById('studentSearch');
    if (studentSearch) {
        studentSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#availableStudentsList tr');

            rows.forEach(row => {
                if (row.dataset.studentId) { // Skip the loading row
                    const name = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
                    const email = row.querySelector('td:nth-child(3)').textContent.toLowerCase();
                    const grade = row.querySelector('td:nth-child(4)').textContent.toLowerCase();

                    if (name.includes(searchTerm) || email.includes(searchTerm) || grade.includes(searchTerm)) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                }
            });
        });
    }
}

// Show the Add Student modal and load available students
async function showAddStudentModal() {
    const modal = new bootstrap.Modal(document.getElementById('addStudentModal'));
    const modalEl = document.getElementById('addStudentModal');

    // Clear previous selections
    const checkboxes = modalEl.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);

    // Show loading state
    const tbody = document.getElementById('availableStudentsList');
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2 mb-0">Loading available students...</p>
            </td>
        </tr>`;

    try {
        // Get current user (teacher)
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }

        // Get all students
        const studentsQuery = query(collection(db, 'students'));
        const studentsSnapshot = await getDocs(studentsQuery);

        if (studentsSnapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        <i class="fas fa-user-slash fa-2x text-muted mb-3"></i>
                        <p class="mb-0">No students found in the system.</p>
                    </td>
                </tr>`;
            return;
        }

        // Get the list of student IDs already assigned to this teacher
        const assignedStudentsQuery = query(
            collection(db, 'students'),
            where('teacherId', '==', user.uid)
        );
        const assignedStudentsSnapshot = await getDocs(assignedStudentsQuery);
        const assignedStudentIds = assignedStudentsSnapshot.docs.map(doc => doc.id);

        // Populate the table with available students
        tbody.innerHTML = '';
        let hasAvailableStudents = false;

        studentsSnapshot.docs.forEach(doc => {
            const student = doc.data();
            const isAssigned = assignedStudentIds.includes(doc.id);

            // Skip if already assigned to this teacher
            if (isAssigned) return;

            hasAvailableStudents = true;

            const row = document.createElement('tr');
            row.dataset.studentId = doc.id;
            row.innerHTML = `
                <td class="text-center">
                    <input type="checkbox" class="form-check-input student-checkbox" data-student-id="${doc.id}">
                </td>
                <td>${student.displayName || student.name || 'Unnamed Student'}</td>
                <td>${student.email || 'No email'}</td>
                <td>${student.grade || 'N/A'}</td>
                <td><span class="badge bg-secondary">Available</span></td>`;

            tbody.appendChild(row);
        });

        if (!hasAvailableStudents) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        <i class="fas fa-check-circle fa-2x text-success mb-3"></i>
                        <p class="mb-0">All students are already assigned to your class.</p>
                    </td>
                </tr>`;
        }

    } catch (error) {
        console.error('Error loading students:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-circle fa-2x mb-3"></i>
                    <p class="mb-0">Error loading students. Please try again later.</p>
                    <small class="text-muted">${error.message}</small>
                </td>
            </tr>`;
    } finally {
        // Show the modal
        modal.show();
    }
}

// Add selected students to the teacher's class
async function addSelectedStudents() {
    const checkboxes = document.querySelectorAll('.student-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('Please select at least one student to add.');
        return;
    }

    const confirmBtn = document.getElementById('confirmAddStudents');
    const originalBtnText = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        Adding Students...`;

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }

        const batch = writeBatch(db);
        const studentIds = Array.from(checkboxes).map(checkbox => checkbox.dataset.studentId);

        // Update each student's document
        for (const studentId of studentIds) {
            const studentRef = doc(db, 'students', studentId);
            batch.update(studentRef, {
                teacherId: user.uid,
                updatedAt: serverTimestamp()
            });
        }

        await batch.commit();

        // Show success message
        alert(`Successfully added ${studentIds.length} student(s) to your class.`);

        // Close the modal and refresh the student list
        const modal = bootstrap.Modal.getInstance(document.getElementById('addStudentModal'));
        modal.hide();

        // Reload the student data
        if (user.uid) {
            await loadClassData(user.uid);
        }

    } catch (error) {
        console.error('Error adding students:', error);
        alert(`Error adding students: ${error.message}`);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalBtnText;
    }
}

// Load teacher data
async function loadTeacherData(teacherId) {
    try {
        const teacherDoc = await getDoc(doc(db, 'teachers', teacherId));
        if (teacherDoc.exists()) {
            const teacherData = teacherDoc.data();
            // Update UI with teacher data
            const displayName = teacherData.displayName || 'Teacher';
            teacherNameElement.textContent = displayName;
            userNameElement.textContent = displayName;
        }
    } catch (error) {
        console.error('Error loading teacher data:', error);
    }
}

// Load class data and student progress
async function loadClassData(teacherId) {
    try {
        // First, get all students assigned to this teacher
        const studentsQuery = query(
            collection(db, 'students'),
            where('teacherId', '==', teacherId)
        );

        const studentsSnapshot = await getDocs(studentsQuery);

        if (studentsSnapshot.empty) {
            console.log('No students found for this teacher');
            updateDashboardStats(0, 0, 0, 0);
            updateStudentTable([]);
            // Initialize empty charts if no students found
            initCharts();
            return;
        }

        let totalStudents = studentsSnapshot.size;
        let totalScore = 0;
        let totalAssignments = 0;
        let studentData = [];
        let processedStudents = 0;

        // Process each student
        for (const studentDoc of studentsSnapshot.docs) {
            const student = studentDoc.data();

            // Get student's test results
            const resultsQuery = query(
                collection(db, 'testResults'),
                where('studentId', '==', studentDoc.id)
            );

            const resultsSnapshot = await getDocs(resultsQuery);
            let studentScore = 0;
            let studentTests = resultsSnapshot.size;
            let recentTests = [];

            // Process test results
            resultsSnapshot.forEach(doc => {
                const result = doc.data();
                if (result.score !== undefined && result.score !== null) {
                    studentScore += parseFloat(result.score) || 0;

                    // Keep track of recent tests for the chart
                    if (result.submittedAt) {
                        try {
                            const testDate = result.submittedAt.toDate ? result.submittedAt.toDate() : new Date(result.submittedAt);
                            recentTests.push({
                                date: testDate,
                                score: parseFloat(result.score) || 0
                            });
                        } catch (e) {
                            console.warn('Error processing test date:', e);
                        }
                    }
                }
            });

            // Calculate average score for this student
            const avgScore = studentTests > 0 ? parseFloat((studentScore / studentTests).toFixed(2)) : 0;
            totalScore += avgScore;
            totalAssignments += studentTests;

            // Get the most recent test date
            let lastTestDate = null;
            if (recentTests.length > 0) {
                recentTests.sort((a, b) => b.date - a.date); // Sort by date descending
                lastTestDate = recentTests[0].date;
            }

            // Add student data for the table
            studentData.push({
                id: studentDoc.id,
                name: student.displayName || student.name || 'Student',
                email: student.email || '',
                class: student.className || student.class || 'Not Assigned',
                testsCompleted: studentTests,
                averageScore: avgScore,
                lastTest: lastTestDate,
                recentTests: recentTests
            });

            processedStudents++;

            // Update dashboard stats periodically during loading
            if (processedStudents % 5 === 0 || processedStudents === totalStudents) {
                updateDashboardStats(totalStudents, totalScore, processedStudents, totalAssignments);
            }
        }

        // Final UI update with all data
        updateDashboardStats(totalStudents, totalScore, studentData.length, totalAssignments);

        // Only update the table once with the complete data
        if (studentData.length > 0) {
            updateStudentTable(studentData);
            updateCharts(studentData);
        }

    } catch (error) {
        console.error('Error loading class data:', error);
    }
}

// Update the dashboard statistics
function updateDashboardStats(totalStudents, totalScore, numStudents, totalAssignments) {
    if (totalStudentsElement) {
        totalStudentsElement.textContent = totalStudents;
    }

    if (averageScoreElement && numStudents > 0) {
        const avgScore = Math.round((totalScore / numStudents) * 10) / 10;
        averageScoreElement.textContent = `${avgScore}%`;

        // Update the trend indicator
        const trendElement = document.getElementById('average-score-trend');
        if (trendElement) {
            // This is a simplified example - you would compare with previous data in a real app
            const trend = Math.random() > 0.5 ? 'up' : 'down';
            const change = Math.floor(Math.random() * 5) + 1;
            trendElement.innerHTML = `<i class="fas fa-arrow-${trend} text-${trend === 'up' ? 'success' : 'danger'}"></i> ${change}% from last month`;
        }
    }

    if (assignmentsGradedElement) {
        assignmentsGradedElement.textContent = totalAssignments;
    }

    if (classAverageElement && numStudents > 0) {
        const avgScore = Math.round((totalScore / numStudents) * 10) / 10;
        let grade = '';

        if (avgScore >= 90) grade = 'A';
        else if (avgScore >= 80) grade = 'B';
        else if (avgScore >= 70) grade = 'C';
        else if (avgScore >= 60) grade = 'D';
        else grade = 'F';

        classAverageElement.textContent = `${avgScore}% (${grade})`;
    }
}

// Track the DataTable instance
let studentDataTable = null;

// Update the student progress table
function updateStudentTable(students) {
    // Only proceed if we're on the teacher progress page
    const isProgressPage = document.querySelector('body.teacher-progress-page') ||
        window.location.pathname.includes('teacher-progress');

    if (!isProgressPage) {
        console.log('Not on teacher progress page, skipping table update');
        return;
    }

    const table = document.querySelector('#studentProgressTable');
    if (!table) {
        console.error('Student progress table not found in DOM');
        return;
    }

    console.log('Updating student table with data for', students.length, 'students');

    // If DataTable is already initialized, just update the data
    if (studentDataTable && $.fn.DataTable && $.fn.DataTable.isDataTable('#studentProgressTable')) {
        try {
            console.log('Updating existing DataTable with new data');
            studentDataTable.clear().rows.add(students).draw();
            return;
        } catch (e) {
            console.error('Error updating DataTable, will reinitialize:', e);
            studentDataTable.destroy(true);
            studentDataTable = null;
        }
    }

    // Get the table body
    const tbody = table.querySelector('tbody');
    if (!tbody) {
        console.error('Table body not found in student progress table');
        return;
    }

    // Clear any existing rows
    tbody.innerHTML = '';

    // If no students, show a message
    if (!students || students.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="7" class="text-center py-4">
                <div class="d-flex flex-column align-items-center">
                    <i class="fas fa-users-slash fa-2x text-muted mb-2"></i>
                    <p class="mb-0">No students found in your class</p>
                </div>
            </td>
        `;
        tbody.appendChild(row);
        return;
    }

    // Sort students by average score (descending)
    const sortedStudents = [...students].sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));

    // Add student rows
    sortedStudents.forEach((student, index) => {
        console.log(`Processing student ${index + 1}/${sortedStudents.length}:`, student);

        const row = document.createElement('tr');

        // Format the last test date
        let lastTestText = 'N/A';
        if (student.lastTest) {
            try {
                const date = student.lastTest.toDate ? student.lastTest.toDate() : new Date(student.lastTest);
                lastTestText = date.toLocaleDateString();
            } catch (e) {
                console.warn('Error formatting date:', e);
            }
        }

        // Calculate progress percentage
        const progress = student.averageScore || 0;
        const status = progress >= 70 ? 'Active' : 'Needs Help';
        const statusClass = status === 'Active' ? 'success' : 'warning';

        row.innerHTML = `
            <td>${student.name || 'N/A'}</td>
            <td>${lastTestText}</td>
            <td>${student.averageScore || 0}%</td>
            <td>${student.testsCompleted || 0}</td>
            <td>
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar bg-primary" role="progressbar" 
                         style="width: ${progress}%" 
                         aria-valuenow="${progress}" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                    </div>
                </div>
                <small class="text-muted">${progress}%</small>
            </td>
            <td><span class="badge bg-${statusClass}">${status}</span></td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-primary view-student" data-id="${student.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" data-bs-toggle="modal" data-bs-target="#studentDetailsModal">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });

    // Initialize DataTables if available
    if (typeof $.fn.DataTable === 'function') {
        try {
            console.log('Initializing DataTable with', students.length, 'students');

            // Destroy any existing instance first
            if ($.fn.DataTable.isDataTable('#studentProgressTable')) {
                $('#studentProgressTable').DataTable().destroy(true);
            }

            // Initialize DataTable with proper configuration
            studentDataTable = $('#studentProgressTable').DataTable({
                pageLength: 10,
                order: [[2, 'desc']], // Sort by average score by default
                responsive: true,
                language: {
                    search: "_INPUT_",
                    searchPlaceholder: "Search students...",
                    emptyTable: "No student data available"
                },
                dom: '<"d-flex justify-content-between align-items-center mb-3"f<"ms-3"l>>rtip',
                initComplete: function () {
                    $('.dataTables_filter input').addClass('form-control');
                    console.log('DataTable initialization complete');
                },
                columnDefs: [
                    { orderable: false, targets: [5, 6] }, // Make action buttons not sortable
                    { responsivePriority: 1, targets: 0 }, // Student name
                    { responsivePriority: 2, targets: 2 }, // Average score
                    { responsivePriority: 3, targets: 3 }, // Completed tests
                    { responsivePriority: 4, targets: 4 }, // Progress
                    { responsivePriority: 5, targets: 1 }, // Last active
                    { responsivePriority: 6, targets: 5 }, // Status
                    { responsivePriority: 7, targets: 6 }  // Actions
                ]
            });

            console.log('DataTable initialized successfully');

        } catch (error) {
            console.error('Error initializing DataTable:', error);
            // Clean up if initialization fails
            if ($.fn.DataTable.isDataTable('#studentProgressTable')) {
                $('#studentProgressTable').DataTable().destroy(true);
                console.error('Error updating DataTable, will reinitialize:', e);
                studentDataTable.destroy(true);
                studentDataTable = null;
            }
        }



        // Global chart state and instances
        const chartsState = {
            initialized: {
                performance: false,
                distribution: false
            },
            instances: {
                performance: null,
                distribution: null
            }
        };

        // Initialize everything after the DOM is fully loaded
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM fully loaded, initializing app...');

            // Initialize auth state first
            initAuthState();

            // Initialize event listeners
            initEventListeners();

            // Initialize charts with empty data
            initializeCharts();
        });

        // Function to initialize all charts
        function initializeCharts() {
            console.log('Initializing charts...');

            // Reset initialization state
            chartsState.initialized.performance = false;
            chartsState.initialized.distribution = false;

            // Initialize performance chart
            const perfChart = getOrCreatePerformanceChart();
            if (perfChart) {
                console.log('Performance chart initialized successfully');
                chartsState.initialized.performance = true;
                chartsState.instances.performance = perfChart;
            } else {
                console.error('Failed to initialize performance chart');
            }

            // Initialize distribution chart
            const distChart = getOrCreateDistributionChart();
            if (distChart) {
                console.log('Distribution chart initialized successfully');
                chartsState.initialized.distribution = true;
                chartsState.instances.distribution = distChart;
            } else {
                console.error('Failed to initialize distribution chart');
            }

            console.log('Charts initialization state:', chartsState.initialized);

            // Process any pending updates now that both charts are initialized
            if (chartsState.initialized.performance && chartsState.initialized.distribution) {
                console.log('Both charts ready, checking for pending updates');
                processPendingUpdates();
            }
        }

        // Update the charts with student data
        function updateCharts(students) {
            try {
                console.log('Updating charts with student data...');

                // Get chart instances from our state
                const perfChart = chartsState.instances.performance;
                const distChart = chartsState.instances.distribution;

                // Check if both charts are ready
                if (!chartsState.initialized.performance || !chartsState.initialized.distribution) {
                    console.log('Charts not fully initialized yet, skipping update');
                    // Store the student data to update charts once they're ready
                    window.pendingChartUpdate = students;
                    return;
                }

                // If no students, update charts with empty data and return
                if (!students || students.length === 0) {
                    console.log('No student data available, resetting charts');
                    if (perfChart && perfChart.data && perfChart.data.datasets) {
                        perfChart.data.datasets[0].data = new Array(6).fill(0);
                        perfChart.update();
                    }
                    if (distChart && distChart.data && distChart.data.datasets) {
                        distChart.data.datasets[0].data = [0, 0, 0, 0, 0];
                        distChart.update();
                    }
                    return;
                }

                // Update charts with student data
                updateClassPerformanceChart(students);
                updateScoreDistributionChart(students);
            } catch (error) {
                console.error('Error in updateCharts:', error);
            }
        }

        // Initialize charts with empty data (kept for backward compatibility)
        function initCharts() {
            // This function is kept for backward compatibility but is no longer needed
            // as chart initialization is now handled by getOrCreate* functions
            console.log('initCharts() is deprecated. Charts are now initialized on demand.');
        }

        // Safely initialize or get performance chart instance
        function getOrCreatePerformanceChart() {
            try {
                // If we already have a chart instance, return it
                if (chartsState.instances.performance) {
                    return chartsState.instances.performance;
                }

                const canvas = document.getElementById('classPerformanceChart');
                if (!canvas) {
                    console.warn('Performance chart canvas not found');
                    return null;
                }

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    console.warn('Could not get 2D context for performance chart');
                    return null;
                }

                // Generate labels for the last 6 months
                const months = [];
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const date = new Date(now);
                    date.setMonth(now.getMonth() - i);
                    months.push(date.toLocaleString('default', { month: 'short' }));
                }

                // Create the chart instance
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: months,
                        datasets: [{
                            label: 'Class Average',
                            data: new Array(6).fill(0),
                            borderColor: '#4e73df',
                            backgroundColor: 'rgba(78, 115, 223, 0.05)',
                            tension: 0.3,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: {
                                    callback: function (value) {
                                        return value + '%';
                                    }
                                }
                            }
                        }
                    }
                });

                // Store the chart instance and update state
                chartsState.instances.performance = chart;
                chartsState.initialized.performance = true;
                console.log('Performance chart created successfully');

                return chart;

            } catch (error) {
                console.error('Error creating performance chart:', error);
                return null;
            }
        }

        // Update the class performance line chart
        function updateClassPerformanceChart(students) {
            try {
                // Get the chart instance
                const chart = chartsState.instances.performance;
                if (!chart || !chart.data || !chart.data.datasets || !chart.data.datasets[0]) {
                    console.warn('Performance chart not properly initialized, skipping update');
                    console.log('Current chart instance:', chart);
                    return;
                }

                // Generate last 6 months labels
                const months = [];
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const date = new Date(now);
                    date.setMonth(now.getMonth() - i);
                    months.push(date.toLocaleString('default', { month: 'short' }));
                }

                // Initialize monthly averages
                const monthlyAverages = new Array(6).fill(0);
                const monthCounts = new Array(6).fill(0);
                let hasData = false;

                // Calculate monthly averages if we have students with test results
                if (students && students.length > 0) {
                    students.forEach(student => {
                        if (!student.testResults) return;

                        Object.values(student.testResults).forEach(test => {
                            if (test.completedAt) {
                                const testDate = test.completedAt.toDate();
                                const monthDiff = (now.getFullYear() - testDate.getFullYear()) * 12 +
                                    now.getMonth() - testDate.getMonth();

                                if (monthDiff >= 0 && monthDiff < 6) {
                                    const index = 5 - monthDiff;
                                    monthlyAverages[index] += test.score || 0;
                                    monthCounts[index]++;
                                    hasData = true;
                                }
                            }
                        });
                    });
                }

                try {
                    // Calculate final averages
                    const averageScores = monthlyAverages.map((sum, i) =>
                        monthCounts[i] > 0 ? Math.round((sum / monthCounts[i]) * 10) / 10 : 0
                    );

                    // Safely update the chart data and labels
                    if (chart.data) {
                        chart.data.labels = months;
                        if (chart.data.datasets && chart.data.datasets[0]) {
                            chart.data.datasets[0].data = hasData ? averageScores : new Array(6).fill(0);
                        }
                        chart.update();
                    }
                } catch (updateError) {
                    console.error('Error updating chart data:', updateError);
                }
            } catch (error) {
                console.error('Error in updateClassPerformanceChart:', error);
            }
        }

        // Safely initialize or get distribution chart instance
        function getOrCreateDistributionChart() {
            try {
                // If we already have a chart instance, return it
                if (chartsState.instances.distribution) {
                    return chartsState.instances.distribution;
                }

                const canvas = document.getElementById('scoreDistributionChart');
                if (!canvas) {
                    console.warn('Distribution chart canvas not found');
                    return null;
                }

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    console.warn('Could not get 2D context for distribution chart');
                    return null;
                }

                // Create the chart instance
                const chart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['90-100%', '80-89%', '70-79%', '60-69%', 'Below 60%'],
                        datasets: [{
                            data: [0, 0, 0, 0, 0],
                            backgroundColor: ['#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796'],
                            hoverBackgroundColor: ['#17a673', '#2c9faf', '#dda20a', '#be2617', '#6c757d'],
                            hoverBorderColor: 'rgba(234, 236, 244, 1)',
                        }]
                    },
                    options: {
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    padding: 20,
                                    usePointStyle: true,
                                    pointStyle: 'circle'
                                }
                            }
                        },
                        cutout: '70%',
                        animation: {
                            animateScale: true,
                            animateRotate: true
                        }
                    }
                });

                // Store the chart instance and update state
                chartsState.instances.distribution = chart;
                chartsState.initialized.distribution = true;
                console.log('Distribution chart created successfully');

                return chart;

            } catch (error) {
                console.error('Error creating distribution chart:', error);
                return null;
            }
        }

        // Update the score distribution chart
        function updateScoreDistributionChart(students) {
            try {
                // Get the chart instance
                const chart = chartsState.instances.distribution;
                if (!chart || !chart.data || !chart.data.datasets || !chart.data.datasets[0]) {
                    console.warn('Distribution chart not properly initialized, skipping update');
                    console.log('Current chart instance:', chart);
                    return;
                }

                // Initialize score ranges
                const scoreRanges = [0, 0, 0, 0, 0]; // 90-100, 80-89, 70-79, 60-69, <60

                // Calculate score distribution if we have students
                if (students && students.length > 0) {
                    students.forEach(student => {
                        if (student.averageScore === undefined) return;

                        if (student.averageScore >= 90) scoreRanges[0]++;
                        else if (student.averageScore >= 80) scoreRanges[1]++;
                        else if (student.averageScore >= 70) scoreRanges[2]++;
                        else if (student.averageScore >= 60) scoreRanges[3]++;
                        else scoreRanges[4]++;
                    });
                }

                // Safely update the chart data
                try {
                    if (chart.data && chart.data.datasets && chart.data.datasets[0]) {
                        chart.data.datasets[0].data = scoreRanges;
                        chart.update();
                    }
                } catch (updateError) {
                    console.error('Error updating distribution chart data:', updateError);
                }
            } catch (error) {
                console.error('Error in updateScoreDistributionChart:', error);
            }
        }

        // Process any pending chart updates when both charts are ready
        function processPendingUpdates() {
            if (chartsState.initialized.performance && chartsState.initialized.distribution && window.pendingChartUpdate) {
                console.log('All charts ready, processing pending update', window.pendingChartUpdate);
                const studentsToUpdate = window.pendingChartUpdate;
                window.pendingChartUpdate = null;
                updateCharts(studentsToUpdate);
            } else {
                console.log('Not all charts ready or no pending updates', {
                    chartsState,
                    hasPendingUpdate: !!window.pendingChartUpdate
                });
            }
        }

        // Make functions available globally for debugging
        window.updateCharts = updateCharts;
        window.updateStudentTable = updateStudentTable;
        window.chartsState = chartsState;
