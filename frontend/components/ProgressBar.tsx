"use client";

interface ProgressBarProps {
    /** Progress from 0 to 1 */
    progress: number;
    /** Time remaining in minutes */
    timeRemaining?: number;
}

export default function ProgressBar({ progress, timeRemaining }: ProgressBarProps) {
    const percent = Math.min(Math.max(progress * 100, 0), 100);

    return (
        <div className="sticky top-0 z-50 bg-[var(--bg)]">
            <div className="w-full h-[3px] bg-[var(--border)]">
                <div
                    className="progress-bar"
                    style={{ width: `${percent}%` }}
                />
            </div>
            {timeRemaining !== undefined && (
                <div className="text-right text-xs text-muted px-4 py-1">
                    {Math.ceil(timeRemaining)} min left
                </div>
            )}
        </div>
    );
}
