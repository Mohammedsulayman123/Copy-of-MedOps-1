export interface RiskResult {
    score: number;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string[];
}

export function calculateRiskScore(
    reportType: 'TOILET' | 'WATER_POINT',
    details: {
        // Common fields
        functional?: string;        // "yes" | "limited" | "no"
        users?: string[];           // ["women", "children", "elderly", "disabled", "general"]
        usersPerDay?: string;       // "<25" | "25-50" | "50-100" | "100+"
        notes?: string;

        // Toilet-specific (if functional = yes/limited)
        water?: string;             // "yes" | "limited" | "no"
        soap?: string;              // "yes" | "no"
        lighting?: string;          // "yes" | "no"
        lock?: string;              // "yes" | "no"
        issues?: string[];          // ["limited_water", "broken_lighting", etc.]

        // Toilet-specific (if functional = no)
        reasonUnusable?: string[];  // ["no_water", "blocked", "collapsed", etc.]
        alternativeNearby?: string; // "yes" | "no" | "unknown"

        // Water Point-specific (if functional = yes)
        waterAvailable?: string;    // "yes" | "limited"
        flowStrength?: string;      // "strong" | "weak"
        quality?: string;           // "clear" | "dirty" | "smelly" | "unknown"
        waitingTime?: string;       // "<5min" | "5-15min" | ">15min"
        areaCondition?: string;     // "clean" | "muddy" | "flooded" | "unsafe"

        // Water Point-specific (if functional = limited)
        wpIssues?: string[];        // ["intermittent", "weak_flow", "poor_quality", etc.]

        // Water Point-specific (if functional = no)
        wpReasonNonFunctional?: string[]; // ["no_source", "pump_broken", etc.]
        wpAlternativeNearby?: string;     // "yes" | "no" | "unknown"
        wpAlternativeDistance?: string;   // "<100m" | "100-300m" | ">300m" | "unknown"
    }
): RiskResult {
    let baseScore = 0;
    const reasoning: string[] = [];

    // ===== GATE LOGIC: Functionality Status =====
    if (details.functional === 'no') {
        baseScore += 50; // Completely non-functional is critical base
        reasoning.push(`${reportType === 'TOILET' ? 'Toilet' : 'Water point'} completely non-functional`);

        if (reportType === 'TOILET') {
            // Check severity of toilet failure
            if (details.reasonUnusable?.includes('no_water')) baseScore += 10;
            if (details.reasonUnusable?.includes('blocked')) baseScore += 10;
            if (details.reasonUnusable?.includes('collapsed') || details.reasonUnusable?.includes('safety_risk')) {
                baseScore += 20;
                reasoning.push('Structural failure or safety hazard');
            }
            if (details.alternativeNearby === 'no') {
                baseScore += 15;
                reasoning.push('No alternative toilet available');
            }
        } else {
            // Water Point non-functional
            if (details.wpReasonNonFunctional?.includes('contaminated')) {
                baseScore += 25;
                reasoning.push('Water contaminated - health hazard');
            }
            if (details.wpReasonNonFunctional?.includes('no_source')) {
                baseScore += 15;
                reasoning.push('No water source available');
            }
            if (details.wpAlternativeNearby === 'no' || details.wpAlternativeDistance === '>300m') {
                baseScore += 20;
                reasoning.push('No nearby alternative water source');
            }
        }

    } else if (details.functional === 'limited') {
        baseScore += 25; // Partially functional
        reasoning.push(`${reportType === 'TOILET' ? 'Toilet' : 'Water point'} partially functional - unreliable`);

        if (reportType === 'TOILET') {
            // Toilet limited - check specific issues
            if (details.issues?.includes('limited_water') || details.water === 'limited') {
                baseScore += 10;
                reasoning.push('Limited water supply');
            }
            if (details.issues?.includes('limited_water') || details.water === 'no') {
                baseScore += 20;
                reasoning.push('No water available');
            }
            if (details.issues?.includes('broken_lighting') || details.lighting === 'no') {
                baseScore += 8;
                reasoning.push('No lighting - night safety risk');
            }
            if (details.issues?.includes('no_lock') || details.lock === 'no') {
                baseScore += 7;
                reasoning.push('No lock - privacy/safety concern');
            }
            if (details.soap === 'no') {
                baseScore += 10;
                reasoning.push('No soap - hygiene risk');
            }
            if (details.issues?.includes('long_waiting')) {
                baseScore += 8;
                reasoning.push('Long waiting times - overcrowding');
            }
        } else {
            // Water Point limited
            if (details.wpIssues?.includes('intermittent') || details.waterAvailable === 'limited') {
                baseScore += 15;
                reasoning.push('Intermittent water supply');
            }
            if (details.wpIssues?.includes('weak_flow') || details.flowStrength === 'weak') {
                baseScore += 10;
                reasoning.push('Very weak water flow');
            }
            if (details.wpIssues?.includes('poor_quality') || details.quality === 'dirty' || details.quality === 'smelly') {
                baseScore += 20;
                reasoning.push('Poor water quality - health risk');
            }
            if (details.wpIssues?.includes('long_queues') || details.waitingTime === '>15min') {
                baseScore += 12;
                reasoning.push('Long queues - access barrier');
            }
            if (details.wpIssues?.includes('safety_concern')) {
                baseScore += 15;
                reasoning.push('Safety concern reported');
            }
        }

    } else if (details.functional === 'yes') {
        // Functional but may have minor issues

        if (reportType === 'TOILET') {
            if (details.water === 'no') {
                baseScore += 25;
                reasoning.push('No water - critical hygiene issue');
            } else if (details.water === 'limited') {
                baseScore += 12;
                reasoning.push('Limited water supply');
            }

            if (details.soap === 'no') {
                baseScore += 15;
                reasoning.push('No soap - handwashing impossible');
            }

            if (details.lighting === 'no') {
                baseScore += 10;
                reasoning.push('No lighting - night safety risk');
            }

            if (details.lock === 'no') {
                baseScore += 8;
                reasoning.push('No lock - privacy/safety concern');
            }
        } else {
            // Water Point functional - check quality and access
            if (details.waterAvailable === 'limited') {
                baseScore += 10;
                reasoning.push('Limited water availability');
            }

            if (details.flowStrength === 'weak') {
                baseScore += 8;
                reasoning.push('Weak water flow - slow access');
            }

            if (details.quality === 'dirty') {
                baseScore += 18;
                reasoning.push('Dirty water - health risk');
            } else if (details.quality === 'smelly') {
                baseScore += 22;
                reasoning.push('Smelly water - possible contamination');
            } else if (details.quality === 'unknown') {
                baseScore += 10;
                reasoning.push('Water quality unknown - needs testing');
            }

            if (details.waitingTime === '5-15min') {
                baseScore += 5;
                reasoning.push('Moderate waiting times');
            } else if (details.waitingTime === '>15min') {
                baseScore += 12;
                reasoning.push('Long waiting times - access barrier');
            }

            if (details.areaCondition === 'muddy') {
                baseScore += 5;
                reasoning.push('Muddy conditions around water point');
            } else if (details.areaCondition === 'flooded') {
                baseScore += 12;
                reasoning.push('Flooded area - safety and hygiene risk');
            } else if (details.areaCondition === 'unsafe') {
                baseScore += 15;
                reasoning.push('Unsafe area conditions');
            }
        }
    }

    // ===== MULTIPLIERS: Population Pressure =====
    let multiplier = 1.0;

    if (details.usersPerDay === '50-100') {
        multiplier *= 1.2;
        reasoning.push('Overcrowded (50-100 users/day)');
    } else if (details.usersPerDay === '100+') {
        multiplier *= 1.5;
        reasoning.push('Severe overcrowding (100+ users/day)');
    }

    // ===== MULTIPLIERS: Vulnerable Populations =====
    const vulnerableUsers = details.users?.filter(u =>
        ['women', 'children', 'elderly', 'disabled'].includes(u.toLowerCase())
    ) || [];

    if (vulnerableUsers.length > 0) {
        multiplier *= 1.3;
        reasoning.push(`Vulnerable groups affected: ${vulnerableUsers.join(', ')}`);
    }

    // Special case: Women + no lighting + toilet = higher risk
    if (reportType === 'TOILET' &&
        details.users?.some(u => u.toLowerCase() === 'women') &&
        (details.lighting === 'no' || details.issues?.includes('broken_lighting'))) {
        multiplier *= 1.2;
        reasoning.push('Women affected by lighting failure - safety critical');
    }

    // Special case: Children + dirty/smelly water = higher risk
    if (reportType === 'WATER_POINT' &&
        details.users?.some(u => u.toLowerCase() === 'children') &&
        (details.quality === 'dirty' || details.quality === 'smelly')) {
        multiplier *= 1.25;
        reasoning.push('Children exposed to poor water quality - high disease risk');
    }

    // ===== FINAL CALCULATION =====
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
