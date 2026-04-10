import { app, auth, db } from './firebase-config.js';
import { requireAuth } from './auth-check.js';
import {
    doc, getDoc, addDoc, collection, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

console.log("Take Reading Test Script START");

// --- CONFIGURATION & CONSTANTS ---
const LEVEL_ORDER = ['pre_primer', 'primer', 'level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6'];

const WORD_LIST_CONFIG = {
    'pre_primer': { count: 10, pass: 8 },
    'primer': { count: 10, pass: 8 },
    'level_1': { count: 15, pass: 12 },
    'level_2': { count: 15, pass: 12 },
    'level_3': { count: 15, pass: 12 }, // Fixed: Document implies 15 words, not 20
    'level_4': { count: 20, pass: 15 }, // Table says "Less than 15 words on Level 4"
    'level_5': { count: 20, pass: 15 },
    'level_5': { count: 20, pass: 15 },
    'level_6': { count: 20, pass: 15 }
};

// FIXED: Timeout duration for listening (Student requested 4 sec)
const LISTENING_TIMEOUT_MS = 4000;

// --- GLOBAL STATE ---
let currentUser = null;
let pTest = null;
let currentStageIndex = 0;
let currentSubIndex = 0; // Usage varies by stage
let mediaRecorder = null;
let audioChunks = [];
let isListening = false;
const DEEPGRAM_API_KEY = "26e5c134da53fdd59d8b0c1456cf39359a55a2d4";

// Test & Reading State
let testState = {
    sentenceLevel: -1, // Highest index passed. -1 = None.
    wordListLevel: 'pre_primer', // Calculated from sentences
    passageLevel: 'pre_primer',  // Calculated from word list score

    // Per-stage temporary data
    currentWordList: [],
    wordListScore: 0,

    sentencesAttempted: 0,

    passageWords: [], // { word, clean, status }

    // FIXED: Track last marked word index across speech inputs to prevent duplicate marking
    lastMarkedWordIndex: -1,

    // FIXED: Guard flag to prevent double sentence advancement
    sentenceAdvancing: false,

    // EVIDENCE LOGS (Decision Tree)
    letterLogs: [],   // { letter, step: 'name'|'sound', spoken, status }
    sentenceLogs: [], // { sentence_id, status: 'completed'|'failed', errors }
    wordLogs: [],     // { target, spoken, status }
    passageLogs: [],  // { word, spoken, status, errorType }
    comprehensionLogs: [], // { question, answer, spoken, matched: bool }

    // Safety
    setupDone: false
};

// DOM Elements
const testContent = document.getElementById('test-content');
const nextBtn = document.getElementById('next-item-btn');
// recordBtn hidden/managed by UI

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { user } = await requireAuth(['student']);
        currentUser = user;

        // Load User Profile (Visual only)
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
            document.getElementById('user-name').textContent = userDoc.data().displayName || 'Student';
        }

        // Load Test
        const urlParams = new URLSearchParams(window.location.search);
        await loadPreTest(urlParams.get('testId'));

        // Init Speech
        setupMediaRecorder();

        // Start
        renderCurrentStage();

    } catch (error) {
        console.error("Init Error:", error);
        testContent.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
});

// DEV ONLY: Temporary function to skip letter stages during testing
window.devSkipLetters = function () {
    console.log("🚨 DEV: Skipping letter stages");
    stopRecording();
    clearListeningTimer();

    // Find first non-letter stage
    let nextStageIndex = 0;
    for (let i = 0; i < pTest.stages.length; i++) {
        if (pTest.stages[i].type !== 'letter_recognition') {
            nextStageIndex = i;
            break;
        }
    }

    currentStageIndex = nextStageIndex;
    currentSubIndex = 0;
    letterStep = 'name';

    renderCurrentStage();
};

async function loadPreTest(testId) {
    // Hardcoded logic for "Pre-test" / "Placement Test" if ID missing is acceptable for this specific flow
    // But we prefer fetching the real doc if possible.
    // For now assuming the standard 'pre-test' logic or ID passed.
    // We already have the JSON structure in previous context.

    // Simplified fetch for this context:
    // In production, we query firestore. Here we assume pTest is loaded from Firestore or Fallback.
    // I will use a direct fetch pattern similar to previous file.
    if (testId) {
        const d = await getDoc(doc(db, 'tests', testId));
        if (d.exists()) pTest = d.data();
    } else {
        // Fallback for dev - normally wouldn't do this but user context implies we need it working
        // We'll rely on the one seeded in DB. 
        // If not found, throw.
        throw new Error("No Test ID provided and auto-lookup not fully implemented without query");
    }

    if (!pTest) throw new Error("Test data not found");
    document.getElementById('test-title').textContent = pTest.title;
}

// --- RENDER ENGINE ---

function renderCurrentStage() {
    if (currentStageIndex >= pTest.stages.length) {
        finishTest();
        return;
    }

    const stage = pTest.stages[currentStageIndex];
    console.log("Rendering Stage:", stage.id, stage.type);

    // Common Cleanup
    stopRecording();
    testState.setupDone = false;

    // Router
    switch (stage.type) {
        case 'letter_recognition':
            renderLetterStage(stage);
            break;
        case 'sentence_reading':
            renderSentenceStage(stage);
            break;
        case 'word_list':
            // We need to configure the word list based on Sentence Results first
            if (!testState.setupDone) prepareWordList(stage);
            renderWordListStage(stage);
            break;
        case 'oral_reading':
            // Configure passage based on Word List Results
            if (!testState.setupDone) prepareReadingPassage(stage);
            renderReadingPassageStage(stage);
            break;
        default:
            currentStageIndex++;
            renderCurrentStage();
    }
}

// --- STAGE 1: LETTERS ---
let letterStep = 'name'; // 'name' or 'sound'

function renderLetterStage(stage) {
    if (currentSubIndex >= stage.items.length) {
        currentStageIndex++;
        currentSubIndex = 0;
        letterStep = 'name'; // Reset
        renderCurrentStage();
        return;
    }

    testState.letterAnswered = false; // Reset lock for new letter
    const letter = stage.items[currentSubIndex];
    let promptText = "";

    // AUDIT FIX: Check if this is name-only stage (common/lowercase letters)
    const isNameOnly = stage.id === 'letters_common';

    if (isNameOnly) {
        // Name-only stage: skip sound step (per Welcome to Reading.md lines 42-71)
        letterStep = 'name';
        promptText = "Say the <b>LETTER NAME</b>.";
    } else {
        // Capital letters: name + sound
        if (letterStep === 'name') {
            promptText = "Say the <b>LETTER NAME</b>.";
        } else {
            promptText = "Say the <b>LETTER SOUND</b>.";
        }
    }

    const html = `<div class="py-5"><h1 class="giant-text mb-0">${letter}</h1></div>
    <!-- DEV ONLY: Temporary Skip Button -->
    <button onclick="window.devSkipLetters()" class="btn btn-danger btn-sm mt-3" style="opacity:0.7">
        ⚠️ SKIP LETTERS (DEV ONLY)
    </button>`;

    testContent.innerHTML = getStageWrapper(html, promptText);
    // User requested manual start/stop interaction.
    updateRecordingUI("ready");
}

// --- STAGE 2: SENTENCES ---
function renderSentenceStage(stage) {
    // Branching Logic is handled in handleInput/Evaluation.
    // Here we just render the current sentence (currentSubIndex).

    // Safety check
    if (currentSubIndex >= stage.items.length) {
        // Should have branched out by now usually, but if fell through:
        evaluateSentencePlacement();
        currentStageIndex++;
        currentSubIndex = 0;
        renderCurrentStage();
        return;
    }

    const item = stage.items[currentSubIndex];

    // FIXED: Reset guard and word tracking for new sentence
    testState.sentenceAdvancing = false;
    testState.lastMarkedWordIndex = -1;

    const html = `
        <div class="py-4 text-start">
            <p class="sentence-text" id="sentence-text">${item.text}</p>
        </div>
    `;
    testContent.innerHTML = getStageWrapper(html, "Read the sentence aloud.");

    // Setup checking
    testState.passageWords = item.text.split(' ').map(w => ({
        original: w, clean: cleanWord(w), status: 'pending'
    }));
    updateReadingDisplay('sentence-text');
    updateRecordingUI("ready");
}

// logic to handle sentence progression is in handleSpeechInput

