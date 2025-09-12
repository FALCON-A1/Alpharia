// Wait for Firebase to be fully initialized
if (!window.alphariaFirebase) {
    throw new Error('Firebase not initialized. Make sure alphariaFirebase is available in the global scope.');
}

// Access Firebase instances from the global alphariaFirebase object
const { auth, db, firestore, authMethods } = window.alphariaFirebase;
const { 
    doc, getDoc, collection, query, where, getDocs, orderBy, limit,
    addDoc, updateDoc, serverTimestamp
} = firestore;

const { onAuthStateChanged, signOut } = authMethods;

// Debug: Log when test-taking.js starts executing
console.log('Debug: test-taking.js is executing');
console.log('Debug: Firebase instances available:', { 
    auth: !!auth, 
    db: !!db,
    firebaseModules: !!firebaseModules 
});

// Show error if Firebase is not available
if (!auth || !db || !firebaseModules) {
    const error = new Error('Firebase not properly initialized');
    console.error('Firebase initialization error:', error);
    
    const errorElement = document.createElement('div');
    errorElement.style.cssText = `
        color: white;
        background-color: #ef4444;
        padding: 20px;
        margin: 20px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
    `;
    errorElement.innerHTML = `
        <h3 style="margin: 0 0 10px 0;">Error: Application Initialization Failed</h3>
        <p style="margin: 0 0 10px 0;">${error.message || 'Unable to initialize required services.'}</p>
        <p style="margin: 0;">Please refresh the page or contact support if the issue persists.</p>
    `;
    document.body.prepend(errorElement);
    throw error;
}

// DOM Elements
const testContent = document.getElementById('test-content');
const testTitle = document.getElementById('test-title');
const testInstructions = document.getElementById('test-instructions');
const testGrade = document.getElementById('test-grade');
const testTimeLimit = document.getElementById('test-time-limit');
const testSections = document.getElementById('test-sections');
const prevSectionBtn = document.getElementById('prev-section-btn');
const nextSectionBtn = document.getElementById('next-section-btn');
const submitTestBtn = document.getElementById('submit-test-btn');
const testProgress = document.getElementById('test-progress');
const progressText = document.getElementById('progress-text');

// Speech Recognition Elements
const speechModal = document.getElementById('speech-modal');
const speechPrompt = document.getElementById('speech-prompt');
const recordingIndicator = document.getElementById('recording-indicator');
const recognizedText = document.getElementById('recognized-text');
const resultFeedback = document.getElementById('result-feedback');
const tryAgainBtn = document.getElementById('try-again-btn');
const nextItemBtn = document.getElementById('next-item-btn');

// Submit Modal Elements
const submitModal = document.getElementById('submit-modal');
const completedCount = document.getElementById('completed-count');
const timeSpent = document.getElementById('time-spent');
const cancelSubmitBtn = document.getElementById('cancel-submit-btn');
const confirmSubmitBtn = document.getElementById('confirm-submit-btn');

// State
let currentTest = null;
let currentSectionIndex = 0;
let currentItemIndex = 0;
let userResponses = [];
let startTime = null;
let timerInterval = null;
let recognition = null;
let currentAttempt = 1;
const maxAttempts = 3;

