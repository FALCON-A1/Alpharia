// Import necessary Firebase modules
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Firebase configuration - Replace with your actual config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// DOM Elements
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const googleLoginBtn = document.getElementById('google-login');
const microsoftLoginBtn = document.getElementById('microsoft-login');
const loginTab = document.querySelector('[data-tab="login"]');
const signupTab = document.querySelector('[data-tab="signup"]');
const switchToSignup = document.getElementById('switch-to-signup');
const switchToLogin = document.getElementById('switch-to-login');
const forgotPasswordLink = document.getElementById('forgot-password');
const loadingOverlay = document.getElementById('loading-overlay');

// Toggle between login and signup forms
function switchForm(formToShow) {
    // Clear any previous errors and input fields
    clearFormErrors();
    document.querySelectorAll('input').forEach(input => input.value = '');
    
    if (formToShow === 'login') {
        loginForm.classList.add('active');
        signupForm.classList.remove('active');
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        switchToSignup.style.display = 'inline';
        switchToLogin.style.display = 'none';
    } else {
        loginForm.classList.remove('active');
        signupForm.classList.add('active');
        loginTab.classList.remove('active');
        signupTab.classList.add('active');
        switchToSignup.style.display = 'none';
        switchToLogin.style.display = 'inline';
    }
}

// Clear form errors
function clearFormErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.remove());
    document.querySelectorAll('.form-group').forEach(group => group.classList.remove('error'));
}

// Show form field error
function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const formGroup = field.closest('.form-group');
    
    // Remove any existing error message
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) existingError.remove();
    
    // Add error class and message
    formGroup.classList.add('error');
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    formGroup.appendChild(errorElement);
}

// Toggle loading state
function setLoading(isLoading) {
    if (isLoading) {
        loadingOverlay.style.display = 'flex';
    } else {
        loadingOverlay.style.display = 'none';
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Toggle password visibility
function setupPasswordToggle() {
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
}

// Save user data to Firestore
async function saveUserToFirestore(user, additionalData = {}) {
    try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: additionalData.displayName || user.displayName || user.email.split('@')[0],
            photoURL: user.photoURL || '',
            role: additionalData.role || 'student',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            ...additionalData
        }, { merge: true });
        
        return true;
    } catch (error) {
        console.error('Error saving user to Firestore:', error);
        return false;
    }
}

// Handle user signup
async function handleSignup(e) {
    e.preventDefault();
    
    // Get form values
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const displayName = document.getElementById('signup-display-name').value.trim();
    const userType = document.querySelector('input[name="user-type"]:checked')?.value || 'student';
    
    // Validation
    let isValid = true;
    clearFormErrors();
    
    if (!email) {
        showError('signup-email', 'Email is required');
        isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('signup-email', 'Please enter a valid email');
        isValid = false;
    }
    
    if (!password) {
        showError('signup-password', 'Password is required');
        isValid = false;
    } else if (password.length < 8) {
        showError('signup-password', 'Password must be at least 8 characters');
        isValid = false;
    }
    
    if (password !== confirmPassword) {
        showError('signup-confirm-password', 'Passwords do not match');
        isValid = false;
    }
    
    if (!displayName) {
        showError('signup-display-name', 'Display name is required');
        isValid = false;
    }
    
    if (!isValid) return;
    
    try {
        setLoading(true);
        
        // Create user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Save additional user data to Firestore
        const userData = {
            displayName,
            role: userType,
            emailVerified: false
        };
        
        await saveUserToFirestore(user, userData);
        
        // Send email verification
        // await sendEmailVerification(user);
        
        showToast('Account created successfully! Redirecting...', 'success');
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'An error occurred during signup. Please try again.';
        
        // More specific error messages
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'An account with this email already exists. Please use a different email or sign in.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Please choose a stronger password.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Please enter a valid email address.';
        }
        
        showToast(errorMessage, 'error');
    } finally {
        setLoading(false);
    }
}

// Handle user login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    // Basic validation
    if (!email || !password) {
        showToast('Please enter both email and password', 'error');
        return;
    }
    
    try {
        setLoading(true);
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Update last login time
        await saveUserToFirestore(user, { lastLogin: serverTimestamp() });
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Invalid email or password. Please try again.';
        
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password. Please try again.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed login attempts. Please try again later or reset your password.';
        } else if (error.code === 'auth/user-disabled') {
            errorMessage = 'This account has been disabled. Please contact support.';
        }
        
        showToast(errorMessage, 'error');
    } finally {
        setLoading(false);
    }
}

// Handle Google Sign In
async function handleGoogleSignIn() {
    try {
        setLoading(true);
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        // Save user data to Firestore
        await saveUserToFirestore(user, {
            displayName: user.displayName,
            photoURL: user.photoURL,
            emailVerified: user.emailVerified,
            role: 'student' // Default role
        });
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Google sign in error:', error);
        showToast('Failed to sign in with Google. Please try again.', 'error');
    } finally {
        setLoading(false);
    }
}