// --- STAGE 3: WORD LISTS ---
function prepareWordList(stage) {
    // 1. Determine Level from TestState
    // Default 'pre_primer' if nothing passed
    let level = testState.wordListLevel || 'pre_primer';

    // 2. Get words for that level
    const allWords = stage.levels[level];
    if (!allWords) {
        console.error("Missing words for level", level);
        currentStageIndex++; renderCurrentStage(); return;
    }

    // 3. Randomize and Pick N
    const config = WORD_LIST_CONFIG[level] || { count: 10, pass: 8 };
    const shuffled = [...allWords].sort(() => 0.5 - Math.random());
    testState.currentWordList = shuffled.slice(0, config.count);
    testState.wordListScore = 0;

    // Reset subIndex to iterate through these words
    currentSubIndex = 0;
    testState.setupDone = true; // Mark as ready so we don't re-shuffle on re-render
}

let wordInterval = null;

function renderWordListStage(stage) {
    if (currentSubIndex >= testState.currentWordList.length) {
        // Finished List -> Goto Passage
        evaluateWordListPass();
        clearInterval(wordInterval);
        currentStageIndex++;
        currentSubIndex = 0;
        renderCurrentStage();
        return;
    }

    const word = testState.currentWordList[currentSubIndex];
    const html = `
        <div class="py-5">
            <h2 class="display-1 fw-bolder mb-4 text-dark fade-in" style="font-size: 6rem; letter-spacing: 2px;">${word}</h2>
        </div>
    `;
    testContent.innerHTML = getStageWrapper(html, "Read the word quickly!");

    startListeningWindow(4000);
}

// --- STAGE 4: PASSAGE ---
let passageMode = 'reading'; // 'reading' or 'questions'

function prepareReadingPassage(stage) {
    // 1. Determine Level (calculated in evaluateWordListPass)
    const level = testState.passageLevel || 'pre_primer';

    // 2. Find data
    const levelData = stage.levels.find(l => l.levelId === level);
    if (!levelData) {
        finishTest(); return;
    }

    // 3. Setup
    testState.currentPassageData = levelData;
    testState.passageWords = levelData.text.split(' ').map(w => ({
        original: w, clean: cleanWord(w), status: 'pending'
    }));
    passageMode = 'reading';
    testState.setupDone = true;
    currentSubIndex = 0; // Question index later
}

function renderReadingPassageStage(stage) {
    const data = testState.currentPassageData;

    if (passageMode === 'reading') {
        const html = `
            <div class="text-start">
                <h4 class="text-muted text-uppercase fw-bold mb-4 small">${data.title}</h4>
                <p class="sentence-text" id="passage-text" style="font-size: 1.8rem; line-height: 1.8;">
                    ${generatePassageHTML(testState.passageWords)}
                </p>
                <button id="finish-btn" class="btn btn-success btn-lg mt-4 w-100">I'm Done Reading</button>
            </div>
        `;
        testContent.innerHTML = getStageWrapper(html, "Read the story aloud.");

        document.getElementById('finish-btn').addEventListener('click', () => {
            passageMode = 'questions';
            currentSubIndex = 0;
            renderReadingPassageStage(stage);
        });
        updateRecordingUI("ready");
    } else {
        // Questions
        if (currentSubIndex >= data.questions.length) {
            evaluatePassagePerformance(stage);
            return;
        }

        const q = data.questions[currentSubIndex];
        const html = `
            <div class="py-4">
                <span class="badge bg-primary mb-3">Question ${currentSubIndex + 1} of ${data.questions.length}</span>
                <h3 class="display-6 fw-bold mb-5">${q.question}</h3>
                <button id="skip-btn" class="btn btn-outline-danger mt-4">I don't know / Skip</button>
            </div>
        `;
        testContent.innerHTML = getStageWrapper(html, "Answer out loud or press Skip.");

        document.getElementById('skip-btn').addEventListener('click', () => {
            testState.questionMistakes++;
            showToast("Marked as incorrect.", false);
            currentSubIndex++;
            renderReadingPassageStage(stage);
        });

        updateRecordingUI("ready");
    }
}

// --- LOGIC HELPER: TRANSITIONS ---

function evaluateSentenceLevel() {
    // Logic: 
    // If S1 passed -> Primer (at least)
    // If S2 passed -> Level 1
    // ...
    // Determine the highest passed sentence index (0-4)
    // S0="I can play" -> Pre-Primer words if failed. Primer words if Passed.
    // Wait, Table: "Only Sentence 1 read" -> Primer words. "Sentence 2" -> Level 1 words.
    // So:
    // Pass S0 -> Start Level Primer
    // Pass S1 -> Start Level 1
    // Pass S2 -> Start Level 2
    // Pass S3 -> Start Level 3
    // Pass S4 -> Start Level 4

    // Default
    testState.wordListLevel = 'pre_primer';

    if (testState.sentenceLevel >= 0) testState.wordListLevel = 'primer';
    if (testState.sentenceLevel >= 1) testState.wordListLevel = 'level_1';
    if (testState.sentenceLevel >= 2) testState.wordListLevel = 'level_2';
    if (testState.sentenceLevel >= 3) testState.wordListLevel = 'level_3';
    if (testState.sentenceLevel >= 4) testState.wordListLevel = 'level_4';

    console.log("Sentence Eval:", testState.sentenceLevel, "-> Word Level:", testState.wordListLevel);
}

// Alias for compatibility with renderSentenceStage safety check
function evaluateSentencePlacement() {
    evaluateSentenceLevel();
}

function evaluateWordListPass() {
    const level = testState.wordListLevel;
    const score = testState.wordListScore;
    const config = WORD_LIST_CONFIG[level];

    console.log(`Word List Result: Level ${level}, Score ${score}/${config.count}`);

    if (score >= config.pass) {
        // Pass -> Same Level Passage
        testState.passageLevel = level;
    } else {
        // Fail -> Drop Down ONE level
        const idx = LEVEL_ORDER.indexOf(level);
        if (idx > 0) {
            testState.passageLevel = LEVEL_ORDER[idx - 1];
        } else {
            testState.passageLevel = 'pre_primer';
        }
    }
    console.log("Passage Level set to:", testState.passageLevel);
}


// --- SPEECH HANDLING ---

let listenTimer = null;
let listenDuration = 25000; // 25 seconds - enough time for sentences

async function setupMediaRecorder() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 
                         MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 
                         'audio/ogg'; // fallback
                         
        mediaRecorder = new MediaRecorder(stream, { mimeType });

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstart = () => {
            isListening = true;
            audioChunks = [];
            updateRecordingUI("recording");
        };

        mediaRecorder.onstop = async () => {
            isListening = false;
            updateRecordingUI("processing");
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            await sendToDeepgram(audioBlob);
        };
    } catch (err) {
        console.error("Microphone access denied or unavailable", err);
        alert("Please allow microphone access to use the assessment.");
    }
}

function startRecording() {
    if (isListening || !mediaRecorder) return;
    try { mediaRecorder.start(); } catch (e) { }
}

function stopRecording() {
    if (!isListening || !mediaRecorder) return;
    try { mediaRecorder.stop(); } catch (e) { }
}

window.toggleRecording = function() {
    if (isListening) {
        stopRecording();
    } else {
        startRecording();
    }
};

function startListeningWindow(duration) {
    const finalDuration = duration || 5000;
    stopRecording();
    setTimeout(() => {
        startRecording();
        updateTimerBar(finalDuration);
        clearListeningTimer();
        listenTimer = setTimeout(() => {
            stopRecording(); // Automatically stops recording and sends to Deepgram
        }, finalDuration);
    }, 100);
}

function clearListeningTimer() {
    if (listenTimer) clearTimeout(listenTimer);
    listenTimer = null;
}