// Initialize the test taking interface
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const user = auth.currentUser;
    if (!user) {
        window.location.href = '/auth/login-fixed.html';
        return;
    }

    // Set up auth state observer
    auth.onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = '/auth/login-fixed.html';
        }
    });

    // Get test ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');

    if (!testId) {
        showNotification('No test ID provided', 'error');
        setTimeout(() => {
            window.location.href = 'student-dashboard.html';
        }, 2000);
        return;
    }

    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            processSpeechResult(transcript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            showNotification('Error with speech recognition. Please try again.', 'error');
            stopRecording();
        };

        recognition.onend = () => {
            // Auto-restart if we're still in the recording state
            if (speechModal.classList.contains('show')) {
                startRecording();
            }
        };
    } else {
        showNotification('Speech recognition is not supported in this browser', 'error');
    }

    // Load test data
    try {
        currentTest = await getTestById(testId);
        if (!currentTest) {
            throw new Error('Test not found');
        }
        
        // Initialize test UI
        initializeTest(currentTest);
        
        // Start the test timer
        startTimer();
    } catch (error) {
        console.error('Error loading test:', error);
        showNotification('Error loading test. Please try again.', 'error');
        setTimeout(() => {
            window.location.href = 'student-dashboard.html';
        }, 2000);
    }

    // Set up event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Navigation buttons
    prevSectionBtn.addEventListener('click', showPreviousSection);
    nextSectionBtn.addEventListener('click', showNextSection);
    submitTestBtn.addEventListener('click', showSubmitModal);
    
    // Speech modal buttons
    tryAgainBtn.addEventListener('click', startRecording);
    nextItemBtn.addEventListener('click', showNextItem);
    
    // Submit modal buttons
    cancelSubmitBtn.addEventListener('click', () => {
        submitModal.classList.remove('show');
    });
    
    confirmSubmitBtn.addEventListener('click', submitTest);
    
    // Close modals when clicking outside
    [speechModal, submitModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
        
        const closeButtons = modal.querySelectorAll('.close-modal');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('show');
            });
        });
    });
    
    // Prevent modal from closing when clicking inside
    document.querySelectorAll('.modal-content').forEach(content => {
        content.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
    
    // Handle back/forward browser buttons
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.sectionIndex !== undefined) {
            showSection(e.state.sectionIndex);
        }
    });
}

function initializeTest(test) {
    // Set test info
    testTitle.textContent = test.title;
    testInstructions.textContent = test.instructions || 'Read each word/sentence clearly when prompted.';
    testGrade.textContent = `Grade: ${test.grade || 'N/A'}`;
    testTimeLimit.textContent = `Time Limit: ${test.timeLimit || 30} minutes`;
    testSections.textContent = `Sections: ${test.sections?.length || 0}`;
    
    // Render test sections
    renderTestSections(test.sections);
    
    // Show first section
    showSection(0);
}

function renderTestSections(sections) {
    if (!sections || !sections.length) {
        testContent.innerHTML = '<p class="text-center">No sections found in this test.</p>';
        return;
    }
    
    testContent.innerHTML = '';
    
    sections.forEach((section, sectionIndex) => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'test-section';
        sectionEl.dataset.sectionIndex = sectionIndex;
        
        let itemsHTML = '';
        
        section.items.forEach((item, itemIndex) => {
            const isPassage = section.type === 'passage';
            const itemId = `${sectionIndex}-${itemIndex}`;
            
            itemsHTML += `
                <div class="test-item" data-item-id="${itemId}">
                    <div class="item-prompt">
                        ${isPassage ? 'Read the following passage:' : 'Read the following:'}
                    </div>
                    <div class="item-content">
                        ${isPassage ? 
                            `<h4>${item.title || 'Reading Passage'}</h4>
                             <p>${item.content || ''}</p>
                             ${item.question ? `<p><strong>Question:</strong> ${item.question}</p>` : ''}` 
                            : 
                            `<p class="text-lg">${item.text || ''}</p>`
                        }
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-primary start-recording" 
                                data-section-index="${sectionIndex}" 
                                data-item-index="${itemIndex}">
                            <i class="fas fa-microphone"></i> Record Response
                        </button>
                    </div>
                </div>
            `;
        });
        
        sectionEl.innerHTML = `
            <div class="section-header">
                <h2>${section.title || `Section ${sectionIndex + 1}`}</h2>
            </div>
            ${section.instructions ? 
                `<div class="section-instructions">${section.instructions}</div>` : ''
            }
            <div class="test-items">
                ${itemsHTML}
            </div>
        `;
        
        testContent.appendChild(sectionEl);
    });
    
    // Add event listeners to record buttons
    document.querySelectorAll('.start-recording').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sectionIndex = parseInt(e.target.closest('.start-recording').dataset.sectionIndex);
            const itemIndex = parseInt(e.target.closest('.start-recording').dataset.itemIndex);
            startItemRecording(sectionIndex, itemIndex);
        });
    });
    
    // Initialize user responses
    initializeUserResponses(sections);
}

