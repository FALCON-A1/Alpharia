// Auth state listener
firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        // User is not signed in, redirect to login page
        if (!window.location.pathname.includes('login-fixed.html') &&
            !window.location.pathname.includes('signup-fixed.html')) {
            window.location.href = '/auth/login-fixed.html';
        }
    } else if (window.location.pathname.includes('login-fixed.html') ||
        window.location.pathname.includes('signup-fixed.html')) {
        // User is signed in but on auth pages, redirect to dashboard
        window.location.href = '/student-dashboard.html';
    }
});

// Helper function to get current user
function getCurrentUser() {
    return new Promise((resolve, reject) => {
        const unsubscribe = firebase.auth().onAuthStateChanged(user => {
            unsubscribe();
            resolve(user);
        }, reject);
    });
}

// Export functions if needed
window.auth = {
    getCurrentUser,
    signOut: () => firebase.auth().signOut()
};
