const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Application Setup
const app = express();
app.use(cors({ origin: true }));

// Mock API Keys (In production, use functions.config() or Secret Manager)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
const stripe = require('stripe')(STRIPE_SECRET_KEY);
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'AC_mock';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'auth_mock';
const twilioClient = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ═══════════════════════════════════════════════════════════
//  1. ROLE MANAGEMENT (Custom Claims)
// ═══════════════════════════════════════════════════════════

/**
 * Assigns a specific role to a user.
 * Roles: 'admin', 'school_admin', 'teacher', 'parent', 'student'
 * Expected Body: { uid: "user_id", role: "teacher" }
 */
app.post('/api/roles/assign', async (req, res) => {
    try {
        // In production: Verify the request is made by a super admin
        const { uid, role } = req.body;
        
        if (!uid || !role) {
            return res.status(400).json({ error: 'Missing uid or role' });
        }
        
        await admin.auth().setCustomUserClaims(uid, { role: role });
        
        // Also update Firestore user doc
        await db.collection('users').doc(uid).set({ role: role }, { merge: true });
        
        return res.status(200).json({ success: true, message: `Role ${role} assigned to ${uid}` });
    } catch (error) {
        console.error('Error assigning role:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ═══════════════════════════════════════════════════════════
//  2. STRIPE PAYMENTS & WEBHOOKS
// ═══════════════════════════════════════════════════════════

/**
 * Stripe Webhook Handler
 * Listens for subscription events and updates Firestore accordingly.
 */
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock';
    
    let event;
    try {
        // In dev, we might bypass signature verification if secret is mock
        if (endpointSecret === 'whsec_mock') {
             event = req.body;
             if (typeof event === 'string') event = JSON.parse(event);
             if (event instanceof Buffer) event = JSON.parse(event.toString());
        } else {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        }
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                await handleSuccessfulPayment(session);
                break;
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                const subscription = event.data.object;
                await updateSubscriptionStatus(subscription);
                break;
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
        res.json({received: true});
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).end();
    }
});

async function handleSuccessfulPayment(session) {
    const userId = session.client_reference_id;
    if (!userId) return;
    
    // Grant Pro Tier
    await db.collection('users').doc(userId).set({
        subscriptionTier: 'pro',
        stripeCustomerId: session.customer,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function updateSubscriptionStatus(subscription) {
    // Look up user by stripe customer ID and update their status in Firestore
    const snapshot = await db.collection('users').where('stripeCustomerId', '==', subscription.customer).limit(1).get();
    if (snapshot.empty) return;
    
    const docRef = snapshot.docs[0].ref;
    await docRef.update({
        subscriptionStatus: subscription.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

// ═══════════════════════════════════════════════════════════
//  3. TWILIO SMS REMINDERS
// ═══════════════════════════════════════════════════════════

/**
 * Scheduled Cron Job: Runs daily to find inactive students and alert parents/teachers.
 */
exports.dailySMSReminders = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Find students who haven't taken a test recently
        const inactiveStudents = await db.collection('students')
            .where('lastTestDate', '<', thirtyDaysAgo)
            .get();
            
        let reminderCount = 0;
            
        for (const sDoc of inactiveStudents.docs) {
            const student = sDoc.data();
            
            // If they have a linked parent phone number
            if (student.parentPhone) {
                // Mock Twilio call
                console.log(`Sending SMS to ${student.parentPhone}: Hi, ${student.name} hasn't taken a reading assessment recently. Please log into Alpharia.`);
                
                // Real Twilio call (commented out until keys are valid)
                /*
                await twilioClient.messages.create({
                    body: `Alpharia Alert: It's time for ${student.name}'s next reading assessment! Log in to keep their reading growth on track.`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: student.parentPhone
                });
                */
                reminderCount++;
            }
        }
        
        console.log(`Sent ${reminderCount} SMS reminders.`);
        return null;
    } catch (error) {
        console.error('Error in dailySMSReminders:', error);
        return null;
    }
});

// ═══════════════════════════════════════════════════════════
//  4. ASSESSMENT BOOKING API (Phase 2)
// ═══════════════════════════════════════════════════════════

/**
 * Get available time slots for an expert evaluation.
 */
app.get('/api/bookings/availability', async (req, res) => {
    try {
        const { date, expertId } = req.query;
        // Mock Implementation: In production, query a 'bookings' collection or external Calendar API
        return res.status(200).json({
            date: date,
            expertId: expertId,
            availableSlots: ['3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM']
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch availability' });
    }
});

/**
 * Create a new booking. Usually called via Stripe Webhook upon success,
 * or as a pending booking creation before checkout.
 */
app.post('/api/bookings/create', async (req, res) => {
    try {
        const { studentId, parentId, date, time, expertId } = req.body;
        
        // 1. Verify availability again to prevent double-booking
        // 2. Create Stripe Checkout Session
        // 3. Store pending booking in Firestore
        
        // Mock Checkout URL response
        const mockCheckoutUrl = 'https://checkout.stripe.com/pay/cs_mock_123';
        
        return res.status(200).json({ 
            success: true, 
             message: 'Booking initiated',
             checkoutUrl: mockCheckoutUrl
         });
    } catch (error) {
        return res.status(500).json({ error: 'Booking creation failed' });
    }
});

// ═══════════════════════════════════════════════════════════
//  5. SCHOOL ANALYTICS API (Phase 3)
// ═══════════════════════════════════════════════════════════

/**
 * Get aggregated stats for a school.
 * Usage: GET /api/school/stats?schoolId=SCH-123
 */
app.get('/api/school/stats', async (req, res) => {
    try {
        const { schoolId } = req.query;
        if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });

        // 1. Get Teachers in school
        const teachersSnap = await db.collection('teachers').where('schoolId', '==', schoolId).get();
        const teacherCount = teachersSnap.size;

        // 2. Get Students in school
        const studentsSnap = await db.collection('students').where('schoolId', '==', schoolId).get();
        const studentCount = studentsSnap.size;

        // 3. Calculate Aggregates
        let totalReadingLevel = 0;
        let assessmentCount = 0;

        studentsSnap.forEach(doc => {
            const data = doc.data();
            totalReadingLevel += (data.readingLevel || 0);
            assessmentCount += (data.totalAssessments || 0);
        });

        const avgReadingLevel = studentCount > 0 ? (totalReadingLevel / studentCount).toFixed(1) : 0;

        return res.status(200).json({
            schoolId: schoolId,
            teacherCount: teacherCount,
            studentCount: studentCount,
            totalAssessments: assessmentCount,
            avgReadingLevel: parseFloat(avgReadingLevel),
            growthRate: "+12.4%" // Mock growth for now
        });

    } catch (error) {
        console.error('School stats error:', error);
        return res.status(500).json({ error: 'Failed to aggregate school stats' });
    }
});

// Export the Express API as a Cloud Function
exports.api = functions.https.onRequest(app);