function initializeUserResponses(sections) {
    userResponses = [];
    
    sections.forEach((section, sectionIndex) => {
        const sectionResponses = [];
        
        section.items.forEach((item, itemIndex) => {
            sectionResponses.push({
                itemId: `${sectionIndex}-${itemIndex}`,
                attempts: [],
                isCorrect: false,
                score: 0,
                maxScore: item.points || 1,
                submitted: false
            });
        });
        
        userResponses.push(sectionResponses);
    });
}

function showSection(sectionIndex) {
    // Hide all sections
    document.querySelectorAll('.test-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.querySelector(`.test-section[data-section-index="${sectionIndex}"]`);
    if (targetSection) {
        targetSection.classList.add('active');
        
        // Update navigation buttons
        prevSectionBtn.disabled = sectionIndex === 0;
        nextSectionBtn.disabled = sectionIndex === currentTest.sections.length - 1;
        
        // Update URL without reloading the page
        history.pushState({ sectionIndex }, '', `?id=${currentTest.id}&section=${sectionIndex}`);
        
        // Update progress
        updateProgress();
    }
}

function showPreviousSection() {
    if (currentSectionIndex > 0) {
        showSection(currentSectionIndex - 1);
    }
}

function showNextSection() {
    if (currentSectionIndex < currentTest.sections.length - 1) {
        showSection(currentSectionIndex + 1);
    }
}

function updateProgress() {
    if (!currentTest) return;
    
    const totalItems = currentTest.sections.reduce((total, section) => total + section.items.length, 0);
    let completedItems = 0;
    
    userResponses.forEach(section => {
        section.forEach(item => {
            if (item.submitted) {
                completedItems++;
            }
        });
    });
    
    // Update progress bar
    const progressPercentage = Math.round((completedItems / totalItems) * 100);
    testProgress.style.width = `${progressPercentage}%`;
    
    // Update progress text
    progressText.textContent = `${completedItems}/${totalItems}`;
    
    // Update submit button state
    submitTestBtn.disabled = completedItems === 0;
}

function startItemRecording(sectionIndex, itemIndex) {
    if (!recognition) {
        showNotification('Speech recognition is not available', 'error');
        return;
    }
    
    currentSectionIndex = sectionIndex;
    currentItemIndex = itemIndex;
    currentAttempt = 1;
    
    const section = currentTest.sections[sectionIndex];
    const item = section.items[itemIndex];
    
    // Update UI for recording
    const isPassage = section.type === 'passage';
    const promptText = isPassage 
        ? `Read the passage: "${item.title || 'Untitled'}"`
        : `Say the ${section.type === 'words' ? 'word' : 'sentence'}: <strong>"${item.text}"</strong>`;
    
    speechPrompt.innerHTML = promptText;
    recognizedText.textContent = '';
    resultFeedback.innerHTML = '';
    
    // Reset attempt dots
    const dots = document.querySelectorAll('.attempt-dots .dot');
    dots.forEach(dot => dot.classList.remove('active'));
    dots[0].classList.add('active');
    
    // Show the modal
    speechModal.classList.add('show');
    
    // Start recording
    startRecording();
}

function startRecording() {
    if (!recognition) return;
    
    // Update UI
    recordingIndicator.style.display = 'flex';
    document.querySelector('.recording-visualizer').style.display = 'flex';
    resultFeedback.style.display = 'none';
    
    // Update attempt dots
    const dots = document.querySelectorAll('.attempt-dots .dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index < currentAttempt);
    });
    
    // Start speech recognition
    try {
        recognition.start();
    } catch (error) {
        console.error('Error starting speech recognition:', error);
        showNotification('Error starting speech recognition. Please try again.', 'error');
        stopRecording();
    }
}