function handleTimeout() {
    console.log("Listening Timeout - Moving to next");
    stopRecording();
    showFeedback(false);

    const stage = pTest.stages[currentStageIndex];

    // 1. Letters: Log no_response and move to next step/letter
    if (stage.type === 'letter_recognition') {
        const target = stage.items[currentSubIndex];
        const isNameOnly = stage.id === 'letters_common'; // AUDIT FIX: Name-only for common letters

        // LOG EVIDENCE: No Response
        testState.letterLogs.push({
            letter: target,
            step: letterStep,
            spoken: '(no response)',
            status: 'no_response'
        });

        if (letterStep === 'name' && !isNameOnly) {
            // Only ask for sound if NOT name-only stage (i.e., capital letters)
            letterStep = 'sound';
            setTimeout(() => renderLetterStage(stage), 1000);
        } else {
            // Name-only or completed both: move to next letter
            letterStep = 'name'; // Always reset to name for next letter
            currentSubIndex++;
            if (currentSubIndex >= stage.items.length) {
                showSectionCompleteModal(stage);
            } else {
                setTimeout(() => renderLetterStage(stage), 1000);
            }
        }
    }
    // 2. Sentences: Log failure and CONTINUE to next sentence (unless all attempted)
    else if (stage.type === 'sentence_reading') {
        // FIXED: Guard against double advancement
        if (testState.sentenceAdvancing) {
            console.log("Already advancing, skipping duplicate timeout");
            return;
        }
        testState.sentenceAdvancing = true;

        console.log("Sentence Failed/Timeout.");

        const words = testState.passageWords;
        const totalWords = words.length;
        const correctWords = words.filter(w => w.status === 'correct').length;

        // FIXED: Mark all remaining pending words as incorrect for red highlighting
        words.forEach(w => {
            if (w.status === 'pending') w.status = 'incorrect';
        });
        updateReadingDisplay('sentence-text');

        // LOG EVIDENCE: Sentence Failed
        testState.sentenceLogs.push({
            sentence_id: currentSubIndex,
            total_words: totalWords,
            correct_words: correctWords,
            completed: false,
            errors_count: totalWords - correctWords
        });

        // FIXED: Continue to next sentence instead of ending stage
        // This allows student to attempt all 5 sentences for proper placement
        setTimeout(() => {
            // FIXED: Reset index before advancing
            testState.lastMarkedWordIndex = -1;

            currentSubIndex++;
            if (currentSubIndex >= stage.items.length) {
                // All sentences attempted - now end stage
                testState.sentenceAdvancing = false;
                showSectionCompleteModal(stage);
            } else {
                // Continue to next sentence
                testState.sentenceAdvancing = false;
                renderCurrentStage();
            }
        }, 1500);
    }
    // 3. Word List: Log no_response and move next
    else if (stage.type === 'word_list') {
        const target = testState.currentWordList[currentSubIndex];

        // FIXED: Grace Period - Wait for final speech result (from flush) before logging fail
        // This prevents "carry over" where speech arrives after we already moved to next word
        setTimeout(() => {
            // Check if processed by handleInput during grace period
            const currentTarget = testState.currentWordList[currentSubIndex];

            // If index moved, or we have a log for this target, it was handled!
            const alreadyLogged = testState.wordLogs.some(l => l.target === target && (l.status === 'correct' || l.status === 'incorrect'));

            if (currentTarget !== target || alreadyLogged) {
                console.log("Grace period: Word handled successfully during flush");
                return;
            }

            // Still not handled? Log NO RESPONSE
            testState.wordLogs.push({
                target: target,
                spoken: '(no response)',
                status: 'no_response'
            });

            currentSubIndex++;
            if (currentSubIndex >= testState.currentWordList.length) {
                evaluateWordListPass();
                clearInterval(wordInterval);
                showSectionCompleteModal(stage);
            } else {
                renderWordListStage(stage);
            }
        }, 500); // 500ms grace period
    }
    // 4. Comprehension Questions: Log no_response
    else if (stage.type === 'oral_reading' && passageMode === 'questions') {
        const q = testState.currentPassageData.questions[currentSubIndex];

        // LOG EVIDENCE: No Response
        testState.comprehensionLogs.push({
            question: q.question,
            expected: q.answer,
            spoken: '(no response)',
            status: 'no_response'
        });

        setTimeout(() => {
            currentSubIndex++;
            if (currentSubIndex >= testState.currentPassageData.questions.length) {
                finishTest();
            } else {
                renderReadingPassageStage(stage);
            }
        }, 1000);
    }
}

async function sendToDeepgram(blob) {
    try {
        const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                'Content-Type': blob.type
            },
            body: blob
        });
        
        if (!response.ok) {
            console.error("Deepgram Error:", await response.text());
            updateRecordingUI("ready");
            showToast("Failed to process audio. Please try again.", false);
            return;
        }

        const data = await response.json();
        const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        
        // AGGRESSIVE CLEANING: Strip punctuation immediately
        let cleanTranscript = transcript.replace(/[.,?!]/g, '').trim();

        const feedbackEl = document.getElementById('live-feedback');
        if (feedbackEl) {
            const stage = pTest.stages[currentStageIndex];
            let displayText = cleanTranscript;
            if (stage && stage.type === 'letter_recognition' && cleanTranscript) {
                const target = stage.items[currentSubIndex];
                if (target) displayText = normalizeSpeechToTarget(cleanTranscript.toLowerCase(), target);
            }
            feedbackEl.textContent = cleanTranscript ? `Heard: "${displayText}"` : `Heard: (nothing)`;
            feedbackEl.style.opacity = '1';
            setTimeout(() => { if (feedbackEl) feedbackEl.style.opacity = '0'; }, 3000);
        }

        updateRecordingUI("ready");
        handleInput(cleanTranscript.toLowerCase(), false);

    } catch (err) {
        console.error("Fetch to Deepgram failed", err);
        updateRecordingUI("ready");
        showToast("Network Error: Could not connect to AI services.", false);
    }
}

