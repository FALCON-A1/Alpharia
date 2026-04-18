/**
 * Early Warning System — Shared Module
 * Analyzes student assessment data to flag struggling readers.
 * Used by: teacher-dashboard.html, teacher-progress.html, student-portfolio.html
 */

// Risk thresholds
const RISK_CONFIG = {
    HIGH: {
        fluencyWPM: 30,         // Below 30 WPM is critically low
        accuracy: 60,           // Below 60% accuracy
        daysSinceTest: 45,      // No test in 45+ days
        levelDecline: 2         // Dropped 2+ levels
    },
    MEDIUM: {
        fluencyWPM: 50,         // Below 50 WPM needs attention
        accuracy: 75,           // Below 75% accuracy
        daysSinceTest: 30,      // No test in 30+ days
        levelDecline: 1         // Dropped 1 level
    }
};

const LEVEL_ORDER = ['pre_primer', 'primer', 'level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6'];

function levelIndex(level) {
    const idx = LEVEL_ORDER.indexOf(level);
    return idx >= 0 ? idx : -1;
}

function levelLabel(level) {
    const labels = {
        'pre_primer': 'Pre-Primer',
        'primer': 'Primer',
        'level_1': 'Level 1',
        'level_2': 'Level 2',
        'level_3': 'Level 3',
        'level_4': 'Level 4',
        'level_5': 'Level 5',
        'level_6': 'Level 6'
    };
    return labels[level] || level || 'Unknown';
}

/**
 * Analyze a student's risk level from their assessment results.
 * @param {Array} results — Array of result documents from Firestore `results` collection, sorted by timestamp desc
 * @returns {Object} { level: 'high'|'medium'|'low', flags: string[], details: object }
 */
export function analyzeStudentRisk(results) {
    if (!results || results.length === 0) {
        return {
            level: 'medium',
            flags: ['No assessments completed yet'],
            details: { noData: true }
        };
    }

    const flags = [];
    const latest = results[0];
    const now = Date.now();

    // 1. Check last assessment date
    let daysSinceTest = 999;
    if (latest.timestamp) {
        const testDate = latest.timestamp.toDate ? latest.timestamp.toDate() : new Date(latest.timestamp);
        daysSinceTest = Math.floor((now - testDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    if (daysSinceTest >= RISK_CONFIG.HIGH.daysSinceTest) {
        flags.push(`No assessment in ${daysSinceTest} days`);
    } else if (daysSinceTest >= RISK_CONFIG.MEDIUM.daysSinceTest) {
        flags.push(`Last assessment ${daysSinceTest} days ago`);
    }

    // 2. Check fluency
    const wpm = latest.fluency?.wordsPerMinute || 0;
    const accuracy = latest.fluency?.accuracyRate || 0;
    const fluencyClass = latest.fluency?.classification || 'N/A';

    if (fluencyClass === 'Disfluent' || wpm < RISK_CONFIG.HIGH.fluencyWPM) {
        flags.push(`Critically low fluency: ${wpm} WPM`);
    } else if (wpm < RISK_CONFIG.MEDIUM.fluencyWPM) {
        flags.push(`Low fluency: ${wpm} WPM`);
    }

    if (accuracy < RISK_CONFIG.HIGH.accuracy) {
        flags.push(`Very low accuracy: ${accuracy}%`);
    } else if (accuracy < RISK_CONFIG.MEDIUM.accuracy) {
        flags.push(`Below-target accuracy: ${accuracy}%`);
    }

    // 3. Check reading level decline (compare latest 3 results)
    if (results.length >= 2) {
        const latestLevel = levelIndex(latest.placedLevel);
        const previousLevel = levelIndex(results[1].placedLevel);

        if (latestLevel >= 0 && previousLevel >= 0) {
            const decline = previousLevel - latestLevel;
            if (decline >= RISK_CONFIG.HIGH.levelDecline) {
                flags.push(`Reading level dropped ${decline} levels`);
            } else if (decline >= RISK_CONFIG.MEDIUM.levelDecline) {
                flags.push(`Reading level declined by ${decline} level`);
            }
        }
    }

    // 4. Check oral reading errors
    const oralErrors = latest.oralErrors || {};
    const totalErrors = (oralErrors.mispronounced || 0) + (oralErrors.substitutions || 0) + (oralErrors.omissions || 0);
    if (totalErrors > 10) {
        flags.push(`High error count: ${totalErrors} oral reading errors`);
    }

    // 5. Check comprehension
    const compPercent = latest.comprehensionPercent || 0;
    if (compPercent < 40) {
        flags.push(`Comprehension critically low: ${compPercent}%`);
    } else if (compPercent < 60) {
        flags.push(`Comprehension needs work: ${compPercent}%`);
    }

    // Determine overall risk level
    let level = 'low';
    const highFlagCount = flags.filter(f =>
        f.includes('Critically') || f.includes('Very low') || f.includes('dropped') || f.includes(`${RISK_CONFIG.HIGH.daysSinceTest}`)
    ).length;
    const mediumFlagCount = flags.length - highFlagCount;

    if (highFlagCount >= 1 || flags.length >= 3) {
        level = 'high';
    } else if (mediumFlagCount >= 1 || flags.length >= 1) {
        level = 'medium';
    }

    return {
        level,
        flags,
        details: {
            daysSinceTest,
            wpm,
            accuracy,
            fluencyClass,
            placedLevel: latest.placedLevel,
            placedLevelLabel: levelLabel(latest.placedLevel),
            compPercent,
            oralErrors: totalErrors,
            recommendations: latest.recommendations || [],
            latestTimestamp: latest.timestamp
        }
    };
}

/**
 * Summarize risk across a class of students.
 * @param {Array} studentsWithRisk — Array of { student, risk } objects
 * @returns {Object} { highRisk: [], mediumRisk: [], lowRisk: [], summary: {} }
 */
export function summarizeClassRisk(studentsWithRisk) {
    const highRisk = studentsWithRisk.filter(s => s.risk.level === 'high');
    const mediumRisk = studentsWithRisk.filter(s => s.risk.level === 'medium');
    const lowRisk = studentsWithRisk.filter(s => s.risk.level === 'low');

    // Fluency distribution
    const fluencyDist = { fluent: 0, developing: 0, disfluent: 0, unknown: 0 };
    studentsWithRisk.forEach(s => {
        const fc = (s.risk.details.fluencyClass || '').toLowerCase();
        if (fc === 'fluent') fluencyDist.fluent++;
        else if (fc === 'developing') fluencyDist.developing++;
        else if (fc === 'disfluent') fluencyDist.disfluent++;
        else fluencyDist.unknown++;
    });

    // Reading level distribution
    const levelDist = {};
    studentsWithRisk.forEach(s => {
        const lbl = s.risk.details.placedLevelLabel || 'Unknown';
        levelDist[lbl] = (levelDist[lbl] || 0) + 1;
    });

    return {
        highRisk,
        mediumRisk,
        lowRisk,
        summary: {
            total: studentsWithRisk.length,
            highCount: highRisk.length,
            mediumCount: mediumRisk.length,
            lowCount: lowRisk.length,
            fluencyDist,
            levelDist,
            needsIntervention: highRisk.length + mediumRisk.length
        }
    };
}

export { LEVEL_ORDER, levelIndex, levelLabel, RISK_CONFIG };