function stopRecording() {
    if (recognition) {
        try {
            recognition.stop();
        } catch (error) {
            console.error('Error stopping speech recognition:', error);
        }
    }
    
    recordingIndicator.style.display = 'none';
    document.querySelector('.recording-visualizer').style.display = 'none';
}

function processSpeechResult(transcript) {
    // Stop the recording
    stopRecording();
    
    const section = currentTest.sections[currentSectionIndex];
    const item = section.items[currentItemIndex];
    const isPassage = section.type === 'passage';
    
    // For now, we'll do a simple text comparison
    // In a real app, you might want to use a more sophisticated comparison
    const expectedText = isPassage ? item.content : item.text;
    const isCorrect = compareTranscription(transcript, expectedText);
    
    // Update UI with result
    recognizedText.textContent = `"${transcript}"`;
    
    // Update user responses
    const response = userResponses[currentSectionIndex][currentItemIndex];
    response.attempts.push({
        attempt: currentAttempt,
        transcript,
        isCorrect,
        timestamp: new Date().toISOString()
    });
    
    // Calculate score (simplified)
    if (isCorrect) {
        response.isCorrect = true;
        response.score = response.maxScore;
        response.submitted = true;
        
        // Show success feedback
        resultFeedback.innerHTML = `
            <i class="fas fa-check-circle success"></i>
            <span>Correct! Well done!</span>
        `;
        
        // Update button states
        nextItemBtn.style.display = 'inline-flex';
        tryAgainBtn.style.display = 'none';
    } else if (currentAttempt >= maxAttempts) {
        // Max attempts reached
        response.submitted = true;
        
        // Show feedback with correct answer
        resultFeedback.innerHTML = `
            <i class="fas fa-times-circle error"></i>
            <span>Maximum attempts reached. The correct answer was: <strong>${expectedText}</strong></span>
        `;
        
        // Update button states
        nextItemBtn.style.display = 'inline-flex';
        tryAgainBtn.style.display = 'none';
    } else {
        // Incorrect but can try again
        resultFeedback.innerHTML = `
            <i class="fas fa-exclamation-circle error"></i>
            <span>Not quite right. Try again!</span>
        `;
        
        // Update button states
        nextItemBtn.style.display = 'none';
        tryAgainBtn.style.display = 'inline-flex';
        
        // Increment attempt counter
        currentAttempt++;
    }
    
    // Show the feedback
    resultFeedback.style.display = 'flex';
    
    // Update the test UI
    updateItemUI(currentSectionIndex, currentItemIndex, response);
    updateProgress();
}

function compareTranscription(transcript, expected) {
    if (!transcript || !expected) return false;
    
    // Simple comparison - in a real app, you might want to use a more sophisticated algorithm
    // that handles minor mispronunciations, different accents, etc.
    const cleanTranscript = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const cleanExpected = expected.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    return cleanTranscript === cleanExpected;
}

function updateItemUI(sectionIndex, itemIndex, response) {
    const itemElement = document.querySelector(`.test-item[data-item-id="${sectionIndex}-${itemIndex}"]`);
    if (!itemElement) return;
    
    const button = itemElement.querySelector('.start-recording');
    if (!button) return;
    
    if (response.submitted) {
        button.innerHTML = `
            <i class="fas fa-${response.isCorrect ? 'check' : 'times'}-circle"></i>
            ${response.isCorrect ? 'Completed' : 'Attempted'}
        `;
        button.classList.add(response.isCorrect ? 'btn-success' : 'btn-outline');
        button.classList.remove('btn-primary');
        button.disabled = true;
    } else if (response.attempts.length > 0) {
        button.innerHTML = `
            <i class="fas fa-redo"></i>
            Try Again (${maxAttempts - response.attempts.length} left)
        `;
    }
}