function handleInput(text, isInterim = false) {
    // 0. Greeting Mode Routing
    if (interactionMode === 'GREETING') {
        if (isInterim) return; // Ignore interim for simple inputs

        if (greetingState.step === 0) {
            const input = document.getElementById('user-name-input');
            if (input) {
                input.value = text;
                // Auto-submit after small delay? Or let user confirm?
                // For "speech flow" demo, let's auto-submit after 1.5s
                setTimeout(submitName, 1500);
            }
        } else if (greetingState.step === 1) {
            const input = document.getElementById('user-place-input');
            if (input) {
                input.value = text;
                setTimeout(submitPlace, 1500);
            }
        }
        return;
    }

    // Suppress console log spam for interim unless debugging
    if (!isInterim) console.log("Heard (Final):", text);

    const stage = pTest.stages[currentStageIndex];

    // 1. Letters - With Evidence Logging
    // ISSUE 2 FIX: Only accept FINAL results for letters stage
    if (stage.type === 'letter_recognition') {
        // GUARD: Prevent double-fire from interim+final both advancing state
        if (testState.letterAnswered) return;

        const target = stage.items[currentSubIndex];
        const isNameOnly = stage.id === 'letters_common';

        // Accept strong interim matches immediately (avoids timeout on slow finalisation)
        if (isInterim) {
            if (!checkMatch(text, target)) return;
            console.log("Accepting strong interim match:", text);
        }

        // For letters, we expect strict single-word match
        if (checkMatch(text, target)) {
            // ISSUE 3 FIX: Normalize spoken to target letter
            const normalizedSpoken = normalizeSpeechToTarget(text, target);

            // LOG EVIDENCE: Correct
            testState.letterLogs.push({
                letter: target,
                step: letterStep,
                spoken: normalizedSpoken, // Use normalized value
                status: 'correct'
            });

            showFeedback(true);
            clearListeningTimer();
            stopRecording();
            testState.letterAnswered = true; // Lock against double-fire

            setTimeout(() => {
                if (letterStep === 'name' && !isNameOnly) {
                    // Only ask for sound if NOT name-only stage (i.e., capital letters)
                    letterStep = 'sound';
                    renderLetterStage(stage);
                } else {
                    // Name-only or completed both: move to next letter
                    letterStep = 'name'; // Always reset to name for next letter
                    currentSubIndex++;
                    if (currentSubIndex >= stage.items.length) {
                        showSectionCompleteModal(stage);
                    } else {
                        renderLetterStage(stage);
                    }
                }
            }, 1000);
        } else {
            // FIXED: Wrong answer - mark incorrect and move on
            // Check if it's a real attempt (not just noise)
            const cleanedText = text.trim();
            if (cleanedText.length > 0) {
                // LOG EVIDENCE: Incorrect
                testState.letterLogs.push({
                    letter: target,
                    step: letterStep,
                    spoken: text,
                    status: 'incorrect'
                });

                showFeedback(false);
                clearListeningTimer();
                stopRecording();
                testState.letterAnswered = true; // Lock against double-fire

                setTimeout(() => {
                    if (letterStep === 'name' && !isNameOnly) {
                        // Move to sound step even if name was wrong
                        letterStep = 'sound';
                        renderLetterStage(stage);
                    } else {
                        // Move to next letter
                        letterStep = 'name';
                        currentSubIndex++;
                        if (currentSubIndex >= stage.items.length) {
                            showSectionCompleteModal(stage);
                        } else {
                            renderLetterStage(stage);
                        }
                    }
                }, 1000);
            }
        }
    }
    // 2. Sentences (Strict Branching) - With Evidence Logging
    else if (stage.type === 'sentence_reading') {
        const words = testState.passageWords;

        // STRICT SEQUENTIAL MATCHING (User Request)
        // Replaced dual-scan with sequential strict checking.
        // Handles stutters (repeating the previous word) but penalizes skipping or swapping.
        
        // Reset pointers for the full evaluation of this API response
        let currentScanIdx = 0; 
        testState.lastMarkedWordIndex = -1;
        let hasChange = false;
        let extraWordsSpoken = false;

        text.split(/\s+/).forEach(spoken => {
            if (!spoken || spoken.trim().length === 0) return;

            if (currentScanIdx >= words.length) {
                // The user spoke additional words after the target sentence finished (e.g. "happy")
                extraWordsSpoken = true;
                return;
            }

            const targetWord = words[currentScanIdx];

            // 1. Check strict match
            if (checkMatch(spoken, targetWord.clean)) {
                targetWord.status = 'correct';
                testState.lastMarkedWordIndex = currentScanIdx;
                currentScanIdx++;
                hasChange = true;
            } 
            // 2. Check if it's a stutter of the immediately previous word
            else if (currentScanIdx > 0 && checkMatch(spoken, words[currentScanIdx - 1].clean)) {
                // Harmless stutter/repetition, ignore and do not penalize
            } 
            // 3. Spoken word is completely out of order or wrong
            else {
                targetWord.status = 'incorrect'; // Mark the expected word as failed
                testState.lastMarkedWordIndex = currentScanIdx;
                currentScanIdx++; // Force the cursor forward to expect the next word
                hasChange = true;
            }
        });

        if (hasChange) {
            updateReadingDisplay('sentence-text');
        }

        // NOTE: Removed immediate error progression
        // Timeout handler will catch failures and move to next sentence

        // Check Completion - FIXED: Complete when no pending words (not when all correct)
        const totalWords = words.length;
        const correctWords = words.filter(w => w.status === 'correct').length;
        const incorrectWords = words.filter(w => w.status === 'incorrect').length;
        const pendingWords = words.filter(w => w.status === 'pending').length;

        // Sentence is complete when NO words are pending (regardless of correct/incorrect)
        if (pendingWords === 0) {
            // FIXED: Guard against double advancement
            if (testState.sentenceAdvancing) {
                console.log("Already advancing, skipping duplicate completion");
                return;
            }
            testState.sentenceAdvancing = true;

            // If they had 0 incorrect words but appended extra noise at the end, they fail the strict check!
            const allCorrect = (incorrectWords === 0) && !extraWordsSpoken;

            // LOG EVIDENCE
            testState.sentenceLogs.push({
                sentence_id: currentSubIndex,
                total_words: totalWords,
                correct_words: correctWords,
                completed: allCorrect,
                errors_count: incorrectWords + (extraWordsSpoken ? 1 : 0)
            });

            showFeedback(allCorrect);
            stopRecording();
            clearListeningTimer(); // FIXED: Cancel timer to prevent double firing

            // Update word list level based on strict placement rules
            if (allCorrect) {
                const levelMap = ['primer', 'level_1', 'level_2', 'level_3', 'level_4'];
                if (currentSubIndex < levelMap.length) {
                    testState.wordListLevel = levelMap[currentSubIndex];
                } else {
                    testState.wordListLevel = 'level_4';
                }
            }

            setTimeout(() => {
                // FIXED: Reset index before advancing to prevent carryover
                testState.lastMarkedWordIndex = -1;

                currentSubIndex++;
                if (currentSubIndex >= stage.items.length) {
                    testState.sentenceAdvancing = false;
                    showSectionCompleteModal(stage);
                } else {
                    testState.sentenceAdvancing = false;
                    renderCurrentStage();
                }
            }, 1000);
        }
    }
    // 3. Word List - With Evidence Logging
    else if (stage.type === 'word_list') {
        // FIXED: Ignore interim results to prevent double-processing (Interim matches -> moves -> Final matches next word wrongly)
        if (isInterim) return;

        const target = testState.currentWordList[currentSubIndex];
        if (checkMatch(text, target)) {
            // FIXED: If repetition (e.g. "see see"), log as single "see" to avoid confusion
            let finalLog = text;
            const t = cleanWord(target);
            const s = cleanWord(text);
            const words = s.split(/\s+/);
            if (words.length > 1 && words.every(w => w === t)) {
                finalLog = target;
            }

            // LOG EVIDENCE: Correct
            testState.wordLogs.push({
                target: target,
                spoken: finalLog,
                status: 'correct'
            });

            testState.wordListScore++;
            showFeedback(true);
            clearListeningTimer();
            stopRecording();

            currentSubIndex++;
            if (currentSubIndex >= testState.currentWordList.length) {
                evaluateWordListPass();
                clearInterval(wordInterval);
                showSectionCompleteModal(stage);
            } else {
                setTimeout(() => renderWordListStage(stage), 1000);
            }
        } else if (!isInterim) {
            const isNoResp = text.trim().length === 0;
            testState.wordLogs.push({
                target: target,
                spoken: isNoResp ? '(no response)' : text,
                status: isNoResp ? 'no_response' : 'incorrect'
            });

            showFeedback(false); // Red border
            clearListeningTimer();
            stopRecording();

            currentSubIndex++;
            if (currentSubIndex >= testState.currentWordList.length) {
                evaluateWordListPass();
                clearInterval(wordInterval);
                showSectionCompleteModal(stage);
            } else {
                setTimeout(() => renderWordListStage(stage), 1000);
            }
        }
    }
    // 4. Passage Reading
    else if (stage.type === 'oral_reading' && passageMode === 'reading') {
        const words = testState.passageWords;
        let changed = false;

        // DUAL-SCAN BEST FIT: Same robust logic as sentence stage.
        // Handles both cumulative speech ("Tom and" → "Tom and his friends")
        // and continuation ("Tom" pause "and his friends")
        const spokens = text.split(/\s+/).filter(s => s.trim().length > 0);

        const scanAndCount = (startIdx) => {
            let matches = 0;
            let ptr = startIdx;
            spokens.forEach(s => {
                for (let o = 0; o <= 2; o++) {
                    const tid = ptr + o;
                    if (tid < words.length && checkMatch(s, words[tid].clean)) {
                        matches++;
                        ptr = tid + 1;
                        return;
                    }
                }
            });
            return matches;
        };

        const scoreFromZero = scanAndCount(0);
        const scoreFromCursor = scanAndCount(testState.lastMarkedWordIndex + 1);

        // Prefer cursor (continuation) if tied; use zero only if it wins clearly
        let currentScanIdx = (scoreFromCursor >= scoreFromZero)
            ? (testState.lastMarkedWordIndex + 1)
            : 0;

        spokens.forEach(spoken => {
            // Check window of 3 words from current scan position
            for (let offset = 0; offset <= 2; offset++) {
                const targetIdx = currentScanIdx + offset;
                if (targetIdx >= words.length) break;

                const targetWord = words[targetIdx];

                if (checkMatch(spoken, targetWord.clean)) {
                    // 1. Mark any skipped pending words as incorrect
                    for (let skipped = currentScanIdx; skipped < targetIdx; skipped++) {
                        if (words[skipped].status === 'pending') {
                            words[skipped].status = 'incorrect';
                            changed = true;
                        }
                    }
                    // 2. Mark matched word correct (if not already)
                    if (targetWord.status !== 'correct') {
                        targetWord.status = 'correct';
                        changed = true;
                    }
                    // 3. Update global progress cursor
                    if (targetIdx > testState.lastMarkedWordIndex) {
                        testState.lastMarkedWordIndex = targetIdx;
                    }
                    // 4. Advance scan pointer
                    currentScanIdx = targetIdx + 1;
                    return; // Next spoken word
                }
            }
            // No match → noise/insertion, ignore
        });

        if (changed) updateReadingDisplay('passage-text');
    }
    // 5. Comprehension Questions - With Evidence Logging
    else if (stage.type === 'oral_reading' && passageMode === 'questions') {
        const q = testState.currentPassageData.questions[currentSubIndex];
        const answers = q.answer.split(',').map(a => a.trim());

        // FIXED: Ignore interim results to avoid partial match false positives/negatives
        if (isInterim && text.length < 5) return;

        if (answers.some(a => checkMatch(text, a))) {
            // LOG EVIDENCE: Correct Answer
            testState.comprehensionLogs.push({
                question: q.question,
                expected: q.answer,
                spoken: text,
                status: 'correct'
            });

            showFeedback(true);
            stopRecording();
            clearListeningTimer();
            setTimeout(() => {
                currentSubIndex++;
                if (currentSubIndex >= testState.currentPassageData.questions.length) {
                    finishTest();
                } else {
                    renderReadingPassageStage(stage);
                }
            }, 1000);
        } else if (!isInterim) {
            // FIXED: Incorrect Answer -> Mark Wrong & Proceed (Student Request)

            // LOG EVIDENCE: Incorrect
            testState.comprehensionLogs.push({
                question: q.question,
                expected: q.answer,
                spoken: text,
                status: 'incorrect'
            });

            showFeedback(false); // Red border
            stopRecording();
            clearListeningTimer();

            setTimeout(() => {
                currentSubIndex++;
                if (currentSubIndex >= testState.currentPassageData.questions.length) {
                    finishTest();
                } else {
                    renderReadingPassageStage(stage);
                }
            }, 1000);
        }
    }
}

