import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  icon?: IconName;
  onConfirm: () => void;
  className?: string;
  timeout?: number;
}

export function ConfirmButton({
  label,
  confirmLabel = "click again",
  icon = "delete",
  onConfirm,
  className,
  timeout = 3500,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  return (
    <button
      className={cn("confirm-btn", armed && "armed", className)}
      onClick={() => {
        if (armed) {
          disarm();
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), timeout);
        }
      }}
      onBlur={disarm}
    >
      <Icon name={armed ? "badge-alert" : icon} size={13} anim="none" />
      {armed ? confirmLabel : label}
    </button>
  );
}
