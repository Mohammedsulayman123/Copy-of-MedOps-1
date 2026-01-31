
import { WASHReport, ReportType } from '../types';

export const COMPRESSION_MAP = {
    // Zones: "Zone A" -> "ZA"
    ZONES: {
        'Zone A': 'ZA', 'Zone B': 'ZB', 'Zone C': 'ZC', 'Zone D': 'ZD', 'Zone E': 'ZE',
        'Zone F': 'ZF', 'Zone G': 'ZG', 'Zone H': 'ZH', 'Zone I': 'ZI', 'Zone J': 'ZJ',
        // Generic reverse lookup fallback
        'ZA': 'Zone A', 'ZB': 'Zone B', 'ZC': 'Zone C', 'ZD': 'Zone D', 'ZE': 'Zone E',
        'ZF': 'Zone F', 'ZG': 'Zone G', 'ZH': 'Zone H', 'ZI': 'Zone I', 'ZJ': 'Zone J'
    } as Record<string, string>,

    // Questions Maps (Index based)
    // TOILET
    // 1. Working? Yes(0), Limited(1), No(2)
    T_USABLE: { 'Yes': '0', 'Limited': '1', 'No': '2', '0': 'Yes', '1': 'Limited', '2': 'No' },
    // 2. Water? Yes(0), Limited(1), None(2)
    T_WATER: { 'Yes': '0', 'Limited': '1', 'None': '2', '0': 'Yes', '1': 'Limited', '2': 'None' },
    // 3. Soap? Yes(0), No(1)
    BOOL_YN: { 'true': '0', 'false': '1', '0': true, '1': false }, // repurposed for soap/light/lock
    // 6. Users/Day
    USERS_PD: { '<25': '0', '25-50': '1', '50-100': '2', '100+': '3', '0': '<25', '1': '25-50', '2': '50-100', '3': '100+' },
    // 7. Groups (Multi-select) - Bitmask would be efficient, but simple char list is safer for readability
    // Women(W), Children(C), Elderly(E), Disabled(D), Men(M)
    GROUPS: {
        'Women': 'W', 'Children': 'C', 'Elderly': 'E', 'Disabled': 'D', 'Men': 'M',
        'W': 'Women', 'C': 'Children', 'E': 'Elderly', 'D': 'Disabled', 'M': 'Men'
    } as Record<string, string>,

    // WATER POINT
    // 1. Avail? Yes(0), Limited(1), None(2)
    W_AVAIL: { 'Yes': '0', 'Limited': '1', 'None': '2', '0': 'Yes', '1': 'Limited', '2': 'None' },
    // 2. Quality? Clear(0), Dirty(1), Smelly(2)
    W_QUAL: { 'Clear': '0', 'Dirty': '1', 'Smelly': '2', '0': 'Clear', '1': 'Dirty', '2': 'Smelly' },
    // 3. Func? Yes(0), Limited(L), No(1)
    W_FUNC: { 'YES': '0', 'LIMITED': 'L', 'NO': '1', '0': 'YES', 'L': 'LIMITED', '1': 'NO' },
    // 4. Wait? <5(0), 5-15(1), 15+(2)
    W_WAIT: { '<5 min': '0', '5–15 min': '1', '15+ min': '2', 'Unknown': '3', '0': '<5 min', '1': '5–15 min', '2': '15+ min', '3': 'Unknown' },

    // NEW PREMIUM FIELDS
    // Flow Strength
    FLOW: { 'Good': 'G', 'Weak': 'W', 'Dripping': 'D', 'G': 'Good', 'W': 'Weak', 'D': 'Dripping' },

    // Reasons for Non-Functionality / Issues
    REASONS: {
        'Pump broken': 'P', 'No water source': 'N', 'Tap damaged': 'T', 'Contaminated water': 'C',
        'Flooded': 'F', 'Safety risk': 'S', 'Other': 'O',
        'P': 'Pump broken', 'N': 'No water source', 'T': 'Tap damaged', 'C': 'Contaminated water',
        'F': 'Flooded', 'S': 'Safety risk', 'O': 'Other'
    } as Record<string, string>,

    // Alternative Source?
    ALT_SOURCE: { 'YES': 'Y', 'NO': 'N', 'UNKNOWN': 'U', 'Y': 'YES', 'N': 'NO', 'U': 'UNKNOWN' },

    // Distance
    DIST: { '<100m': '0', '100–300m': '1', '>300m': '2', 'Unknown': '3', '0': '<100m', '1': '100–300m', '2': '>300m', '3': 'Unknown' }
};