// Helper
function formatLevel(l) { return l.replace(/_/g, ' ').toUpperCase(); }
function showToast(msg, good) { showFeedback(good); } // Reuse

// --- USER DATA ---
async function loadUserData(user) {
    try {
        const userDoc = await getDoc(doc(db, 'students', user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            // Update Sidebar / UI
            const nameEl = document.getElementById('sidebar-username') || document.getElementById('user-name');
            if (nameEl) nameEl.textContent = data.name || user.displayName || 'Student';

            // Avatar
            const avatarEl = document.getElementById('sidebar-avatar');
            const photoURL = data.photoURL || user.photoURL;
            if (avatarEl && photoURL) avatarEl.src = photoURL;
        }
    } catch (e) {
        console.warn("User data load error:", e);
    }
}

// --- GREETING & CHAT LOGIC ---
let interactionMode = 'GREETING'; // 'GREETING' or 'TEST'
let greetingState = { step: 0, userName: '', userPlace: '' };

function startGreetingSequence() {
    interactionMode = 'GREETING';
    document.getElementById('greeting-container').style.display = 'block';
    document.getElementById('test-content-wrapper').style.display = 'none';
    runGreetingStep(0);
}

function runGreetingStep(step) {
    greetingState.step = step;
    const interaction = document.getElementById('user-interaction');

    if (step === 0) {
        // Intro — render input IMMEDIATELY, speak in background
        const text = "Hi, I am Alex. What is your name?";
        interaction.innerHTML = `
            <div class="input-group" style="max-width:400px; margin: 0 auto;">
                <input type="text" id="user-name-input" class="form-control form-control-lg" placeholder="Type or say name..." onkeypress="if(event.key==='Enter') submitName()">
                <button class="btn btn-outline-primary" id="record-toggle-btn" type="button" onclick="window.toggleRecording()">
                    <i class="fas fa-microphone"></i>
                </button>
                <button class="btn btn-primary px-4" onclick="submitName()"><i class="fas fa-paper-plane"></i></button>
            </div>
            <div id="mic-status" class="transition-all text-danger fw-bold mt-2 w-100" style="opacity:0; display:none;">
                <i class="fas fa-microphone-alt me-2 text-danger"></i> Recording...
            </div>
        `;
        speakAndShow(text, () => {}); // Fire-and-forget speech
    } else if (step === 1) {
        // Place — render input IMMEDIATELY
        const text = `Hi ${greetingState.userName}. I am from Spanish Town. Where are you from?`;
        interaction.innerHTML = `
            <div class="input-group" style="max-width:400px; margin: 0 auto;">
                <input type="text" id="user-place-input" class="form-control form-control-lg" placeholder="Type or say place..." onkeypress="if(event.key==='Enter') submitPlace()">
                <button class="btn btn-outline-primary" id="record-toggle-btn" type="button" onclick="window.toggleRecording()">
                    <i class="fas fa-microphone"></i>
                </button>
                <button class="btn btn-primary px-4" onclick="submitPlace()"><i class="fas fa-paper-plane"></i></button>
            </div>
            <div id="mic-status" class="transition-all text-danger fw-bold mt-2 w-100" style="opacity:0; display:none;">
                <i class="fas fa-microphone-alt me-2 text-danger"></i> Recording...
            </div>
        `;
        speakAndShow(text, () => {}); // Fire-and-forget speech
    } else if (step === 2) {
        // Explanation — render button IMMEDIATELY
        const text = `Okay! ${greetingState.userName}... You will be doing a Reading Assessment. That includes; identifying letter names and sounds, identifying sight words, reading one or more stories and then answering some questions. This is not a pass or fail kind of test, so relax and do your best.`;
        interaction.innerHTML = `
            <button class="btn btn-success btn-lg px-5 py-3 rounded-pill fw-bold shadow-sm" onclick="startTestFromGreeting()">
                Start Test <i class="fas fa-arrow-right ms-2"></i>
            </button>
        `;
        stopRecording();
        speakAndShow(text, () => {}); // Fire-and-forget speech
    }
}

function speakAndShow(text, onEnd) {
    const bubble = document.getElementById('alex-text');
    if (bubble) bubble.textContent = text;

    // Stop any existing speech
    window.speechSynthesis.cancel();

    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 1;

        // FIXED: Enhanced Voice Selection Strategy (User requested Google UK Female)
        const voices = window.speechSynthesis.getVoices();
        let preferredVoice = voices.find(v =>
            (v.name.includes("Google") && v.name.includes("UK") && v.name.includes("Female")) || 
            (v.name.includes("Google") && v.name.includes("UK")) || 
            (v.name.includes("Natural") && v.lang === 'en-GB') || 
            (v.name.includes("Female") && v.lang === 'en-GB') || 
            (v.name.includes("Natural") && v.lang === 'en-US')
        );

        if (!preferredVoice && voices.length > 0) {
            // Absolutely ensure we have a fallback if on iOS/Safari
            preferredVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
        }

        if (preferredVoice) {
            u.voice = preferredVoice;
        } else if (voices.length === 0 && !window.__speechRetried) {
            console.log("Voices not loaded yet, retrying once...");
            window.__speechRetried = true;
            setTimeout(() => speakAndShow(text, onEnd), 500);
            return;
        }

        let isDone = false;
        const complete = () => {
            if (isDone) return;
            isDone = true;
            onEnd();
        };

        u.onend = complete;
        u.onerror = complete;
        
        try {
            window.speechSynthesis.speak(u);
        } catch (err) {
            console.warn("Speech Synthesis blocked by browser:", err);
        }

        // Mobile fallback: Safari/Chrome aggressively block autoplay speech on page load.
        // If the speech API doesn't end (or start) within estimated time, unblock the UI.
        const fallbackTime = Math.max(3500, (text.length * 100)); // ~100ms per character
        setTimeout(complete, fallbackTime);
    } else {
        setTimeout(onEnd, 2000);
    }
}

// Global functions for HTML onclick
window.submitName = function () {
    const val = document.getElementById('user-name-input').value;
    if (val.trim()) {
        greetingState.userName = val.trim();
        runGreetingStep(1);
    }
};

window.submitPlace = function () {
    const val = document.getElementById('user-place-input').value;
    if (val.trim()) {
        greetingState.userPlace = val.trim();
        runGreetingStep(2);
    }
};

window.startTestFromGreeting = function () {
    document.getElementById('greeting-container').style.display = 'none';
    document.getElementById('test-content-wrapper').style.display = 'block';
    interactionMode = 'TEST';
    renderCurrentStage();
};


document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { user } = await requireAuth(['student']);
        currentUser = user;

        await loadUserData(user); // Fetch profile

        // Load Test
        const urlParams = new URLSearchParams(window.location.search);
        await loadPreTest(urlParams.get('testId'));

        // RANDOMIZE ITEMS
        // RANDOMIZE ITEMS (Except Sentences)
        if (pTest && pTest.stages) {
            pTest.stages.forEach(stage => {
                if (stage.id !== 'sentence_filter' && stage.items && Array.isArray(stage.items)) {
                    stage.items = shuffleArray(stage.items);
                }
            });
        }

        // Init Speech
        setupMediaRecorder();

        // Modal is now in HTML, no need to inject.

        // Start GREETING instead of Test
        startGreetingSequence();

    } catch (error) {
        console.error("Init Error:", error);
        testContent.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
});

// Utils
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

window.nextStageFromModal = function () {
    document.getElementById('section-transition-modal').style.display = 'none';
    currentStageIndex++;
    currentSubIndex = 0;
    renderCurrentStage();
};