function showNextItem() {
    // Close the speech modal
    speechModal.classList.remove('show');
    
    // Move to next item or next section
    const currentSection = currentTest.sections[currentSectionIndex];
    
    if (currentItemIndex < currentSection.items.length - 1) {
        // Next item in current section
        currentItemIndex++;
        
        // Scroll to next item
        const nextItem = document.querySelector(`.test-item[data-item-id="${currentSectionIndex}-${currentItemIndex}"]`);
        if (nextItem) {
            nextItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else if (currentSectionIndex < currentTest.sections.length - 1) {
        // First item in next section
        showSection(currentSectionIndex + 1);
        currentItemIndex = 0;
    }
    // Else: Do nothing (last item of last section)
}

function showSubmitModal() {
    if (!currentTest) return;
    
    // Calculate completed items
    let completedItems = 0;
    let totalItems = 0;
    
    userResponses.forEach(section => {
        section.forEach(item => {
            totalItems++;
            if (item.submitted) {
                completedItems++;
            }
        });
    });
    
    // Update modal content
    completedCount.textContent = `${completedItems}/${totalItems}`;
    
    // Calculate time spent
    const timeElapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(timeElapsed / 60);
    const seconds = timeElapsed % 60;
    timeSpent.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Show the modal
    submitModal.classList.add('show');
}

async function submitTest() {
    if (!currentTest) return;
    
    // Stop the timer
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Calculate score
    let totalScore = 0;
    let maxPossibleScore = 0;
    let correctItems = 0;
    let totalItems = 0;
    
    userResponses.forEach((section, sectionIndex) => {
        section.forEach((item, itemIndex) => {
            totalItems++;
            maxPossibleScore += item.maxScore;
            
            if (item.submitted && item.isCorrect) {
                totalScore += item.score;
                correctItems++;
            }
        });
    });
    
    const percentageScore = Math.round((totalScore / maxPossibleScore) * 100);
    
    try {
        // Save test attempt to Firestore
        const attemptData = {
            testId: currentTest.id,
            studentId: auth.currentUser.uid,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date().toISOString(),
            timeSpent: Math.floor((Date.now() - startTime) / 1000), // in seconds
            score: totalScore,
            maxScore: maxPossibleScore,
            percentage: percentageScore,
            responses: userResponses.flat(),
            isGraded: true
        };
        
        const attemptId = await saveTestAttempt(currentTest.id, auth.currentUser.uid, attemptData);
        console.log('Test submitted with attempt ID:', attemptId);
        
        // Show success message and redirect to results page
        showNotification('Test submitted successfully!', 'success');
        
        // Redirect to results page after a short delay
        setTimeout(() => {
            window.location.href = `test-results.html?attempt=${attemptId}`;
        }, 1500);
        
    } catch (error) {
        console.error('Error submitting test:', error);
        showNotification('Error submitting test. Please try again.', 'error');
    }
}

function startTimer() {
    startTime = Date.now();
    const timeLimitMinutes = currentTest.timeLimit || 30;
    const timeLimitMs = timeLimitMinutes * 60 * 1000;
    
    function updateTimer() {
        const now = Date.now();
        const elapsedMs = now - startTime;
        const remainingMs = Math.max(0, timeLimitMs - elapsedMs);
        
        // Update timer display
        const minutes = Math.floor(remainingMs / (60 * 1000));
        const seconds = Math.floor((remainingMs % (60 * 1000)) / 1000);
        
        const timerDisplay = document.getElementById('test-timer');
        if (timerDisplay) {
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Check if time is up
        if (remainingMs <= 0) {
            clearInterval(timerInterval);
            showNotification('Time is up! Your test will be submitted automatically.', 'error');
            submitTest();
        }
    }
    
    // Update timer immediately and then every second
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

// Helper function to show notifications
function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close">&times;</button>
    `;
    
    // Add close button functionality
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
        notification.remove();
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Trigger reflow to enable animation
    notification.offsetHeight;
    notification.classList.add('show');
}
