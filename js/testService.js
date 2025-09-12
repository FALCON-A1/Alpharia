// Use global Firebase instances that are already initialized in the HTML
const { db } = window;

// Collection names
const TESTS_COLLECTION = 'tests';
const TEST_ATTEMPTS_COLLECTION = 'testAttempts';

/**
 * Save a new test to Firestore
 * @param {Object} testData - The test data to save
 * @param {string} userId - The ID of the teacher creating the test
 * @returns {Promise<string>} The ID of the newly created test
 */
export async function saveTest(testData, userId) {
    try {
        // Add metadata to the test
        const testWithMetadata = {
            ...testData,
            createdBy: userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'draft', // or 'published' when published
            isActive: true
        };

        // Add the test to the 'tests' collection
        const docRef = await db.collection(TESTS_COLLECTION).add(testWithMetadata);
        console.log('Test saved with ID: ', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error saving test: ', error);
        throw error;
    }
}

/**
 * Update an existing test in Firestore
 * @param {string} testId - The ID of the test to update
 * @param {Object} updates - The updates to apply to the test
 * @returns {Promise<void>}
 */
export async function updateTest(testId, updates) {
    try {
        await db.collection(TESTS_COLLECTION).doc(testId).update({
            ...updates,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('Test updated successfully');
    } catch (error) {
        console.error('Error updating test: ', error);
        throw error;
    }
}

/**
 * Get all tests created by a specific teacher
 * @param {string} userId - The ID of the teacher
 * @returns {Promise<Array>} Array of test documents
 */
export async function getTestsByTeacher(userId) {
    try {
        const snapshot = await db
            .collection(TESTS_COLLECTION)
            .where('createdBy', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting tests: ', error);
        throw error;
    }
}

/**
 * Get a single test by ID
 * @param {string} testId - The ID of the test to retrieve
 * @returns {Promise<Object>} The test document
 */
export async function getTestById(testId) {
    try {
        const doc = await db.collection(TESTS_COLLECTION).doc(testId).get();
        if (!doc.exists) {
            throw new Error('Test not found');
        }
        return {
            id: doc.id,
            ...doc.data()
        };
    } catch (error) {
        console.error('Error getting test: ', error);
        throw error;
    }
}

/**
 * Save a student's test attempt
 * @param {string} testId - The ID of the test being attempted
 * @param {string} studentId - The ID of the student
 * @param {Object} attemptData - The student's answers and results
 * @returns {Promise<string>} The ID of the test attempt
 */
export async function saveTestAttempt(testId, studentId, attemptData) {
    try {
        const attemptWithMetadata = {
            ...attemptData,
            testId,
            studentId,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isGraded: attemptData.isGraded || false,
            score: attemptData.score || 0,
            totalPoints: attemptData.totalPoints || 0
        };

        const docRef = await db.collection(TEST_ATTEMPTS_COLLECTION).add(attemptWithMetadata);
        console.log('Test attempt saved with ID: ', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error saving test attempt: ', error);
        throw error;
    }
}

/**
 * Get all test attempts for a specific student
 * @param {string} studentId - The ID of the student
 * @returns {Promise<Array>} Array of test attempts
 */
export async function getStudentTestAttempts(studentId) {
    try {
        const snapshot = await db
            .collection(TEST_ATTEMPTS_COLLECTION)
            .where('studentId', '==', studentId)
            .orderBy('submittedAt', 'desc')
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting student test attempts: ', error);
        throw error;
    }
}

/**
 * Get all attempts for a specific test
 * @param {string} testId - The ID of the test
 * @returns {Promise<Array>} Array of test attempts
 */
export async function getTestAttempts(testId) {
    try {
        const snapshot = await db
            .collection(TEST_ATTEMPTS_COLLECTION)
            .where('testId', '==', testId)
            .orderBy('submittedAt', 'desc')
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting test attempts: ', error);
        throw error;
    }
}
