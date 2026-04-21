/**
 * Intervention Activities Data Module
 * ═══════════════════════════════════════
 * Central source of expert-designed literacy intervention activities.
 * Used by: resources.html, lesson-builder.html, reading-practice.html
 * 
 * Categories: phonics, fluency, comprehension, vocabulary
 * Levels: pre-primer, primer, level-1 through level-6
 */

export const CATEGORIES = [
    { id: 'phonics',       label: 'Phonics',        icon: 'fa-spell-check',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
    { id: 'fluency',       label: 'Fluency',        icon: 'fa-running',      color: '#14b8a6', bg: 'rgba(20,184,166,0.1)' },
    { id: 'comprehension', label: 'Comprehension',  icon: 'fa-book-reader',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    { id: 'vocabulary',    label: 'Vocabulary',     icon: 'fa-language',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
];

export const LEVELS = [
    { id: 'pre-primer', label: 'Pre-Primer' },
    { id: 'primer',     label: 'Primer' },
    { id: 'level-1',    label: 'Level 1' },
    { id: 'level-2',    label: 'Level 2' },
    { id: 'level-3',    label: 'Level 3' },
    { id: 'level-4',    label: 'Level 4' },
    { id: 'level-5',    label: 'Level 5' },
    { id: 'level-6',    label: 'Level 6' }
];

export const ACTIVITIES = [
    // ═══════════ PHONICS ═══════════
    {
        id: 'ph-1',
        category: 'phonics',
        level: 'pre-primer',
        title: 'Letter Sound Match',
        description: 'Match uppercase and lowercase letters to their sounds. Students tap the correct sound when shown a letter.',
        duration: '10 min',
        type: 'Interactive',
        difficulty: 'easy',
        skills: ['letter recognition', 'phonemic awareness'],
        instructions: [
            'Show each letter card one at a time.',
            'Ask the student to say the sound the letter makes.',
            'If incorrect, model the sound and have them repeat 3 times.',
            'Track which letters need more practice.'
        ]
    },
    {
        id: 'ph-2',
        category: 'phonics',
        level: 'pre-primer',
        title: 'CVC Word Blending',
        description: 'Blend consonant-vowel-consonant words by sounding out each letter: c-a-t → cat.',
        duration: '15 min',
        type: 'Interactive',
        difficulty: 'easy',
        skills: ['blending', 'decoding'],
        instructions: [
            'Present CVC word cards (cat, dog, sun, big, hat, etc.).',
            'Student sounds out each letter separately.',
            'Then blends the sounds together to say the whole word.',
            'Repeat with 10–15 words per session.'
        ],
        wordList: ['cat', 'dog', 'sun', 'big', 'hat', 'run', 'sit', 'map', 'pen', 'cup', 'bed', 'fox', 'hop', 'wet', 'jam']
    },
    {
        id: 'ph-3',
        category: 'phonics',
        level: 'primer',
        title: 'Digraph Detective',
        description: 'Identify and read common digraphs (sh, ch, th, wh) in words and sentences.',
        duration: '15 min',
        type: 'Worksheet',
        difficulty: 'medium',
        skills: ['digraphs', 'word patterns'],
        instructions: [
            'Read each sentence aloud.',
            'Circle all words containing a digraph (sh, ch, th, wh).',
            'Sort the circled words by their digraph type.',
            'Practice reading each word 3 times.'
        ],
        wordList: ['ship', 'chat', 'thin', 'when', 'shop', 'chin', 'that', 'whip', 'shell', 'check', 'think', 'whale']
    },
    {
        id: 'ph-4',
        category: 'phonics',
        level: 'level-1',
        title: 'Silent E Magic',
        description: 'Learn the magic-e rule: how adding "e" changes the vowel sound (cap → cape, kit → kite).',
        duration: '12 min',
        type: 'Interactive',
        difficulty: 'medium',
        skills: ['vowel patterns', 'silent-e rule'],
        instructions: [
            'Show pairs of words: short vowel vs. silent-e (cap/cape, hop/hope).',
            'Student reads both words and explains the difference.',
            'Practice with the word list below.',
            'Create sentences using the silent-e words.'
        ],
        wordList: ['cap/cape', 'hop/hope', 'kit/kite', 'pin/pine', 'tub/tube', 'cut/cute', 'dim/dime', 'tap/tape']
    },
    {
        id: 'ph-5',
        category: 'phonics',
        level: 'level-2',
        title: 'R-Controlled Vowels',
        description: 'Practice reading words with r-controlled vowels (ar, er, ir, or, ur).',
        duration: '15 min',
        type: 'Interactive',
        difficulty: 'medium',
        skills: ['r-controlled vowels', 'decoding'],
        wordList: ['car', 'star', 'her', 'fern', 'bird', 'girl', 'corn', 'fork', 'burn', 'curl']
    },
    {
        id: 'ph-6',
        category: 'phonics',
        level: 'level-3',
        title: 'Multisyllable Word Decoding',
        description: 'Break longer words into syllables and decode each part before reading the full word.',
        duration: '20 min',
        type: 'Guided',
        difficulty: 'hard',
        skills: ['syllable division', 'decoding strategy'],
        wordList: ['basket', 'kitten', 'sunset', 'rabbit', 'napkin', 'pumpkin', 'fantastic', 'hamburger']
    },

    // ═══════════ FLUENCY ═══════════
    {
        id: 'fl-1',
        category: 'fluency',
        level: 'primer',
        title: 'Echo Reading',
        description: 'Teacher reads a sentence, student repeats it with the same expression and pace. Builds prosody.',
        duration: '10 min',
        type: 'Guided',
        difficulty: 'easy',
        skills: ['prosody', 'expression'],
        instructions: [
            'Read a sentence aloud with proper expression.',
            'Student "echoes" — repeats exactly how you read it.',
            'Focus on matching speed, pauses, and expression.',
            'Progress from short sentences to longer ones.'
        ],
        passages: [
            'The cat sat on the mat.',
            'Look at the big red ball!',
            'Can you see the bird in the tree?',
            'I like to run and play all day.'
        ]
    },
    {
        id: 'fl-2',
        category: 'fluency',
        level: 'level-1',
        title: '60-Second Fluency Sprint',
        description: 'Read a passage for exactly one minute. Count total words and errors to calculate WPM.',
        duration: '5 min',
        type: 'Timed',
        difficulty: 'medium',
        skills: ['reading speed', 'accuracy'],
        passages: [
            'Sam had a dog named Max. Max was a big brown dog. He liked to run in the park. Sam threw the ball, and Max ran to get it. Max brought the ball back. Sam was happy. Max was happy too. They played until the sun went down. Then they walked home. Mom had dinner ready. Sam ate his dinner. Max ate his food too. It was a good day for Sam and Max.'
        ]
    },
    {
        id: 'fl-3',
        category: 'fluency',
        level: 'level-2',
        title: 'Repeated Reading Practice',
        description: 'Read the same passage 3 times. Each time, try to read faster and smoother.',
        duration: '15 min',
        type: 'Repetition',
        difficulty: 'medium',
        skills: ['fluency building', 'automaticity'],
        passages: [
            'The little red hen found a grain of wheat. "Who will help me plant this wheat?" she asked. "Not I," said the cat. "Not I," said the dog. "Not I," said the pig. "Then I will plant it myself," said the little red hen. And she did. The wheat grew tall and golden in the summer sun. When it was time to harvest, the little red hen asked again for help.'
        ]
    },
    {
        id: 'fl-4',
        category: 'fluency',
        level: 'level-3',
        title: 'Readers Theater Script',
        description: 'Practice reading a script with different character voices. Focus on expression and dialogue.',
        duration: '20 min',
        type: 'Performance',
        difficulty: 'medium',
        skills: ['prosody', 'expression', 'dialogue reading']
    },
    {
        id: 'fl-5',
        category: 'fluency',
        level: 'level-4',
        title: 'Phrase-Phrased Reading',
        description: 'Read text broken into meaningful phrases rather than word-by-word. Develop natural reading rhythm.',
        duration: '15 min',
        type: 'Guided',
        difficulty: 'medium',
        skills: ['phrasing', 'natural rhythm'],
        passages: [
            'On a warm / summer morning, / a little girl / named Lily / walked through the forest. / She heard / the birds singing / in the tall trees. / A rabbit / hopped across / the path / in front of her. / Lily smiled / and continued / on her way / to grandmother\'s house.'
        ]
    },

    // ═══════════ COMPREHENSION ═══════════
    {
        id: 'co-1',
        category: 'comprehension',
        level: 'pre-primer',
        title: 'Picture Walk',
        description: 'Before reading, look through the pictures in a book. Predict what the story is about.',
        duration: '10 min',
        type: 'Pre-Reading',
        difficulty: 'easy',
        skills: ['prediction', 'prior knowledge'],
        instructions: [
            'Show the book cover. Ask: "What do you think this book is about?"',
            'Flip through pages looking only at pictures.',
            'For each picture ask: "What is happening here?"',
            'After the walk, ask: "What do you think will happen in this story?"',
            'Then read the story and compare predictions.'
        ]
    },
    {
        id: 'co-2',
        category: 'comprehension',
        level: 'level-1',
        title: 'Story Retelling — "The Lost Kitten"',
        description: 'Read a short story, then retell it in your own words using beginning, middle, and end structure.',
        duration: '15 min',
        type: 'Guided',
        difficulty: 'easy',
        skills: ['retelling', 'sequencing', 'main idea'],
        passages: [
            'One morning, a small grey kitten woke up and couldn\'t find her mother. She looked under the porch. She looked behind the garden shed. She even looked inside the old barn. "Meow! Meow!" she cried. A friendly dog heard her and said, "Follow me!" The dog led the kitten to the big oak tree. There, under the tree, was her mother, sleeping in the warm sun. The kitten was so happy! She curled up next to her mother and they both fell asleep.'
        ],
        questions: [
            { q: 'Who is the main character?', a: 'A small grey kitten' },
            { q: 'What was the kitten\'s problem?', a: 'She couldn\'t find her mother' },
            { q: 'Who helped the kitten?', a: 'A friendly dog' },
            { q: 'How did the story end?', a: 'The kitten found her mother under the oak tree and they slept together' }
        ]
    },
    {
        id: 'co-3',
        category: 'comprehension',
        level: 'level-2',
        title: 'Main Idea Detective',
        description: 'Read a paragraph and identify the main idea and 2-3 supporting details.',
        duration: '15 min',
        type: 'Worksheet',
        difficulty: 'medium',
        skills: ['main idea', 'supporting details']
    },
    {
        id: 'co-4',
        category: 'comprehension',
        level: 'level-3',
        title: 'Inference Challenge',
        description: 'Read clues in the text and pictures to figure out what the author doesn\'t directly say.',
        duration: '20 min',
        type: 'Critical Thinking',
        difficulty: 'hard',
        skills: ['inference', 'critical thinking'],
        passages: [
            'Maria put on her boots and grabbed her umbrella. She zipped up her raincoat all the way to her chin. Then she looked out the window and sighed.'
        ],
        questions: [
            { q: 'What is the weather like outside?', a: 'It is raining' },
            { q: 'How does Maria feel about going outside?', a: 'She doesn\'t seem happy about it (she sighed)' },
            { q: 'What clues told you about the weather?', a: 'Boots, umbrella, raincoat' }
        ]
    },
    {
        id: 'co-5',
        category: 'comprehension',
        level: 'level-4',
        title: 'Cause and Effect Mapping',
        description: 'Identify cause-and-effect relationships in a passage and map them visually.',
        duration: '20 min',
        type: 'Graphic Organizer',
        difficulty: 'hard',
        skills: ['cause and effect', 'text analysis']
    },
    {
        id: 'co-6',
        category: 'comprehension',
        level: 'level-5',
        title: 'Author\'s Purpose Analysis',
        description: 'Determine why the author wrote a piece: to inform, persuade, or entertain.',
        duration: '25 min',
        type: 'Critical Thinking',
        difficulty: 'hard',
        skills: ['author\'s purpose', 'text analysis']
    },

    // ═══════════ VOCABULARY ═══════════
    {
        id: 'vo-1',
        category: 'vocabulary',
        level: 'pre-primer',
        title: 'Sight Word Flashcards',
        description: 'Practice recognizing high-frequency sight words instantly, without sounding out.',
        duration: '10 min',
        type: 'Flashcards',
        difficulty: 'easy',
        skills: ['sight words', 'automaticity'],
        wordList: ['the', 'and', 'is', 'it', 'in', 'to', 'a', 'I', 'he', 'she', 'we', 'my', 'you', 'can', 'see', 'like', 'go', 'no', 'up', 'am']
    },
    {
        id: 'vo-2',
        category: 'vocabulary',
        level: 'primer',
        title: 'Word Family Sorting',
        description: 'Sort words into families based on their ending sounds (-at, -an, -ig, -op).',
        duration: '15 min',
        type: 'Sorting',
        difficulty: 'easy',
        skills: ['word families', 'rhyming'],
        wordList: ['cat', 'bat', 'hat', 'mat', 'can', 'man', 'fan', 'ran', 'big', 'dig', 'pig', 'wig', 'hop', 'mop', 'top', 'pop']
    },
    {
        id: 'vo-3',
        category: 'vocabulary',
        level: 'level-1',
        title: 'Context Clue Detective',
        description: 'Figure out the meaning of underlined words by reading the clues in the sentence around them.',
        duration: '15 min',
        type: 'Worksheet',
        difficulty: 'medium',
        skills: ['context clues', 'word meaning'],
        passages: [
            'The dog was famished after running all day, so he ate three bowls of food.',
            'She was jubilant when she won the prize — she jumped up and down with joy!',
            'The immense elephant towered over all the other animals at the zoo.'
        ],
        questions: [
            { q: 'What does "famished" mean?', a: 'Very hungry' },
            { q: 'What does "jubilant" mean?', a: 'Very happy, joyful' },
            { q: 'What does "immense" mean?', a: 'Very big, huge' }
        ]
    },
    {
        id: 'vo-4',
        category: 'vocabulary',
        level: 'level-2',
        title: 'Synonym & Antonym Match',
        description: 'Match words with their synonyms (similar meaning) and antonyms (opposite meaning).',
        duration: '12 min',
        type: 'Matching',
        difficulty: 'medium',
        skills: ['synonyms', 'antonyms'],
        wordList: ['happy/sad', 'big/small', 'fast/slow', 'hot/cold', 'happy/glad', 'big/large', 'fast/quick', 'smart/clever']
    },
    {
        id: 'vo-5',
        category: 'vocabulary',
        level: 'level-3',
        title: 'Tier-2 Vocabulary Builder',
        description: 'Learn academic words that appear across many subjects: compare, describe, explain, predict.',
        duration: '20 min',
        type: 'Interactive',
        difficulty: 'hard',
        skills: ['academic vocabulary', 'word usage'],
        wordList: ['compare', 'contrast', 'describe', 'explain', 'predict', 'observe', 'analyze', 'summarize', 'evaluate', 'infer']
    },
    {
        id: 'vo-6',
        category: 'vocabulary',
        level: 'level-4',
        title: 'Prefix & Suffix Workshop',
        description: 'Learn how prefixes (un-, re-, pre-) and suffixes (-ful, -less, -tion) change word meanings.',
        duration: '20 min',
        type: 'Workshop',
        difficulty: 'hard',
        skills: ['morphology', 'word structure'],
        wordList: ['unhappy', 'redo', 'preview', 'careful', 'careless', 'action', 'hopeful', 'hopeless', 'rewrite', 'unkind']
    }
];

/**
 * Filter activities by category, level, search term, or difficulty.
 */
export function filterActivities({ category, level, search, difficulty } = {}) {
    return ACTIVITIES.filter(act => {
        if (category && act.category !== category) return false;
        if (level && act.level !== level) return false;
        if (difficulty && act.difficulty !== difficulty) return false;
        if (search) {
            const s = search.toLowerCase();
            return act.title.toLowerCase().includes(s) ||
                   act.description.toLowerCase().includes(s) ||
                   act.skills?.some(sk => sk.toLowerCase().includes(s));
        }
        return true;
    });
}

/**
 * Get category metadata by ID.
 */
export function getCategoryMeta(id) {
    return CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
}

/**
 * Reading practice passages for standalone reading mode.
 */
export const PRACTICE_PASSAGES = [
    {
        id: 'rp-1',
        level: 'pre-primer',
        title: 'My Pet Cat',
        text: 'I have a cat. My cat is black. She likes to sit on my lap. She likes to play with a ball. I love my cat.',
        wordCount: 28
    },
    {
        id: 'rp-2',
        level: 'primer',
        title: 'A Day at the Park',
        text: 'Tom and his mom went to the park. Tom ran to the swings. He went up high in the sky! Then he played in the sand. He made a big castle. Mom said it was time to go home. Tom waved goodbye to the park.',
        wordCount: 47
    },
    {
        id: 'rp-3',
        level: 'level-1',
        title: 'The Helpful Ant',
        text: 'A little ant found a big crumb on the ground. The crumb was too heavy to carry alone. The ant went back to find her friends. Five ants came to help. Together, they picked up the crumb and carried it all the way home. Working together made the hard job easy!',
        wordCount: 51
    },
    {
        id: 'rp-4',
        level: 'level-2',
        title: 'The Rainbow After the Storm',
        text: 'Dark clouds filled the sky and rain began to fall. Thunder crashed and lightning flashed. Lily watched from her window with wide eyes. After a long time, the rain stopped. The sun peeked through the clouds. Then something beautiful appeared — a rainbow! It stretched across the whole sky with red, orange, yellow, green, blue, and purple stripes. Lily smiled. The storm was worth it for this moment.',
        wordCount: 71
    },
    {
        id: 'rp-5',
        level: 'level-3',
        title: 'The Invention of the Bicycle',
        text: 'Did you know that the first bicycle had no pedals? In 1817, a German inventor named Karl von Drais created a wooden machine with two wheels. Riders had to push themselves along with their feet on the ground. It was called a "running machine." It wasn\'t until the 1860s that pedals were added. Over the years, bicycles have changed a lot. Today, they come in many shapes and sizes, and millions of people around the world ride them every day.',
        wordCount: 82
    },
    {
        id: 'rp-6',
        level: 'level-4',
        title: 'Ocean Explorers',
        text: 'The ocean covers more than 70 percent of Earth\'s surface, yet we have explored less than 5 percent of it. Deep beneath the waves lies a world of incredible creatures and landscapes. Mountains taller than anything on land rise from the ocean floor. Strange fish with glowing bodies swim in total darkness. Giant squids with eyes the size of dinner plates lurk in the deep. Scientists use special submarines called submersibles to explore these mysterious depths. Every expedition reveals something new and surprising about our underwater world.',
        wordCount: 90
    }
];
