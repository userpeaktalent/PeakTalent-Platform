import React, { useState, useRef, useEffect } from 'react';

interface MonthPickerProps {
    label: string;
    id: string;
    name: string;
    value: string; // Expected format: YYYY-MM or 'present'
    onChange: (e: { target: { name: string; value: string } }) => void;
    required?: boolean;
    allowPresent?: boolean;
}

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const MonthPicker: React.FC<MonthPickerProps> = ({
    label,
    id,
    name,
    value,
    onChange,
    required = false,
    allowPresent = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Parse initial value
    const currentDate = new Date();
    const initialYear = value && value !== 'present'
        ? parseInt(value.split('-')[0])
        : currentDate.getFullYear();
    const initialMonth = value && value !== 'present'
        ? parseInt(value.split('-')[1]) - 1
        : currentDate.getMonth();

    const [viewYear, setViewYear] = useState(initialYear);

    useEffect(() => {
        // If external value changes, update internal view year if it's not 'present'
        if (value && value !== 'present') {
            const valYear = parseInt(value.split('-')[0]);
            if (!isNaN(valYear)) setViewYear(valYear);
        }
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMonthSelect = (monthIndex: number) => {
        const monthStr = (monthIndex + 1).toString().padStart(2, '0');
        const newValue = `${viewYear}-${monthStr}`;
        onChange({ target: { name, value: newValue } });
        setIsOpen(false);
    };

    const handlePresentSelect = () => {
        onChange({ target: { name, value: 'present' } });
        setIsOpen(false);
    };

    const incrementYear = () => setViewYear(prev => prev + 1);
    const decrementYear = () => setViewYear(prev => prev - 1);

    const getDisplayValue = () => {
        if (value === 'present') return 'Present';
        if (!value) return '';
        const [y, m] = value.split('-');
        const mIdx = parseInt(m) - 1;
        return `${MONTHS[mIdx]} ${y}`;
    };

    return (
        <div className="relative" ref={containerRef}>
            <label htmlFor={id} className="block min-h-5 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
                {label} {required && <span className="text-red-500">*</span>}
            </label>

            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`mt-1 flex h-12 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 cursor-pointer dark:bg-slate-700 dark:border-slate-600 dark:text-white hover:border-orange-500 transition-colors duration-200 ${isOpen ? 'ring-2 ring-orange-500 border-orange-500' : ''}`}
            >
                <span className={!value ? 'text-slate-400' : 'text-slate-900 dark:text-white'}>
                    {getDisplayValue() || 'Select Date (MM-YYYY)'}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-left">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                        <button type="button" onClick={decrementYear} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-600 dark:text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        </button>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-lg">{viewYear}</span>
                        <button type="button" onClick={incrementYear} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-600 dark:text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        </button>
                    </div>

                    {/* Month Grid */}
                    <div className="p-3 grid grid-cols-3 gap-2">
                        {MONTHS.map((month, index) => {
                            const isSelected = value === `${viewYear}-${(index + 1).toString().padStart(2, '0')}`;
                            return (
                                <button
                                    key={month}
                                    type="button"
                                    onClick={() => handleMonthSelect(index)}
                                    className={`py-2 text-sm font-medium rounded-lg transition-all ${isSelected
                                            ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-500/20'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 dark:hover:text-orange-400'
                                        }`}
                                >
                                    {month}
                                </button>
                            );
                        })}
                    </div>

                    {allowPresent && (
                        <div className="p-2 border-t border-slate-100 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={handlePresentSelect}
                                className={`w-full py-2 text-sm font-bold rounded-lg transition-all ${value === 'present'
                                        ? 'bg-slate-800 text-white'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                            >
                                Present
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