// --- UTILS ---
function getStageWrapper(content, help) {
    // Determine header text and type based on content inspection or current stage index
    // Ideally pass type as arg, but we can infer for now
    let headerText = "READ THIS:";
    let type = "letter";
    const stage = pTest.stages[currentStageIndex];
    if (stage) {
        if (stage.type === 'letter_recognition') { headerText = "READ THIS LETTER:"; type = "letter"; }
        else if (stage.type === 'word_list') { headerText = "READ THIS WORD:"; type = "word"; }
        else if (stage.type === 'sentence_reading') { headerText = "READ THIS SENTENCE:"; type = "sentence"; }
        else if (stage.type === 'oral_reading') { headerText = "READ THIS PASSAGE:"; type = "passage"; }
    }

    return `
    <div class="question-container fade-in">
        <div class="question-header">
            <h2 class="question-title">${headerText}</h2>
            <div class="question-points">1 point</div>
        </div>
        
        <!-- Content Area -->
        <div class="prompt-text" data-type="${type}">
            ${content}
        </div>

        <!-- Footer / Feedback -->
        <div class="mt-4 text-center">
            <p class="text-secondary fw-medium mb-3">${help}</p>
            
            <div class="mb-4">
               <button id="record-toggle-btn" class="btn btn-outline-primary btn-lg rounded-pill shadow-sm px-4 py-2" onclick="window.toggleRecording()">
                   <i class="fas fa-microphone me-2"></i> Start Recording
               </button>
               <div id="recording-spinner" class="spinner-border text-primary ms-3" role="status" style="width: 1.5rem; height: 1.5rem; display: none; vertical-align: middle;"></div>
            </div>

            <div id="mic-status" class="transition-all text-danger fw-bold mb-2" style="opacity:0">
                <i class="fas fa-microphone-alt me-2"></i> Recording...
            </div>
            
            <div id="live-feedback" class="text-muted fst-italic transition-all" style="height:24px; opacity:0"></div>
            
            <!-- Timer Bar Container -->
            <div class="card-footer bg-transparent border-0 p-0 mt-3"></div>
        </div>
    </div>
    
    <style>.fade-in{animation:fadeIn 0.5s ease-out}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}</style>
    `;
}
function updateUI(on) {
    const el = document.getElementById('mic-status');
    if (el) el.style.opacity = on ? '1' : '0';
}

function updateRecordingUI(state) {
    const el = document.getElementById('mic-status');
    const btn = document.getElementById('record-toggle-btn');
    const spinner = document.getElementById('recording-spinner');
    
    // Check if we are in greeting mode
    const isGreeting = (typeof interactionMode !== 'undefined' && interactionMode === 'GREETING');
    
    if (state === "ready") {
        if(btn) { 
            btn.innerHTML = isGreeting ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone me-2"></i> Start Recording'; 
            btn.classList.remove('btn-danger', 'btn-secondary'); 
            btn.classList.add('btn-outline-primary'); 
            btn.disabled = false;
        }
        if(spinner) spinner.style.display = 'none';
        if (el) { el.style.opacity = '0'; el.style.display = 'none'; }
    } else if (state === "recording") {
        if(btn) { 
            btn.innerHTML = isGreeting ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-stop me-2"></i> Stop Recording'; 
            btn.classList.remove('btn-outline-primary', 'btn-secondary'); 
            btn.classList.add('btn-danger'); 
            btn.disabled = false;
        }
        if(spinner) spinner.style.display = 'none';
        if (el) { el.style.opacity = '1'; el.style.display = 'block'; el.innerHTML = '<i class="fas fa-microphone-alt me-2 text-danger"></i> Recording...'; }
    } else if (state === "processing") {
        if(btn) { 
            btn.innerHTML = isGreeting ? '<i class="fas fa-cog fa-spin"></i>' : 'Processing...'; 
            btn.classList.remove('btn-danger', 'btn-outline-primary'); 
            btn.classList.add('btn-secondary'); 
            btn.disabled = true; 
        }
        if(spinner && !isGreeting) spinner.style.display = 'inline-block';
        if (el) { el.style.opacity = '1'; el.style.display = 'block'; el.innerHTML = '<i class="fas fa-cog fa-spin me-2 text-primary"></i> Processing audio...'; }
    }
}
function updateTimerBar(duration) {
    const footer = document.querySelector('.card-footer');
    if (footer && !document.getElementById('generic-timer')) {
        const bar = document.createElement('div');
        bar.id = 'generic-timer';
        bar.className = 'progress mt-2';
        bar.style.height = '4px';
        bar.innerHTML = '<div class="progress-bar bg-info" style="width: 100%; transition: width linear 4s"></div>';
        footer.appendChild(bar);

        setTimeout(() => {
            const pb = bar.querySelector('.progress-bar');
            if (pb) {
                pb.style.transitionDuration = `${duration}ms`;
                pb.style.width = '0%';
            }
        }, 50);
    } else if (document.getElementById('generic-timer')) {
        const bar = document.getElementById('generic-timer').querySelector('.progress-bar');
        if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '100%';
            setTimeout(() => {
                bar.style.transition = `width linear ${duration}ms`;
                bar.style.width = '0%';
            }, 50);
        }
    }
}
// UPDATED CLEAN WORD: Strict alphanumeric only but PRESERVE SPACES
function cleanWord(w) {
    return w ? w.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() : '';
}
function generatePassageHTML(list) {
    return list.map(w => {
        let style = '';
        if (w.status === 'correct') {
            // Green background for correctly read words
            style = 'color:#198754;background:#d1e7dd';
        } else if (w.status === 'incorrect') {
            // Red background for incorrectly read words
            style = 'color:#dc3545;background:#f8d7da';
        } else if (w.status === 'pending') {
            // Light gray for not yet attempted (no highlight)
            style = '';
        }
        return `<span style="${style}" class="rounded px-1 transition-all">${w.original}</span>`;
    }).join(' ');
}
function updateReadingDisplay(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = generatePassageHTML(testState.passageWords);
}
function showFeedback(good) {
    // 1. Toast
    const div = document.createElement('div');
    div.className = `position-fixed top-50 start-50 translate-middle p-4 rounded-4 shadow-lg text-white ${good ? 'bg-success' : 'bg-danger'}`;
    div.style.zIndex = 10000;
    div.style.minWidth = '200px';
    div.style.textAlign = 'center';
    div.innerHTML = good ?
        '<i class="fas fa-check-circle fa-3x mb-2"></i><br><h3 class="m-0">Correct!</h3>' :
        '<i class="fas fa-times-circle fa-3x mb-2"></i><br><h3 class="m-0">Incorrect</h3>';

    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1500); // 1.5s duration

    // 2. Card Visual (Flash border)
    // Updated to target .question-container if .card isn't the main wrapper
    const card = document.querySelector('.question-container') || document.querySelector('.card');
    if (card) {
        const originalBorder = card.style.borderColor;
        const originalShadow = card.style.boxShadow;

        card.style.transition = 'all 0.3s ease';
        card.style.borderColor = good ? '#198754' : '#dc3545';
        card.style.borderWidth = '4px';
        card.style.borderStyle = 'solid';

        // Add glow effect
        card.style.boxShadow = good ?
            '0 0 20px rgba(25, 135, 84, 0.4)' :
            '0 0 20px rgba(220, 53, 69, 0.4)';

        setTimeout(() => {
            card.style.borderColor = originalBorder || '';
            card.style.borderWidth = '';
            card.style.borderStyle = '';
            card.style.boxShadow = originalShadow || '';
        }, 1000);
    }
}

