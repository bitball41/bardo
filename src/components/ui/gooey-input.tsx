import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { cn } from "@/lib/utils";

function GooeyFilter({ id, blur }: { id: string; blur: number }) {
  return (
    <svg className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4 shrink-0">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export interface GooeyInputClassNames {
  root?: string;
  filterWrap?: string;
  buttonRow?: string;
  trigger?: string;
  input?: string;
  bubble?: string;
  bubbleSurface?: string;
}

export interface GooeyInputProps {
  inputId?: string;
  placeholder?: string;
  className?: string;
  classNames?: GooeyInputClassNames;
  collapsedWidth?: number | string;
  expandedWidth?: number | string;
  expandedOffset?: number;
  gooeyBlur?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  collapseOnBlur?: boolean;
  clearOnCollapse?: boolean;
  selectOnFocus?: boolean;
  disabled?: boolean;
}

export function GooeyInput({
  inputId,
  placeholder = "Type to search...",
  className,
  classNames,
  collapsedWidth = 115,
  expandedWidth = 200,
  expandedOffset = 50,
  gooeyBlur = 5,
  value: valueProp,
  defaultValue = "",
  onValueChange,
  onOpenChange,
  collapseOnBlur = false,
  clearOnCollapse = true,
  selectOnFocus = false,
  disabled = false,
}: GooeyInputProps) {
  const filterId = `gooey-${useId().replace(/:/g, "")}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wasExpanded = useRef(false);
  const [expanded, setExpandedState] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const controlled = valueProp !== undefined;
  const value = controlled ? valueProp : uncontrolledValue;

  const setValue = useCallback(
    (next: string) => {
      if (!controlled) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );

  const setExpanded = useCallback(
    (next: boolean) => {
      setExpandedState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
    else if (wasExpanded.current && clearOnCollapse) setValue("");
    wasExpanded.current = expanded;
  }, [clearOnCollapse, expanded, setValue]);

  const rowStyle: CSSProperties = {
    width: expanded ? expandedWidth : collapsedWidth,
    marginLeft: expanded ? expandedOffset : 0,
    transition: "width .24s cubic-bezier(.2,.8,.2,1), margin-left .24s cubic-bezier(.2,.8,.2,1)",
  };
  const bubbleStyle: CSSProperties = {
    opacity: expanded ? 1 : 0,
    transform: `translateY(-50%) scale(${expanded ? 1 : 0.65})`,
    transition: "opacity .14s ease, transform .24s cubic-bezier(.2,.8,.2,1)",
    pointerEvents: "none",
  };

  return (
    <div className={cn("relative flex items-center justify-center", className, classNames?.root)}>
      <GooeyFilter id={filterId} blur={gooeyBlur} />
      <div
        className={cn("relative flex h-10 items-center justify-center", classNames?.filterWrap)}
        style={{ filter: `url(#${filterId})` }}
      >
        <div className={cn("flex h-10 items-center justify-center", classNames?.buttonRow)} style={rowStyle}>
          <div
            className={cn(
              "relative flex h-10 w-full cursor-text items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none",
              "bg-foreground text-background shadow-sm ring-1 ring-border/60",
              disabled && "pointer-events-none opacity-50",
              classNames?.trigger,
            )}
            onClick={() => !disabled && setExpanded(true)}
          >
            {!expanded && (
              <button
                type="button"
                className="absolute inset-0 z-10 cursor-text rounded-full outline-none"
                aria-label={placeholder}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(true);
                }}
              />
            )}
            {!expanded && <SearchGlyph />}
            <input
              id={inputId}
              ref={inputRef}
              type="search"
              enterKeyHint="go"
              autoComplete="off"
              value={value}
              onInput={(event: FormEvent<HTMLInputElement>) => setValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              onBlur={() => {
                if (collapseOnBlur || !value) setExpanded(false);
              }}
              onFocus={(event) => selectOnFocus && event.currentTarget.select()}
              disabled={disabled || !expanded}
              placeholder={placeholder}
              className={cn(
                "h-full min-w-0 flex-1 bg-transparent text-sm text-background outline-none",
                expanded ? "placeholder:text-background/50" : "pointer-events-none placeholder:text-background/75",
                classNames?.input,
              )}
            />
          </div>
        </div>

        <div
          aria-hidden
          className={cn("absolute top-1/2 left-0 flex size-10 items-center justify-center", classNames?.bubble)}
          style={bubbleStyle}
        >
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-full bg-foreground text-background shadow-sm ring-1 ring-border/60",
              classNames?.bubbleSurface,
            )}
          >
            <SearchGlyph />
          </div>
        </div>
      </div>
    </div>
  );
}