export const encodeReport = (data: any, type: ReportType): string => {
    // FORMAT: WASH [ZONE] [FACILITY_ID] [DATA]-[GROUPS]
    // DATA depends on Functional Status now

    let z = COMPRESSION_MAP.ZONES[data.zone];
    if (!z) {
        // Smart Fallback: Generate code from name
        // "Zone 1" -> "Z1", "North Camp" -> "NC"
        if (data.zone) {
            const parts = data.zone.split(' ');
            if (parts.length >= 2) {
                // First char of first two words
                z = (parts[0][0] + parts[1][0]).toUpperCase();
            } else {
                // First two chars of word
                z = data.zone.substring(0, 2).toUpperCase();
            }
        } else {
            z = 'ZX';
        }
    }
    // ID compression: "Toilet Block 1" -> "T1", "Water Point 2" -> "W2"
    const fid = data.facilityId.replace('Toilet Block ', 'T').replace('Water Point ', 'W');

    let code = '';
    const groups = (data.users || []).map((u: string) => COMPRESSION_MAP.GROUPS[u] || '').join('');

    if (type === ReportType.TOILET) {
        // [Usable][Water][Soap][Light][Lock][UsersPD]
        code += COMPRESSION_MAP.T_USABLE[data.usable] || '0';
        code += COMPRESSION_MAP.T_WATER[data.water] || '0';
        code += COMPRESSION_MAP.BOOL_YN[String(data.soap)] || '1';
        code += COMPRESSION_MAP.BOOL_YN[String(data.lighting)] || '1';
        code += COMPRESSION_MAP.BOOL_YN[String(data.lock)] || '1';
        code += COMPRESSION_MAP.USERS_PD[data.usersPerDay] || '0';
    } else {
        // WATER POINT LOGIC
        // Base: [Func]...
        const funcCode = COMPRESSION_MAP.W_FUNC[data.isFunctional] || '0'; // Default Yes
        code += funcCode;

        if (data.isFunctional === 'YES') {
            // YES: [Flow][Quality][Wait][UsersPD]
            code += COMPRESSION_MAP.FLOW[data.flowStrength] || 'G';
            code += COMPRESSION_MAP.W_QUAL[data.quality] || '0';
            code += COMPRESSION_MAP.W_WAIT[data.waitingTime] || '0';
            code += COMPRESSION_MAP.USERS_PD[data.usersPerDay] || '0';
        } else if (data.isFunctional === 'LIMITED') {
            // LIMITED: [Flow][Quality][Wait][UsersPD] (Similar to Yes)
            code += COMPRESSION_MAP.FLOW[data.flowStrength] || 'W';
            code += COMPRESSION_MAP.W_QUAL[data.quality] || '0';
            code += COMPRESSION_MAP.W_WAIT[data.waitingTime] || '0';
            code += COMPRESSION_MAP.USERS_PD[data.usersPerDay] || '0';
        } else {
            // NO: [ReasonCode][AltSource][Dist][UsersPD]
            // Reason can be multi, we take the first letter of first reason for compression, or special code
            // For simplicity in SMS, we take the first MAIN reason map
            const mainReason = (data.wpReasonNonFunctional && data.wpReasonNonFunctional[0]) || 'Other';
            code += COMPRESSION_MAP.REASONS[mainReason] || 'O';
            code += COMPRESSION_MAP.ALT_SOURCE[data.wpAlternativeNearby] || 'U';
            code += COMPRESSION_MAP.DIST[data.wpAlternativeDistance] || '3';
            code += COMPRESSION_MAP.USERS_PD[data.usersPerDay] || '0';
        }
    }

    return `WASH ${z} ${fid} ${code}-${groups}`;
};

