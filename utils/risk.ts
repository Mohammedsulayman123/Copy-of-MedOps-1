export interface RiskResult {
    score: number;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string[];
}

export function calculateRiskScore(
    details: {
        usability?: string;
        water?: string;
        soap?: boolean;
        lighting?: boolean;
        lock?: boolean;
        usersPerDay?: string;
        users?: string[];
    }
): RiskResult {
    let baseScore = 0;
    const reasoning: string[] = [];

    // ===== STEP 1: FUNCTIONALITY (40 points max) =====
    if (details.usability === 'no') {
        baseScore += 40;
        reasoning.push('Facility completely unusable');
    } else if (details.usability === 'limited') {
        baseScore += 20;
        reasoning.push('Facility partially functional');
    }

    // ===== STEP 2: WATER AVAILABILITY (30 points max) =====
    if (details.water === 'none') {
        baseScore += 30;
        reasoning.push('No water available - critical hygiene risk');
    } else if (details.water === 'limited') {
        baseScore += 15;
        reasoning.push('Limited water supply');
    }

    // ===== STEP 3: SOAP (20 points) =====
    if (details.soap === false) {
        baseScore += 20;
        reasoning.push('No soap - handwashing impossible');
    }

    // ===== STEP 4: LIGHTING (15 points) =====
    if (details.lighting === false) {
        baseScore += 15;
        reasoning.push('No lighting - safety risk at night');
    }

    // ===== STEP 5: LOCK/PRIVACY (10 points) =====
    if (details.lock === false) {
        baseScore += 10;
        reasoning.push('No lock - privacy/safety concern');
    }

    // ===== MULTIPLIERS =====
    let multiplier = 1.0;

    // Overcrowding multiplier
    if (details.usersPerDay === '50-100') {
        multiplier *= 1.2;
        reasoning.push('Overcrowded (50-100 users)');
    } else if (details.usersPerDay === '100+') {
        multiplier *= 1.5;
        reasoning.push('Severe overcrowding (100+ users)');
    }

    // Vulnerable population multiplier
    const vulnerableUsers = details.users?.filter(u =>
        ['women', 'children', 'elderly', 'disabled'].includes(u.toLowerCase())
    ) || [];

    if (vulnerableUsers.length > 0) {
        multiplier *= 1.3;
        reasoning.push(`Vulnerable groups present: ${vulnerableUsers.join(', ')}`);
    }

    // ===== FINAL SCORE =====
    const finalScore = Math.min(Math.round(baseScore * multiplier), 100);

    // ===== PRIORITY CLASSIFICATION =====
    let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    if (finalScore >= 75) {
        priority = 'CRITICAL';
    } else if (finalScore >= 50) {
        priority = 'HIGH';
    } else if (finalScore >= 25) {
        priority = 'MEDIUM';
    } else {
        priority = 'LOW';
    }

    return {
        score: finalScore,
        priority,
        reasoning
    };
}

export function calculateWaterPointRisk(
    details: {
        functional?: string;
        availability?: string;
        quality?: string;
        waitingTime?: string;
        usersPerDay?: string;
        users?: string[];
    }
): RiskResult {
    let baseScore = 0;
    const reasoning: string[] = [];

    // ===== STEP 1: FUNCTIONALITY (40 points) =====
    if (details.functional?.toLowerCase() === 'no') {
        baseScore += 40;
        reasoning.push('Water point non-functional');
    }

    // ===== STEP 2: WATER AVAILABILITY (30 points) =====
    if (details.availability?.toLowerCase() === 'none') {
        baseScore += 30;
        reasoning.push('No water available');
    } else if (details.availability?.toLowerCase() === 'limited') {
        baseScore += 15;
        reasoning.push('Limited water availability');
    }

    // ===== STEP 3: WATER QUALITY (25 points) =====
    if (details.quality?.toLowerCase() === 'dirty') {
        baseScore += 15;
        reasoning.push('Dirty water detected');
    } else if (details.quality?.toLowerCase() === 'smelly') {
        baseScore += 25;
        reasoning.push('Potentially contaminated water');
    }

    // ===== STEP 4: WAITING TIME (15 points) =====
    if (details.waitingTime === '5–15 min' || details.waitingTime === '5-15 min') {
        baseScore += 8;
        reasoning.push('Moderate queue time');
    } else if (details.waitingTime === '15+ min') {
        baseScore += 15;
        reasoning.push('Long waiting time');
    }

    // ===== MULTIPLIERS =====
    let multiplier = 1.0;

    // Overcrowding multiplier
    if (details.usersPerDay === '50-100') {
        multiplier *= 1.2;
        reasoning.push('High usage pressure (50–100 users)');
    } else if (details.usersPerDay === '100+') {
        multiplier *= 1.5;
        reasoning.push('Severe usage pressure (100+ users)');
    }

    // Vulnerable population multiplier
    const vulnerableUsers = details.users?.filter(u =>
        ['women', 'children', 'elderly', 'disabled'].includes(u.toLowerCase())
    ) || [];

    if (vulnerableUsers.length > 0) {
        multiplier *= 1.3;
        reasoning.push(`Vulnerable groups depend on water point: ${vulnerableUsers.join(', ')}`);
    }

    // ===== FINAL SCORE =====
    const finalScore = Math.min(Math.round(baseScore * multiplier), 100);

    // ===== PRIORITY CLASSIFICATION =====
    let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    if (finalScore >= 75) {
        priority = 'CRITICAL';
    } else if (finalScore >= 50) {
        priority = 'HIGH';
    } else if (finalScore >= 25) {
        priority = 'MEDIUM';
    } else {
        priority = 'LOW';
    }

    return {
        score: finalScore,
        priority,
        reasoning
    };
}