// --- SECTION TRANSITION LOGIC ---
function showSectionCompleteModal(currentStage) {
    const modal = document.getElementById('section-transition-modal');
    const scoreEl = document.getElementById('section-score-display');
    const msgEl = document.getElementById('section-transition-msg');

    // Calculate Score based on TEST STATE LOGS (Evidence) of current stage
    let scoreHtml = '';

    // ISSUE 1 FIX: Show separate Name/Sound scores for letters
    if (currentStage.type === 'letter_recognition') {
        // Only count logs for letters in THIS stage (avoids cross-stage contamination)
        const stageLetters = new Set(currentStage.items || []);
        const stageLogs = testState.letterLogs.filter(l => stageLetters.has(l.letter));

        const nameLogs = stageLogs.filter(l => l.step === 'name');
        const soundLogs = stageLogs.filter(l => l.step === 'sound');

        // Deduplicate: For each letter, take the LAST log entry (most recent attempt)
        const deduplicateLogs = (logs) => {
            const map = {};
            logs.forEach(l => { map[l.letter] = l; }); // latest overwrites earlier
            return Object.values(map);
        };

        const uniqueNameLogs = deduplicateLogs(nameLogs);
        const uniqueSoundLogs = deduplicateLogs(soundLogs);

        const nameCorrect = uniqueNameLogs.filter(l => l.status === 'correct').length;
        const soundCorrect = uniqueSoundLogs.filter(l => l.status === 'correct').length;
        const totalLetters = currentStage.items ? currentStage.items.length : 26;

        // AUDIT FIX: Handle name-only stages (common letters per document)
        const isNameOnly = currentStage.id === 'letters_common';

        // ENHANCED: Build detailed table for letters
        if (isNameOnly) {
            scoreHtml = `
                <div style="max-height: 400px; overflow-y: auto; margin-top: 15px;">
                    <table class="table table-bordered table-sm">
                        <thead class="table-light">
                            <tr>
                                <th>Capital Letters</th>
                                <th>Letter Names</th>
                                <th>No Response</th>
                                <th>Letter Substituted</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${currentStage.items.map(letter => {
                const log = nameLogs.find(l => l.letter === letter);
                const correct = log && log.status === 'correct';
                const noResp = !log || log.status === 'no_response';
                const subst = log && !correct && !noResp;
                return `
                                    <tr>
                                        <td><strong>${letter.toUpperCase()}</strong></td>
                                        <td class="text-center">${correct ? '✓' : ''}</td>
                                        <td class="text-center">${noResp ? '✗' : ''}</td>
                                        <td class="text-center">${subst ? log.spoken : ''}</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                        <tfoot class="table-light">
                            <tr><td colspan="4"><strong>Reader's Score: ${nameCorrect}/${totalLetters}</strong></td></tr>
                        </tfoot>
                    </table>
                </div>
            `;
        } else {
            scoreHtml = `
                <div style="max-height: 400px; overflow-y: auto; margin-top: 15px;">
                    <table class="table table-bordered table-sm">
                        <thead class="table-light">
                            <tr>
                                <th rowspan="2" class="align-middle">Capital<br>Letters</th>
                                <th colspan="2" class="text-center">Letter Names</th>
                                <th colspan="2" class="text-center">Letter Sounds</th>
                            </tr>
                            <tr>
                                <th>No<br>Response</th>
                                <th>Letter<br>Substituted</th>
                                <th>No<br>Response</th>
                                <th>Sound<br>Substituted</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${currentStage.items.map(letter => {
                const nameLog = nameLogs.find(l => l.letter === letter);
                const soundLog = soundLogs.find(l => l.letter === letter);

                const nameCorrectMark = nameLog && nameLog.status === 'correct';
                const nameNoResp = !nameLog || nameLog.status === 'no_response';
                const nameSubst = nameLog && !nameCorrectMark && !nameNoResp;

                const soundCorrectMark = soundLog && soundLog.status === 'correct';
                const soundNoResp = !soundLog || soundLog.status === 'no_response';
                const soundSubst = soundLog && !soundCorrectMark && !soundNoResp;

                return `
                                    <tr>
                                        <td><strong>${letter.toUpperCase()}</strong></td>
                                        <td class="text-center">${nameNoResp ? '✗' : (nameCorrectMark ? '✓' : '')}</td>
                                        <td class="text-center">${nameSubst ? nameLog.spoken : ''}</td>
                                        <td class="text-center">${soundNoResp ? '✗' : (soundCorrectMark ? '✓' : '')}</td>
                                        <td class="text-center">${soundSubst ? soundLog.spoken : ''}</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                        <tfoot class="table-light">
                            <tr><td colspan="5"><strong>Reader's Score: ${nameCorrect}/${totalLetters} names, ${soundCorrect}/${totalLetters} sounds</strong></td></tr>
                        </tfoot>
                    </table>
                </div>
            `;
        }
    } else if (currentStage.type === 'word_list') {
        const total = testState.wordLogs.length;
        const score = testState.wordLogs.filter(l => l.status === 'correct').length;

        // ENHANCED: Build detailed table for words
        const levelName = testState.wordListLevel.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        scoreHtml = `
            <div style="max-height: 400px; overflow-y: auto; margin-top: 15px;">
                <table class="table table-bordered table-sm">
                    <thead class="table-light">
                        <tr>
                            <th>${levelName} Words</th>
                            <th>Correct<br>Response</th>
                            <th colspan="2" class="text-center">Substitution</th>
                        </tr>
                        <tr>
                            <th></th>
                            <th></th>
                            <th>Word in Text</th>
                            <th>Word Given</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${testState.wordLogs.map(log => {
            const correct = log.status === 'correct';
            const noResp = log.status === 'no_response';
            return `
                                <tr>
                                    <td><strong>${log.target}</strong></td>
                                    <td class="text-center">${correct ? '✓' : ''}</td>
                                    <td class="text-center">${!correct && !noResp ? log.target : ''}</td>
                                    <td class="text-center">${!correct ? log.spoken : ''}</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                    <tfoot class="table-light">
                        <tr><td colspan="4"><strong>Total: ${score}/${total}</strong></td></tr>
                    </tfoot>
                </table>
            </div>
        `;
    } else if (currentStage.type === 'sentence_reading') {
        const completed = testState.sentenceLogs.filter(l => l.completed).length;
        const total = testState.sentenceLogs.length;
        scoreHtml = `Sentences Completed: ${completed} / ${total}`;
    } else if (currentStage.type === 'oral_reading') {
        const words = testState.passageWords || [];
        const total = words.length;
        const correct = words.filter(w => w.status === 'correct').length;
        const incorrect = words.filter(w => w.status === 'incorrect').length;
        const skipped = words.filter(w => w.status === 'pending').length;

        scoreHtml = `
            <div style="margin-top: 15px;">
                <table class="table table-bordered table-sm text-center">
                    <thead class="table-light">
                        <tr>
                            <th>Total Words</th>
                            <th class="text-success">✓ Correct</th>
                            <th class="text-danger">✗ Errors</th>
                            <th>Skipped</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>${total}</strong></td>
                            <td class="text-success"><strong>${correct}</strong></td>
                            <td class="text-danger"><strong>${incorrect}</strong></td>
                            <td><strong>${skipped}</strong></td>
                        </tr>
                    </tbody>
                    <tfoot class="table-light">
                        <tr><td colspan="4"><strong>Reader's Score: ${correct} / ${total}</strong></td></tr>
                    </tfoot>
                </table>
            </div>
        `;
    } else {
        // Fallback
        const total = currentStage.items ? currentStage.items.length : 0;
        scoreHtml = `Score: 0 / ${total}`;
    }

    // Update Score text
    scoreEl.innerHTML = scoreHtml;

    // Determine Next Message
    const nextStage = pTest.stages[currentStageIndex + 1];
    let msg = "Thank you.";

    if (!nextStage) {
        finishTest();
        return; // Done
    }

    if (nextStage.type === 'word_list') {
        msg = "Thank you.<br>Please Prepare to Call some Words.";
    } else if (nextStage.type === 'sentence_reading') {
        msg = "Thank you.<br>Please Prepare to Call some Sentences.";
    } else if (nextStage.type === 'oral_reading') {
        msg = "Thank you.<br>Please Prepare to Read a Passage.";
    } else {
        msg = "Thank you.<br>Proceeding to next section.";
    }

    msgEl.innerHTML = msg;

    // Show Modal
    modal.style.display = 'block';
    modal.classList.add('show');
}

// ISSUE 5 FIX: Proper stage transition from modal to prevent double advancement
function nextStageFromModal() {
    const modal = document.getElementById('section-transition-modal');

    // Close modal
    modal.style.display = 'none';
    modal.classList.remove('show');

    // Advance to next stage
    currentStageIndex++;
    currentSubIndex = 0;

    // Render next stage
    renderCurrentStage();
}

// Make globally accessible for HTML onclick
window.nextStageFromModal = nextStageFromModal;

// Matching
function checkMatch(spoken, target) {
    if (!spoken || !target) return false;
    const s = cleanWord(spoken);
    const t = cleanWord(target);

    // FIXED: Digit-to-Word Conversion (e.g. "100" -> "hundred")
    const DIGIT_MAP = {
        '0': ['zero'], '1': ['one'], '2': ['two'], '3': ['three'], '4': ['four'],
        '5': ['five'], '6': ['six'], '7': ['seven'], '8': ['eight'], '9': ['nine'],
        '10': ['ten'], '11': ['eleven'], '12': ['twelve'], '20': ['twenty'],
        '100': ['hundred', 'one hundred']
    };
    // Map spoke digits to words? Or target words to digits?
    // User says "hundred" -> Logic hears "100" (digit). Target is "hundred".
    // So if spoken is digit, convert to word.
    let s_norm = s;
    if (/^\d+$/.test(s)) {
        if (DIGIT_MAP[s]) s_norm = DIGIT_MAP[s][0]; // standardized
        // Also check if target matches any variation
        if (DIGIT_MAP[s] && DIGIT_MAP[s].includes(t)) return true;
    }

    if (s === t) return true;
    if (s_norm === t) return true;

    // 3.0 Strict Single Letter Logic
    if (t.length === 1) {
        // Exact match
        if (s === t) return true;
        // "Letter X" pattern
        if (s === `letter ${t}` || s === `letter ${t.toUpperCase()}`) return true;
        // Token match (e.g. "it is a", "this is b")
        // Only allow if the letter is a distinct word
        const words = s.split(/\s+/);
        if (words.includes(t)) return true;

        // Repetition: Allow "b b", "bb", "b bb b"
        // Checks if string consists ONLY of target letter and spaces
        if (new RegExp(`^[${t}\\s]+$`).test(s)) return true;

        // Homophones (letter mappings)
        const map = getLetterMappings();
        if (map[t] && map[t].some(opt => s === opt || words.includes(opt))) return true;

        return false; // FAIL strict check if no match found
    }

    if (s.includes(t)) return true; // Standard loose match for words/sentences

    // FIXED: Repetition check for Whole Words (e.g. "see see" -> "see")
    // If user repeats the word, count it as correct
    const spokenWords = s.split(/\s+/);
    // If multiple words and ALL of them match target?
    if (spokenWords.length > 1 && spokenWords.every(w => w === t)) return true;

    // Homophones & Letter Expansions
    const map = getLetterMappings();

    // Check direct mapping
    if (map[t] && map[t].some(opt => s.includes(cleanWord(opt)))) return true;

    // Levenshtein for long words
    if (t.length > 3 && dist(s, t) <= 1) return true;

    // FIXED: PHRASE MATCHING (for Comprehension)
    // If target has multiple words, check if spoken text contains enough of them
    if (t.split(' ').length > 1) {
        if (checkPhraseMatch(s, t)) return true;
    }

    return false;
}

// Helper: Check if spoken phrase contains key words from target
function checkPhraseMatch(spoken, target) {
    // 1. Remove instruction text from target (e.g. "(detail)", "(inference)", "or any other answer")
    // Remove content in parenthesis
    let cleanTarget = target.replace(/\(.*?\)/g, "").trim();
    // Remove "or any other..." clauses
    cleanTarget = cleanTarget.split(" or ")[0].trim();

    if (!cleanTarget) return false;

    // 2. Tokenize
    const sWords = spoken.toLowerCase().split(/\s+/);
    const tWords = cleanTarget.toLowerCase().split(/\s+/);

    // 3. Count matches
    let matches = 0;
    tWords.forEach(tw => {
        // Allow slight fuzzy match for each word
        if (sWords.some(sw => sw === tw || (tw.length > 3 && dist(sw, tw) <= 1))) {
            matches++;
        }
    });

    // 4. Threshold: If 75% of target keywords are present, match!
    // e.g. Target: "plants grow" (2 words). User: "it helps plants to grow" (contains "plants", "grow") -> 100%
    // e.g. Target: "he gets water" (3 words). User: "he gets the water" (contains "he", "gets", "water") -> 100%
    const pct = matches / tWords.length;
    return pct >= 0.75;
}

// Letter mappings for homophones
function getLetterMappings() {
    return {
        'b': ['be', 'bee', 'bea'],
        'c': ['see', 'sea', 'si', 'ci'],
        'd': ['dee'],
        'e': ['ee'],
        'f': ['eff', 'if', 'off', 'half'], // "If" is very common for "F"
        'g': ['jee', 'gee', 'gee', 'she'],
        'h': ['aitch', 'hey', 'huh', 'hah', 'itch', 'etch'],
        'i': ['eye', 'hi'],
        'j': ['jay', 'je', 'ja', 'g'],
        'k': ['kay', 'key', 'cay'],
        'l': ['el', 'ell'],
        'm': ['em'],
        'n': ['en', 'an', 'and', 'in', 'end'], // Common misrecognitions for N
        'o': ['oh'],
        'p': ['pee', 'pea', 'peh'],
        'q': ['cue', 'queue', 'kew'],
        'r': ['are', 'ar', 'our', 'or', 'hour'],
        's': ['ess', 'yes'],
        't': ['tea', 'tee', 'dee'],
        'u': ['you'],
        'v': ['vee', 'vi', 've', 'viy'],
        'w': ['double u', 'doubleplay', 'doubleyou'],
        'x': ['ex'],
        'y': ['why', 'wi'],
        'z': ['zee', 'zed']
    };
}

// ISSUE 3 FIX: Normalize spoken mapping words to target letter
function normalizeSpeechToTarget(spoken, target) {
    const s = cleanWord(spoken);
    const t = cleanWord(target);

    // If target is a single letter
    if (t.length === 1) {
        // Check if spoken is a repeated letter (bb, bbb -> b)
        if (new RegExp(`^${t}+$`).test(s)) {
            return target.toUpperCase(); // Return uppercase letter
        }

        // Check if spoken is a mapping word (why -> Y, bee -> B)
        const map = getLetterMappings();
        if (map[t] && map[t].some(opt => s.includes(cleanWord(opt)))) {
            return target.toUpperCase();
        }

        // Direct match
        if (s === t || s.includes(t)) {
            return target.toUpperCase();
        }
    }

    // Return original spoken value for non-letter stages
    return spoken;
}

function dist(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let m = [];
    for (let i = 0; i <= b.length; i++) { m[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { m[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] : Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]) + 1;
        }
    }
    return m[b.length][a.length];
}

function finishTest() {
    // === FINAL PLACEMENT ANALYSIS ===

    // 1. ORAL READING ERROR ANALYSIS
    // errors = omitted_words + substitutions + mispronunciations
    // Currently we track 'pending' = omitted, we don't have separate sub/mispronunciation tracking
    const oralErrors = testState.passageWords.filter(w => w.status !== 'correct').length;

    let oralClassification = 'Independent';
    if (oralErrors >= 5) oralClassification = 'Frustrational';
    else if (oralErrors >= 3) oralClassification = 'Instructional';
    // 0-2 = Independent

    // 2. COMPREHENSION SCORING
    const compTotal = testState.comprehensionLogs.length;
    const compCorrect = testState.comprehensionLogs.filter(l => l.status === 'correct').length;
    const compPercent = compTotal > 0 ? Math.round((compCorrect / compTotal) * 100) : 0;

    let compClassification = 'Independent';
    if (compPercent < 40) compClassification = 'Frustrational';
    else if (compPercent < 80) compClassification = 'Instructional';
    // 80-100 = Independent

    // 3. FINAL RECOMMENDATION
    // If oral OR comprehension is Frustrational => drop one level
    let finalLevel = testState.passageLevel;
    let dropped = false;

    if (oralClassification === 'Frustrational' || compClassification === 'Frustrational') {
        const idx = LEVEL_ORDER.indexOf(finalLevel);
        if (idx > 0) {
            finalLevel = LEVEL_ORDER[idx - 1];
            dropped = true;
        }
    }

    // Display Results
    testContent.innerHTML = `
        <div class="text-center py-5">
            <h1 class="display-4 fw-bold mb-4">Assessment Complete</h1>
            <div class="card shadow-sm p-5 mx-auto" style="max-width:700px">
                <i class="fas fa-check-circle text-success fa-5x mb-4"></i>
                <h2 class="display-6">Thank you for completing the assessment!</h2>
                <p class="lead text-muted mt-3">Your results have been saved.</p>
                
                <hr class="my-4">
                <button class="btn btn-primary btn-lg" onclick="location.href='student-dashboard.html'">Back to Dashboard</button>
            </div>
        </div>
    `;

    saveResult(finalLevel, oralErrors, oralClassification, compPercent, compClassification);
}

async function saveResult(finalLevel, oralErrors, oralClassification, compPercent, compClassification) {
    try {
        await addDoc(collection(db, 'results'), {
            userId: currentUser.uid,
            testId: pTest?.id || 'pre-test',

            // Final Placement
            placedLevel: finalLevel,

            // Oral Reading Analysis
            oralErrors: oralErrors,
            oralClassification: oralClassification,

            // Comprehension Analysis
            comprehensionPercent: compPercent,
            comprehensionClassification: compClassification,

            // Full Evidence Logs (Decision Tree)
            logs: {
                letters: testState.letterLogs,
                sentences: testState.sentenceLogs,
                words: testState.wordLogs,
                comprehension: testState.comprehensionLogs
            },

            timestamp: serverTimestamp()
        });
        console.log("Result saved with full evidence logs");
    } catch (e) {
        console.error("Save error:", e);
    }
}
