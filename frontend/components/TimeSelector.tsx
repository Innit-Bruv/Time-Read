"use client";

import { useState, useEffect } from "react";

interface TimeSelectorProps {
    value: number | null;
    onChange: (minutes: number | null) => void;
}

const TIME_OPTIONS = [5, 10, 20, 30];

export default function TimeSelector({ value, onChange }: TimeSelectorProps) {
    const [customMode, setCustomMode] = useState(false);
    const [customValue, setCustomValue] = useState("");

    const handlePillClick = (minutes: number) => {
        setCustomMode(false);
        setCustomValue("");
        onChange(minutes === value ? null : minutes);
    };

    const handleCustomClick = () => {
        setCustomMode(true);
        onChange(null);
    };

    // Auto-apply custom value as user types
    useEffect(() => {
        if (!customMode) return;
        const parsed = parseInt(customValue);
        if (parsed > 0 && parsed <= 120) {
            onChange(parsed);
        } else {
            onChange(null);
        }
    }, [customValue, customMode]);

    return (
        <div className="w-full text-center space-y-4 md:space-y-6 relative z-10">
            <div className="space-y-1 md:space-y-2">
                <span className="uppercase tracking-[0.4em] text-accent/40 text-[9px] md:text-xs font-semibold">
                    Your moment of focus
                </span>
                <h1 className="text-[#f1f5f9] font-serif italic text-3xl md:text-5xl lg:text-6xl leading-tight">
                    How much <span className="text-accent">time</span> do you have?
                </h1>
            </div>

            <div className="flex flex-wrap justify-center gap-3 md:gap-5">
                {TIME_OPTIONS.map((min) => {
                    const isSelected = value === min && !customMode;
                    const labels: Record<number, string> = { 5: "Brief", 10: "Steady", 20: "Deep", 30: "Immerse" };

                    return (
                        <label key={min} className="group cursor-pointer">
                            <input
                                className="peer hidden"
                                name="time-preset"
                                type="radio"
                                value={min}
                                checked={isSelected}
                                onChange={() => handlePillClick(min)}
                            />
                            <div
                                className={`w-18 h-18 md:w-24 md:h-24 flex flex-col items-center justify-center rounded-2xl border transition-all duration-500 hover:border-accent/40 ${isSelected
                                        ? "bg-accent border-accent text-[#0f0f0f]"
                                        : "bg-accent/5 border-accent/10 hover:bg-accent/10"
                                    }`}
                            >
                                <span
                                    className={`text-xl md:text-2xl font-serif italic ${isSelected ? "text-[#0f0f0f]" : "text-accent"
                                        }`}
                                >
                                    {min}m
                                </span>
                                <span
                                    className={`text-[8px] md:text-[10px] uppercase tracking-widest mt-0.5 ${isSelected ? "text-[#0f0f0f]/60" : "text-accent/40"
                                        }`}
                                >
                                    {labels[min]}
                                </span>
                            </div>
                        </label>
                    );
                })}
            </div>

            <div className="flex justify-center">
                <button
                    className={`text-[9px] md:text-[10px] uppercase tracking-widest border border-accent/20 rounded-full px-5 py-1.5 transition-all hover:border-accent hover:text-accent ${customMode ? "bg-accent/10 text-accent border-accent/40" : "bg-transparent text-accent/50"
                        }`}
                    onClick={handleCustomClick}
                >
                    Custom Time
                </button>
            </div>

            {customMode && (
                <div className="flex justify-center items-center">
                    <div className="relative">
                        <input
                            type="number"
                            className="bg-accent/5 border-0 border-b-2 border-accent/30 text-accent py-2 px-0 focus:ring-0 focus:border-accent transition-all text-2xl md:text-3xl font-serif italic text-center w-24 outline-none placeholder:text-accent/20"
                            placeholder="min"
                            min={1}
                            max={120}
                            value={customValue}
                            onChange={(e) => setCustomValue(e.target.value)}
                            autoFocus
                        />
                        <span className="absolute right-0 bottom-3 text-accent/30 text-xs font-medium">min</span>
                    </div>
                </div>
            )}
        </div>
    );
}
