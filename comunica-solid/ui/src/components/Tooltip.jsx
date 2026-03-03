import { useState, useRef, useEffect } from "react";

export default function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState("bottom");
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (visible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      // If tooltip would overflow below viewport, show above
      if (triggerRect.bottom + tooltipRect.height + 8 > window.innerHeight) {
        setPosition("top");
      } else {
        setPosition("bottom");
      }
    }
  }, [visible]);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      ref={triggerRef}
    >
      {children || (
        <span
          className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full border border-gray-400 text-gray-500 cursor-help select-none hover:border-swiss-green hover:text-swiss-green transition-colors"
          aria-label="More info"
        >
          ?
        </span>
      )}
      {visible && (
        <span
          ref={tooltipRef}
          className={`absolute z-50 left-1/2 -translate-x-1/2 w-80 px-3 py-2 text-xs font-normal normal-case tracking-normal text-left bg-gray-900 text-white rounded shadow-lg leading-relaxed [&_a]:underline [&_a]:text-emerald-300 [&_a:hover]:text-emerald-200 ${
            position === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
