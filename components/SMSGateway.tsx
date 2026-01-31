import React, { useState, useEffect } from 'react';
import { addReport } from '../services/db';
import { WASHReport, ReportType } from '../types';
import { calculateRiskScore } from '../utils/risk';
import { decodeReport } from '../utils/smsCodec';
import { Capacitor } from '@capacitor/core';

const SMSGateway: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [history, setHistory] = useState<{ type: 'in' | 'out', text: string }[]>([]);
    const [sending, setSending] = useState(false);

    // NATIVE SMS LISTENER (From Java MainActivity)
    useEffect(() => {
        const handleNativeSMS = async (event: any) => {
            console.log("Native SMS Received:", event.detail);
            alert("NATIVE SMS RECEIVED: " + JSON.stringify(event.detail)); // Enabled for debugging
            const { body } = event.detail;
            if (body) {
                const cleanText = body.replace('WASH', '').trim();
                setHistory(prev => [...prev, { type: 'out', text: `(Native) ${cleanText}` }]);
                const response = await processSMS(cleanText);
                setHistory(prev => [...prev, { type: 'in', text: response }]);
            }
        };

        window.addEventListener('smsReceived', handleNativeSMS);
        console.log("SMS Listener Attached"); // Debug log

        return () => window.removeEventListener('smsReceived', handleNativeSMS);
    }, []);

    // NOTE: Real SMS Listener removed due to plugin incompatibility (Deprecation Error).
    // Falling back to "Simulation Mode" which is safer for the demo.

    const toggleOpen = () => setIsOpen(!isOpen);

    const handleSend = async () => {
        if (!message.trim()) return;

        const originalMessage = message.trim().toUpperCase();
        setHistory(prev => [...prev, { type: 'out', text: message }]);
        setMessage('');
        setSending(true);

        // DELAY SIMULATION (Network latency)
        setTimeout(async () => {
            try {
                const response = await processSMS(originalMessage);
                setHistory(prev => [...prev, { type: 'in', text: response }]);
            } catch (error) {
                console.error(error);
                setHistory(prev => [...prev, { type: 'in', text: "ERR: System Failure. Try again." }]);
            }
            setSending(false);
        }, 1500);
    };

    const processSMS = async (text: string): Promise<string> => {
        // PARSE FORMAT: [ID] [COMMAND] 
        // Example: T-101 BROKEN


        const parts = text.split(' ');

        // NEW DECODE LOGIC
        // Allow length 3 (Header stripped) or 4 (Full message)
        if (parts.length >= 3) {
            let fullMsg = text;
            if (!text.startsWith('WASH')) fullMsg = 'WASH ' + text;

            const decodedReport = decodeReport(fullMsg);

            if (decodedReport && decodedReport.details) {
                alert("Decoded OK: " + JSON.stringify(decodedReport)); // DEBUG
                // Calculate Risk with decoded details
                let riskResult;
                if (decodedReport.type === ReportType.TOILET) {
                    riskResult = calculateRiskScore(ReportType.TOILET, {
                        functional: decodedReport.details.usable?.toLowerCase() === 'yes' ? 'yes' : decodedReport.details.usable?.toLowerCase() === 'limited' ? 'limited' : 'no',
                        water: decodedReport.details.water?.toLowerCase(),
                        soap: String(decodedReport.details.soap),
                        lighting: String(decodedReport.details.lighting),
                        lock: String(decodedReport.details.lock),
                        usersPerDay: decodedReport.details.usersPerDay,
                        users: decodedReport.details.users
                    });
                } else {
                    riskResult = calculateRiskScore(ReportType.WATER_POINT, {
                        functional: decodedReport.details.isFunctional?.toLowerCase(),
                        waterAvailable: decodedReport.details.available?.toLowerCase(),
                        quality: decodedReport.details.quality?.toLowerCase(),
                        waitingTime: decodedReport.details.waitingTime,
                        usersPerDay: decodedReport.details.usersPerDay,
                        users: decodedReport.details.users
                    });
                }

                const newReport: WASHReport = {
                    id: `SMS-${Date.now()}`,
                    type: decodedReport.type!,
                    zone: decodedReport.zone!,
                    facilityId: decodedReport.facilityId!,
                    timestamp: new Date().toISOString(),
                    synced: true,
                    status: 'Pending',
                    details: {
                        ...decodedReport.details,
                        riskScore: riskResult.score,
                        riskPriority: riskResult.priority,
                        riskReasoning: [...(riskResult.reasoning || []), 'Reported via SMS Gateway']
                    }
                };
                try {
                    await addReport(newReport);
                    alert("DB Save Success!"); // DEBUG
                } catch (e: any) {
                    alert("DB Save Failed: " + e.message); // DEBUG
                }
                return `SMS PROCESSED: ${decodedReport.facilityId} - Risk: ${riskResult.score}`;
            } else {
                alert("Decode Failed logic hit"); // DEBUG 
            }
        }

        if (parts.length < 2) return "ERR: Invalid Format. Use [ID] [STATUS] or Standard Code";

        const facilityId = parts[0];
        const command = parts.slice(1).join(' '); // Remainder is command

        // 1. DETERMINE TYPE (Toilet or Water Point)
        // Heuristic: T-* is Toilet, W-* is Water. Default to Toilet if unknown.
        const isWaterPoint = facilityId.startsWith('W');
        const reportType = isWaterPoint ? ReportType.WATER_POINT : ReportType.TOILET;

        // 2. MAP KEYWORDS TO REPORT DATA
        // Using Partial<WASHReport['details']> to match Type definition
        const reportData: Partial<WASHReport['details']> = {
            usagePressure: '<25', // Default required field
            usersPerDay: '<25'
        };

        if (isWaterPoint) {
            // WATER POINT MAPPING
            if (command.includes('BROKEN') || command.includes('NO-WATER')) {
                reportData.isFunctional = 'No';
                reportData.available = 'None';
                reportData.urgency = 'Critical';
            } else if (command.includes('DIRTY') || command.includes('SMELLY')) {
                reportData.quality = 'Dirty';
                reportData.isFunctional = 'Yes';
                reportData.urgency = 'High';
            } else if (command.includes('LEAK')) {
                reportData.isFunctional = 'Yes'; // Leaking implies water exists
                reportData.notes = 'Leak reported via SMS';
                reportData.urgency = 'Medium';
            } else if (command.includes('OK')) {
                reportData.isFunctional = 'Yes';
                reportData.available = 'Yes';
                reportData.quality = 'Clear';
                reportData.urgency = 'Low';
            } else {
                return `ERR: Unknown Command '${command}'. Try BROKEN, DIRTY, LEAK.`;
            }

            // Calculate Risk (Map to calculateWaterPointRisk expected args)
            const riskResult = calculateRiskScore(ReportType.WATER_POINT, {
                functional: reportData.isFunctional?.toLowerCase(),
                waterAvailable: reportData.available?.toLowerCase() === 'none' ? 'no' : reportData.available?.toLowerCase(), // MAPPING 'None' to 'no'
                quality: reportData.quality?.toLowerCase(),
                waitingTime: reportData.waitingTime, // Assuming format matches or is close enough
                usersPerDay: reportData.usersPerDay,
                users: reportData.users
            });

            const newReport: WASHReport = {
                id: `SMS-${Date.now()}`,
                type: reportType,
                zone: 'Unknown',
                facilityId: facilityId,
                timestamp: new Date().toISOString(),
                synced: true,
                status: 'Pending',
                details: {
                    ...reportData,
                    riskScore: riskResult.score,
                    riskPriority: riskResult.priority,
                    riskReasoning: [...(riskResult.reasoning || []), 'Reported via SMS Gateway'],
                    usagePressure: reportData.usagePressure || '<25' // Ensure it's there
                }
            };
            await addReport(newReport);

        } else {
            // TOILET MAPPING
            if (command.includes('BROKEN') || command.includes('UNUSABLE')) {
                reportData.usable = 'no';
                reportData.urgency = 'Critical';
            } else if (command.includes('LEAK')) {
                reportData.usable = 'limited';
                reportData.notes = 'Water leak in facility';
                reportData.urgency = 'High';
            } else if (command.includes('NO-SOAP')) {
                reportData.soap = false;
                reportData.usable = 'yes';
                reportData.urgency = 'Medium';
            } else if (command.includes('DIRTY') || command.includes('MESSY')) {
                reportData.usable = 'limited';
                reportData.notes = 'Dirty condition reported via SMS';
                reportData.urgency = 'High';
            } else if (command.includes('DARK') || command.includes('NO-LIGHT')) {
                reportData.lighting = false;
                reportData.usable = 'yes';
                reportData.urgency = 'Medium';
            } else if (command.includes('OK')) {
                reportData.usable = 'yes';
                reportData.soap = true;
                reportData.urgency = 'Low';
            } else {
                return `ERR: Unknown Command '${command}'. Try BROKEN, NO-SOAP, DIRTY.`;
            }

            // Calculate Risk (Map to calculateRiskScore expected args)
            // Ensure lighting is boolean if present
            const lightingBool = typeof reportData.lighting === 'boolean' ? reportData.lighting : undefined;

            const riskResult = calculateRiskScore(ReportType.TOILET, {
                functional: reportData.usable === 'yes' ? 'yes' : reportData.usable === 'limited' ? 'limited' : 'no', // Mapping 'usable' to 'functional'
                water: reportData.water,
                soap: String(reportData.soap),
                lighting: String(reportData.lighting),
                lock: String(reportData.lock),
                usersPerDay: reportData.usersPerDay,
                users: reportData.users
            });

            const newReport: WASHReport = {
                id: `SMS-${Date.now()}`,
                type: reportType,
                zone: 'Unknown',
                facilityId: facilityId,
                timestamp: new Date().toISOString(),
                synced: true,
                status: 'Pending',
                details: {
                    ...reportData,
                    riskScore: riskResult.score,
                    riskPriority: riskResult.priority,
                    riskReasoning: [...(riskResult.reasoning || []), 'Reported via SMS Gateway'],
                    usagePressure: reportData.usagePressure || '<25'
                }
            };
            await addReport(newReport);
        }

        return `SMS RECEIVED. Logged report for ${facilityId}.`;
    };

    // The UI (button and modal) is removed as requested by the user.
    // The component now runs silently in the background listening for REAL native SMS events.
    return null;
};

export default SMSGateway;
