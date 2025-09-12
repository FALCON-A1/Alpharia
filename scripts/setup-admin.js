// Script to set up initial admin user and collections
// Run this once to initialize the admin system

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    collection,
    getDocs,
    query,
    where
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword 
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAtOedXLBC4eigzqmBpYFciN-W5Mi2Cpmc",
    authDomain: "alpharia-c6a39.firebaseapp.com",
    projectId: "alpharia-c6a39",
    storageBucket: "alpharia-c6a39.firebasestorage.app",
    messagingSenderId: "85322759772",
    appId: "1:85322759772:web:d5c7a528fd61c9d2373099",
    measurementId: "G-KEC7MGMVE8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Admin configuration
const ADMIN_EMAIL = "admin@alpharia.com";
const ADMIN_PASSWORD = "@LPH@RI@*134679";
const ADMIN_DISPLAY_NAME = "System Administrator";

// Permissions
const PERMISSIONS = {
    // User Management
    MANAGE_USERS: 'manage_users',
    VIEW_USERS: 'view_users',
    
    // Test Management
    MANAGE_TESTS: 'manage_tests',
    VIEW_TESTS: 'view_tests',
    
    // Class Management
    MANAGE_CLASSES: 'manage_classes',
    VIEW_CLASSES: 'view_classes',
    
    // Settings
    MANAGE_SETTINGS: 'manage_settings',
    
    // Analytics
    VIEW_ANALYTICS: 'view_analytics'
};

// Roles
const ROLES = {
    SUPER_ADMIN: {
        name: 'Super Administrator',
        permissions: Object.values(PERMISSIONS)
    },
    ADMIN: {
        name: 'Administrator',
        permissions: [
            PERMISSIONS.VIEW_USERS,
            PERMISSIONS.MANAGE_USERS,
            PERMISSIONS.VIEW_TESTS,
            PERMISSIONS.VIEW_CLASSES,
            PERMISSIONS.VIEW_ANALYTICS
        ]
    },
    TEACHER: {
        name: 'Teacher',
        permissions: [
            PERMISSIONS.VIEW_TESTS,
            PERMISSIONS.VIEW_CLASSES,
            PERMISSIONS.VIEW_ANALYTICS
        ]
    },
    LIMITED_TEACHER: {
        name: 'Limited Teacher',
        permissions: [
            PERMISSIONS.VIEW_TESTS
        ]
    }
};

async function setupAdmin() {
    try {
        console.log('Starting admin setup...');
        
        // 1. Create the admin user
        console.log('Creating admin user...');
        const userCredential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
        const user = userCredential.user;
        console.log('Admin user created:', user.uid);
        
        // 2. Create the roles collection if it doesn't exist
        console.log('Setting up roles...');
        const rolesRef = collection(db, 'roles');
        
        for (const [roleId, roleData] of Object.entries(ROLES)) {
            const roleRef = doc(rolesRef, roleId);
            await setDoc(roleRef, {
                name: roleData.name,
                permissions: roleData.permissions,
                createdAt: new Date().toISOString()
            }, { merge: true });
            console.log(`Role created/updated: ${roleData.name}`);
        }
        
        // 3. Create the admin user document with super admin role
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
            uid: user.uid,
            email: ADMIN_EMAIL,
            displayName: ADMIN_DISPLAY_NAME,
            role: 'SUPER_ADMIN',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        });
        
        console.log('Admin setup completed successfully!');
        console.log('Admin email:', ADMIN_EMAIL);
        console.log('Admin password:', ADMIN_PASSWORD);
        console.log('Please change this password after first login.');
        
    } catch (error) {
        console.error('Error setting up admin:', error);
        
        // Check if admin already exists
        if (error.code === 'auth/email-already-in-use') {
            console.log('Admin user already exists. Updating permissions...');
            
            // Find the admin user by email
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', ADMIN_EMAIL));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const adminDoc = querySnapshot.docs[0];
                await setDoc(doc(db, 'users', adminDoc.id), {
                    role: 'SUPER_ADMIN',
                    isActive: true,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                
                console.log('Admin permissions updated successfully!');
            } else {
                console.error('Admin user not found in Firestore. Please try again.');
            }
        }
    }
}

// Run the setup
setupAdmin();