// Handle password reset
async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = prompt('Please enter your email address:');
    if (!email) return;
    
    try {
        setLoading(true);
        await sendPasswordResetEmail(auth, email);
        showToast('Password reset email sent. Please check your inbox.', 'success');
    } catch (error) {
        console.error('Password reset error:', error);
        showToast('Failed to send password reset email. Please check the email address and try again.', 'error');
    } finally {
        setLoading(false);
    }
}

// Check authentication state and redirect if needed
function checkAuthState() {
    onAuthStateChanged(auth, (user) => {
        const currentPath = window.location.pathname;
        const isAuthPage = currentPath.includes('auth/') || currentPath.endsWith('login.html') || currentPath.endsWith('signup.html');
        
        if (user) {
            // User is signed in
            if (isAuthPage) {
                // Redirect to dashboard if already logged in
                window.location.href = 'dashboard.html';
            }
        } else {
            // User is signed out
            if (!isAuthPage) {
                // Redirect to login if not on auth page
                window.location.href = '/auth/login-fixed.html';
            }
        }
    });
}

// Handle form submission
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        
        // Sign in with email and password
        await window.alphariaFirebase.signInWithEmailAndPassword(
            window.alphariaFirebase.auth,
            email,
            password
        );
        
        // Redirect to dashboard on success
        window.location.href = '../index.html';
    } catch (error) {
        console.error('Login error:', error);
        showToast(getAuthErrorMessage(error.code), 'error');
        
        // Reset button state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const userType = document.querySelector('input[name="user-type"]:checked').value;
    
    // Validate form
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        
        // Create user with email and password
        const userCredential = await window.alphariaFirebase.createUserWithEmailAndPassword(
            window.alphariaFirebase.auth,
            email,
            password
        );
        
        // Save user data to Firestore
        await window.alphariaFirebase.createUserProfile(userCredential.user.uid, {
            displayName: name,
            email: email,
            role: userType,
            isAdmin: userType === 'teacher',
            emailVerified: false,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        });
        
        // Send email verification
        await sendEmailVerification(userCredential.user);
        
        // Show success message
        const successMessage = userType === 'teacher' 
            ? 'Teacher account created successfully! You now have full administrative access.' 
            : 'Student account created successfully!';
            
        showToast(successMessage, 'success');
        
        // Redirect based on user role after a short delay
        setTimeout(() => {
            if (userType === 'teacher') {
                window.location.href = '../dashboard/teacher.html';
            } else {
                window.location.href = '../dashboard/student.html';
            }
        }, 3000);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    } catch (error) {
        console.error('Signup error:', error);
        showToast(getAuthErrorMessage(error.code), 'error');
        
        // Reset button state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// Social login handlers
async function handleGoogleLogin() {
    try {
        await window.alphariaFirebase.signInWithGoogle();
        window.location.href = '../index.html';
    } catch (error) {
        console.error('Google login error:', error);
        showToast(getAuthErrorMessage(error.code), 'error');
    }
}

async function handleMicrosoftLogin() {
    try {
        await window.alphariaFirebase.signInWithMicrosoft();
        window.location.href = '../index.html';
    } catch (error) {
        console.error('Microsoft login error:', error);
        showToast(getAuthErrorMessage(error.code), 'error');
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Add show class after a small delay for animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove toast after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Get user-friendly error messages
function getAuthErrorMessage(errorCode) {
    const messages = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/user-not-found': 'No account found with this email address.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/weak-password': 'Password should be at least 6 characters long.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
        'auth/operation-not-allowed': 'This operation is not allowed.',
        'auth/account-exists-with-different-credential': 'An account already exists with the same email but different sign-in credentials.'
    };
    
    return messages[errorCode] || 'An error occurred. Please try again.';
}

// Initialize the authentication page
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    checkAuthState();
    
    // Set up event listeners
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    if (googleLoginBtn) googleLoginBtn.addEventListener('click', handleGoogleLogin);
    if (microsoftLoginBtn) microsoftLoginBtn.addEventListener('click', handleMicrosoftLogin);
    
    // Tab switching
    if (loginTab) loginTab.addEventListener('click', () => switchForm('login'));
    if (signupTab) signupTab.addEventListener('click', () => switchForm('signup'));
    if (switchToSignup) switchToSignup.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('signup');
    });
    if (switchToLogin) switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('login');
    });
    
    // Set up password toggles
    setupPasswordToggle();
    
    // Check if user is already logged in
    window.alphariaFirebase.onAuthStateChanged(window.alphariaFirebase.auth, (user) => {
        if (user) {
            // User is signed in, redirect to dashboard
            window.location.href = '../index.html';
        }
    });
});