export const decodeReport = (sms: string): Partial<WASHReport> | null => {
    try {
        // WASH ZD T3 111010-WCD
        const parts = sms.trim().split(' ');
        if (parts.length !== 4 || parts[0] !== 'WASH') return null;

        const zoneCode = parts[1];
        const fidCode = parts[2];
        const dataCode = parts[3];

        const [answers, groupsCode] = dataCode.split('-');

        const zone = COMPRESSION_MAP.ZONES[zoneCode] || 'Unknown';
        // Expand ID
        let facilityId = fidCode;
        let type = ReportType.TOILET;
        if (fidCode.startsWith('T')) {
            facilityId = fidCode.replace('T', 'Toilet Block ');
            type = ReportType.TOILET;
        } else if (fidCode.startsWith('W')) {
            facilityId = fidCode.replace('W', 'Water Point ');
            type = ReportType.WATER_POINT;
        }

        const details: any = {};
        const users = (groupsCode || '').split('').map(c => COMPRESSION_MAP.GROUPS[c]).filter(Boolean);
        details.users = users;

        if (type === ReportType.TOILET) {
            // [Usable][Water][Soap][Light][Lock][UsersPD]
            details.usable = COMPRESSION_MAP.T_USABLE[answers[0]];
            details.water = COMPRESSION_MAP.T_WATER[answers[1]];
            details.soap = COMPRESSION_MAP.BOOL_YN[answers[2]];
            details.lighting = COMPRESSION_MAP.BOOL_YN[answers[3]];
            details.lock = COMPRESSION_MAP.BOOL_YN[answers[4]];
            details.usersPerDay = COMPRESSION_MAP.USERS_PD[answers[5]];
            details.notes = 'Reported via SMS';
        } else {
            // WATER POINT
            // 1st Char is FUNC
            const funcStatus = COMPRESSION_MAP.W_FUNC[answers[0]];
            details.isFunctional = funcStatus;

            if (funcStatus === 'YES' || funcStatus === 'LIMITED') {
                // [Func][Flow][Quality][Wait][UsersPD]
                details.flowStrength = COMPRESSION_MAP.FLOW[answers[1]];
                details.quality = COMPRESSION_MAP.W_QUAL[answers[2]];
                details.waitingTime = COMPRESSION_MAP.W_WAIT[answers[3]];
                details.usersPerDay = COMPRESSION_MAP.USERS_PD[answers[4]];
                details.available = funcStatus === 'YES' ? 'Yes' : 'Limited'; // backward compat
            } else {
                // NO: [Func][Reason][Alt][Dist][UsersPD]
                const reasonCode = answers[1];
                details.wpReasonNonFunctional = [COMPRESSION_MAP.REASONS[reasonCode] || 'Other'];
                details.wpAlternativeNearby = COMPRESSION_MAP.ALT_SOURCE[answers[2]];
                details.wpAlternativeDistance = COMPRESSION_MAP.DIST[answers[3]];
                details.usersPerDay = COMPRESSION_MAP.USERS_PD[answers[4]];
                details.available = 'None';
            }

            details.notes = 'Reported via SMS';
        }

        // Add required default for usage pressure if missing
        if (!details.usagePressure) details.usagePressure = '<25';

        return {
            type,
            zone,
            facilityId,
            details
        } as Partial<WASHReport>;

    } catch (e) {
        console.error("SMS Decode Error", e);
        return null;
    }
};
