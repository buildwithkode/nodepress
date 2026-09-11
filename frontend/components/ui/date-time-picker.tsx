'use client';

import * as React from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
  Sparkles,
  Check,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '@/lib/utils';

export interface DateTimePickerProps {
  value?: string | null; // Expected format: 'YYYY-MM-DDTHH:mm' or ISO string
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a Date object to local YYYY-MM-DDTHH:mm */
function toLocalString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse an incoming value string into a safe Date object or null */
function parseValue(val?: string | null): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Human-friendly relative publish preview text */
function getRelativeTimePreview(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'Publish time has already arrived';

  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) {
    return `Publishes in ${diffMins} minute${diffMins === 1 ? '' : 's'}`;
  }

  const diffHours = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;
  if (diffHours < 24) {
    return remMins > 0
      ? `Publishes in ${diffHours}h ${remMins}m`
      : `Publishes in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Publishes in ${diffDays} day${diffDays === 1 ? '' : 's'} (${target.toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date and time…',
  className,
  disabled = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => parseValue(value), [value]);

  // Active view month & year in calendar
  const [viewYear, setViewYear] = React.useState<number>(() =>
    selectedDate ? selectedDate.getFullYear() : new Date().getFullYear(),
  );
  const [viewMonth, setViewMonth] = React.useState<number>(() =>
    selectedDate ? selectedDate.getMonth() : new Date().getMonth(),
  );

  // Sync view when selectedDate changes externally
  React.useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
    }
  }, [value]);

  // Time state
  const hours24 = selectedDate ? selectedDate.getHours() : 9;
  const minutes = selectedDate ? selectedDate.getMinutes() : 0;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  // Navigate calendar month
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  // Select day in grid
  const handleSelectDay = (day: number) => {
    const target = new Date(viewYear, viewMonth, day, hours24, minutes, 0, 0);
    onChange(toLocalString(target));
  };

  // Change Time
  const handleTimeChange = (newHours12: number, newMinutes: number, newPeriod: 'AM' | 'PM') => {
    let h24 = newHours12 % 12;
    if (newPeriod === 'PM') h24 += 12;

    const base = selectedDate ? new Date(selectedDate) : new Date(viewYear, viewMonth, new Date().getDate());
    base.setHours(h24);
    base.setMinutes(newMinutes);
    base.setSeconds(0);
    base.setMilliseconds(0);
    onChange(toLocalString(base));
  };

  // Quick Presets
  const applyPreset = (preset: '1h' | 'tonight' | 'tomorrow-9am' | 'tomorrow-6pm' | 'weekend') => {
    const now = new Date();
    const d = new Date();

    if (preset === '1h') {
      d.setTime(now.getTime() + 60 * 60 * 1000);
      // round to next 5 minutes
      d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    } else if (preset === 'tonight') {
      d.setHours(20, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
    } else if (preset === 'tomorrow-9am') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else if (preset === 'tomorrow-6pm') {
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
    } else if (preset === 'weekend') {
      const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
      d.setDate(now.getDate() + daysUntilSaturday);
      d.setHours(10, 0, 0, 0);
    }

    onChange(toLocalString(d));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  // Clear value
  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange('');
  };

  // Build calendar matrix
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const calendarDays: Array<{ day: number; currentMonth: boolean; dateObj: Date }> = [];

  // Prev month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    calendarDays.push({
      day,
      currentMonth: false,
      dateObj: new Date(viewYear, viewMonth - 1, day),
    });
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({
      day,
      currentMonth: true,
      dateObj: new Date(viewYear, viewMonth, day),
    });
  }

  // Next month padding to round up to 35 or 42 cells
  const remainingCells = 42 - calendarDays.length;
  for (let day = 1; day <= (remainingCells >= 7 ? remainingCells - 7 : remainingCells); day++) {
    calendarDays.push({
      day,
      currentMonth: false,
      dateObj: new Date(viewYear, viewMonth + 1, day),
    });
  }

  const today = new Date();
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isSelected = (date: Date) =>
    selectedDate &&
    date.getDate() === selectedDate.getDate() &&
    date.getMonth() === selectedDate.getMonth() &&
    date.getFullYear() === selectedDate.getFullYear();

  return (
    <div className={cn('relative inline-block w-full max-w-sm', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'group flex h-9.5 w-full items-center justify-between rounded-lg border border-input bg-background/80 px-3 py-1.5 text-sm shadow-xs transition-all hover:bg-muted/40 hover:border-border focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left',
              selectedDate && 'border-primary/40 bg-primary/[0.02]',
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
                selectedDate ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-foreground'
              )}>
                <CalendarIcon className="h-3.5 w-3.5" />
              </div>

              {selectedDate ? (
                <div className="truncate">
                  <span className="font-semibold text-foreground text-xs sm:text-sm">
                    {selectedDate.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="mx-1.5 text-muted-foreground/60">·</span>
                  <span className="font-medium text-primary text-xs sm:text-sm">
                    {selectedDate.toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground text-xs sm:text-sm truncate">
                  {placeholder}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              {selectedDate && !disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-full p-1 text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Clear scheduled date"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[330px] p-3.5 shadow-2xl border-border bg-popover/95 backdrop-blur-md rounded-xl"
        >
          {/* Quick Presets Bar */}
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Quick Schedule
              </span>
              <button
                type="button"
                onClick={goToToday}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                Today
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-1 font-normal bg-muted/30 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => applyPreset('1h')}
              >
                +1 Hour
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-1 font-normal bg-muted/30 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => applyPreset('tonight')}
              >
                Tonight 8 PM
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-1 font-normal bg-muted/30 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => applyPreset('tomorrow-9am')}
              >
                Tmrw 9 AM
              </Button>
            </div>
          </div>

          <div className="border-t border-border/60 my-2.5" />

          {/* Calendar Month Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground tracking-tight">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={prevMonth}
                title="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={nextMonth}
                title="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {DAYS_OF_WEEK.map((w) => (
              <span key={w} className="text-[11px] font-medium text-muted-foreground/70">
                {w}
              </span>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((item, idx) => {
              const active = isSelected(item.dateObj);
              const isCurrentDay = isToday(item.dateObj);
              const isPast =
                item.dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDay(item.day)}
                  disabled={!item.currentMonth}
                  className={cn(
                    'h-8 w-8 text-xs rounded-md flex items-center justify-center font-normal transition-all mx-auto',
                    !item.currentMonth && 'text-muted-foreground/20 cursor-default pointer-events-none',
                    item.currentMonth && !active && 'hover:bg-accent hover:text-accent-foreground text-foreground',
                    item.currentMonth && isPast && !active && 'text-muted-foreground/60',
                    isCurrentDay && !active && 'border border-primary/60 font-semibold text-primary',
                    active && 'bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90',
                  )}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border/60 my-3" />

          {/* Time Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Publish Time
              </span>
              <span className="text-[11px] text-muted-foreground/80 font-mono">
                {period}
              </span>
            </div>

            <div className="flex items-center justify-between gap-1.5">
              {/* Hour selector */}
              <select
                value={hours12}
                onChange={(e) =>
                  handleTimeChange(Number(e.target.value), minutes, period)
                }
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {pad(h)}
                  </option>
                ))}
              </select>

              <span className="text-muted-foreground font-bold text-xs">:</span>

              {/* Minute selector (5 min increments or all minutes) */}
              <select
                value={minutes}
                onChange={(e) =>
                  handleTimeChange(hours12, Number(e.target.value), period)
                }
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                  <option key={m} value={m}>
                    {pad(m)}
                  </option>
                ))}
              </select>

              {/* AM/PM toggle */}
              <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => handleTimeChange(hours12, minutes, 'AM')}
                  className={cn(
                    'px-2 py-1 text-[11px] font-semibold rounded transition-colors',
                    period === 'AM'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeChange(hours12, minutes, 'PM')}
                  className={cn(
                    'px-2 py-1 text-[11px] font-semibold rounded transition-colors',
                    period === 'PM'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Footer Preview & Actions */}
          {selectedDate && (
            <div className="mt-3 pt-2.5 border-t border-border/60">
              <p className="text-[11px] text-primary font-medium truncate mb-2">
                {getRelativeTimePreview(selectedDate)}
              </p>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors font-medium"
                >
                  Clear schedule
                </button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs px-3 gap-1 font-medium ml-auto"
                  onClick={() => setOpen(false)}
                >
                  <Check className="h-3 w-3" />
                  Done
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
