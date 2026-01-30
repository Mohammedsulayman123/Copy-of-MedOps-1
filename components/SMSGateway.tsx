import React, { useState, useEffect } from 'react';
import { addReport } from '../services/db';
import { WASHReport, ReportType } from '../types';
import { calculateRiskScore, calculateWaterPointRisk } from '../utils/risk';
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
            // alert("NATIVE SMS RECEIVED: " + JSON.stringify(event.detail)); // Removed for production
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
        if (parts.length < 2) return "ERR: Invalid Format. Use [ID] [STATUS]";

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
            const riskResult = calculateWaterPointRisk({
                functional: reportData.isFunctional,
                availability: reportData.available,
                quality: reportData.quality,
                waitingTime: reportData.waitingTime,
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

            const riskResult = calculateRiskScore({
                usability: reportData.usable,
                water: reportData.water,
                soap: reportData.soap,
                lighting: lightingBool,
                lock: reportData.lock,
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

    return (
        <>
            {/* FLOATING ACTION BUTTON */}
            <div className="fixed bottom-4 right-4 z-50">
                <button
                    onClick={toggleOpen}
                    className={`${isOpen ? 'bg-slate-700' : 'bg-green-600'} hover:scale-105 transition-all shadow-lg text-white p-4 rounded-full flex items-center justify-center`}
                    title="Simulate SMS Reporting"
                >
                    {isOpen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* PHONE INTERFACE POPUP */}
            {isOpen && (
                <div className="fixed bottom-20 right-4 z-50 w-72 bg-slate-800 rounded-3xl border-4 border-slate-900 shadow-2xl overflow-hidden font-mono text-sm flex flex-col h-96 animate-fade-in-up">
                    {/* Phone Header */}
                    <div className="bg-slate-900 text-slate-400 px-4 py-2 text-xs flex justify-between items-center">
                        <span>MedOps Cell</span>
                        <div className="flex space-x-1">
                            <span>4G</span>
                            <span className="text-green-500">❚❚❚</span>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-grow bg-slate-100 p-2 overflow-y-auto space-y-2 flex flex-col">
                        <div className="self-center text-xs text-slate-400 my-2">-- SMS CHANNEL OPEN --</div>
                        <div className="bg-slate-200 text-slate-700 p-2 rounded-lg rounded-tl-none self-start max-w-[85%] text-xs">
                            <p><strong>System:</strong> Send report using format: [ID] [STATUS]</p>
                            <p className="mt-1 opacity-70">Ex: T-104 BROKEN</p>
                        </div>

                        {history.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`p-2 rounded-lg max-w-[85%] text-xs ${msg.type === 'out'
                                    ? 'bg-blue-600 text-white self-end rounded-tr-none'
                                    : 'bg-slate-200 text-slate-800 self-start rounded-tl-none'
                                    }`}
                            >
                                {msg.text}
                            </div>
                        ))}
                    </div>

                    {/* Input Area */}
                    <div className="bg-slate-200 p-2 flex space-x-2 border-t border-slate-300">
                        <input
                            type="text"
                            className="flex-grow bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-500 placeholder:text-slate-400"
                            placeholder="Type message..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            autoFocus
                        />
                        <button
                            onClick={handleSend}
                            disabled={sending}
                            className={`bg-green-600 text-white px-3 py-1 rounded font-bold transition-colors ${sending ? 'opacity-50' : 'hover:bg-green-700'}`}
                        >
                            {sending ? '...' : '➤'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default SMSGateway;
