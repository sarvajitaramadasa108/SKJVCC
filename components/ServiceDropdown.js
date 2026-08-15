"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { normalizeText } from "@/components/registryUtils";

function uniqueSortedOptions(options) {
  const seen = new Set();
  const next = [];

  for (const option of Array.isArray(options) ? options : []) {
    const value = String(option || "").trim();
    if (!value) continue;
    const key = normalizeText(value);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }

  next.sort((left, right) =>
    left.localeCompare(right, undefined, {
      sensitivity: "base",
      numeric: true
    })
  );
  return next;
}

export default function ServiceDropdown({ value, options, placeholder, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 360, maxHeight: 360 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const sortedOptions = useMemo(() => uniqueSortedOptions(options), [options]);
  const filteredOptions = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return sortedOptions;
    return sortedOptions.filter((option) => normalizeText(option).includes(term));
  }, [search, sortedOptions]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }

    const timer = window.setTimeout(() => {
      searchRef.current?.focus();
      searchRef.current?.select?.();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const menuWidth = 360;
      const estimatedHeight = Math.min(filteredOptions.length + 2, 10) * 44 + 88;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 12);
      const spaceAbove = Math.max(0, rect.top - 12);
      const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(180, Math.min(estimatedHeight, openAbove ? spaceAbove : spaceBelow));
      const menuHeight = Math.min(estimatedHeight, maxHeight);
      const left = Math.max(12, Math.min(rect.left, viewportWidth - menuWidth - 12));
      const top = openAbove
        ? Math.max(12, rect.top - menuHeight - 8)
        : Math.min(viewportHeight - 12, rect.bottom + 8);
      setMenuStyle({ top, left, width: menuWidth, maxHeight });
    }

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    updatePosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [filteredOptions.length, open]);

  return (
    <div className="service-dropdown-wrap">
      <button
        type="button"
        ref={triggerRef}
        className="service-dropdown-trigger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) return;
          setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "service-dropdown-value" : "service-dropdown-placeholder"}>{value || placeholder}</span>
        <span className="service-dropdown-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="service-dropdown-menu"
              style={{
                top: `${menuStyle.top}px`,
                left: `${menuStyle.left}px`,
                width: `${menuStyle.width}px`,
                maxHeight: `${menuStyle.maxHeight}px`
              }}
            >
              <div className="service-dropdown-menu-head">
                <div>
                  <strong>{placeholder}</strong>
                  <span>{sortedOptions.length} services</span>
                </div>
                <button
                  type="button"
                  className="service-dropdown-close"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
              <label className="service-dropdown-search">
                <span className="sr-only">Search services</span>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Type to filter services"
                />
              </label>
              <div className="service-dropdown-options" role="listbox">
                <button
                  type="button"
                  className={`service-dropdown-option ${!value ? "is-selected" : ""}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange("");
                    setOpen(false);
                  }}
                >
                  {placeholder}
                </button>
                {filteredOptions.length ? (
                  filteredOptions.map((serviceName) => (
                    <button
                      type="button"
                      key={serviceName}
                      className={`service-dropdown-option ${serviceName === value ? "is-selected" : ""}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onChange(serviceName);
                        setOpen(false);
                      }}
                    >
                      {serviceName}
                    </button>
                  ))
                ) : (
                  <div className="service-dropdown-empty">No matching services</div>
                )}
              </div>
              {filteredOptions.length > 8 ? <div className="service-dropdown-scroll-indicator" aria-hidden="true" /> : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
