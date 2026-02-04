// Helper functions for managing passages and levels

// Add a new passage to a specific level
window.addPassage = function (levelId) {
    // This will trigger a re-render after adding to testData
    alert('Add passage functionality - will be implemented in saveTest');
};

// Remove a passage
window.removePassage = function (levelId, globalIdx) {
    if (confirm('Are you sure you want to remove this passage?')) {
        alert('Remove passage functionality - will be implemented in saveTest');
    }
};

// Add a new question to a passage
window.addQuestion = function (passageIdx) {
    const container = document.getElementById(`questions_${passageIdx}`);
    if (container) {
        const qIdx = container.querySelectorAll('.question-card').length;
        const newQuestion = `
            <div class="question-card mb-2 p-2 border rounded">
                <div class="d-flex justify-content-between mb-2">
                    <small class="text-muted">Question ${qIdx + 1}</small>
                    <button class="btn btn-sm btn-link text-danger p-0" onclick="removeQuestion(${passageIdx}, ${qIdx})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="mb-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Question" value="">
                </div>
                <div>
                    <input type="text" class="form-control form-control-sm" placeholder="Answer" value="">
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', newQuestion);
    }
};

// Remove a question from a passage
window.removeQuestion = function (passageIdx, qIdx) {
    const container = document.getElementById(`questions_${passageIdx}`);
    if (container) {
        const questions = container.querySelectorAll('.question-card');
        if (questions[qIdx]) {
            questions[qIdx].remove();
            // Re-number remaining questions
            container.querySelectorAll('.question-card').forEach((card, idx) => {
                card.querySelector('.text-muted').textContent = `Question ${idx + 1}`;
            });
        }
    }
};

// Add a new level for words or passages
window.addNewLevel = function (levelId, levelName, type) {
    if (type === 'word') {
        // Add empty word level
        const container = document.getElementById('wordListsContainer');
        const newLevelHtml = `
            <div class="mb-4">
                <h5 class="mb-3">${levelName} <span class="badge bg-secondary">0 words</span></h5>
                <div id="wordStage_${levelId}" class="mb-3" data-level-id="${levelId}">
                </div>
                <div class="input-group">
                    <input type="text" class="form-control" id="newWord_${levelId}" placeholder="Add new word" onkeypress="if(event.key==='Enter') addWord('${levelId}')">
                    <button class="btn btn-outline-primary" onclick="addWord('${levelId}')">
                        <i class="fas fa-plus"></i> Add
                    </button>
                </div>
            </div>
        `;
        // Insert before the "Add Level" button
        const addButton = container.querySelector('.text-center');
        if (addButton) {
            addButton.insertAdjacentHTML('beforebegin', newLevelHtml);
            addButton.remove(); // Remove old button, will be recreated with next level
        } else {
            container.insertAdjacentHTML('beforeend', newLevelHtml);
        }

        // Add next level button if not at max
        const nextNum = parseInt(levelId.match(/\d+/)[0]) + 1;
        if (nextNum <= 9) {
            container.insertAdjacentHTML('beforeend', `
                <div class="text-center mt-4">
                    <button class="btn btn-outline-success" onclick="addNewLevel('level_${nextNum}', 'Level ${nextNum}', 'word')">
                        <i class="fas fa-plus-circle"></i> Add Level ${nextNum}
                    </button>
                </div>
            `);
        }
    } else if (type === 'passage') {
        // Add empty passage level
        const container = document.getElementById('passagesContainer');
        const newLevelHtml = `
            <div class="mb-4 pb-3 border-bottom">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="mb-0">${levelName} <span class="badge bg-secondary">0 passage(s)</span></h5>
                    <button class="btn btn-sm btn-outline-primary" onclick="addPassage('${levelId}')">
                        <i class="fas fa-plus"></i> Add Passage
                    </button>
                </div>
                <div id="passageLevel_${levelId}">
                    <p class="text-muted">No passages yet. Click "Add Passage" to create one.</p>
                </div>
            </div>
        `;
        // Insert before the "Add Level" button
        const addButton = container.querySelector('.text-center');
        if (addButton) {
            addButton.insertAdjacentHTML('beforebegin', newLevelHtml);
            addButton.remove();
        } else {
            container.insertAdjacentHTML('beforeend', newLevelHtml);
        }

        // Add next level button if not at max
        const nextNum = parseInt(levelId.match(/\d+/)[0]) + 1;
        if (nextNum <= 9) {
            container.insertAdjacentHTML('beforeend', `
                <div class="text-center mt-4">
                    <button class="btn btn-outline-success" onclick="addNewLevel('level_${nextNum}', 'Level ${nextNum}', 'passage')">
                        <i class="fas fa-plus-circle"></i> Add Level ${nextNum}
                    </button>
                </div>
            `);
        }
    }
};
