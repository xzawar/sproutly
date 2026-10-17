"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
import { X, Leaf } from "lucide-react";
import { useGarden } from "./garden-provider";
import { activityEmoji, type Activity, type TaskStatus } from "@/lib/types";
export function ActivityIcon({ activity }: { activity: Activity }) {
  return (
    <span
      className={`activity-icon activity-${activity.toLowerCase()}`}
      aria-hidden="true"
    >
      {activityEmoji(activity)}
    </span>
  );
}
export function Badge({
  status,
}: {
  status: TaskStatus | "Completed" | "Skipped" | "Ended" | "Archived";
}) {
  return (
    <span
      className={`badge badge-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf size={26} />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { errorMessage, clearError } = useGarden();
  useEffect(() => {
    clearError();
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, [clearError]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
      {errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
    </dialog>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
